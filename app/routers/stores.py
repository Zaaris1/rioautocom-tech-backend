from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Store, ClientAccess, ROLE_ADMIN, ROLE_TECH, ROLE_CLIENT, User
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

    # CLIENT: só lojas que ele tem acesso (e se tiver network_id, só as da rede)
    rows = (
        q.join(ClientAccess, ClientAccess.store_id == Store.id)
         .filter(ClientAccess.user_id == user.id)
         .order_by(Store.active.desc(), Store.name)
         .all()
    )
    return [StoreOut(id=s.id, name=s.name, cnpj=s.cnpj, active=s.active) for s in rows]
