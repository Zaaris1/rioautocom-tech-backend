import json
import os
from uuid import uuid4
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    ClientAccess,
    ClientNetworkAccess,
    Network,
    MonitoringEvent,
    ROLE_ADMIN,
    ROLE_TECH,
    Store,
    StoreMonitoringStatus,
    User,
)
from app.schemas import (
    MonitoringBackupHeartbeatIn,
    MonitoringCertificateHeartbeatIn,
    MonitoringCertificateItemOut,
    MonitoringHeartbeatIn,
    MonitoringHeartbeatResponse,
    MonitoringHistoryResponse,
    MonitoringHistorySummaryOut,
    MonitoringEventOut,
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
    return "".join(ch for ch in str(value or "") if ch.isdigit())


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
        stores = db.query(Store).all()
        for store in stores:
            if _digits(store.cnpj) == cnpj_digits:
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


def _status_label(value: str | None) -> str:
    raw = str(value or "SEM_DADOS").strip().upper()
    labels = {
        "ONLINE": "Online",
        "PARCIAL": "Parcial",
        "OFFLINE": "Offline",
        "STALE": "Sem atualização recente",
        "SEM_DADOS": "Sem dados",
        "OK": "OK",
        "ERRO": "Erro",
        "SEM_BACKUP_ONTEM": "Sem backup ontem",
        "SEM_LOGS": "Sem logs",
        "NAO_CONFIRMADO": "Não confirmado",
        "VENCIDO": "Vencido",
        "NAO_ENCONTRADO": "Não encontrado",
    }
    if raw.startswith(CERT_ALERT_PREFIX):
        return "Certificado em alerta"
    return labels.get(raw, raw.replace("_", " ").title())


def _severity_for_connectivity(status: str | None) -> str:
    raw = str(status or "SEM_DADOS").upper()
    if raw == "ONLINE":
        return "OK"
    if raw == "OFFLINE":
        return "CRITICAL"
    if raw in {"PARCIAL", "STALE", "SEM_DADOS"}:
        return "WARNING"
    return "INFO"


def _severity_for_backup(status: str | None) -> str:
    raw = str(status or "SEM_DADOS").upper()
    if raw in {"OK", "SUCESSO", "CONFIRMADO", "NORMAL"}:
        return "OK"
    if raw in {"ERRO", "SEM_LOGS", "NAO_CONFIRMADO"}:
        return "CRITICAL"
    if raw in {"SEM_BACKUP_ONTEM", "PENDENTE", "ALERTA"}:
        return "WARNING"
    return "INFO" if raw == "SEM_DADOS" else "WARNING"


def _severity_for_certificate(status: str | None) -> str:
    raw = str(status or "SEM_DADOS").upper()
    if raw == "OK":
        return "OK"
    if raw in CERT_HARD_ALERTS:
        return "CRITICAL"
    if raw.startswith(CERT_ALERT_PREFIX) or raw == "ALERTA":
        return "WARNING"
    return "INFO" if raw == "SEM_DADOS" else "WARNING"


def _record_monitoring_event(
    db: Session,
    store: Store,
    category: str,
    event_type: str,
    severity: str,
    title: str,
    message: str | None,
    status_from: str | None,
    status_to: str | None,
    occurred_at: datetime | None = None,
    payload: dict | None = None,
) -> None:
    event = MonitoringEvent(
        id=str(uuid4()),
        store_id=store.id,
        category=str(category or "SYSTEM").upper(),
        event_type=str(event_type or "STATUS_CHANGED").upper(),
        severity=str(severity or "INFO").upper(),
        title=str(title or "Evento de monitoramento")[:240],
        message=(str(message).strip() if message else None),
        status_from=(str(status_from).upper() if status_from else None),
        status_to=(str(status_to).upper() if status_to else None),
        payload_json=json.dumps(payload or {}, ensure_ascii=False) if payload else None,
        occurred_at=occurred_at or _utcnow(),
    )
    db.add(event)


def _event_to_out(event: MonitoringEvent, store: Store | None = None, network_name: str | None = None) -> MonitoringEventOut:
    return MonitoringEventOut(
        id=event.id,
        store_id=event.store_id,
        store_name=store.name if store else None,
        cnpj=store.cnpj if store else None,
        network_id=store.network_id if store else None,
        network_name=network_name,
        category=event.category,
        event_type=event.event_type,
        severity=event.severity,
        title=event.title,
        message=event.message,
        status_from=event.status_from,
        status_to=event.status_to,
        payload_json=event.payload_json,
        occurred_at=event.occurred_at.isoformat() if event.occurred_at else "",
        created_at=event.created_at.isoformat() if event.created_at else None,
    )


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
    previous_status = _effective_status(row) if row else "SEM_DADOS"
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

    if previous_status != status:
        _record_monitoring_event(
            db=db,
            store=store,
            category="CONNECTIVITY",
            event_type="STATUS_CHANGED",
            severity=_severity_for_connectivity(status),
            title=f"Comunicação {_status_label(status)}",
            message=f"Comunicação alterou de {_status_label(previous_status)} para {_status_label(status)}. {summary}.",
            status_from=previous_status,
            status_to=status,
            occurred_at=checked_at,
            payload={"up_count": int(up_count), "down_count": int(down_count), "total_count": int(total_count)},
        )

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
    previous_backup_status = str(_extract_backup(row).get("status") or "SEM_DADOS").strip().upper() if row else "SEM_DADOS"
    if not row:
        row = StoreMonitoringStatus(store_id=store.id)

    blob = _load_monitor_blob(row)
    backup_status = str(body.status or "").strip().upper() or "SEM_DADOS"
    blob["backup"] = {
        "status": backup_status,
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

    if previous_backup_status != backup_status:
        _record_monitoring_event(
            db=db,
            store=store,
            category="BACKUP",
            event_type="STATUS_CHANGED",
            severity=_severity_for_backup(backup_status),
            title=f"Backup {_status_label(backup_status)}",
            message=(str(body.summary or body.message or "Status de backup atualizado.").strip() or "Status de backup atualizado."),
            status_from=previous_backup_status,
            status_to=backup_status,
            occurred_at=checked_at,
            payload={
                "task_name": str(body.task_name or "").strip() or None,
                "source_name": str(body.source_name or "").strip() or None,
                "last_event_at": last_event_at.isoformat() if last_event_at else (str(body.last_event_at or "").strip() or None),
            },
        )

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
    previous_certificate_status = str(_extract_certificate(row).get("status") or "SEM_DADOS").strip().upper() if row else "SEM_DADOS"
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

    if previous_certificate_status != overall_status:
        _record_monitoring_event(
            db=db,
            store=store,
            category="CERTIFICATE",
            event_type="STATUS_CHANGED",
            severity=_severity_for_certificate(overall_status),
            title=f"Certificado {_status_label(overall_status)}",
            message=(str(body.summary or body.message or "Status de certificado atualizado.").strip() or "Status de certificado atualizado."),
            status_from=previous_certificate_status,
            status_to=overall_status,
            occurred_at=checked_at,
            payload={"expires_at": expires_at, "days_left": days_left, "items_count": len(items)},
        )

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




@router.get("/history", response_model=MonitoringHistoryResponse)
def history(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    store_id: str | None = Query(None),
    category: str | None = Query(None),
    severity: str | None = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(120, ge=1, le=500),
):
    visible_rows = _visible_store_query(db, user).all()
    visible_map = {store.id: (store, network_name) for store, network_name in visible_rows}
    visible_ids = list(visible_map.keys())

    if store_id:
        if store_id not in visible_map:
            raise HTTPException(status_code=404, detail="Loja não encontrada")
        visible_ids = [store_id]

    summary = MonitoringHistorySummaryOut()
    if not visible_ids:
        return MonitoringHistoryResponse(items=[], summary=summary)

    since = _utcnow() - timedelta(days=days)
    qdb = db.query(MonitoringEvent).filter(
        MonitoringEvent.store_id.in_(visible_ids),
        MonitoringEvent.occurred_at >= since,
    )

    if category:
        qdb = qdb.filter(MonitoringEvent.category == category.strip().upper())
    if severity:
        qdb = qdb.filter(MonitoringEvent.severity == severity.strip().upper())

    all_events = qdb.order_by(MonitoringEvent.occurred_at.desc()).limit(limit).all()

    for event in all_events:
        sev = str(event.severity or "INFO").lower()
        cat = str(event.category or "SYSTEM").lower()
        summary.total += 1
        if sev == "critical":
            summary.critical += 1
        elif sev == "warning":
            summary.warning += 1
        elif sev == "ok":
            summary.ok += 1
        else:
            summary.info += 1

        if cat == "connectivity":
            summary.connectivity += 1
        elif cat == "backup":
            summary.backup += 1
        elif cat == "certificate":
            summary.certificate += 1

    items = []
    for event in all_events:
        store, network_name = visible_map.get(event.store_id, (None, None))
        items.append(_event_to_out(event, store, network_name))

    return MonitoringHistoryResponse(items=items, summary=summary)


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
