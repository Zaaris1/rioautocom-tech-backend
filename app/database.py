
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
engine_options = {
    "pool_pre_ping": True,
    "connect_args": connect_args,
}

if not settings.is_sqlite:
    engine_options["pool_recycle"] = 1800

engine = create_engine(settings.database_url, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
