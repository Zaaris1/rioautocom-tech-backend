
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, LoginResponse, ChangePasswordRequest
from app.security import verify_password, create_access_token, hash_password
from app.deps import get_current_user

router = APIRouter()

@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username, User.active == True).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    token = create_access_token({"uid": user.id, "role": user.role, "sub": user.username})
    return LoginResponse(access_token=token, role=user.role, must_change_password=user.must_change_password)

@router.post("/change-password")
def change_password(body: ChangePasswordRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Senha atual inválida")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    db.add(user)
    db.commit()
    return {"ok": True}
