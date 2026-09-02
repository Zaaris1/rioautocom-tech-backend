import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import Task, User, ROLE_ADMIN, ROLE_TECH
from app.schemas import TaskCreate, TaskOut, TaskStatusUpdate, TaskUpdate

router = APIRouter()

VALID_STATUSES = {"PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"}


def _iso(value):
    return value.isoformat().replace("+00:00", "Z") if value else None


def _out(task: Task, assigned_to: str | None = None) -> TaskOut:
    return TaskOut(
        id=task.id, title=task.title, description=task.description, status=task.status,
        due_at=_iso(task.due_at), assigned_tech_id=task.assigned_tech_id,
        assigned_to=assigned_to, created_by_user_id=task.created_by_user_id,
        created_at=_iso(task.created_at), updated_at=_iso(task.updated_at), completed_at=_iso(task.completed_at),
    )


def _get_assignee(db: Session, user_id: str | None) -> User | None:
    if not user_id:
        return None
    user = db.query(User).filter(User.id == user_id, User.role == ROLE_TECH, User.active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=400, detail="Técnico responsável inválido")
    return user


@router.get("/", response_model=list[TaskOut])
def list_tasks(
    status: str | None = Query(None),
    mine_only: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(ROLE_ADMIN)),
):
    q = db.query(Task, User.username).outerjoin(User, User.id == Task.assigned_tech_id)
    if mine_only:
        q = q.filter(Task.assigned_tech_id == user.id)
    if status:
        normalized = status.strip().upper()
        if normalized not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Status de tarefa inválido")
        q = q.filter(Task.status == normalized)
    rows = q.order_by(Task.due_at.is_(None), Task.due_at.asc(), Task.created_at.desc()).all()
    return [_out(task, username) for task, username in rows]


@router.post("/", response_model=TaskOut)
def create_task(body: TaskCreate, db: Session = Depends(get_db), user: User = Depends(require_roles(ROLE_ADMIN))):
    assignee = _get_assignee(db, body.assigned_tech_id)
    task = Task(
        id=str(uuid.uuid4()), title=body.title.strip(), description=(body.description or "").strip() or None,
        due_at=body.due_at, assigned_tech_id=assignee.id if assignee else None, created_by_user_id=user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _out(task, assignee.username if assignee else None)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: str, body: TaskUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles(ROLE_ADMIN))):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    assignee = None
    if body.title is not None:
        task.title = body.title.strip()
    if body.description is not None:
        task.description = body.description.strip() or None
    if "due_at" in body.model_fields_set:
        task.due_at = body.due_at
    if "assigned_tech_id" in body.model_fields_set:
        assignee = _get_assignee(db, body.assigned_tech_id)
        task.assigned_tech_id = assignee.id if assignee else None
    db.add(task)
    db.commit()
    db.refresh(task)
    if assignee is None and task.assigned_tech_id:
        assignee = db.query(User).filter(User.id == task.assigned_tech_id).first()
    return _out(task, assignee.username if assignee else None)


@router.patch("/{task_id}/status", response_model=TaskOut)
def update_task_status(task_id: str, body: TaskStatusUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles(ROLE_ADMIN))):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    status = body.status.strip().upper()
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Status de tarefa inválido")
    task.status = status
    task.completed_at = datetime.now(timezone.utc) if status == "CONCLUIDA" else None
    db.add(task)
    db.commit()
    db.refresh(task)
    assignee = db.query(User).filter(User.id == task.assigned_tech_id).first() if task.assigned_tech_id else None
    return _out(task, assignee.username if assignee else None)

