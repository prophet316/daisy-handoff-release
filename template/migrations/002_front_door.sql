-- Front door: adds reported_at (has {{OWNER}} heard about this job?), cancel_requested, and the cancelled status.
-- Status is now checked in code instead of a table rule, so future statuses need no table rebuild.
-- Old table is kept as a backup, not dropped.
ALTER TABLE jobs RENAME TO jobs_backup_20261021b;
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  reported_at TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0
);
INSERT INTO jobs (id, title, details, status, result, created_at, updated_at, started_at, finished_at, reported_at)
  SELECT id, title, details, status, result, created_at, updated_at, started_at, finished_at,
         CASE WHEN status IN ('done','failed','needs_approval') THEN updated_at END
  FROM jobs_backup_20261021b;
CREATE INDEX IF NOT EXISTS jobs_status_created_v3 ON jobs (status, created_at);
