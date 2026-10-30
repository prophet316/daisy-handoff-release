-- Jarvis phase 2: threads, modes, project folders, parallel claiming, publish and share.
-- Additive only: new columns and a new table. Nothing is dropped or rebuilt.
-- mode: code, research, writing or design (the worker maps each to its own instructions and tool set).
-- project_dir: absolute folder under {{OWNER}}'s home the job works in; NULL means its own job folder.
-- thread_id: the thread this job belongs to; jobs in one thread run one at a time and continue one Claude session.
-- publish: JSON {"to":"google_doc"|"google_drive","file":...,"title":...}; share_with: JSON [{"who":email|"anyone","role":...}].
-- published: JSON of what the worker published and shared, with links. claimed_by: which worker runs it.
ALTER TABLE jobs ADD COLUMN mode TEXT NOT NULL DEFAULT 'code';
ALTER TABLE jobs ADD COLUMN project_dir TEXT;
ALTER TABLE jobs ADD COLUMN thread_id TEXT;
ALTER TABLE jobs ADD COLUMN publish TEXT;
ALTER TABLE jobs ADD COLUMN share_with TEXT;
ALTER TABLE jobs ADD COLUMN published TEXT;
ALTER TABLE jobs ADD COLUMN claimed_by TEXT;
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
