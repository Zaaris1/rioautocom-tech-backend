
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Store, ClientAccess, ROLE_ADMIN, ROLE_TECH, ROLE_CLIENT
from app.schemas import UserCreate, UserOut, StoreCreate, StoreOut
from app.security import hash_password
from app.deps import require_roles

router = APIRouter()

def _assert_role(role: str):
    if role not in (ROLE_ADMIN, ROLE_TECH, ROLE_CLIENT):
        raise HTTPException(status_code=400, detail="Role inválida")

@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    _assert_role(body.role)
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail="username já existe")

    password = body.password
    if body.role == ROLE_CLIENT and not password:
        password = "402365"
    if body.role == ROLE_TECH and not password:
        raise HTTPException(status_code=400, detail="Técnico precisa de senha")
    if body.role == ROLE_ADMIN and not password:
        password = "040126"

    user = User(
        id=str(uuid.uuid4()),
        username=body.username,
        password_hash=hash_password(password),
        role=body.role,
        must_change_password=body.must_change_password,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut(id=user.id, username=user.username, role=user.role, must_change_password=user.must_change_password, active=user.active)

@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    rows = db.query(User).order_by(User.role, User.username).all()
    return [UserOut(id=u.id, username=u.username, role=u.role, must_change_password=u.must_change_password, active=u.active) for u in rows]

@router.post("/stores", response_model=StoreOut)
def create_store(body: StoreCreate, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    if db.query(Store).filter(Store.cnpj == body.cnpj).first():
        raise HTTPException(status_code=409, detail="CNPJ já cadastrado")
    s = Store(id=str(uuid.uuid4()), name=body.name, cnpj=body.cnpj, active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return StoreOut(id=s.id, name=s.name, cnpj=s.cnpj)

@router.get("/stores", response_model=list[StoreOut])
def list_stores(db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    rows = db.query(Store).filter(Store.active == True).order_by(Store.name).all()
    return [StoreOut(id=s.id, name=s.name, cnpj=s.cnpj) for s in rows]

@router.post("/clients/{client_id}/stores/{store_id}")
def grant_store_access(client_id: str, store_id: str, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    user = db.query(User).filter(User.id == client_id).first()
    if not user or user.role != ROLE_CLIENT:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")
    exists = db.query(ClientAccess).filter(ClientAccess.user_id==client_id, ClientAccess.store_id==store_id).first()
    if not exists:
        db.add(ClientAccess(user_id=client_id, store_id=store_id))
        db.commit()
    return {"ok": True}
