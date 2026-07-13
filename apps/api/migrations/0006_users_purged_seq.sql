-- Highest seq ever purged for this user, so GET /changes can detect a since
-- cursor that predates a purged tombstone (which would resurrect a delete).
ALTER TABLE users ADD COLUMN purged_seq INTEGER NOT NULL DEFAULT 0;
