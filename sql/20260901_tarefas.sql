CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title VARCHAR NOT NULL,
  description TEXT NULL,
  status VARCHAR NOT NULL DEFAULT 'PENDENTE',
  due_at TIMESTAMPTZ NULL,
  assigned_tech_id TEXT NULL REFERENCES users(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS ix_tasks_assigned_tech_id ON tasks(assigned_tech_id);
CREATE INDEX IF NOT EXISTS ix_tasks_due_at ON tasks(due_at);

