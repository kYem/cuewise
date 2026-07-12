-- Partial index over tombstones only, so the daily purge sweep
-- (DELETE WHERE deleted = 1 AND server_received_at < ?) avoids a full-table scan.
CREATE INDEX idx_records_tombstone ON records (server_received_at) WHERE deleted = 1;
