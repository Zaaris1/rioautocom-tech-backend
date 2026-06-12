import uuid
from app.models import User, ROLE_ADMIN, BillingPlan
from app.security import hash_password
from app.database import SessionLocal


def seed_data():
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(
                id=str(uuid.uuid4()),
                username="admin",
                password_hash=hash_password("040126"),
                role=ROLE_ADMIN,
                must_change_password=True,
                active=True,
            ))
            db.commit()

        if db.query(BillingPlan).count() == 0:
            defaults = [
                BillingPlan(
                    id=str(uuid.uuid4()),
                    name="Básico",
                    description="Chamados, histórico e portal do cliente.",
                    monthly_price_cents=14990,
                    max_stores=3,
                    max_users=3,
                    features_json='["Chamados", "Histórico", "Portal do cliente"]',
                    active=True,
                ),
                BillingPlan(
                    id=str(uuid.uuid4()),
                    name="Profissional",
                    description="Chamados, monitoramento, relatórios e alertas operacionais.",
                    monthly_price_cents=29990,
                    max_stores=10,
                    max_users=8,
                    features_json='["Chamados", "Monitoramento", "Relatórios", "Alertas"]',
                    active=True,
                ),
                BillingPlan(
                    id=str(uuid.uuid4()),
                    name="Premium",
                    description="Operação completa com monitoramento, relatórios e controle avançado.",
                    monthly_price_cents=49990,
                    max_stores=None,
                    max_users=None,
                    features_json='["Chamados", "Monitoramento", "Relatórios", "Alertas", "Auditoria", "Portal do cliente"]',
                    active=True,
                ),
            ]
            db.add_all(defaults)
            db.commit()
    finally:
        db.close()
