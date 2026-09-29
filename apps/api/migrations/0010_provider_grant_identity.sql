-- ENG-142. All nullable, so the previous Worker's inserts and updates still succeed while a deploy
-- rolls out; the new Worker heals a missing or stale fingerprint the first time it opens the grant.
ALTER TABLE provider_tokens ADD COLUMN token_fingerprint TEXT;
ALTER TABLE provider_tokens ADD COLUMN completion_property TEXT;
ALTER TABLE auth_codes ADD COLUMN revoke_attempted_at INTEGER;
