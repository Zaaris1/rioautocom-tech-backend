-- RioAutocom Tech — Histórico de Monitoramento
-- Use manualmente apenas se a tabela não for criada automaticamente pelo deploy do backend.

CREATE TABLE IF NOT EXISTS monitoring_events (
    id VARCHAR PRIMARY KEY,
    store_id VARCHAR NOT NULL REFERENCES stores(id),
    category VARCHAR NOT NULL,
    event_type VARCHAR NOT NULL,
    severity VARCHAR NOT NULL DEFAULT 'INFO',
    title VARCHAR NOT NULL,
    message TEXT NULL,
    status_from VARCHAR NULL,
    status_to VARCHAR NULL,
    payload_json TEXT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_monitoring_events_store_id ON monitoring_events(store_id);
CREATE INDEX IF NOT EXISTS ix_monitoring_events_occurred_at ON monitoring_events(occurred_at);
CREATE INDEX IF NOT EXISTS ix_monitoring_events_category ON monitoring_events(category);
CREATE INDEX IF NOT EXISTS ix_monitoring_events_severity ON monitoring_events(severity);
