
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Store, ClientAccess, ROLE_ADMIN, ROLE_TECH, User
from app.schemas import StoreOut
from app.deps import get_current_user

router = APIRouter()

@router.get("/", response_model=list[StoreOut])
def list_stores(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Store)
    if user.role in (ROLE_ADMIN, ROLE_TECH):
        rows = q.order_by(Store.active.desc(), Store.name).all()
    else:
        rows = (
            q.join(ClientAccess, ClientAccess.store_id == Store.id)
             .filter(ClientAccess.user_id == user.id)
             .order_by(Store.active.desc(), Store.name)
             .all()
        )
    return [StoreOut(id=s.id, name=s.name, cnpj=s.cnpj, active=s.active) for s in rows]
