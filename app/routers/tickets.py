
import uuid, json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Ticket, TicketUpdate, TicketClosure, Store, ClientAccess, User, ROLE_ADMIN, ROLE_TECH, ROLE_CLIENT
from app.schemas import TicketCreate, TicketOut, AssignRequest, CommentRequest, CloseRequest, StatusRequest
from app.deps import get_current_user

router = APIRouter()

VALID_TYPES = {"Reparo", "Instalação", "Serviço", "Visita técnica"}
VALID_PRIORITIES = {"Normal", "Urgente"}

def add_update(db: Session, ticket_id: str, user_id: str, event_type: str, note: str | None = None, payload: dict | None = None):
    db.add(TicketUpdate(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        created_by_user_id=user_id,
        event_type=event_type,
        note=note,
        payload_json=json.dumps(payload or {}, ensure_ascii=False),
    ))

def ensure_can_view_ticket(db: Session, user: User, ticket: Ticket) -> None:
    if user.role in (ROLE_ADMIN, ROLE_TECH):
        return
    ok = db.query(ClientAccess).filter(ClientAccess.user_id == user.id, ClientAccess.store_id == ticket.store_id).first()
    if not ok:
        raise HTTPException(status_code=403, detail="Sem permissão para ver este chamado")

def ensure_assigned_to_user(ticket: Ticket, user: User):
    if ticket.assigned_tech_id != user.id:
        raise HTTPException(status_code=403, detail="Chamado não atribuído a você")

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
        raise HTTPException(status_code=404, detail="Loja não encontrada")

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
    return TicketOut(id=t.id, store_id=t.store_id, status=t.status, problem=t.problem, type=t.type, priority=t.priority, assigned_tech_id=t.assigned_tech_id)

@router.get("/", response_model=list[TicketOut])
def list_tickets(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Ticket)
    if user.role == ROLE_CLIENT:
        q = q.join(ClientAccess, ClientAccess.store_id == Ticket.store_id).filter(ClientAccess.user_id == user.id)
    rows = q.order_by(Ticket.opened_at.desc()).limit(200).all()
    return [TicketOut(id=t.id, store_id=t.store_id, status=t.status, problem=t.problem, type=t.type, priority=t.priority, assigned_tech_id=t.assigned_tech_id) for t in rows]

@router.post("/{ticket_id}/assign", response_model=TicketOut)
def assign_ticket(ticket_id: str, body: AssignRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")

    if user.role == ROLE_ADMIN:
        if not body.tech_id:
            raise HTTPException(status_code=400, detail="Admin precisa informar tech_id")
        tech = db.query(User).filter(User.id == body.tech_id, User.role == ROLE_TECH).first()
        if not tech:
            raise HTTPException(status_code=404, detail="Técnico não encontrado")
        t.assigned_tech_id = tech.id
        if t.status == "ABERTO":
            t.status = "ATRIBUIDO"
        t.assigned_at = datetime.utcnow()
        db.add(t)
        db.commit()
        add_update(db, t.id, user.id, "ASSIGN", note="Atribuído pelo admin", payload={"tech_id": tech.id})
        db.commit()
    elif user.role == ROLE_TECH:
        if t.assigned_tech_id and t.assigned_tech_id != user.id:
            raise HTTPException(status_code=409, detail="Chamado já atribuído a outro técnico")
        t.assigned_tech_id = user.id
        if t.status == "ABERTO":
            t.status = "ATRIBUIDO"
            t.assigned_at = datetime.utcnow()
        db.add(t)
        db.commit()
        add_update(db, t.id, user.id, "ASSIGN", note="Assumido pelo técnico", payload={"tech_id": user.id})
        db.commit()
    else:
        raise HTTPException(status_code=403, detail="Cliente não pode atribuir chamado")

    return TicketOut(id=t.id, store_id=t.store_id, status=t.status, problem=t.problem, type=t.type, priority=t.priority, assigned_tech_id=t.assigned_tech_id)

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
    return TicketOut(id=t.id, store_id=t.store_id, status=t.status, problem=t.problem, type=t.type, priority=t.priority, assigned_tech_id=t.assigned_tech_id)

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
    t.status = "PENDENTE"
    db.add(t)
    db.commit()
    add_update(db, t.id, user.id, "STATUS_CHANGE", note=body.note, payload={"from": "EM_ATENDIMENTO", "to": "PENDENTE"})
    db.commit()
    return TicketOut(id=t.id, store_id=t.store_id, status=t.status, problem=t.problem, type=t.type, priority=t.priority, assigned_tech_id=t.assigned_tech_id)

@router.post("/{ticket_id}/comment")
def comment_ticket(ticket_id: str, body: CommentRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    ensure_can_view_ticket(db, user, t)
    add_update(db, t.id, user.id, "COMMENT", note=body.note)
    db.commit()
    return {"ok": True}

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

    db.add(TicketClosure(ticket_id=t.id, resolution_text=body.resolution_text.strip(), closed_by_user_id=user.id))
    old = t.status
    t.status = "CONCLUIDO"
    t.closed_at = datetime.utcnow()
    db.add(t)
    add_update(db, t.id, user.id, "CLOSE", note="Concluído com parecer")
    add_update(db, t.id, user.id, "STATUS_CHANGE", payload={"from": old, "to": "CONCLUIDO"})
    db.commit()

    return TicketOut(id=t.id, store_id=t.store_id, status=t.status, problem=t.problem, type=t.type, priority=t.priority, assigned_tech_id=t.assigned_tech_id)
