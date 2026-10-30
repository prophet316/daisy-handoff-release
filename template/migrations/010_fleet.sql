-- Phase 5 groundwork: several machines, ability tags, a named target, parent/child jobs, held lane locks, recipes.
-- Additive only. With FLEET off and these columns empty, claiming behaves exactly as before.
ALTER TABLE jobs ADD COLUMN machine TEXT;      -- run only on this named machine (NULL = any)
ALTER TABLE jobs ADD COLUMN needs TEXT;        -- JSON array of abilities the machine must have, e.g. ["resolve","gpu"]
ALTER TABLE jobs ADD COLUMN parent_id TEXT;    -- set on a child task
ALTER TABLE jobs ADD COLUMN depends_on TEXT;   -- JSON array of job ids that must be done first
ALTER TABLE jobs ADD COLUMN lanes TEXT;        -- JSON array of lane keys, e.g. ["timeline:ep12-color"]
ALTER TABLE jobs ADD COLUMN children INTEGER NOT NULL DEFAULT 0;  -- >0: a parent; never claimed itself, finishes when its children do
ALTER TABLE jobs ADD COLUMN recipe TEXT;       -- recipe name a parent was started from
CREATE INDEX IF NOT EXISTS jobs_parent ON jobs (parent_id);

CREATE TABLE IF NOT EXISTS machines (
  name TEXT PRIMARY KEY,          -- e.g. "studio", "mini-1", "gaming-laptop"
  abilities TEXT NOT NULL DEFAULT '[]',
  os TEXT,
  max_slots INTEGER NOT NULL DEFAULT 1,
  running INTEGER NOT NULL DEFAULT 0,
  version TEXT,
  disk TEXT,
  last_seen TEXT NOT NULL,
  first_seen TEXT NOT NULL
);

-- A held lane belongs to one job (usually a parent) until it finishes or {{OWNER}} releases it; only that job and its children may use it.
-- Lanes of running jobs need no row here: claiming checks running jobs directly, in the same statement.
CREATE TABLE IF NOT EXISTS lane_locks (
  lane TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  taken_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  spec TEXT NOT NULL,             -- JSON: { lanes?, steps: [{ key, title, details?, machine?, needs?, lanes?, after?, mode? }] }
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
