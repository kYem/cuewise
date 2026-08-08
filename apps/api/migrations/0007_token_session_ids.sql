-- Rebuild rather than ADD COLUMN: SQLite forbids an expression default on an added column, so the
-- id would have to default to '' and a Worker predating this migration would keep minting rows
-- with no addressable handle — during the apply-then-deploy window and after any rollback. A
-- generating default makes that impossible, which is what lets the unique index below be total.
CREATE TABLE tokens_new (
  token_hash TEXT PRIMARY KEY,
  -- Default generates one when the column is omitted; the CHECK stops anything writing a blank
  -- explicitly, so "every row has an addressable handle" is enforced by the schema, not convention.
  id TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))) CHECK (id <> ''),
  user_id TEXT NOT NULL REFERENCES users(id),
  device_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_used_at INTEGER,
  window_start INTEGER NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- id omitted so the default generates one per row.
INSERT INTO tokens_new (
  token_hash, user_id, device_name, expires_at, revoked_at, last_used_at,
  window_start, window_count, created_at
)
SELECT
  token_hash, user_id, device_name, expires_at, revoked_at, last_used_at,
  window_start, window_count, created_at
FROM tokens;

DROP TABLE tokens;
ALTER TABLE tokens_new RENAME TO tokens;

CREATE INDEX idx_tokens_user ON tokens (user_id);
CREATE UNIQUE INDEX idx_tokens_id ON tokens (id);
