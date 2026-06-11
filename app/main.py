import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.seed import seed_data
from app.routers import auth, stores, tickets, admin, networks, accesses, monitoring


def _env_true(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "sim", "s"}


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "*").strip()
    if not raw or raw == "*":
        return ["*"]
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


def _cors_regex() -> str | None:
    # Ajuda a evitar erro quando o Vercel abre um deployment/preview diferente do domínio fixo.
    # Pode desativar no Render com CORS_ALLOW_VERCEL_PREVIEWS=false.
    if _env_true("CORS_ALLOW_VERCEL_PREVIEWS", "true"):
        return r"https://.*\.vercel\.app"
    return None


app = FastAPI(title="RioAutocom Tech API", version="1.0.1-session-safe")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=_cors_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mantém o comportamento original funcional: não roda Alembic e não altera schema existente.
Base.metadata.create_all(bind=engine)
seed_data()


@app.get("/health")
def health():
    return {"ok": True, "version": "1.0.1-session-safe"}


app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(networks.router, prefix="/networks", tags=["Networks"])
app.include_router(stores.router, prefix="/stores", tags=["Stores"])
app.include_router(tickets.router, prefix="/tickets", tags=["Tickets"])
app.include_router(accesses.router, prefix="/accesses", tags=["Acessos"])
app.include_router(monitoring.router, prefix="/monitoring", tags=["Monitoring"])
