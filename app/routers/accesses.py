import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_roles
from app.models import AnyDeskAccess, Store, ROLE_ADMIN, User
from app.schemas import AnyDeskAccessCreate, AnyDeskAccessOut, AnyDeskAccessUpdate

router = APIRouter()


ID_PATTERN = re.compile(r"\D+")


def _normalize_anydesk_id(value: str) -> str:
    cleaned = ID_PATTERN.sub("", (value or "").strip())
    if len(cleaned) < 6:
        raise HTTPException(status_code=400, detail="ID AnyDesk inválido")
    if len(cleaned) > 20:
        raise HTTPException(status_code=400, detail="ID AnyDesk inválido")
    return cleaned


@router.get("/", response_model=list[AnyDeskAccessOut])
def list_anydesk_accesses(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
    store_id: str | None = Query(None),
    q: str | None = Query(None, description="Buscar por loja, etiqueta, ID ou observação"),
):
    rows = db.query(AnyDeskAccess, Store.name.label("store_name")).join(Store, Store.id == AnyDeskAccess.store_id)

    if store_id:
        rows = rows.filter(AnyDeskAccess.store_id == store_id)

    if q:
        term = f"%{q.strip()}%"
        rows = rows.filter(
            (Store.name.ilike(term))
            | (AnyDeskAccess.label.ilike(term))
            | (AnyDeskAccess.anydesk_id.ilike(term))
            | (AnyDeskAccess.notes.ilike(term))
        )

    rows = rows.order_by(Store.name.asc(), AnyDeskAccess.label.asc(), AnyDeskAccess.created_at.desc()).all()

    return [
        AnyDeskAccessOut(
            id=access.id,
            store_id=access.store_id,
            store_name=store_name,
            label=access.label,
            anydesk_id=access.anydesk_id,
            notes=access.notes,
            active=access.active,
            created_at=access.created_at.isoformat() if access.created_at else None,
            updated_at=access.updated_at.isoformat() if access.updated_at else None,
        )
        for access, store_name in rows
    ]


@router.post("/", response_model=AnyDeskAccessOut)
def create_anydesk_access(
    body: AnyDeskAccessCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
):
    store = db.query(Store).filter(Store.id == body.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")

    anydesk_id = _normalize_anydesk_id(body.anydesk_id)
    label = (body.label or "").strip() or "Acesso principal"
    notes = (body.notes or "").strip() or None

    access = AnyDeskAccess(
        id=str(uuid.uuid4()),
        store_id=body.store_id,
        label=label,
        anydesk_id=anydesk_id,
        notes=notes,
        active=body.active,
    )
    db.add(access)
    db.commit()
    db.refresh(access)

    return AnyDeskAccessOut(
        id=access.id,
        store_id=access.store_id,
        store_name=store.name,
        label=access.label,
        anydesk_id=access.anydesk_id,
        notes=access.notes,
        active=access.active,
        created_at=access.created_at.isoformat() if access.created_at else None,
        updated_at=access.updated_at.isoformat() if access.updated_at else None,
    )


@router.patch("/{access_id}", response_model=AnyDeskAccessOut)
def update_anydesk_access(
    access_id: str,
    body: AnyDeskAccessUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
):
    access = db.query(AnyDeskAccess).filter(AnyDeskAccess.id == access_id).first()
    if not access:
        raise HTTPException(status_code=404, detail="Acesso não encontrado")

    if body.store_id is not None:
        store = db.query(Store).filter(Store.id == body.store_id).first()
        if not store:
            raise HTTPException(status_code=404, detail="Loja não encontrada")
        access.store_id = body.store_id
    else:
        store = db.query(Store).filter(Store.id == access.store_id).first()

    if body.label is not None:
        access.label = body.label.strip() or "Acesso principal"
    if body.anydesk_id is not None:
        access.anydesk_id = _normalize_anydesk_id(body.anydesk_id)
    if body.notes is not None:
        access.notes = body.notes.strip() or None
    if body.active is not None:
        access.active = body.active

    db.add(access)
    db.commit()
    db.refresh(access)

    return AnyDeskAccessOut(
        id=access.id,
        store_id=access.store_id,
        store_name=store.name if store else None,
        label=access.label,
        anydesk_id=access.anydesk_id,
        notes=access.notes,
        active=access.active,
        created_at=access.created_at.isoformat() if access.created_at else None,
        updated_at=access.updated_at.isoformat() if access.updated_at else None,
    )


@router.delete("/{access_id}")
def delete_anydesk_access(
    access_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
):
    access = db.query(AnyDeskAccess).filter(AnyDeskAccess.id == access_id).first()
    if not access:
        raise HTTPException(status_code=404, detail="Acesso não encontrado")

    db.delete(access)
    db.commit()
    return {"ok": True}
