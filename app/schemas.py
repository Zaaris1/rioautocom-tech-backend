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
    expires_at: Optional[str] = None
    expires_in_minutes: Optional[int] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=4, max_length=128)


# ---------- Networks ----------
class NetworkCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class NetworkUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    active: Optional[bool] = None


class NetworkOut(BaseModel):
    id: str
    name: str
    active: bool


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
    network_id: Optional[str] = None


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    cnpj: Optional[str] = None
    active: Optional[bool] = None
    network_id: Optional[str] = None


class StoreOut(BaseModel):
    id: str
    name: str
    cnpj: str
    active: bool
    network_id: Optional[str] = None


# ---------- Tickets (Enums) ----------
class TicketType(str, Enum):
    SUPORTE = "SUPORTE"
    VISITA = "VISITA"
    MANUTENCAO = "MANUTENCAO"
    REPARO = "REPARO"
    OUTRO = "OUTRO"


class TicketPriority(str, Enum):
    NORMAL = "NORMAL"
    URGENTE = "URGENTE"


class TicketStatus(str, Enum):
    ABERTO = "ABERTO"
    ATRIBUIDO = "ATRIBUIDO"
    EM_ATENDIMENTO = "EM_ATENDIMENTO"
    PENDENTE = "PENDENTE"
    CONCLUIDO = "CONCLUIDO"
    CANCELADO = "CANCELADO"


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
    store_name: Optional[str] = None
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


class AssignRequest(BaseModel):
    username: Optional[str] = None


class CommentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class CloseRequest(BaseModel):
    parecer: str = Field(min_length=15, max_length=10000)


class StatusRequest(BaseModel):
    message: Optional[str] = Field(default=None, max_length=2000)


class TicketUpdateOut(BaseModel):
    id: str
    ticket_id: str
    created_by_user_id: str
    created_at: str
    event_type: str
    note: Optional[str] = None
    payload_json: Optional[str] = None


class TicketAttachmentOut(BaseModel):
    id: str
    ticket_id: str
    phase: str
    original_filename: str
    mime_type: str
    size_bytes: int
    drive_file_id: str
    drive_view_link: Optional[str] = None
    drive_download_link: Optional[str] = None
    created_at: Optional[str] = None


class EditClosureRequest(BaseModel):
    parecer: str = Field(min_length=15, max_length=10000)

    class Config:
        extra = "forbid"


# ---------- Acessos / AnyDesk ----------
class AnyDeskAccessCreate(BaseModel):
    store_id: str
    label: str = Field(min_length=2, max_length=120)
    anydesk_id: str = Field(min_length=6, max_length=30)
    notes: Optional[str] = Field(default=None, max_length=500)
    active: bool = True


class AnyDeskAccessUpdate(BaseModel):
    store_id: Optional[str] = None
    label: Optional[str] = Field(default=None, min_length=2, max_length=120)
    anydesk_id: Optional[str] = Field(default=None, min_length=6, max_length=30)
    notes: Optional[str] = Field(default=None, max_length=500)
    active: Optional[bool] = None


class AnyDeskAccessOut(BaseModel):
    id: str
    store_id: str
    store_name: Optional[str] = None
    label: str
    anydesk_id: str
    notes: Optional[str] = None
    active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ---------- Monitoramento ----------
class MonitoringHeartbeatItem(BaseModel):
    name: str
    ip: str
    ok: bool
    detail: Optional[str] = None


class MonitoringHeartbeatIn(BaseModel):
    store_id: Optional[str] = None
    store_cnpj: Optional[str] = None
    store_name: Optional[str] = None
    checked_at: Optional[str] = None
    up_count: Optional[int] = None
    down_count: Optional[int] = None
    total_count: Optional[int] = None
    overall_status: Optional[str] = None
    signature: Optional[str] = None
    summary: Optional[str] = None
    agent_version: Optional[str] = None
    methods: Optional[str] = None
    items: list[MonitoringHeartbeatItem] = Field(default_factory=list)


class MonitoringBackupHeartbeatIn(BaseModel):
    store_id: Optional[str] = None
    store_cnpj: Optional[str] = None
    store_name: Optional[str] = None
    checked_at: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None
    message: Optional[str] = None
    task_name: Optional[str] = None
    source_name: Optional[str] = None
    last_event_at: Optional[str] = None
    agent_version: Optional[str] = None


class MonitoringCertificateItemIn(BaseModel):
    cn: str
    thumbprint: Optional[str] = None
    issuer: Optional[str] = None
    store: Optional[str] = None
    expires_at: Optional[str] = None
    days_left: Optional[int] = None
    status: Optional[str] = None


class MonitoringCertificateHeartbeatIn(BaseModel):
    store_id: Optional[str] = None
    store_cnpj: Optional[str] = None
    store_name: Optional[str] = None
    checked_at: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None
    message: Optional[str] = None
    alert_days: Optional[int] = None
    agent_version: Optional[str] = None
    items: list[MonitoringCertificateItemIn] = Field(default_factory=list)


class MonitoringItemOut(BaseModel):
    name: str
    ip: str
    ok: bool
    detail: Optional[str] = None


class MonitoringCertificateItemOut(BaseModel):
    cn: str
    thumbprint: Optional[str] = None
    issuer: Optional[str] = None
    store: Optional[str] = None
    expires_at: Optional[str] = None
    days_left: Optional[int] = None
    status: Optional[str] = None


class MonitoringStoreOut(BaseModel):
    store_id: str
    store_name: str
    cnpj: str
    network_id: Optional[str] = None
    network_name: Optional[str] = None
    status: str
    reported_status: Optional[str] = None
    up_count: int = 0
    down_count: int = 0
    total_count: int = 0
    summary: Optional[str] = None
    signature: Optional[str] = None
    methods: Optional[str] = None
    agent_version: Optional[str] = None
    last_check_at: Optional[str] = None
    last_seen_at: Optional[str] = None
    age_seconds: Optional[int] = None
    active: bool = True
    configured: bool = False
    items: list[MonitoringItemOut] = Field(default_factory=list)

    backup_status: Optional[str] = None
    backup_summary: Optional[str] = None
    backup_message: Optional[str] = None
    backup_task_name: Optional[str] = None
    backup_source_name: Optional[str] = None
    backup_last_event_at: Optional[str] = None
    backup_last_seen_at: Optional[str] = None
    backup_agent_version: Optional[str] = None

    certificate_status: Optional[str] = None
    certificate_summary: Optional[str] = None
    certificate_message: Optional[str] = None
    certificate_alert_days: Optional[int] = None
    certificate_expires_at: Optional[str] = None
    certificate_days_left: Optional[int] = None
    certificate_last_seen_at: Optional[str] = None
    certificate_agent_version: Optional[str] = None
    certificate_items: list[MonitoringCertificateItemOut] = Field(default_factory=list)


class MonitoringOverviewResponse(BaseModel):
    items: list[MonitoringStoreOut]


class MonitoringHeartbeatResponse(BaseModel):
    ok: bool
    store_id: str
    store_name: str
    status: str
    checked_at: Optional[str] = None


class MonitoringEventOut(BaseModel):
    id: str
    store_id: str
    store_name: Optional[str] = None
    cnpj: Optional[str] = None
    network_id: Optional[str] = None
    network_name: Optional[str] = None
    category: str
    event_type: str
    severity: str
    title: str
    message: Optional[str] = None
    status_from: Optional[str] = None
    status_to: Optional[str] = None
    payload_json: Optional[str] = None
    occurred_at: str
    created_at: Optional[str] = None


class MonitoringHistorySummaryOut(BaseModel):
    total: int = 0
    critical: int = 0
    warning: int = 0
    ok: int = 0
    info: int = 0
    connectivity: int = 0
    backup: int = 0
    certificate: int = 0


class MonitoringHistoryResponse(BaseModel):
    items: list[MonitoringEventOut]
    summary: MonitoringHistorySummaryOut

# ---------- Billing / Planos ----------
from datetime import datetime


class BillingPlanCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    monthly_price_cents: int = Field(default=0, ge=0)
    max_stores: Optional[int] = Field(default=None, ge=0)
    max_users: Optional[int] = Field(default=None, ge=0)
    features_json: Optional[str] = Field(default=None, max_length=5000)
    active: bool = True


class BillingPlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    monthly_price_cents: Optional[int] = Field(default=None, ge=0)
    max_stores: Optional[int] = Field(default=None, ge=0)
    max_users: Optional[int] = Field(default=None, ge=0)
    features_json: Optional[str] = Field(default=None, max_length=5000)
    active: Optional[bool] = None


class BillingPlanOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    monthly_price_cents: int
    max_stores: Optional[int] = None
    max_users: Optional[int] = None
    features_json: Optional[str] = None
    active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ClientSubscriptionUpsert(BaseModel):
    plan_id: Optional[str] = None
    status: str = Field(default="ATIVO", max_length=30)
    monthly_price_cents: Optional[int] = Field(default=None, ge=0)
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    next_due_date: Optional[datetime] = None
    trial_until: Optional[datetime] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class ClientSubscriptionOut(BaseModel):
    id: Optional[str] = None
    client_user_id: str
    client_username: Optional[str] = None
    plan_id: Optional[str] = None
    plan_name: Optional[str] = None
    status: str
    monthly_price_cents: Optional[int] = None
    due_day: Optional[int] = None
    next_due_date: Optional[str] = None
    trial_until: Optional[str] = None
    blocked_at: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MySubscriptionOut(BaseModel):
    status: str
    blocked: bool
    plan_name: Optional[str] = None
    next_due_date: Optional[str] = None
    trial_until: Optional[str] = None
    message: Optional[str] = None
