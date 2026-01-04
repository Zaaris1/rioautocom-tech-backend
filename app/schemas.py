
from pydantic import BaseModel, Field
from typing import Optional

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

class StoreCreate(BaseModel):
    name: str
    cnpj: str

class StoreOut(BaseModel):
    id: str
    name: str
    cnpj: str

class UserCreate(BaseModel):
    username: str
    role: str  # ADMIN, TECH, CLIENT
    password: Optional[str] = None
    must_change_password: bool = True

class UserOut(BaseModel):
    id: str
    username: str
    role: str
    must_change_password: bool
    active: bool

class TicketCreate(BaseModel):
    store_id: str
    requester_name: Optional[str] = None
    local: Optional[str] = None
    problem: str
    type: str
    priority: str

class TicketOut(BaseModel):
    id: str
    store_id: str
    status: str
    problem: str
    type: str
    priority: str
    assigned_tech_id: Optional[str] = None

class AssignRequest(BaseModel):
    tech_id: Optional[str] = None

class CommentRequest(BaseModel):
    note: str

class CloseRequest(BaseModel):
    resolution_text: str = Field(min_length=15)

class StatusRequest(BaseModel):
    note: Optional[str] = None
