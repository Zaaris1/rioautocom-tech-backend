
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.security import decode_token
from app.models import User, ROLE_ADMIN, ROLE_TECH, ROLE_CLIENT

bearer = HTTPBearer()

def get_current_user(
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
    return user

def require_roles(*roles: str):
    def _inner(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Sem permissão")
        return user
    return _inner
