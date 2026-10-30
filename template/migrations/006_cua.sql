-- Jarvis phase 4: computer-use jobs in the CUA lane.
-- Additive only. allow: JSON list of gated kinds {{OWNER}} allowed for this one job (send, post, buy, delete, credentials, access).
ALTER TABLE jobs ADD COLUMN allow TEXT;
