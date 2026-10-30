-- Who saved it: NULL means the owner, from their own Claude chat. Anything else is an agent's label, e.g. "agent build-bot".
-- Runs of an agent's schedule or routine are marked as that agent's, never as the owner's.
ALTER TABLE schedules ADD COLUMN created_by TEXT;
ALTER TABLE routines ADD COLUMN created_by TEXT;
