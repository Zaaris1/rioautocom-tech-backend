from sqlalchemy import (
    Column,
    String,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
    Integer,
)
from sqlalchemy.sql import func
from app.database import Base

ROLE_ADMIN = "ADMIN"
ROLE_TECH = "TECH"
ROLE_CLIENT = "CLIENT"


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    must_change_password = Column(Boolean, default=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# =========================
# Redes
# =========================
class Network(Base):
    __tablename__ = "networks"
    id = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# =========================
# Lojas
# =========================
class Store(Base):
    __tablename__ = "stores"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    cnpj = Column(String, unique=True, nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # vínculo opcional com rede
    network_id = Column(Text, ForeignKey("networks.id"), nullable=True)


Index("ix_stores_network_id", Store.network_id)


# =========================
# Cliente → Loja (já existente)
# =========================
class ClientAccess(Base):
    __tablename__ = "client_access"
    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    store_id = Column(String, ForeignKey("stores.id"), primary_key=True)

    __table_args__ = (
        UniqueConstraint("user_id", "store_id", name="uq_client_store"),
    )


# =========================
# ✅ NOVO: Cliente → Rede
# =========================
class ClientNetworkAccess(Base):
    __tablename__ = "client_network_access"

    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    network_id = Column(String, ForeignKey("networks.id"), primary_key=True)

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "network_id",
            name="uq_client_network"
        ),
    )


Index("ix_client_network_user_id", ClientNetworkAccess.user_id)
Index("ix_client_network_network_id", ClientNetworkAccess.network_id)


# =========================
# AnyDesk / Acessos remotos
# =========================
class AnyDeskAccess(Base):
    __tablename__ = "anydesk_accesses"

    id = Column(String, primary_key=True)
    store_id = Column(String, ForeignKey("stores.id"), nullable=False)
    label = Column(String, nullable=False, default="Acesso principal")
    anydesk_id = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


Index("ix_anydesk_accesses_store_id", AnyDeskAccess.store_id)
Index("ix_anydesk_accesses_active", AnyDeskAccess.active)


# =========================
# Tickets
# =========================
class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(String, primary_key=True)
    store_id = Column(String, ForeignKey("stores.id"), nullable=False)

    opened_at = Column(DateTime(timezone=True), server_default=func.now())
    opened_by_admin_id = Column(String, ForeignKey("users.id"), nullable=False)

    requester_name = Column(String, nullable=True)
    local = Column(String, nullable=True)
    problem = Column(Text, nullable=False)

    type = Column(String, nullable=False)
    priority = Column(String, nullable=False)

    status = Column(String, nullable=False, default="ABERTO")
    assigned_tech_id = Column(String, ForeignKey("users.id"), nullable=True)

    assigned_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


Index("ix_tickets_store_id", Ticket.store_id)
Index("ix_tickets_status", Ticket.status)
Index("ix_tickets_assigned_tech_id", Ticket.assigned_tech_id)


# =========================
# Histórico de Tickets
# =========================
class TicketUpdate(Base):
    __tablename__ = "ticket_updates"
    id = Column(String, primary_key=True)
    ticket_id = Column(String, ForeignKey("tickets.id"), nullable=False)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    event_type = Column(String, nullable=False)
    note = Column(Text, nullable=True)
    payload_json = Column(Text, nullable=True)


Index("ix_ticket_updates_ticket_id", TicketUpdate.ticket_id)


# =========================
# Encerramento de Ticket
# =========================
class TicketClosure(Base):
    __tablename__ = "ticket_closures"
    ticket_id = Column(String, ForeignKey("tickets.id"), primary_key=True)
    resolution_text = Column(Text, nullable=False)
    closed_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    closed_at = Column(DateTime(timezone=True), server_default=func.now())


# =========================
# Monitoramento de conectividade (snapshot atual por loja)
# =========================
class StoreMonitoringStatus(Base):
    __tablename__ = "store_monitoring_status"

    store_id = Column(String, ForeignKey("stores.id"), primary_key=True)
    store_name_reported = Column(String, nullable=True)
    reported_status = Column(String, nullable=True)
    up_count = Column(Integer, nullable=False, default=0)
    down_count = Column(Integer, nullable=False, default=0)
    total_count = Column(Integer, nullable=False, default=0)
    summary_text = Column(Text, nullable=True)
    details_json = Column(Text, nullable=True)
    signature = Column(Text, nullable=True)
    methods = Column(String, nullable=True)
    agent_version = Column(String, nullable=True)
    last_check_at = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


Index("ix_store_monitoring_reported_status", StoreMonitoringStatus.reported_status)
Index("ix_store_monitoring_last_seen_at", StoreMonitoringStatus.last_seen_at)
