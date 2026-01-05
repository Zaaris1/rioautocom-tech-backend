from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional

# ---------- Auth ----------
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    role: str
    must_change_password: bool

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=4, max_length=128)

# ---------- Admin: Users ----------
class UserCreate(BaseModel):
    username: str
    role: str  # ADMIN, TECH, CLIENT
    password: Optional[str] = None
    must_change_password: bool = True

class UserUpdate(BaseModel):
    password: Optional[str] = None
    must_change_password: Optional[bool] = None
    active: Optional[bool] = None

class UserOut(BaseModel):
    id: str
    username: str
    role: str
    must_change_password: bool
    active: bool

# ---------- Stores ----------
class StoreCreate(BaseModel):
    name: str
    cnpj: str

class StoreUpdate(BaseModel):
    name: Optional[str] = None
    cnpj: Optional[str] = None
    active: Optional[bool] = None

class StoreOut(BaseModel):
    id: str
    name: str
    cnpj: str
    active: bool

# ---------- Tickets (Enums) ----------
class TicketType(str, Enum):
    SUPORTE = "SUPORTE"
    VISITA = "VISITA"
    MANUTENCAO = "MANUTENCAO"
    REPARO = "REPARO"

class TicketPriority(str, Enum):
    NORMAL = "NORMAL"
    URGENTE = "URGENTE"

class TicketStatus(str, Enum):
    ABERTO = "ABERTO"
    ATRIBUIDO = "ATRIBUIDO"
    EM_ATENDIMENTO = "EM_ATENDIMENTO"
    PENDENTE = "PENDENTE"
    CONCLUIDO = "CONCLUIDO"

# ---------- Tickets ----------
class TicketCreate(BaseModel):
    store_id: str
    requester_name: Optional[str] = None
    local: Optional[str] = None
    problem: str = Field(min_length=5)
    type: TicketType
    priority: TicketPriority

class TicketOut(BaseModel):
    id: str
    store_id: str
    store_name: Optional[str] = None  # ✅ NOVO (pra lista mostrar nome)
    status: str
    problem: str
    type: str
    priority: str
    requester_name: Optional[str] = None
    local: Optional[str] = None
    assigned_tech_id: Optional[str] = None
    opened_at: Optional[str] = None
    updated_at: Optional[str] = None

class TicketDetail(TicketOut):
    resolution_text: Optional[str] = None

# ---------- Requests compatíveis com o FRONTEND ----------
class AssignRequest(BaseModel):
    # ✅ frontend manda { username } no admin (tech assume com {})
    username: Optional[str] = None

class CommentRequest(BaseModel):
    # ✅ frontend manda { message }
    message: str = Field(min_length=1, max_length=4000)

class CloseRequest(BaseModel):
    # ✅ frontend manda { parecer }
    parecer: str = Field(min_length=15, max_length=10000)

class StatusRequest(BaseModel):
    # ✅ frontend manda { message } (ou vazio)
    message: Optional[str] = Field(default=None, max_length=2000)

class TicketUpdateOut(BaseModel):
    id: str
    ticket_id: str
    created_by_user_id: str
    created_at: str
    event_type: str
    note: Optional[str] = None
    payload_json: Optional[str] = None
