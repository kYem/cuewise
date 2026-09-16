-- Third-party OAuth grants (ENG-115). Deliberately NOT in `records`: the Worker must read these
-- to call the provider, so the ciphertext-only guarantee cannot cover them. Keeping them in their
-- own table is what lets that guarantee stay literally true of sync data.
-- ciphertext/iv are AES-GCM under PROVIDER_TOKEN_KEY, never the user's sync key.
-- The refresh pair is nullable: Notion's token response declares refresh_token as `string | null`
-- and documents no expires_in, so only some grants expire and only those can be renewed.
-- data_source_id is the table queried; Notion's schema lives on the data source, not the database.
CREATE TABLE provider_tokens (
  user_id            TEXT NOT NULL REFERENCES users(id),
  provider           TEXT NOT NULL,
  ciphertext         TEXT NOT NULL,
  iv                 TEXT NOT NULL,
  refresh_ciphertext TEXT,
  refresh_iv         TEXT,
  workspace          TEXT,
  data_source_id     TEXT,
  created_at         INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);
