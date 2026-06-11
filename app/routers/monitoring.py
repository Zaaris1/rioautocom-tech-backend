import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    ClientAccess,
    ClientNetworkAccess,
    Network,
    ROLE_ADMIN,
    ROLE_TECH,
    Store,
    StoreMonitoringStatus,
    User,
)
from app.cnpj_utils import only_digits
from app.schemas import (
    MonitoringBackupHeartbeatIn,
    MonitoringCertificateHeartbeatIn,
    MonitoringCertificateItemOut,
    MonitoringHeartbeatIn,
    MonitoringHeartbeatResponse,
    MonitoringItemOut,
    MonitoringOverviewResponse,
    MonitoringStoreOut,
)

router = APIRouter()

ALLOWED_STATUSES = {"ONLINE", "PARCIAL", "OFFLINE"}
BACKUP_ALERT_STATUSES = {"ERRO", "SEM_BACKUP_ONTEM", "SEM_LOGS", "NAO_CONFIRMADO"}
CERT_ALERT_PREFIX = "ALERTA_"
CERT_HARD_ALERTS = {"VENCIDO", "NAO_ENCONTRADO"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _digits(value: str | None) -> str:
    return only_digits(value)


def _parse_dt(value: str | None) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def _coerce_status(value: str | None, up_count: int, down_count: int, total_count: int) -> str:
    status = str(value or "").strip().upper()
    if status in ALLOWED_STATUSES:
        return status
    if total_count <= 0:
        return "OFFLINE"
    if down_count <= 0:
        return "ONLINE"
    if up_count <= 0:
        return "OFFLINE"
    return "PARCIAL"


def _age_seconds(dt: datetime | None) -> int | None:
    if not dt:
        return None
    now = _utcnow()
    base = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return max(0, int((now - base).total_seconds()))


def _effective_status(row: StoreMonitoringStatus | None) -> str:
    if not row or (not row.last_seen_at and not row.last_check_at):
        return "SEM_DADOS"

    stale_minutes = max(1, int(os.getenv("MONITORING_STALE_MINUTES", "15") or "15"))
    base_dt = row.last_seen_at or row.last_check_at
    age = _age_seconds(base_dt)
    if age is not None and age > stale_minutes * 60:
        return "STALE"

    status = str(row.reported_status or "").upper()
    return status if status in ALLOWED_STATUSES else "SEM_DADOS"


def _visible_store_query(db: Session, user: User):
    q = db.query(Store, Network.name.label("network_name")).outerjoin(Network, Network.id == Store.network_id).filter(Store.active.is_(True))

    if user.role in (ROLE_ADMIN, ROLE_TECH):
        return q

    return (
        q.outerjoin(
            ClientAccess,
            (ClientAccess.store_id == Store.id) & (ClientAccess.user_id == user.id),
        )
        .outerjoin(
            ClientNetworkAccess,
            (ClientNetworkAccess.network_id == Store.network_id) & (ClientNetworkAccess.user_id == user.id),
        )
        .filter(
            or_(
                ClientAccess.user_id.isnot(None),
                ClientNetworkAccess.user_id.isnot(None),
            )
        )
    )


def _require_ingest_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("MONITORING_INGEST_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="MONITORING_INGEST_TOKEN não configurado no servidor")

    auth = str(authorization or "").strip()
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token do agente ausente")

    token = auth[7:].strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Token do agente inválido")


def _find_store_for_heartbeat(db: Session, store_id: str | None, store_cnpj: str | None, store_name: str | None) -> Store:
    if store_id:
        store = db.query(Store).filter(Store.id == store_id).first()
        if store:
            return store

    cnpj_digits = _digits(store_cnpj)
    if cnpj_digits:
        store = db.query(Store).filter(Store.cnpj_digits == cnpj_digits).first()
        if store:
            return store

        # Compatibilidade para bancos ainda não migrados/preenchidos.
        stores = db.query(Store).all()
        for store in stores:
            if _digits(store.cnpj) == cnpj_digits:
                if not getattr(store, "cnpj_digits", None):
                    store.cnpj_digits = cnpj_digits
                    db.add(store)
                    db.commit()
                return store

    store_name = str(store_name or "").strip()
    if store_name:
        store = db.query(Store).filter(Store.name == store_name).first()
        if store:
            return store

    raise HTTPException(status_code=404, detail="Loja do monitoramento não encontrada")


def _load_monitor_blob(row: StoreMonitoringStatus | None) -> dict:
    if not row or not row.details_json:
        return {}
    try:
        data = json.loads(row.details_json)
    except Exception:
        return {}
    if isinstance(data, list):
        return {"connectivity": {"items": data}}
    if isinstance(data, dict):
        return data
    return {}


def _save_monitor_blob(row: StoreMonitoringStatus, blob: dict) -> None:
    row.details_json = json.dumps(blob, ensure_ascii=False)


def _extract_connectivity_items(row: StoreMonitoringStatus | None) -> list[MonitoringItemOut]:
    blob = _load_monitor_blob(row)
    data = []
    conn = blob.get("connectivity")
    if isinstance(conn, dict) and isinstance(conn.get("items"), list):
        data = conn.get("items") or []
    elif isinstance(blob, list):
        data = blob
    out: list[MonitoringItemOut] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        out.append(
            MonitoringItemOut(
                name=str(item.get("name") or item.get("ip") or "Caixa"),
                ip=str(item.get("ip") or ""),
                ok=bool(item.get("ok", False)),
                detail=str(item.get("detail") or "").strip() or None,
            )
        )
    return out


def _extract_backup(row: StoreMonitoringStatus | None) -> dict:
    blob = _load_monitor_blob(row)
    data = blob.get("backup")
    return data if isinstance(data, dict) else {}


def _extract_certificate(row: StoreMonitoringStatus | None) -> dict:
    blob = _load_monitor_blob(row)
    data = blob.get("certificate")
    return data if isinstance(data, dict) else {}


def _extract_certificate_items(row: StoreMonitoringStatus | None) -> list[MonitoringCertificateItemOut]:
    data = _extract_certificate(row).get("items")
    out: list[MonitoringCertificateItemOut] = []
    if not isinstance(data, list):
        return out
    for item in data:
        if not isinstance(item, dict):
            continue
        out.append(
            MonitoringCertificateItemOut(
                cn=str(item.get("cn") or "(sem CN)"),
                thumbprint=str(item.get("thumbprint") or "").strip() or None,
                issuer=str(item.get("issuer") or "").strip() or None,
                store=str(item.get("store") or "").strip() or None,
                expires_at=str(item.get("expires_at") or "").strip() or None,
                days_left=(int(item["days_left"]) if isinstance(item.get("days_left"), int) else None),
                status=str(item.get("status") or "").strip() or None,
            )
        )
    return out


def _row_to_out(store: Store, network_name: str | None, row: StoreMonitoringStatus | None, include_items: bool = False) -> MonitoringStoreOut:
    items = _extract_connectivity_items(row) if include_items else []
    backup = _extract_backup(row)
    certificate = _extract_certificate(row)
    last_check_at = row.last_check_at.isoformat() if row and row.last_check_at else None
    last_seen_at = row.last_seen_at.isoformat() if row and row.last_seen_at else None

    return MonitoringStoreOut(
        store_id=store.id,
        store_name=store.name,
        cnpj=store.cnpj,
        network_id=store.network_id,
        network_name=network_name,
        status=_effective_status(row),
        reported_status=(str(row.reported_status).upper() if row and row.reported_status else None),
        up_count=(row.up_count if row else 0) or 0,
        down_count=(row.down_count if row else 0) or 0,
        total_count=(row.total_count if row else 0) or 0,
        summary=(row.summary_text if row else None),
        signature=(row.signature if row else None),
        methods=(row.methods if row else None),
        agent_version=(row.agent_version if row else None),
        last_check_at=last_check_at,
        last_seen_at=last_seen_at,
        age_seconds=_age_seconds(row.last_seen_at if row else None),
        active=bool(store.active),
        configured=bool(row),
        items=items,
        backup_status=str(backup.get("status") or "").strip() or None,
        backup_summary=str(backup.get("summary") or "").strip() or None,
        backup_message=str(backup.get("message") or "").strip() or None,
        backup_task_name=str(backup.get("task_name") or "").strip() or None,
        backup_source_name=str(backup.get("source_name") or "").strip() or None,
        backup_last_event_at=str(backup.get("last_event_at") or "").strip() or None,
        backup_last_seen_at=str(backup.get("last_seen_at") or "").strip() or None,
        backup_agent_version=str(backup.get("agent_version") or "").strip() or None,
        certificate_status=str(certificate.get("status") or "").strip() or None,
        certificate_summary=str(certificate.get("summary") or "").strip() or None,
        certificate_message=str(certificate.get("message") or "").strip() or None,
        certificate_alert_days=(int(certificate["alert_days"]) if isinstance(certificate.get("alert_days"), int) else None),
        certificate_expires_at=str(certificate.get("expires_at") or "").strip() or None,
        certificate_days_left=(int(certificate["days_left"]) if isinstance(certificate.get("days_left"), int) else None),
        certificate_last_seen_at=str(certificate.get("last_seen_at") or "").strip() or None,
        certificate_agent_version=str(certificate.get("agent_version") or "").strip() or None,
        certificate_items=_extract_certificate_items(row) if include_items else [],
    )


@router.post("/heartbeat", response_model=MonitoringHeartbeatResponse)
def heartbeat(
    body: MonitoringHeartbeatIn,
    db: Session = Depends(get_db),
    _: None = Depends(_require_ingest_token),
):
    store = _find_store_for_heartbeat(db, body.store_id, body.store_cnpj, body.store_name)
    checked_at = _parse_dt(body.checked_at) or _utcnow()
    seen_at = _utcnow()

    items = [
        {
            "name": str(item.name),
            "ip": str(item.ip),
            "ok": bool(item.ok),
            "detail": (str(item.detail).strip() if item.detail is not None else None),
        }
        for item in (body.items or [])
    ]

    total_count = body.total_count if body.total_count is not None else len(items)
    up_count = body.up_count if body.up_count is not None else sum(1 for item in items if item["ok"])
    down_count = body.down_count if body.down_count is not None else max(0, total_count - up_count)
    status = _coerce_status(body.overall_status, up_count, down_count, total_count)

    summary = (str(body.summary or "").strip() or None)
    if not summary:
        summary = f"{up_count}/{total_count} caixas OK" if total_count else "Sem caixas configurados"

    row = db.query(StoreMonitoringStatus).filter(StoreMonitoringStatus.store_id == store.id).first()
    if not row:
        row = StoreMonitoringStatus(store_id=store.id)

    blob = _load_monitor_blob(row)
    blob["connectivity"] = {
        "items": items,
        "signature": str(body.signature or "").strip() or None,
        "methods": str(body.methods or "").strip() or None,
        "agent_version": str(body.agent_version or "").strip() or None,
        "summary": summary,
        "reported_status": status,
        "up_count": int(up_count),
        "down_count": int(down_count),
        "total_count": int(total_count),
        "checked_at": checked_at.isoformat(),
        "last_seen_at": seen_at.isoformat(),
    }

    row.store_name_reported = str(body.store_name or store.name).strip() or store.name
    row.reported_status = status
    row.up_count = int(up_count)
    row.down_count = int(down_count)
    row.total_count = int(total_count)
    row.summary_text = summary
    row.signature = str(body.signature or "").strip() or None
    row.methods = str(body.methods or "").strip() or None
    row.agent_version = str(body.agent_version or "").strip() or None
    row.last_check_at = checked_at
    row.last_seen_at = seen_at
    _save_monitor_blob(row, blob)

    db.add(row)
    db.commit()
    db.refresh(row)

    return MonitoringHeartbeatResponse(
        ok=True,
        store_id=store.id,
        store_name=store.name,
        status=_effective_status(row),
        checked_at=row.last_check_at.isoformat() if row.last_check_at else None,
    )


@router.post("/backup-heartbeat", response_model=MonitoringHeartbeatResponse)
def backup_heartbeat(
    body: MonitoringBackupHeartbeatIn,
    db: Session = Depends(get_db),
    _: None = Depends(_require_ingest_token),
):
    store = _find_store_for_heartbeat(db, body.store_id, body.store_cnpj, body.store_name)
    checked_at = _parse_dt(body.checked_at) or _utcnow()
    last_event_at = _parse_dt(body.last_event_at)

    row = db.query(StoreMonitoringStatus).filter(StoreMonitoringStatus.store_id == store.id).first()
    if not row:
        row = StoreMonitoringStatus(store_id=store.id)

    blob = _load_monitor_blob(row)
    blob["backup"] = {
        "status": str(body.status or "").strip().upper() or "SEM_DADOS",
        "summary": str(body.summary or "").strip() or None,
        "message": str(body.message or "").strip() or None,
        "task_name": str(body.task_name or "").strip() or None,
        "source_name": str(body.source_name or "").strip() or None,
        "last_event_at": last_event_at.isoformat() if last_event_at else (str(body.last_event_at or "").strip() or None),
        "last_seen_at": checked_at.isoformat(),
        "agent_version": str(body.agent_version or "").strip() or None,
    }
    row.store_name_reported = str(body.store_name or store.name).strip() or (row.store_name_reported or store.name)
    _save_monitor_blob(row, blob)
    db.add(row)
    db.commit()
    db.refresh(row)

    return MonitoringHeartbeatResponse(
        ok=True,
        store_id=store.id,
        store_name=store.name,
        status=_effective_status(row),
        checked_at=checked_at.isoformat(),
    )


@router.post("/certificate-heartbeat", response_model=MonitoringHeartbeatResponse)
def certificate_heartbeat(
    body: MonitoringCertificateHeartbeatIn,
    db: Session = Depends(get_db),
    _: None = Depends(_require_ingest_token),
):
    store = _find_store_for_heartbeat(db, body.store_id, body.store_cnpj, body.store_name)
    checked_at = _parse_dt(body.checked_at) or _utcnow()

    items = []
    for item in (body.items or []):
        items.append(
            {
                "cn": str(item.cn),
                "thumbprint": str(item.thumbprint or "").strip() or None,
                "issuer": str(item.issuer or "").strip() or None,
                "store": str(item.store or "").strip() or None,
                "expires_at": str(item.expires_at or "").strip() or None,
                "days_left": item.days_left if isinstance(item.days_left, int) else None,
                "status": str(item.status or "").strip().upper() or None,
            }
        )

    overall_status = str(body.status or "").strip().upper()
    if not overall_status:
        statuses = [str(item.get("status") or "").upper() for item in items]
        if any(s == "VENCIDO" for s in statuses):
            overall_status = "VENCIDO"
        elif any(s.startswith(CERT_ALERT_PREFIX) for s in statuses):
            overall_status = next((s for s in statuses if s.startswith(CERT_ALERT_PREFIX)), "ALERTA")
        elif any(s == "NAO_ENCONTRADO" for s in statuses):
            overall_status = "NAO_ENCONTRADO"
        else:
            overall_status = "OK" if items else "SEM_DADOS"

    expires_at = None
    days_left = None
    sortable = []
    for item in items:
        item_days = item.get("days_left")
        if isinstance(item_days, int):
            sortable.append((item_days, item))
    if sortable:
        sortable.sort(key=lambda x: x[0])
        _, worst = sortable[0]
        expires_at = worst.get("expires_at")
        days_left = worst.get("days_left")

    row = db.query(StoreMonitoringStatus).filter(StoreMonitoringStatus.store_id == store.id).first()
    if not row:
        row = StoreMonitoringStatus(store_id=store.id)

    blob = _load_monitor_blob(row)
    blob["certificate"] = {
        "status": overall_status,
        "summary": str(body.summary or "").strip() or None,
        "message": str(body.message or "").strip() or None,
        "alert_days": body.alert_days if isinstance(body.alert_days, int) else None,
        "expires_at": expires_at,
        "days_left": days_left,
        "last_seen_at": checked_at.isoformat(),
        "agent_version": str(body.agent_version or "").strip() or None,
        "items": items,
    }
    row.store_name_reported = str(body.store_name or store.name).strip() or (row.store_name_reported or store.name)
    _save_monitor_blob(row, blob)
    db.add(row)
    db.commit()
    db.refresh(row)

    return MonitoringHeartbeatResponse(
        ok=True,
        store_id=store.id,
        store_name=store.name,
        status=_effective_status(row),
        checked_at=checked_at.isoformat(),
    )


@router.get("/overview", response_model=MonitoringOverviewResponse)
def overview(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    network_id: str | None = Query(None),
    status: str | None = Query(None),
    q: str | None = Query(None),
):
    qdb = _visible_store_query(db, user)

    if network_id:
        qdb = qdb.filter(Store.network_id == network_id)

    if q:
        term = f"%{q.strip()}%"
        qdb = qdb.filter(or_(Store.name.ilike(term), Store.cnpj.ilike(term), Network.name.ilike(term)))

    rows = qdb.order_by(Store.active.desc(), Store.name.asc()).all()
    store_ids = [store.id for store, _ in rows]
    snapshots = {
        row.store_id: row
        for row in db.query(StoreMonitoringStatus).filter(StoreMonitoringStatus.store_id.in_(store_ids)).all()
    } if store_ids else {}

    items = [_row_to_out(store, network_name, snapshots.get(store.id)) for store, network_name in rows]

    if status:
        wanted = status.strip().upper()
        items = [item for item in items if item.status == wanted]

    return MonitoringOverviewResponse(items=items)


@router.get("/stores/{store_id}", response_model=MonitoringStoreOut)
def store_detail(
    store_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = _visible_store_query(db, user).filter(Store.id == store_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Loja não encontrada")

    store, network_name = row
    snapshot = db.query(StoreMonitoringStatus).filter(StoreMonitoringStatus.store_id == store.id).first()
    return _row_to_out(store, network_name, snapshot, include_items=True)
