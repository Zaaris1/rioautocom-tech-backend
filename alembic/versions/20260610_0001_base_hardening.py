"""base hardening: cnpj_digits and safe indexes

Revision ID: 20260610_0001
Revises:
Create Date: 2026-06-10

Observação:
Esta migration precisa ser extremamente tolerante porque roda em produção
com banco já existente. Por isso, ela evita constraints que possam falhar
caso existam dados históricos fora do padrão.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260610_0001"
down_revision = None
branch_labels = None
depends_on = None


VALID_TICKET_TYPES_SQL = "'REPARO', 'SUPORTE', 'VISITA', 'MANUTENCAO', 'OUTRO', 'INSTALACAO', 'SERVICO', 'VISITA_TECNICA'"


def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # 1) Coluna normalizada de CNPJ. IF NOT EXISTS evita quebrar se já foi aplicada manualmente.
        op.execute("ALTER TABLE stores ADD COLUMN IF NOT EXISTS cnpj_digits VARCHAR(14)")
        op.execute("UPDATE stores SET cnpj_digits = regexp_replace(COALESCE(cnpj, ''), '\\D', '', 'g') WHERE cnpj_digits IS NULL")

        # 2) Se houver duplicidade histórica do mesmo CNPJ com máscara diferente,
        # mantém o primeiro e limpa os duplicados para não quebrar índice único.
        op.execute("""
            WITH ranked AS (
                SELECT id, cnpj_digits, row_number() OVER (PARTITION BY cnpj_digits ORDER BY created_at NULLS LAST, id) AS rn
                FROM stores
                WHERE cnpj_digits IS NOT NULL AND cnpj_digits <> ''
            )
            UPDATE stores s
            SET cnpj_digits = NULL
            FROM ranked r
            WHERE s.id = r.id AND r.rn > 1
        """)

        # 3) Índices seguros. O bloco checa a existência da tabela para não quebrar
        # bancos que ainda estejam parcialmente antigos.
        op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_stores_cnpj_digits ON stores (cnpj_digits) WHERE cnpj_digits IS NOT NULL")
        op.execute("CREATE INDEX IF NOT EXISTS ix_stores_network_id ON stores (network_id)")
        op.execute("""
        DO $$
        BEGIN
            IF to_regclass('client_network_access') IS NOT NULL THEN
                CREATE INDEX IF NOT EXISTS ix_client_network_user_id ON client_network_access (user_id);
                CREATE INDEX IF NOT EXISTS ix_client_network_network_id ON client_network_access (network_id);
            END IF;

            IF to_regclass('anydesk_accesses') IS NOT NULL THEN
                CREATE INDEX IF NOT EXISTS ix_anydesk_accesses_store_id ON anydesk_accesses (store_id);
                CREATE INDEX IF NOT EXISTS ix_anydesk_accesses_active ON anydesk_accesses (active);
            END IF;

            IF to_regclass('store_monitoring_status') IS NOT NULL THEN
                CREATE INDEX IF NOT EXISTS ix_store_monitoring_last_seen_at ON store_monitoring_status (last_seen_at);
                CREATE INDEX IF NOT EXISTS ix_store_monitoring_reported_status ON store_monitoring_status (reported_status);
            END IF;
        END $$;
        """)

        # 4) Constraints só entram se os dados atuais estiverem compatíveis.
        # Isso evita rollback total da migration e erro indireto de CORS no frontend.
        op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_role')
               AND NOT EXISTS (SELECT 1 FROM users WHERE role IS NULL OR role NOT IN ('ADMIN', 'TECH', 'CLIENT')) THEN
                ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('ADMIN', 'TECH', 'CLIENT'));
            END IF;
        END $$;
        """)
        op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tickets_type')
               AND NOT EXISTS (SELECT 1 FROM tickets WHERE type IS NULL OR type NOT IN ({VALID_TICKET_TYPES_SQL})) THEN
                ALTER TABLE tickets ADD CONSTRAINT ck_tickets_type CHECK (type IN ({VALID_TICKET_TYPES_SQL}));
            END IF;

            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tickets_priority')
               AND NOT EXISTS (SELECT 1 FROM tickets WHERE priority IS NULL OR priority NOT IN ('NORMAL', 'URGENTE')) THEN
                ALTER TABLE tickets ADD CONSTRAINT ck_tickets_priority CHECK (priority IN ('NORMAL', 'URGENTE'));
            END IF;

            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tickets_status')
               AND NOT EXISTS (SELECT 1 FROM tickets WHERE status IS NULL OR status NOT IN ('ABERTO', 'ATRIBUIDO', 'EM_ATENDIMENTO', 'PENDENTE', 'CONCLUIDO', 'CANCELADO')) THEN
                ALTER TABLE tickets ADD CONSTRAINT ck_tickets_status CHECK (status IN ('ABERTO', 'ATRIBUIDO', 'EM_ATENDIMENTO', 'PENDENTE', 'CONCLUIDO', 'CANCELADO'));
            END IF;
        END $$;
        """)
    else:
        inspector = sa.inspect(bind)
        columns = [c["name"] for c in inspector.get_columns("stores")]
        if "cnpj_digits" not in columns:
            op.add_column("stores", sa.Column("cnpj_digits", sa.String(length=14), nullable=True))
        try:
            op.create_index("ix_stores_cnpj_digits", "stores", ["cnpj_digits"], unique=True)
        except Exception:
            pass


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_stores_cnpj_digits")
        op.execute("ALTER TABLE stores DROP COLUMN IF EXISTS cnpj_digits")
        op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role")
        op.execute("ALTER TABLE tickets DROP CONSTRAINT IF EXISTS ck_tickets_type")
        op.execute("ALTER TABLE tickets DROP CONSTRAINT IF EXISTS ck_tickets_priority")
        op.execute("ALTER TABLE tickets DROP CONSTRAINT IF EXISTS ck_tickets_status")
    else:
        try:
            op.drop_index("ix_stores_cnpj_digits", table_name="stores")
        except Exception:
            pass
