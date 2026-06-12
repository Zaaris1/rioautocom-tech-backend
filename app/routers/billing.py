import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import (
    User,
    BillingPlan,
    ClientSubscription,
    ROLE_ADMIN,
    ROLE_CLIENT,
)
from app.schemas import (
    BillingPlanCreate,
    BillingPlanUpdate,
    BillingPlanOut,
    ClientSubscriptionUpsert,
    ClientSubscriptionOut,
    MySubscriptionOut,
)

router = APIRouter()

VALID_STATUSES = {"TRIAL", "ATIVO", "ATRASADO", "BLOQUEADO", "CANCELADO"}
BLOCKED_STATUSES = {"BLOQUEADO", "CANCELADO"}


def _iso(dt):
    if not dt:
        return None
    try:
        return dt.isoformat().replace("+00:00", "Z")
    except Exception:
        return str(dt)


def _plan_out(p: BillingPlan) -> BillingPlanOut:
    return BillingPlanOut(
        id=p.id,
        name=p.name,
        description=p.description,
        monthly_price_cents=p.monthly_price_cents or 0,
        max_stores=p.max_stores,
        max_users=p.max_users,
        features_json=p.features_json,
        active=bool(p.active),
        created_at=_iso(p.created_at),
        updated_at=_iso(p.updated_at),
    )


def _sub_out(db: Session, sub: ClientSubscription, client: User | None = None) -> ClientSubscriptionOut:
    if client is None:
        client = db.query(User).filter(User.id == sub.client_user_id).first()
    plan = db.query(BillingPlan).filter(BillingPlan.id == sub.plan_id).first() if sub.plan_id else None
    return ClientSubscriptionOut(
        id=sub.id,
        client_user_id=sub.client_user_id,
        client_username=client.username if client else None,
        plan_id=sub.plan_id,
        plan_name=plan.name if plan else None,
        status=sub.status,
        monthly_price_cents=sub.monthly_price_cents,
        due_day=sub.due_day,
        next_due_date=_iso(sub.next_due_date),
        trial_until=_iso(sub.trial_until),
        blocked_at=_iso(sub.blocked_at),
        notes=sub.notes,
        created_at=_iso(sub.created_at),
        updated_at=_iso(sub.updated_at),
    )


def _normalize_status(status: str) -> str:
    value = (status or "ATIVO").strip().upper()
    if value not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Status de mensalidade inválido")
    return value


@router.get("/plans", response_model=list[BillingPlanOut])
def list_plans(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
):
    rows = db.query(BillingPlan).order_by(BillingPlan.active.desc(), BillingPlan.monthly_price_cents, BillingPlan.name).all()
    return [_plan_out(p) for p in rows]


@router.post("/plans", response_model=BillingPlanOut)
def create_plan(
    body: BillingPlanCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
):
    name = body.name.strip()
    if db.query(BillingPlan).filter(BillingPlan.name == name).first():
        raise HTTPException(status_code=409, detail="Já existe um plano com esse nome")

    p = BillingPlan(
        id=str(uuid.uuid4()),
        name=name,
        description=(body.description or "").strip() or None,
        monthly_price_cents=body.monthly_price_cents or 0,
        max_stores=body.max_stores,
        max_users=body.max_users,
        features_json=body.features_json,
        active=bool(body.active),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _plan_out(p)


@router.patch("/plans/{plan_id}", response_model=BillingPlanOut)
def update_plan(
    plan_id: str,
    body: BillingPlanUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
):
    p = db.query(BillingPlan).filter(BillingPlan.id == plan_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Plano não encontrado")

    if body.name is not None:
        name = body.name.strip()
        exists = db.query(BillingPlan).filter(BillingPlan.name == name, BillingPlan.id != plan_id).first()
        if exists:
            raise HTTPException(status_code=409, detail="Já existe um plano com esse nome")
        p.name = name
    if body.description is not None:
        p.description = body.description.strip() or None
    if body.monthly_price_cents is not None:
        p.monthly_price_cents = body.monthly_price_cents
    if body.max_stores is not None:
        p.max_stores = body.max_stores
    if body.max_users is not None:
        p.max_users = body.max_users
    if body.features_json is not None:
        p.features_json = body.features_json
    if body.active is not None:
        p.active = bool(body.active)

    db.add(p)
    db.commit()
    db.refresh(p)
    return _plan_out(p)


@router.get("/subscriptions", response_model=list[ClientSubscriptionOut])
def list_subscriptions(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
):
    clients = db.query(User).filter(User.role == ROLE_CLIENT).order_by(User.username).all()
    subs = {s.client_user_id: s for s in db.query(ClientSubscription).all()}
    out: list[ClientSubscriptionOut] = []
    for c in clients:
        sub = subs.get(c.id)
        if sub:
            out.append(_sub_out(db, sub, c))
        else:
            out.append(
                ClientSubscriptionOut(
                    id=None,
                    client_user_id=c.id,
                    client_username=c.username,
                    plan_id=None,
                    plan_name=None,
                    status="SEM_CADASTRO",
                    monthly_price_cents=None,
                )
            )
    return out


@router.put("/subscriptions/{client_user_id}", response_model=ClientSubscriptionOut)
def upsert_subscription(
    client_user_id: str,
    body: ClientSubscriptionUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(ROLE_ADMIN)),
):
    client = db.query(User).filter(User.id == client_user_id, User.role == ROLE_CLIENT).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    plan = None
    if body.plan_id:
        plan = db.query(BillingPlan).filter(BillingPlan.id == body.plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plano não encontrado")

    status = _normalize_status(body.status)
    sub = db.query(ClientSubscription).filter(ClientSubscription.client_user_id == client_user_id).first()
    old_status = sub.status if sub else None

    if not sub:
        sub = ClientSubscription(
            id=str(uuid.uuid4()),
            client_user_id=client_user_id,
        )

    sub.plan_id = body.plan_id or None
    sub.status = status
    sub.monthly_price_cents = body.monthly_price_cents if body.monthly_price_cents is not None else (plan.monthly_price_cents if plan else None)
    sub.due_day = body.due_day
    sub.next_due_date = body.next_due_date
    sub.trial_until = body.trial_until
    sub.notes = (body.notes or "").strip() or None

    if status in BLOCKED_STATUSES and old_status not in BLOCKED_STATUSES:
        sub.blocked_at = datetime.now(timezone.utc)
    if status not in BLOCKED_STATUSES:
        sub.blocked_at = None

    db.add(sub)
    db.commit()
    db.refresh(sub)
    return _sub_out(db, sub, client)


@router.get("/my-subscription", response_model=MySubscriptionOut)
def my_subscription(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != ROLE_CLIENT:
        return MySubscriptionOut(status="NAO_CLIENTE", blocked=False, message="Perfil sem mensalidade de cliente.")

    sub = db.query(ClientSubscription).filter(ClientSubscription.client_user_id == user.id).first()
    if not sub:
        return MySubscriptionOut(status="SEM_CADASTRO", blocked=False, message="Cliente sem controle de mensalidade cadastrado.")

    plan = db.query(BillingPlan).filter(BillingPlan.id == sub.plan_id).first() if sub.plan_id else None
    blocked = sub.status in BLOCKED_STATUSES
    message = "Acesso liberado."
    if blocked:
        message = "Acesso temporariamente bloqueado por pendência administrativa. Fale com a RioAutocom."
    elif sub.status == "ATRASADO":
        message = "Mensalidade em atraso. O acesso permanece liberado no momento."
    elif sub.status == "TRIAL":
        message = "Cliente em período de teste."

    return MySubscriptionOut(
        status=sub.status,
        blocked=blocked,
        plan_name=plan.name if plan else None,
        next_due_date=_iso(sub.next_due_date),
        trial_until=_iso(sub.trial_until),
        message=message,
    )
