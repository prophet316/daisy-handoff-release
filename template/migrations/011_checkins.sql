-- Hourly check-ins + self-healing stalls (job 94c3a255). Additive only.
-- checkin: the supervisor's latest check-in for a running job (JSON: n, at, text, progress, no_progress).
-- recoveries: its self-recovery attempts for the current run (JSON array: n, at, cause, why, step, decision, needs_jon, action).
ALTER TABLE jobs ADD COLUMN checkin TEXT;
ALTER TABLE jobs ADD COLUMN recoveries TEXT;
