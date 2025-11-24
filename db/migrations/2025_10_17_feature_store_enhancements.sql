-- Feature Store Enhancements
-- Feast-style feature management with versioning

-- Feature definitions registry
CREATE TABLE IF NOT EXISTS feature_definitions (
  id SERIAL PRIMARY KEY,

  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL, -- 'company', 'person', 'email'
  value_type TEXT NOT NULL, -- 'numeric', 'categorical', 'boolean', 'vector'

  -- Computation
  computation_logic JSONB, -- How to compute this feature
  dependencies TEXT[], -- Other features this depends on

  -- Versioning
  version TEXT NOT NULL DEFAULT 'v1',

  -- Metadata
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(name, version)
);

-- Feature lineage (tracks dependencies)
CREATE TABLE IF NOT EXISTS feature_lineage (
  id SERIAL PRIMARY KEY,

  feature_name TEXT NOT NULL UNIQUE,
  dependencies JSONB NOT NULL, -- [{name, version, type}]

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add feature hash to feature_store (for deduplication)
ALTER TABLE feature_store ADD COLUMN IF NOT EXISTS feature_hash TEXT;
CREATE INDEX IF NOT EXISTS feature_store_hash_idx ON feature_store(feature_hash);

-- Add unique constraint on hash (prevents duplicate feature storage)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feature_store_unique_hash'
  ) THEN
    ALTER TABLE feature_store
    ADD CONSTRAINT feature_store_unique_hash
    UNIQUE(entity_type, entity_id, feature_version, feature_hash);
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS feature_definitions_name_idx ON feature_definitions(name);
CREATE INDEX IF NOT EXISTS feature_definitions_entity_idx ON feature_definitions(entity_type);
CREATE INDEX IF NOT EXISTS feature_lineage_name_idx ON feature_lineage(feature_name);

COMMENT ON TABLE feature_definitions IS 'Feature registry with versioning (Feast-style)';
COMMENT ON TABLE feature_lineage IS 'Tracks feature dependencies for impact analysis';
COMMENT ON COLUMN feature_definitions.computation_logic IS 'SQL or Python code to compute feature';
COMMENT ON COLUMN feature_definitions.value_type IS 'Data type: numeric, categorical, boolean, vector';
