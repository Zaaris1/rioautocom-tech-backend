from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.seed import seed_data
from app.routers import auth, stores, tickets, admin, networks, accesses, monitoring, billing, tasks


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Mantem o comportamento original: cria tabelas faltantes e aplica seed inicial.
    # Alembic continua opcional para uma etapa futura de migracoes versionadas.
    Base.metadata.create_all(bind=engine)
    seed_data()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=not settings.allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "version": settings.app_version}


app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(networks.router, prefix="/networks", tags=["Networks"])
app.include_router(stores.router, prefix="/stores", tags=["Stores"])
app.include_router(tickets.router, prefix="/tickets", tags=["Tickets"])
app.include_router(accesses.router, prefix="/accesses", tags=["Acessos"])
app.include_router(monitoring.router, prefix="/monitoring", tags=["Monitoring"])
app.include_router(billing.router, prefix="/billing", tags=["Billing"])
app.include_router(tasks.router, prefix="/tasks", tags=["Tarefas"])

