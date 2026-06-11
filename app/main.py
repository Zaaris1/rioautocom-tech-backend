import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.seed import seed_data
from app.routers import auth, stores, tickets, admin, networks, accesses, monitoring


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [item.strip() for item in raw.split(",") if item.strip()]

    # Em produção, configure CORS_ORIGINS no Render.
    # Exemplo: https://seu-front.vercel.app,https://app.rioautocom.com.br
    return ["*"]


def _run_startup_migrations() -> None:
    if os.getenv("RUN_MIGRATIONS_ON_STARTUP", "true").lower() not in {"1", "true", "yes", "sim"}:
        return
    try:
        from alembic import command
        from alembic.config import Config

        cfg = Config("alembic.ini")
        command.upgrade(cfg, "head")
    except Exception as exc:
        if os.getenv("STRICT_MIGRATIONS", "false").lower() in {"1", "true", "yes", "sim"}:
            raise
        print(f"[WARN] Não foi possível executar Alembic automaticamente: {exc}")


app = FastAPI(title="RioAutocom Tech API", version="1.1.0-hardening")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_run_startup_migrations()

if os.getenv("AUTO_CREATE_TABLES", "false").lower() in {"1", "true", "yes", "sim"}:
    Base.metadata.create_all(bind=engine)

if os.getenv("SEED_ON_STARTUP", "true").lower() in {"1", "true", "yes", "sim"}:
    seed_data()

app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(networks.router, prefix="/networks", tags=["Networks"])
app.include_router(stores.router, prefix="/stores", tags=["Stores"])
app.include_router(tickets.router, prefix="/tickets", tags=["Tickets"])
app.include_router(accesses.router, prefix="/accesses", tags=["Acessos"])
app.include_router(monitoring.router, prefix="/monitoring", tags=["Monitoring"])
