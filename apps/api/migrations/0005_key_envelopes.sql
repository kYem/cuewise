-- Opaque client-wrapped key material (E2E: the server can never read these).
-- kind 'recovery' is the only v1 row; device pairing (ENG-53) adds 'device:<id>' rows.
CREATE TABLE key_envelopes (
  user_id    TEXT NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL,
  envelope   TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind)
);
