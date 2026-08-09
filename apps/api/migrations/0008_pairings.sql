-- Transient pairing relay rows (ENG-50): auth_codes shape, not key_envelopes — these are
-- one-shot and TTL'd, never durable key material. The server never reads the blobs.
-- Commit-then-reveal (2026-08-09 spec amendment): the requester posts only a commitment to
-- its key up front; requester_public_key/requester_nonce fill in only once revealed, which the
-- server refuses before a commit exists.
CREATE TABLE pairings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) CHECK (id <> ''),
  user_id TEXT NOT NULL REFERENCES users(id),
  requester_session_id TEXT NOT NULL,
  requester_commitment TEXT NOT NULL,
  requester_public_key TEXT,
  requester_nonce TEXT,
  approver_session_id TEXT,
  approver_public_key TEXT,
  envelope TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_pairings_user ON pairings (user_id);
-- One live request per session: create replaces the caller's own prior row.
CREATE UNIQUE INDEX idx_pairings_requester ON pairings (requester_session_id);
