import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from sqlalchemy import text
from app.seed import seed_data
from app.routers import auth, stores, tickets, admin, networks, accesses, monitoring


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [item.strip() for item in raw.split(",") if item.strip()]

    # Em produção, configure CORS_ORIGINS no Render.
    # Exemplo: https://seu-front.vercel.app,https://app.rioautocom.com.br
    return ["*"]




def _ensure_compat_schema() -> None:
    """Correções idempotentes para bancos já existentes.

    Mantém o app funcionando mesmo se o Alembic já tiver sido marcado como aplicado
    ou se uma migration anterior tiver falhado no meio do caminho.
    """
    if os.getenv("RUN_COMPAT_SCHEMA_FIXES", "true").lower() not in {"1", "true", "yes", "sim"}:
        return

    try:
        with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                conn.execute(text("ALTER TABLE stores ADD COLUMN IF NOT EXISTS cnpj_digits VARCHAR(14)"))
                conn.execute(text("UPDATE stores SET cnpj_digits = regexp_replace(COALESCE(cnpj, ''), '\\D', '', 'g') WHERE cnpj_digits IS NULL"))
                conn.execute(text("""
                    WITH ranked AS (
                        SELECT id, cnpj_digits, row_number() OVER (PARTITION BY cnpj_digits ORDER BY created_at NULLS LAST, id) AS rn
                        FROM stores
                        WHERE cnpj_digits IS NOT NULL AND cnpj_digits <> ''
                    )
                    UPDATE stores s
                    SET cnpj_digits = NULL
                    FROM ranked r
                    WHERE s.id = r.id AND r.rn > 1
                """))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_stores_cnpj_digits ON stores (cnpj_digits) WHERE cnpj_digits IS NOT NULL"))
            else:
                # SQLite/dev local: tenta criar a coluna; se já existir, ignora.
                try:
                    conn.execute(text("ALTER TABLE stores ADD COLUMN cnpj_digits VARCHAR(14)"))
                except Exception:
                    pass
    except Exception as exc:
        if os.getenv("STRICT_COMPAT_SCHEMA_FIXES", "false").lower() in {"1", "true", "yes", "sim"}:
            raise
        print(f"[WARN] Não foi possível aplicar compat schema fixes: {exc}")

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
_ensure_compat_schema()

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
