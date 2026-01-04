
import uuid
from app.models import User, ROLE_ADMIN
from app.security import hash_password
from app.database import SessionLocal

def seed_data():
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(
                id=str(uuid.uuid4()),
                username="admin",
                password_hash=hash_password("040126"),
                role=ROLE_ADMIN,
                must_change_password=True,
                active=True,
            ))
            db.commit()
    finally:
        db.close()
