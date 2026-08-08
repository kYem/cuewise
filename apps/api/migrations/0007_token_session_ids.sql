ALTER TABLE tokens ADD COLUMN id TEXT NOT NULL DEFAULT '';
UPDATE tokens SET id = lower(hex(randomblob(16))) WHERE id = '';
-- Partial on purpose. A Worker that predates the id column still inserts rows at the '' default —
-- true during the apply-then-deploy window and after any rollback. The index is table-global, so a
-- total one would 500 every sign-in after the first such row, for any user. Excluding '' degrades
-- that to "those rows aren't individually revocable" while still enforcing real handles.
CREATE UNIQUE INDEX idx_tokens_id ON tokens (id) WHERE id != '';
