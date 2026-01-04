
from sqlalchemy import Column, String, Boolean, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base

ROLE_ADMIN = "ADMIN"
ROLE_TECH = "TECH"
ROLE_CLIENT = "CLIENT"

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)  # admin/tech: username; client: CNPJ
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    must_change_password = Column(Boolean, default=True)
    active = Column(Boolean, default=True)

class Store(Base):
    __tablename__ = "stores"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    cnpj = Column(String, unique=True, nullable=False)
    active = Column(Boolean, default=True)

class ClientAccess(Base):
    __tablename__ = "client_access"
    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    store_id = Column(String, ForeignKey("stores.id"), primary_key=True)
    __table_args__ = (UniqueConstraint("user_id", "store_id", name="uq_client_store"),)

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
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class TicketUpdate(Base):
    __tablename__ = "ticket_updates"
    id = Column(String, primary_key=True)
    ticket_id = Column(String, ForeignKey("tickets.id"), nullable=False)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    event_type = Column(String, nullable=False)
    note = Column(Text, nullable=True)
    payload_json = Column(Text, nullable=True)

class TicketClosure(Base):
    __tablename__ = "ticket_closures"
    ticket_id = Column(String, ForeignKey("tickets.id"), primary_key=True)
    resolution_text = Column(Text, nullable=False)
    closed_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    closed_at = Column(DateTime(timezone=True), server_default=func.now())
