-- Jarvis phase 4b: find jobs by meaning, steer running jobs, live status, stop-all, the host lane, dead-man alarm, health,
-- approved Gmail sends. Additive only: new columns and new tables. Nothing is dropped or rebuilt.
-- progress: JSON {step, at, done, total} from the running job's hooks. target: vm or host for computer jobs.
-- held: JSON of the exact email held for approval {account, from, to, cc, bcc, subject, body, hash}. sent: JSON record once sent.
ALTER TABLE jobs ADD COLUMN progress TEXT;
ALTER TABLE jobs ADD COLUMN target TEXT;
ALTER TABLE jobs ADD COLUMN held TEXT;
ALTER TABLE jobs ADD COLUMN sent TEXT;
-- Messages {{OWNER}} sends to a running job; the worker passes each one to the agent once, mid-run.
CREATE TABLE IF NOT EXISTS job_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS job_messages_job ON job_messages (job_id, delivered_at);
-- Small key/value state: paused, worker heartbeat, alarm state, the worker's health snapshot.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
-- Embeddings for find_job (Workers AI), keyed by job; text_hash says when a job's text changed and needs a new vector.
CREATE TABLE IF NOT EXISTS job_vectors (
  job_id TEXT PRIMARY KEY,
  text_hash TEXT NOT NULL,
  vec TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
