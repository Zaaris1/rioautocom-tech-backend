from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.seed import seed_data
from app.routers import auth, stores, tickets, admin, networks

app = FastAPI(title="RioAutocom Tech API", version="1.0.0-final")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
seed_data()

app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(networks.router, prefix="/networks", tags=["Networks"])  # ✅ NOVO
app.include_router(stores.router, prefix="/stores", tags=["Stores"])
app.include_router(tickets.router, prefix="/tickets", tags=["Tickets"])
