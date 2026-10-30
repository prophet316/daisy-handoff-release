-- Read a running job's live notes and log. Additive only.
-- live_req: when {{OWNER}} last asked to see a running job as it is now; live_at: when the worker last sent that snapshot.
ALTER TABLE jobs ADD COLUMN live_req TEXT;
ALTER TABLE jobs ADD COLUMN live_at TEXT;
-- The live snapshot of a running job (its folder now, its project's PROGRESS.md/JARVIS.md, its log tail), redacted by the worker.
-- Kept apart from job_files (the last finished run) and cleared when the job finishes.
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
