from fastapi import APIRouter, HTTPException
from app.database import SessionLocal
from app.models import User
from app.security import verify_password, create_token

router = APIRouter()

@router.post("/login")
def login(username: str, password: str):
    db = SessionLocal()
    user = db.query(User).filter(User.username==username).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    token = create_token({"sub": user.username, "role": user.role}, 1440)
    return {"access_token": token, "role": user.role}
