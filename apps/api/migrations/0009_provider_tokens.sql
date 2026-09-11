-- Third-party OAuth grants (ENG-115). Deliberately NOT in `records`: the Worker must read these
-- to call the provider, so the ciphertext-only guarantee cannot cover them. Keeping them in their
-- own table is what lets that guarantee stay literally true of sync data.
-- ciphertext/iv are AES-GCM under PROVIDER_TOKEN_KEY, never the user's sync key.
CREATE TABLE provider_tokens (
  user_id        TEXT NOT NULL REFERENCES users(id),
  provider       TEXT NOT NULL,
  ciphertext     TEXT NOT NULL,
  iv             TEXT NOT NULL,
  workspace      TEXT,
  database_id    TEXT,
  data_source_id TEXT,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);
