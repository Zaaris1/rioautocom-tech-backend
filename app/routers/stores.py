from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Store, ClientAccess, ROLE_ADMIN, ROLE_TECH, User
from app.schemas import StoreOut
from app.deps import get_current_user

router = APIRouter()

@router.get("/", response_model=list[StoreOut])
def list_stores(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    network_id: Optional[str] = Query(None, description="Filtrar lojas por rede (network_id)"),
):
    q = db.query(Store)

    # CLIENT: só lojas que ele tem acesso
    if user.role not in (ROLE_ADMIN, ROLE_TECH):
        q = (
            q.join(ClientAccess, ClientAccess.store_id == Store.id)
             .filter(ClientAccess.user_id == user.id)
        )

    # filtro por rede (para TODOS os perfis)
    if network_id:
        q = q.filter(Store.network_id == network_id)

    rows = q.order_by(Store.active.desc(), Store.name).all()

    return [
        StoreOut(
            id=s.id,
            name=s.name,
            cnpj=s.cnpj,
            active=s.active,
            network_id=s.network_id,
        )
        for s in rows
    ]
