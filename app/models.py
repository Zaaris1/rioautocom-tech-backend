from sqlalchemy import Column, String, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    must_change_password = Column(Boolean, default=True)

class Store(Base):
    __tablename__ = "stores"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    cnpj = Column(String, unique=True, nullable=False)

class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(String, primary_key=True)
    store_id = Column(String, ForeignKey("stores.id"))
    status = Column(String, default="ABERTO")
    problem = Column(Text, nullable=False)
    assigned_tech = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TicketUpdate(Base):
    __tablename__ = "ticket_updates"
    id = Column(String, primary_key=True)
    ticket_id = Column(String, ForeignKey("tickets.id"))
    event = Column(String)
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TicketClosure(Base):
    __tablename__ = "ticket_closures"
    ticket_id = Column(String, ForeignKey("tickets.id"), primary_key=True)
    resolution_text = Column(Text, nullable=False)
    closed_at = Column(DateTime(timezone=True), server_default=func.now())
