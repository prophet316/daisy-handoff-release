-- Emergency control lane + hard kill. Additive only.
-- cancel_at: when a stop was asked for; a running job not confirmed stopped 45 s later is marked cancelled anyway.
-- stall_alerted: when {{OWNER}} was last pushed that this job reports no step (stall watchdog).
ALTER TABLE jobs ADD COLUMN cancel_at TEXT;
ALTER TABLE jobs ADD COLUMN stall_alerted TEXT;
-- Commands for the supervisor on the {{MACHINE}} (worker/supervisor.mjs, its own launchd agent). They bypass the job
-- queue and the worker: stop/kill a job's processes, restart the worker or the bell, report status.
CREATE TABLE IF NOT EXISTS control (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  job_id TEXT,
  arg TEXT,
  created_at TEXT NOT NULL,
  taken_at TEXT,
  done_at TEXT,
  result TEXT
);
CREATE INDEX IF NOT EXISTS control_pending ON control (taken_at, id);
