ALTER TABLE tokens ADD COLUMN id TEXT NOT NULL DEFAULT '';
UPDATE tokens SET id = lower(hex(randomblob(16))) WHERE id = '';
-- Partial on purpose. A Worker that predates the id column still inserts rows at the '' default —
-- true during the apply-then-deploy window and after any rollback — and a total unique index would
-- turn the second such sign-in into a 500 for that user. Excluding '' degrades that to "those rows
-- aren't individually revocable" while still enforcing uniqueness on every real handle.
CREATE UNIQUE INDEX idx_tokens_id ON tokens (id) WHERE id != '';
