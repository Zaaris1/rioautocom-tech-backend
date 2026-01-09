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
    network_id: str | None = Query(default=None, description="Filtrar lojas por rede (network_id)")
):
    q = db.query(Store)

    # ✅ filtro opcional por rede
    if network_id:
        q = q.filter(Store.network_id == network_id)

    # ✅ admin/tech veem todas
    if user.role in (ROLE_ADMIN, ROLE_TECH):
        rows = q.order_by(Store.active.desc(), Store.name).all()
    else:
        # ✅ client vê somente lojas vinculadas + respeita network_id se vier
        rows = (
            q.join(ClientAccess, ClientAccess.store_id == Store.id)
             .filter(ClientAccess.user_id == user.id)
             .order_by(Store.active.desc(), Store.name)
             .all()
        )

    return [
        StoreOut(
            id=s.id,
            name=s.name,
            cnpj=s.cnpj,
            active=s.active,
            network_id=getattr(s, "network_id", None),
        )
        for s in rows
    ]
