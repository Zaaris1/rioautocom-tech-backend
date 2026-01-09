from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models import (
    Store,
    ClientAccess,
    ClientNetworkAccess,  # ✅ NOVO
    ROLE_ADMIN,
    ROLE_TECH,
    ROLE_CLIENT,
    User,
)
from app.schemas import StoreOut
from app.deps import get_current_user

router = APIRouter()


@router.get("/", response_model=list[StoreOut])
def list_stores(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    network_id: str | None = Query(None, description="Filtrar por rede (network_id)"),
):
    q = db.query(Store)

    # Filtro por rede (quando seleciona uma rede no filtro)
    if network_id:
        q = q.filter(Store.network_id == network_id)

    # ADMIN/TECH: veem todas (ou filtradas)
    if user.role in (ROLE_ADMIN, ROLE_TECH):
        rows = q.order_by(Store.active.desc(), Store.name).all()
        return [StoreOut(id=s.id, name=s.name, cnpj=s.cnpj, active=s.active) for s in rows]

    # CLIENT: lojas por acesso direto OU por rede
    # - direto: client_access(user_id, store_id)
    # - por rede: client_network_access(user_id, network_id) + stores.network_id
    rows = (
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
        .order_by(Store.active.desc(), Store.name)
        .all()
    )

    return [StoreOut(id=s.id, name=s.name, cnpj=s.cnpj, active=s.active) for s in rows]
