-- Notion's /v1/oauth/token response declares refresh_token as `string | null` and documents no
-- expires_in, so whether a grant expires depends on what that field comes back as. Storing the
-- refresh token when present lets a 401 be retried once instead of forcing the user to reconnect.
-- Nullable: a connection that never received one simply has none.
ALTER TABLE provider_tokens ADD COLUMN refresh_ciphertext TEXT;
ALTER TABLE provider_tokens ADD COLUMN refresh_iv TEXT;
