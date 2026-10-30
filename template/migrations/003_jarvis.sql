-- Jarvis phase 1: follow-up runs (approve, reply, retry) and job files {{OWNER}} can read from any chat.
-- Additive only: new columns and a new table. Nothing is dropped or rebuilt.
-- run_mode: what the next run of a queued job is: fresh (first run), approved, reply, retry.
-- followup: {{OWNER}}'s note, answer, or new instructions for that next run. Cleared when the run finishes.
-- session_id: Claude Code session from the last run, so approved and reply runs continue the same conversation.
ALTER TABLE jobs ADD COLUMN run_mode TEXT NOT NULL DEFAULT 'fresh';
ALTER TABLE jobs ADD COLUMN followup TEXT;
ALTER TABLE jobs ADD COLUMN session_id TEXT;
ALTER TABLE jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN approved_at TEXT;
ALTER TABLE jobs ADD COLUMN history TEXT NOT NULL DEFAULT '';
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
