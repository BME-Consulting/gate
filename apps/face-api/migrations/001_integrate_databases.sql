-- ==========================================
-- Face API Database Integration & Normalization
-- ==========================================
--
-- Purpose: Integrate workers.db and embeddings.db into a single normalized database
--
-- Design:
--   1. workers table: Core worker information
--   2. face_embeddings table: Face recognition data (referenced by person_id)
--   3. Proper foreign key relationships
--
-- ==========================================

-- Create face_embeddings table in workers.db
CREATE TABLE IF NOT EXISTS face_embeddings (
    person_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    embedding_dimensions INTEGER NOT NULL DEFAULT 128,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (person_id) REFERENCES workers(person_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_person_id
    ON face_embeddings(person_id);

-- Remove face_embedding column from workers table (deprecated)
-- NOTE: SQLite doesn't support DROP COLUMN, so we'll ignore it for now
-- The application will use face_embeddings table instead

-- Migration will be handled by Node.js script to:
-- 1. Copy data from old embeddings.db to workers.db
-- 2. Verify data integrity
-- 3. Backup old databases
