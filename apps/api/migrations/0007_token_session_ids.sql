-- The unique index must come after the backfill: ADD COLUMN puts every existing row at '',
-- so indexing first fails the moment the table holds two rows.
ALTER TABLE tokens ADD COLUMN id TEXT NOT NULL DEFAULT '';
UPDATE tokens SET id = lower(hex(randomblob(16))) WHERE id = '';
CREATE UNIQUE INDEX idx_tokens_id ON tokens (id);
