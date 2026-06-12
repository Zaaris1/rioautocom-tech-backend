from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.security import decode_token
from app.models import User, ROLE_ADMIN, ROLE_TECH, ROLE_CLIENT, ClientSubscription

bearer = HTTPBearer()

BLOCKED_BILLING_STATUSES = {"BLOQUEADO", "CANCELADO"}
BILLING_ALLOWED_PREFIXES = (
    "/auth/",
    "/billing/my-subscription",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def _path_allows_blocked_client(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in BILLING_ALLOWED_PREFIXES)


def _enforce_client_billing_status(user: User, db: Session, request: Request | None = None) -> None:
    # Segurança com baixo risco: só bloqueia perfil CLIENT quando existe assinatura explicitamente bloqueada/cancelada.
    # Clientes sem assinatura cadastrada continuam acessando normalmente.
    if user.role != ROLE_CLIENT:
        return

    path = request.url.path if request is not None else ""
    if _path_allows_blocked_client(path):
        return

    sub = db.query(ClientSubscription).filter(ClientSubscription.client_user_id == user.id).first()
    if sub and sub.status in BLOCKED_BILLING_STATUSES:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "CLIENT_BILLING_BLOCKED",
                "message": "Acesso temporariamente bloqueado por pendência administrativa. Fale com a RioAutocom.",
                "status": sub.status,
            },
        )


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db)
) -> User:
    token = creds.credentials
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Token inválido")

    user_id = payload.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = db.query(User).filter(User.id == user_id, User.active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário inválido")

    _enforce_client_billing_status(user, db, request)
    return user


def require_roles(*roles: str):
    def _inner(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Sem permissão")
        return user
    return _inner
