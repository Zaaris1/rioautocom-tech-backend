from datetime import datetime, timedelta, timezone
import os
from jose import jwt, JWTError
from passlib.context import CryptContext

# PBKDF2: compatível e estável no Render (Python 3.13)
pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME")
ALGORITHM = os.getenv("ALGORITHM", "HS256")


def _token_expire_minutes() -> int:
    """
    Sessão padrão: 180 dias.

    Prioridade:
    1) ACCESS_TOKEN_EXPIRE_DAYS, ex.: 180
    2) ACCESS_TOKEN_EXPIRE_MINUTES, ex.: 259200
    3) padrão interno: 259200 minutos
    """
    raw_days = os.getenv("ACCESS_TOKEN_EXPIRE_DAYS")
    if raw_days:
        try:
            return max(1, int(float(raw_days) * 24 * 60))
        except Exception:
            pass

    raw_minutes = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "259200")
    try:
        return max(1, int(float(raw_minutes)))
    except Exception:
        return 259200


ACCESS_TOKEN_EXPIRE_MINUTES = _token_expire_minutes()


def hash_password(p: str) -> str:
    return pwd.hash(p)


def verify_password(p: str, h: str) -> bool:
    return pwd.verify(p, h)


def _build_expiration(minutes: int | None = None) -> tuple[datetime, int]:
    token_minutes = int(minutes) if minutes is not None else ACCESS_TOKEN_EXPIRE_MINUTES
    token_minutes = max(1, token_minutes)
    expire = datetime.now(timezone.utc) + timedelta(minutes=token_minutes)
    return expire, token_minutes


def create_access_token(data: dict, minutes: int | None = None) -> str:
    token, _, _ = create_access_token_with_expiry(data, minutes=minutes)
    return token


def create_access_token_with_expiry(data: dict, minutes: int | None = None) -> tuple[str, datetime, int]:
    to_encode = data.copy()
    expire, token_minutes = _build_expiration(minutes)
    to_encode.update({"exp": expire})
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token, expire, token_minutes


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise ValueError("invalid_token") from e
