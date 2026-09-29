-- ENG-142. provider_tokens was empty in production (Notion not live), so it is rebuilt rather than
-- altered: token_fingerprint is required, and a table is picked together with its property.
DROP TABLE provider_tokens;
CREATE TABLE provider_tokens (
  user_id              TEXT NOT NULL REFERENCES users(id),
  provider             TEXT NOT NULL,
  ciphertext           TEXT NOT NULL,
  iv                   TEXT NOT NULL,
  token_fingerprint    TEXT NOT NULL,
  refresh_ciphertext   TEXT,
  refresh_iv           TEXT,
  workspace            TEXT,
  data_source_id       TEXT,
  completion_property  TEXT,
  renewal_started_at   INTEGER,
  created_at           INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider),
  CHECK ((refresh_ciphertext IS NULL) = (refresh_iv IS NULL)),
  CHECK ((data_source_id IS NULL) = (completion_property IS NULL))
);
ALTER TABLE auth_codes ADD COLUMN revoke_attempted_at INTEGER;
