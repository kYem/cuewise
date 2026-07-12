CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT,
  last_seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE identities (
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_sub)
);

CREATE TABLE tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_used_at INTEGER,
  window_start INTEGER NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE auth_codes (
  code_hash TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE records (
  user_id TEXT NOT NULL REFERENCES users(id),
  collection TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  client_updated_at INTEGER NOT NULL,
  server_received_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, collection, entity_id)
);

CREATE INDEX idx_records_user_seq ON records (user_id, seq);
CREATE INDEX idx_tokens_user ON tokens (user_id);
