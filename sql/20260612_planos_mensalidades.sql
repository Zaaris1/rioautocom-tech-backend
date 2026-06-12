-- RioAutocom Tech - Planos, mensalidades e bloqueio
-- Seguro para rodar no PostgreSQL: usa CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  max_stores INTEGER NULL,
  max_users INTEGER NULL,
  features_json TEXT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_billing_plans_active ON billing_plans(active);

CREATE TABLE IF NOT EXISTS client_subscriptions (
  id TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  plan_id TEXT NULL REFERENCES billing_plans(id),
  status TEXT NOT NULL DEFAULT 'ATIVO',
  monthly_price_cents INTEGER NULL,
  due_day INTEGER NULL,
  next_due_date TIMESTAMPTZ NULL,
  trial_until TIMESTAMPTZ NULL,
  blocked_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_client_subscriptions_client_user_id ON client_subscriptions(client_user_id);
CREATE INDEX IF NOT EXISTS ix_client_subscriptions_status ON client_subscriptions(status);
CREATE INDEX IF NOT EXISTS ix_client_subscriptions_next_due_date ON client_subscriptions(next_due_date);

INSERT INTO billing_plans (id, name, description, monthly_price_cents, max_stores, max_users, features_json, active)
SELECT lower(md5(random()::text || clock_timestamp()::text)), 'Básico', 'Chamados, histórico e portal do cliente.', 14990, 3, 3, '["Chamados", "Histórico", "Portal do cliente"]', TRUE
WHERE NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Básico');

INSERT INTO billing_plans (id, name, description, monthly_price_cents, max_stores, max_users, features_json, active)
SELECT lower(md5(random()::text || clock_timestamp()::text)), 'Profissional', 'Chamados, monitoramento, relatórios e alertas operacionais.', 29990, 10, 8, '["Chamados", "Monitoramento", "Relatórios", "Alertas"]', TRUE
WHERE NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Profissional');

INSERT INTO billing_plans (id, name, description, monthly_price_cents, max_stores, max_users, features_json, active)
SELECT lower(md5(random()::text || clock_timestamp()::text)), 'Premium', 'Operação completa com monitoramento, relatórios e controle avançado.', 49990, NULL, NULL, '["Chamados", "Monitoramento", "Relatórios", "Alertas", "Auditoria", "Portal do cliente"]', TRUE
WHERE NOT EXISTS (SELECT 1 FROM billing_plans WHERE name = 'Premium');
