CREATE TABLE IF NOT EXISTS jobs (
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
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  run_mode TEXT NOT NULL DEFAULT 'fresh',
  followup TEXT,
  session_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  history TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'code',
  project_dir TEXT,
  thread_id TEXT,
  publish TEXT,
  share_with TEXT,
  published TEXT,
  claimed_by TEXT,
  origin TEXT,
  after_job TEXT,
  run_group TEXT,
  allow TEXT,
  progress TEXT,
  target TEXT,
  held TEXT,
  sent TEXT,
  live_req TEXT,
  live_at TEXT,
  cancel_at TEXT,
  stall_alerted TEXT,
  checkin TEXT,
  recoveries TEXT,
  created_by TEXT, -- NULL: the owner; else the agent that added the job
  followup_from TEXT -- NULL: the owner; else the agent behind the pending reply, retry or approval
);
CREATE INDEX IF NOT EXISTS jobs_status_created_v3 ON jobs (status, created_at);
CREATE TABLE IF NOT EXISTS job_files (
  job_id TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  content TEXT,
  truncated INTEGER NOT NULL DEFAULT 0,
  binary INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, path)
);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'code',
  project_dir TEXT,
  session_id TEXT,
  last_job_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_thread ON jobs (thread_id);

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
  updated_at TEXT NOT NULL,
  created_by TEXT -- NULL: the owner; else the agent that saved the schedule
);
CREATE INDEX IF NOT EXISTS schedules_due ON schedules (enabled, next_run_at);
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  steps TEXT NOT NULL,
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT -- NULL: the owner; else the agent that last saved its steps
);

CREATE TABLE IF NOT EXISTS job_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  sender TEXT -- NULL: the owner; else the agent that sent it
);
CREATE INDEX IF NOT EXISTS job_messages_job ON job_messages (job_id, delivered_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_vectors (
  job_id TEXT PRIMARY KEY,
  text_hash TEXT NOT NULL,
  vec TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_live (
  job_id TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  content TEXT,
  truncated INTEGER NOT NULL DEFAULT 0,
  binary INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, path)
);
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
