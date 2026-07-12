-- Speeds up the expired-row sweep that mintAuthCode runs on every call.
CREATE INDEX idx_auth_codes_expires ON auth_codes (expires_at);
