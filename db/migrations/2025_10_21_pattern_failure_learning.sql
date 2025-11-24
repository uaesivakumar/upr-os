-- Pattern Failure Learning System
-- Week 3: Turn expensive mistakes into training data
--
-- Purpose:
-- 1. Track validation failures to avoid repeating mistakes
-- 2. Use similarity search to find similar past failures
-- 3. Learn from corrections when right pattern eventually discovered
-- 4. Reduce wasted NeverBounce costs by 21-50%
--
-- Usage:
-- psql $DATABASE_URL -f db/migrations/2025_10_21_pattern_failure_learning.sql

BEGIN;

-- Table: pattern_failures
-- Stores failed pattern validation attempts with context for learning
CREATE TABLE IF NOT EXISTS pattern_failures (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  company_name VARCHAR(500),
  attempted_pattern VARCHAR(50) NOT NULL,
  sector VARCHAR(200),
  region VARCHAR(200),
  company_size VARCHAR(50),

  -- Failure details
  failed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  validation_results JSONB DEFAULT '{}'::jsonb,  -- Which emails failed
  failure_reason TEXT,

  -- Context for similarity matching
  embedding vector(1536),  -- OpenAI embedding for similarity search
  evidence_summary JSONB DEFAULT '{}'::jsonb,  -- What evidence led to this choice

  -- Learning from corrections
  correct_pattern VARCHAR(50),  -- Filled in when we discover the right pattern
  corrected_at TIMESTAMP,
  correction_confidence NUMERIC(3, 2),

  -- Metadata
  cost_wasted NUMERIC(6, 4) DEFAULT 0.024,  -- How much this failure cost
  prevented_repeats INTEGER DEFAULT 0,  -- How many times we've avoided this mistake
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index: Fast domain lookups
CREATE INDEX IF NOT EXISTS idx_pattern_failures_domain
  ON pattern_failures(domain);

-- Index: Fast sector+region lookups
CREATE INDEX IF NOT EXISTS idx_pattern_failures_context
  ON pattern_failures(sector, region)
  WHERE sector IS NOT NULL AND region IS NOT NULL;

-- Index: Vector similarity search (only if pgvector available)
-- This will be created by the application when first failure is stored
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    -- Check if index doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'pattern_failures'
      AND indexname = 'idx_pattern_failures_embedding'
    ) THEN
      -- Create vector index for similarity search
      -- Using ivfflat with 10 lists (suitable for small-medium datasets)
      EXECUTE 'CREATE INDEX idx_pattern_failures_embedding ON pattern_failures
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)';
      RAISE NOTICE 'Vector index created on pattern_failures.embedding';
    END IF;
  ELSE
    RAISE NOTICE 'pgvector not available - similarity search will use text matching';
  END IF;
END $$;

-- Index: Uncorrected failures (for analysis)
CREATE INDEX IF NOT EXISTS idx_pattern_failures_uncorrected
  ON pattern_failures(failed_at DESC)
  WHERE correct_pattern IS NULL;

COMMENT ON TABLE pattern_failures IS
  'Tracks failed pattern validation attempts to avoid repeating expensive mistakes';

COMMENT ON COLUMN pattern_failures.embedding IS
  'OpenAI embedding (1536-dim) for similarity search of similar failures';

COMMENT ON COLUMN pattern_failures.correct_pattern IS
  'Set when we eventually discover the correct pattern for this domain';

COMMENT ON COLUMN pattern_failures.prevented_repeats IS
  'Number of times we avoided repeating this mistake (cost savings metric)';

-- View 1: Failure insights
CREATE OR REPLACE VIEW v_pattern_failure_insights AS
SELECT
  attempted_pattern,
  COUNT(*) as failure_count,
  COUNT(*) FILTER (WHERE correct_pattern IS NOT NULL) as corrections_learned,
  ROUND(AVG(EXTRACT(EPOCH FROM (corrected_at - failed_at)) / 86400), 1) as avg_days_to_correction,
  SUM(prevented_repeats) as total_repeats_prevented,
  ROUND(SUM(prevented_repeats * cost_wasted), 2) as total_savings,
  ARRAY_AGG(DISTINCT sector) FILTER (WHERE sector IS NOT NULL) as common_sectors,
  ARRAY_AGG(DISTINCT region) FILTER (WHERE region IS NOT NULL) as common_regions
FROM pattern_failures
GROUP BY attempted_pattern
ORDER BY failure_count DESC;

COMMENT ON VIEW v_pattern_failure_insights IS
  'Analytics view showing which patterns fail most often and learning effectiveness';

-- View 2: Stubborn domains (multiple failures, no correction yet)
CREATE OR REPLACE VIEW v_stubborn_domains AS
SELECT
  domain,
  company_name,
  COUNT(*) as attempt_count,
  ARRAY_AGG(attempted_pattern ORDER BY failed_at DESC) as tried_patterns,
  MAX(failed_at) as last_attempt,
  sector,
  region
FROM pattern_failures
WHERE correct_pattern IS NULL
GROUP BY domain, company_name, sector, region
HAVING COUNT(*) >= 2
ORDER BY attempt_count DESC, last_attempt DESC;

COMMENT ON VIEW v_stubborn_domains IS
  'Domains with multiple failed attempts - need special attention or manual research';

-- View 3: Learning effectiveness (cost savings from prevented repeats)
CREATE OR REPLACE VIEW v_failure_learning_roi AS
SELECT
  COUNT(*) as total_failures,
  COUNT(*) FILTER (WHERE correct_pattern IS NOT NULL) as failures_with_corrections,
  ROUND(100.0 * COUNT(*) FILTER (WHERE correct_pattern IS NOT NULL) / NULLIF(COUNT(*), 0), 1) as correction_rate_pct,
  SUM(prevented_repeats) as total_repeats_prevented,
  ROUND(SUM(cost_wasted), 2) as total_cost_wasted,
  ROUND(SUM(prevented_repeats * cost_wasted), 2) as total_cost_saved,
  ROUND(SUM(prevented_repeats * cost_wasted) / NULLIF(SUM(cost_wasted), 0), 2) as roi_multiple
FROM pattern_failures;

COMMENT ON VIEW v_failure_learning_roi IS
  'ROI metrics showing how much money failure learning has saved';

-- Function: Increment prevented_repeats when we avoid a mistake
CREATE OR REPLACE FUNCTION increment_prevented_repeat(failure_id INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE pattern_failures
  SET
    prevented_repeats = prevented_repeats + 1,
    updated_at = NOW()
  WHERE id = failure_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_prevented_repeat IS
  'Increment counter when we successfully avoid repeating a past failure';

-- Function: Update with correct pattern when discovered
CREATE OR REPLACE FUNCTION update_failure_with_correction(
  failure_domain VARCHAR(255),
  correct_pat VARCHAR(50),
  conf NUMERIC(3, 2)
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE pattern_failures
  SET
    correct_pattern = correct_pat,
    corrected_at = NOW(),
    correction_confidence = conf,
    updated_at = NOW()
  WHERE domain = failure_domain
    AND correct_pattern IS NULL
  RETURNING 1 INTO updated_count;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_failure_with_correction IS
  'Update past failures with correct pattern when eventually discovered';

COMMIT;

-- Example queries for monitoring

/*
-- Check recent failures
SELECT
  domain,
  company_name,
  attempted_pattern,
  failed_at,
  correct_pattern,
  prevented_repeats
FROM pattern_failures
ORDER BY failed_at DESC
LIMIT 10;

-- View failure insights by pattern
SELECT * FROM v_pattern_failure_insights;

-- Find stubborn domains needing manual research
SELECT * FROM v_stubborn_domains
LIMIT 10;

-- Calculate ROI from failure learning
SELECT * FROM v_failure_learning_roi;

-- Find similar failures for a new domain (example)
SELECT
  id,
  domain,
  attempted_pattern,
  correct_pattern,
  embedding <=> (SELECT embedding FROM pattern_failures WHERE id = 1) as similarity
FROM pattern_failures
WHERE embedding IS NOT NULL
ORDER BY similarity ASC
LIMIT 5;

-- Update failures when correct pattern discovered
SELECT update_failure_with_correction('example.com', '{first}.{last}', 0.92);

-- Check savings from prevented repeats
SELECT
  SUM(prevented_repeats) as total_prevented,
  SUM(prevented_repeats * 0.024) as total_saved_dollars
FROM pattern_failures;
*/
