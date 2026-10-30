-- Adds the needs_approval status and start/finish times. Old table is kept as a backup, not dropped.
ALTER TABLE jobs RENAME TO jobs_backup_20261021;
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','needs_approval')),
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
INSERT INTO jobs (id, title, details, status, result, created_at, updated_at)
  SELECT id, title, details, status, result, created_at, updated_at FROM jobs_backup_20261021;
CREATE INDEX IF NOT EXISTS jobs_status_created_v2 ON jobs (status, created_at);
