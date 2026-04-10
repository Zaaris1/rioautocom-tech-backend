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
from app.schemas import (
    MonitoringHeartbeatIn,
    MonitoringHeartbeatResponse,
    MonitoringItemOut,
    MonitoringOverviewResponse,
    MonitoringStoreOut,
)

router = APIRouter()

ALLOWED_STATUSES = {"ONLINE", "PARCIAL", "OFFLINE"}


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


def _extract_items(row: StoreMonitoringStatus | None) -> list[MonitoringItemOut]:
    if not row or not row.details_json:
        return []
    try:
        data = json.loads(row.details_json)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
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


def _row_to_out(store: Store, network_name: str | None, row: StoreMonitoringStatus | None, include_items: bool = False) -> MonitoringStoreOut:
    items = _extract_items(row) if include_items else []
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


def _find_store_for_heartbeat(db: Session, body: MonitoringHeartbeatIn) -> Store:
    if body.store_id:
        store = db.query(Store).filter(Store.id == body.store_id).first()
        if store:
            return store

    cnpj_digits = _digits(body.store_cnpj)
    if cnpj_digits:
        stores = db.query(Store).all()
        for store in stores:
            if _digits(store.cnpj) == cnpj_digits:
                return store

    store_name = str(body.store_name or "").strip()
    if store_name:
        store = db.query(Store).filter(Store.name == store_name).first()
        if store:
            return store

    raise HTTPException(status_code=404, detail="Loja do monitoramento não encontrada")


@router.post("/heartbeat", response_model=MonitoringHeartbeatResponse)
def heartbeat(
    body: MonitoringHeartbeatIn,
    db: Session = Depends(get_db),
    _: None = Depends(_require_ingest_token),
):
    store = _find_store_for_heartbeat(db, body)
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

    row.store_name_reported = str(body.store_name or store.name).strip() or store.name
    row.reported_status = status
    row.up_count = int(up_count)
    row.down_count = int(down_count)
    row.total_count = int(total_count)
    row.summary_text = summary
    row.details_json = json.dumps(items, ensure_ascii=False)
    row.signature = str(body.signature or "").strip() or None
    row.methods = str(body.methods or "").strip() or None
    row.agent_version = str(body.agent_version or "").strip() or None
    row.last_check_at = checked_at
    row.last_seen_at = seen_at

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
