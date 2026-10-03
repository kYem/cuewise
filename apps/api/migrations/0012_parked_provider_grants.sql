-- ENG-136. An unclaimed provider grant gets its own table: it must be revoked upstream before it may
-- go, where a sign-in code is simply deleted. Rows parked in auth_codes move across; see Deploy.
CREATE TABLE parked_provider_grants (
  code_hash            TEXT PRIMARY KEY,
  provider             TEXT NOT NULL,
  ciphertext           TEXT NOT NULL,
  iv                   TEXT NOT NULL,
  token_fingerprint    TEXT NOT NULL,
  refresh_ciphertext   TEXT,
  refresh_iv           TEXT,
  workspace            TEXT,
  code_challenge       TEXT NOT NULL,
  expires_at           INTEGER NOT NULL,
  revoke_attempted_at  INTEGER,
  CHECK ((refresh_ciphertext IS NULL) = (refresh_iv IS NULL))
);
CREATE INDEX parked_provider_grants_expires_idx ON parked_provider_grants (provider, expires_at);

INSERT INTO parked_provider_grants (
  code_hash, provider, ciphertext, iv, token_fingerprint, refresh_ciphertext, refresh_iv, workspace,
  code_challenge, expires_at, revoke_attempted_at
)
SELECT
  code_hash,
  'notion',
  json_extract(payload, '$.grant.ciphertext'),
  json_extract(payload, '$.grant.iv'),
  json_extract(payload, '$.grant.tokenFingerprint'),
  json_extract(payload, '$.grant.refreshCiphertext'),
  json_extract(payload, '$.grant.refreshIv'),
  json_extract(payload, '$.grant.workspace'),
  code_challenge,
  expires_at,
  revoke_attempted_at
FROM auth_codes
WHERE json_extract(payload, '$.provider') = 'notion';

DELETE FROM auth_codes WHERE json_extract(payload, '$.provider') = 'notion';
