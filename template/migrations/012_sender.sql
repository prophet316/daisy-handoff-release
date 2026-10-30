-- Who sent it: NULL means the owner, from their own Claude chat. Anything else is an agent's label, e.g. "agent build-bot".
ALTER TABLE job_messages ADD COLUMN sender TEXT;
ALTER TABLE jobs ADD COLUMN created_by TEXT;
ALTER TABLE jobs ADD COLUMN followup_from TEXT;
