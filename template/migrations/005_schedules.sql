-- Scheduled and recurring jobs, saved routines, the daily digest.
-- Additive only: new columns and new tables. Nothing is dropped or rebuilt.
-- origin: what {{OWNER}} saved that made this job (a schedule or a routine run); the saved text is {{HIS}} approval for exactly that.
-- after_job: a routine step waits until this earlier step has ended. run_group: all steps of one routine run.
ALTER TABLE jobs ADD COLUMN origin TEXT;
ALTER TABLE jobs ADD COLUMN after_job TEXT;
ALTER TABLE jobs ADD COLUMN run_group TEXT;
-- kind: job (job holds the saved request), routine (routine_id), digest (one row, id 'digest').
-- repeat: once, daily, weekdays, weekly (days like 'mon,thu'). at_time: HH:MM in the install's time zone (TIME_ZONE in src/index.js). next_run_at: UTC ISO, NULL when over.
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'job',
  repeat TEXT NOT NULL DEFAULT 'once',
  at_time TEXT NOT NULL,
  days TEXT,
  job TEXT,
  routine_id TEXT,
  next_run_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_job_id TEXT,
  last_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS schedules_due ON schedules (enabled, next_run_at);
-- steps: JSON [{title, details, mode, project_dir}], run one after another.
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  steps TEXT NOT NULL,
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
