-- Third-party OAuth grants (ENG-115). Not in `records`: the Worker must decrypt these to call the
-- provider, so a separate table keeps the ciphertext-only guarantee literally true of sync data.
CREATE TABLE provider_tokens (
  user_id            TEXT NOT NULL REFERENCES users(id),
  provider           TEXT NOT NULL,
  ciphertext         TEXT NOT NULL,
  iv                 TEXT NOT NULL,
  refresh_ciphertext TEXT,
  refresh_iv         TEXT,
  workspace          TEXT,
  data_source_id     TEXT,
  renewal_started_at INTEGER,
  created_at         INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider),
  CHECK ((refresh_ciphertext IS NULL) = (refresh_iv IS NULL))
);
