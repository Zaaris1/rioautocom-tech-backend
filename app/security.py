from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings

# PBKDF2: compatível e estável no Render (Python 3.13)
pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm


def _token_expire_minutes() -> int:
    return settings.access_token_expire_minutes


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
