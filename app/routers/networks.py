import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import Network, Store, ClientAccess, User, ROLE_ADMIN, ROLE_TECH, ROLE_CLIENT
from app.schemas import NetworkCreate, NetworkOut

router = APIRouter()

@router.get("/", response_model=list[NetworkOut])
def list_networks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # ADMIN/TECH: vê todas
    if user.role in (ROLE_ADMIN, ROLE_TECH):
        rows = db.query(Network).order_by(Network.active.desc(), Network.name.asc()).all()
        return [NetworkOut(id=n.id, name=n.name, active=n.active) for n in rows]

    # CLIENT: vê apenas redes das lojas que ele tem acesso
    rows = (
        db.query(Network)
          .join(Store, Store.network_id == Network.id)
          .join(ClientAccess, ClientAccess.store_id == Store.id)
          .filter(ClientAccess.user_id == user.id)
          .distinct()
          .order_by(Network.active.desc(), Network.name.asc())
          .all()
    )
    return [NetworkOut(id=n.id, name=n.name, active=n.active) for n in rows]


@router.post("/", response_model=NetworkOut)
def create_network(
    body: NetworkCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN))
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome da rede é obrigatório")

    exists = db.query(Network).filter(Network.name.ilike(name)).first()
    if exists:
        raise HTTPException(status_code=409, detail="Já existe uma rede com esse nome")

    n = Network(id=str(uuid.uuid4()), name=name, active=True)
    db.add(n)
    db.commit()
    db.refresh(n)
    return NetworkOut(id=n.id, name=n.name, active=n.active)
