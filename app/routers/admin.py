import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    User,
    Store,
    ClientAccess,
    ClientNetworkAccess,  # ✅ NOVO
    Network,
    ROLE_ADMIN,
    ROLE_TECH,
    ROLE_CLIENT,
)
from app.schemas import (
    UserCreate,
    UserUpdate,
    UserOut,
    StoreCreate,
    StoreUpdate,
    StoreOut,
    NetworkCreate,
    NetworkOut,
)
from app.security import hash_password
from app.deps import require_roles

router = APIRouter()


def _assert_role(role: str):
    if role not in (ROLE_ADMIN, ROLE_TECH, ROLE_CLIENT):
        raise HTTPException(status_code=400, detail="Role inválida")


# -------- Networks (ADMIN) --------
@router.post("/networks", response_model=NetworkOut)
def create_network(
    body: NetworkCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome inválido")

    if db.query(Network).filter(Network.name == name).first():
        raise HTTPException(status_code=409, detail="Rede já existe")

    n = Network(id=str(uuid.uuid4()), name=name, active=True)
    db.add(n)
    db.commit()
    db.refresh(n)
    return NetworkOut(id=n.id, name=n.name, active=n.active)


# -------- Users --------
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
    return UserOut(
        id=user.id,
        username=user.username,
        role=user.role,
        must_change_password=user.must_change_password,
        active=user.active,
    )


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    rows = db.query(User).order_by(User.role, User.username).all()
    return [
        UserOut(
            id=u.id,
            username=u.username,
            role=u.role,
            must_change_password=u.must_change_password,
            active=u.active,
        )
        for u in rows
    ]


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if body.password is not None:
        u.password_hash = hash_password(body.password)
    if body.must_change_password is not None:
        u.must_change_password = body.must_change_password
    if body.active is not None:
        u.active = body.active

    db.add(u)
    db.commit()
    db.refresh(u)
    return UserOut(
        id=u.id,
        username=u.username,
        role=u.role,
        must_change_password=u.must_change_password,
        active=u.active,
    )


# -------- Stores --------
@router.post("/stores", response_model=StoreOut)
def create_store(body: StoreCreate, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    if db.query(Store).filter(Store.cnpj == body.cnpj).first():
        raise HTTPException(status_code=409, detail="CNPJ já cadastrado")

    # ✅ valida rede se vier
    if body.network_id:
        net = db.query(Network).filter(Network.id == body.network_id).first()
        if not net:
            raise HTTPException(status_code=404, detail="Rede não encontrada")

    s = Store(
        id=str(uuid.uuid4()),
        name=body.name,
        cnpj=body.cnpj,
        active=True,
        network_id=body.network_id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return StoreOut(id=s.id, name=s.name, cnpj=s.cnpj, active=s.active, network_id=s.network_id)


@router.get("/stores", response_model=list[StoreOut])
def list_stores(db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    rows = db.query(Store).order_by(Store.active.desc(), Store.name).all()
    return [StoreOut(id=s.id, name=s.name, cnpj=s.cnpj, active=s.active, network_id=s.network_id) for s in rows]


@router.patch("/stores/{store_id}", response_model=StoreOut)
def update_store(store_id: str, body: StoreUpdate, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    s = db.query(Store).filter(Store.id == store_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Loja não encontrada")
    if body.cnpj is not None and body.cnpj != s.cnpj:
        if db.query(Store).filter(Store.cnpj == body.cnpj).first():
            raise HTTPException(status_code=409, detail="CNPJ já cadastrado")

    if body.network_id is not None:
        if body.network_id == "":
            s.network_id = None
        else:
            net = db.query(Network).filter(Network.id == body.network_id).first()
            if not net:
                raise HTTPException(status_code=404, detail="Rede não encontrada")
            s.network_id = body.network_id

    if body.name is not None:
        s.name = body.name
    if body.cnpj is not None:
        s.cnpj = body.cnpj
    if body.active is not None:
        s.active = body.active

    db.add(s)
    db.commit()
    db.refresh(s)
    return StoreOut(id=s.id, name=s.name, cnpj=s.cnpj, active=s.active, network_id=s.network_id)


# -------- Client ↔ Store links --------
@router.post("/clients/{client_id}/stores/{store_id}")
def grant_store_access(client_id: str, store_id: str, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    user = db.query(User).filter(User.id == client_id).first()
    if not user or user.role != ROLE_CLIENT:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")

    exists = db.query(ClientAccess).filter(ClientAccess.user_id == client_id, ClientAccess.store_id == store_id).first()
    if not exists:
        db.add(ClientAccess(user_id=client_id, store_id=store_id))
        db.commit()
    return {"ok": True}


@router.delete("/clients/{client_id}/stores/{store_id}")
def revoke_store_access(client_id: str, store_id: str, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    row = db.query(ClientAccess).filter(ClientAccess.user_id == client_id, ClientAccess.store_id == store_id).first()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


# -------- ✅ NOVO: Client ↔ Network links --------
@router.post("/clients/{client_id}/networks/{network_id}")
def grant_network_access(client_id: str, network_id: str, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    user = db.query(User).filter(User.id == client_id).first()
    if not user or user.role != ROLE_CLIENT:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    net = db.query(Network).filter(Network.id == network_id).first()
    if not net:
        raise HTTPException(status_code=404, detail="Rede não encontrada")

    exists = db.query(ClientNetworkAccess).filter(
        ClientNetworkAccess.user_id == client_id,
        ClientNetworkAccess.network_id == network_id,
    ).first()

    if not exists:
        db.add(ClientNetworkAccess(user_id=client_id, network_id=network_id))
        db.commit()

    return {"ok": True}


@router.delete("/clients/{client_id}/networks/{network_id}")
def revoke_network_access(client_id: str, network_id: str, db: Session = Depends(get_db), _: User = Depends(require_roles(ROLE_ADMIN))):
    row = db.query(ClientNetworkAccess).filter(
        ClientNetworkAccess.user_id == client_id,
        ClientNetworkAccess.network_id == network_id,
    ).first()

    if row:
        db.delete(row)
        db.commit()

    return {"ok": True}
