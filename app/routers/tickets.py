
import uuid, json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.database import get_db
from app.models import (
    Ticket, TicketUpdate, TicketClosure,
    Store, ClientAccess, User,
    ROLE_ADMIN, ROLE_TECH, ROLE_CLIENT
)
from app.schemas import (
    TicketCreate, TicketOut, TicketDetail,
    AssignRequest, CommentRequest, CloseRequest, StatusRequest, TicketUpdateOut
)
from app.deps import get_current_user

router = APIRouter()

VALID_TYPES = {"Reparo", "Instalação", "Serviço", "Visita técnica"}
VALID_PRIORITIES = {"Normal", "Urgente"}
VALID_STATUSES = {"ABERTO","ATRIBUIDO","EM_ATENDIMENTO","PENDENTE","CONCLUIDO","CANCELADO"}

def add_update(db: Session, ticket_id: str, user_id: str, event_type: str, note: str | None = None, payload: dict | None = None):
    db.add(TicketUpdate(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        created_by_user_id=user_id,
        event_type=event_type,
        note=note,
        payload_json=json.dumps(payload or {}, ensure_ascii=False),
    ))

def ensure_store_access_for_client(db: Session, user: User, store_id: str):
    ok = db.query(ClientAccess).filter(ClientAccess.user_id == user.id, ClientAccess.store_id == store_id).first()
    if not ok:
        raise HTTPException(status_code=403, detail="Sem permissão para esta loja")

def ensure_can_view_ticket(db: Session, user: User, ticket: Ticket) -> None:
    if user.role in (ROLE_ADMIN, ROLE_TECH):
        return
    ensure_store_access_for_client(db, user, ticket.store_id)

def ensure_assigned_to_user(ticket: Ticket, user: User):
    if ticket.assigned_tech_id != user.id:
        raise HTTPException(status_code=403, detail="Chamado não atribuído a você")

# ---------- Create (ADMIN only) ----------
@router.post("/", response_model=TicketOut)
def create_ticket(body: TicketCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Apenas admin cria chamado")
    if body.type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Tipo inválido")
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail="Prioridade inválida")

    store = db.query(Store).filter(Store.id == body.store_id, Store.active == True).first()
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada/ativa")

    t = Ticket(
        id=str(uuid.uuid4()),
        store_id=body.store_id,
        opened_by_admin_id=user.id,
        requester_name=body.requester_name,
        local=body.local,
        problem=body.problem,
        type=body.type,
        priority=body.priority,
        status="ABERTO",
    )
    db.add(t)
    db.commit()
    add_update(db, t.id, user.id, "CREATE", note="Chamado criado", payload={"status": "ABERTO"})
    db.commit()

    return TicketOut(
        id=t.id, store_id=t.store_id, status=t.status,
        problem=t.problem, type=t.type, priority=t.priority,
        requester_name=t.requester_name, local=t.local,
        assigned_tech_id=t.assigned_tech_id,
        opened_at=t.opened_at.isoformat() if t.opened_at else None,
        updated_at=t.updated_at.isoformat() if t.updated_at else None,
    )

# ---------- List (by role + filters) ----------
@router.get("/", response_model=list[TicketOut])
def list_tickets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    open_only: bool = Query(False, description="Somente ABERTO e sem técnico (fila)"),
    mine_only: bool = Query(False, description="Somente tickets do técnico logado"),
    status: str | None = Query(None, description="Filtrar por status"),
    limit: int = Query(200, ge=1, le=500),
):
    if status and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="status inválido")

    q = db.query(Ticket)

    if user.role == ROLE_CLIENT:
        q = q.join(ClientAccess, ClientAccess.store_id == Ticket.store_id).filter(ClientAccess.user_id == user.id)

    if user.role == ROLE_TECH:
        # Técnico vê: fila ABERTO (sem atribuição) + os que são dele (ATRIBUIDO/EM_ATENDIMENTO/PENDENTE/CONCLUIDO opcional)
        if open_only:
            q = q.filter(Ticket.status == "ABERTO", Ticket.assigned_tech_id.is_(None))
        elif mine_only:
            q = q.filter(Ticket.assigned_tech_id == user.id)
        else:
            q = q.filter(
                (and_(Ticket.status == "ABERTO", Ticket.assigned_tech_id.is_(None))) |
                (Ticket.assigned_tech_id == user.id)
            )

    if status:
        q = q.filter(Ticket.status == status)

    rows = q.order_by(Ticket.opened_at.desc()).limit(limit).all()
    return [
        TicketOut(
            id=t.id, store_id=t.store_id, status=t.status,
            problem=t.problem, type=t.type, priority=t.priority,
            requester_name=t.requester_name, local=t.local,
            assigned_tech_id=t.assigned_tech_id,
            opened_at=t.opened_at.isoformat() if t.opened_at else None,
            updated_at=t.updated_at.isoformat() if t.updated_at else None,
        ) for t in rows
    ]

# ---------- Get detail ----------
@router.get("/{ticket_id}", response_model=TicketDetail)
def get_ticket(ticket_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    ensure_can_view_ticket(db, user, t)
    closure = db.query(TicketClosure).filter(TicketClosure.ticket_id == t.id).first()
    return TicketDetail(
        id=t.id, store_id=t.store_id, status=t.status,
        problem=t.problem, type=t.type, priority=t.priority,
        requester_name=t.requester_name, local=t.local,
        assigned_tech_id=t.assigned_tech_id,
        opened_at=t.opened_at.isoformat() if t.opened_at else None,
        updated_at=t.updated_at.isoformat() if t.updated_at else None,
        resolution_text=closure.resolution_text if closure else None,
    )

# ---------- Updates (timeline) ----------
@router.get("/{ticket_id}/updates", response_model=list[TicketUpdateOut])
def list_updates(ticket_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    ensure_can_view_ticket(db, user, t)
    rows = db.query(TicketUpdate).filter(TicketUpdate.ticket_id == ticket_id).order_by(TicketUpdate.created_at.asc()).all()
    return [
        TicketUpdateOut(
            id=u.id,
            ticket_id=u.ticket_id,
            created_by_user_id=u.created_by_user_id,
            created_at=u.created_at.isoformat() if u.created_at else "",
            event_type=u.event_type,
            note=u.note,
            payload_json=u.payload_json,
        ) for u in rows
    ]

# ---------- Assign ----------
@router.post("/{ticket_id}/assign", response_model=TicketOut)
def assign_ticket(ticket_id: str, body: AssignRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")

    # CLIENT cannot
    if user.role == ROLE_CLIENT:
        raise HTTPException(status_code=403, detail="Cliente não pode atribuir chamado")

    old_status = t.status

    if user.role == ROLE_ADMIN:
        if not body.tech_id:
            raise HTTPException(status_code=400, detail="Admin precisa informar tech_id")
        tech = db.query(User).filter(User.id == body.tech_id, User.role == ROLE_TECH, User.active == True).first()
        if not tech:
            raise HTTPException(status_code=404, detail="Técnico não encontrado/ativo")
        t.assigned_tech_id = tech.id
        if t.status == "ABERTO":
            t.status = "ATRIBUIDO"
        t.assigned_at = datetime.utcnow()
        db.add(t)
        db.commit()
        add_update(db, t.id, user.id, "ASSIGN", note="Atribuído pelo admin", payload={"tech_id": tech.id})
        if old_status != t.status:
            add_update(db, t.id, user.id, "STATUS_CHANGE", payload={"from": old_status, "to": t.status})
        db.commit()

    elif user.role == ROLE_TECH:
        # técnico assume se não estiver atribuído, ou se já for dele
        if t.assigned_tech_id and t.assigned_tech_id != user.id:
            raise HTTPException(status_code=409, detail="Chamado já atribuído a outro técnico")

        t.assigned_tech_id = user.id
        if t.status == "ABERTO":
            t.status = "ATRIBUIDO"
            t.assigned_at = datetime.utcnow()

        db.add(t)
        db.commit()
        add_update(db, t.id, user.id, "ASSIGN", note="Assumido pelo técnico", payload={"tech_id": user.id})
        if old_status != t.status:
            add_update(db, t.id, user.id, "STATUS_CHANGE", payload={"from": old_status, "to": t.status})
        db.commit()

    return TicketOut(
        id=t.id, store_id=t.store_id, status=t.status,
        problem=t.problem, type=t.type, priority=t.priority,
        requester_name=t.requester_name, local=t.local,
        assigned_tech_id=t.assigned_tech_id,
        opened_at=t.opened_at.isoformat() if t.opened_at else None,
        updated_at=t.updated_at.isoformat() if t.updated_at else None,
    )

# ---------- Tech workflow ----------
@router.post("/{ticket_id}/start", response_model=TicketOut)
def start_ticket(ticket_id: str, body: StatusRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != ROLE_TECH:
        raise HTTPException(status_code=403, detail="Apenas técnico")
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    ensure_assigned_to_user(t, user)
    if t.status not in ("ATRIBUIDO", "PENDENTE"):
        raise HTTPException(status_code=409, detail="Status inválido para iniciar")
    old = t.status
    t.status = "EM_ATENDIMENTO"
    t.started_at = datetime.utcnow()
    db.add(t)
    db.commit()
    add_update(db, t.id, user.id, "STATUS_CHANGE", note=body.note, payload={"from": old, "to": "EM_ATENDIMENTO"})
    db.commit()
    return TicketOut(
        id=t.id, store_id=t.store_id, status=t.status,
        problem=t.problem, type=t.type, priority=t.priority,
        requester_name=t.requester_name, local=t.local,
        assigned_tech_id=t.assigned_tech_id,
        opened_at=t.opened_at.isoformat() if t.opened_at else None,
        updated_at=t.updated_at.isoformat() if t.updated_at else None,
    )

@router.post("/{ticket_id}/pend", response_model=TicketOut)
def pend_ticket(ticket_id: str, body: StatusRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != ROLE_TECH:
        raise HTTPException(status_code=403, detail="Apenas técnico")
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    ensure_assigned_to_user(t, user)
    if t.status != "EM_ATENDIMENTO":
        raise HTTPException(status_code=409, detail="Só pode pendenciar em atendimento")
    old = t.status
    t.status = "PENDENTE"
    db.add(t)
    db.commit()
    add_update(db, t.id, user.id, "STATUS_CHANGE", note=body.note, payload={"from": old, "to": "PENDENTE"})
    db.commit()
    return TicketOut(
        id=t.id, store_id=t.store_id, status=t.status,
        problem=t.problem, type=t.type, priority=t.priority,
        requester_name=t.requester_name, local=t.local,
        assigned_tech_id=t.assigned_tech_id,
        opened_at=t.opened_at.isoformat() if t.opened_at else None,
        updated_at=t.updated_at.isoformat() if t.updated_at else None,
    )

# ---------- Comment (authorized viewers) ----------
@router.post("/{ticket_id}/comment")
def comment_ticket(ticket_id: str, body: CommentRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    ensure_can_view_ticket(db, user, t)
    add_update(db, t.id, user.id, "COMMENT", note=body.note)
    db.commit()
    return {"ok": True}

# ---------- Close (TECH only with mandatory resolution) ----------
@router.post("/{ticket_id}/close", response_model=TicketOut)
def close_ticket(ticket_id: str, body: CloseRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != ROLE_TECH:
        raise HTTPException(status_code=403, detail="Apenas técnico")
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    ensure_assigned_to_user(t, user)
    if t.status not in ("EM_ATENDIMENTO", "PENDENTE", "ATRIBUIDO"):
        raise HTTPException(status_code=409, detail="Status inválido para concluir")
    if db.query(TicketClosure).filter(TicketClosure.ticket_id == t.id).first():
        raise HTTPException(status_code=409, detail="Chamado já concluído")

    # create closure
    db.add(TicketClosure(
        ticket_id=t.id,
        resolution_text=body.resolution_text.strip(),
        closed_by_user_id=user.id
    ))

    old = t.status
    t.status = "CONCLUIDO"
    t.closed_at = datetime.utcnow()
    db.add(t)

    add_update(db, t.id, user.id, "CLOSE", note="Concluído com parecer", payload={"len": len(body.resolution_text.strip())})
    if old != "CONCLUIDO":
        add_update(db, t.id, user.id, "STATUS_CHANGE", payload={"from": old, "to": "CONCLUIDO"})

    db.commit()

    return TicketOut(
        id=t.id, store_id=t.store_id, status=t.status,
        problem=t.problem, type=t.type, priority=t.priority,
        requester_name=t.requester_name, local=t.local,
        assigned_tech_id=t.assigned_tech_id,
        opened_at=t.opened_at.isoformat() if t.opened_at else None,
        updated_at=t.updated_at.isoformat() if t.updated_at else None,
    )
