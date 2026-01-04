from app.database import SessionLocal
from app.models import User
from app.security import hash_password
import uuid

def seed_data():
    db = SessionLocal()
    if not db.query(User).filter(User.username=="admin").first():
        admin = User(
            id=str(uuid.uuid4()),
            username="admin",
            password_hash=hash_password("040126"),
            role="ADMIN",
            must_change_password=True
        )
        db.add(admin)
        db.commit()
    db.close()
