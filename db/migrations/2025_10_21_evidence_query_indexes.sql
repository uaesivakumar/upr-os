-- Evidence Query Performance Indexes
-- Week 2 Day 3-4: Hierarchical Bayesian Evidence System
--
-- These indexes optimize the evidence gathering queries that scan
-- email_patterns by sector, region, and TLD with recency weighting.
--
-- Usage:
-- psql $DATABASE_URL -f db/migrations/2025_10_21_evidence_query_indexes.sql
--
-- Note: Using CONCURRENTLY - cannot run inside transaction block

-- Index 1: Sector + Region evidence queries
-- Supports: WHERE sector ILIKE '%X%' AND region ILIKE '%Y%' AND confidence >= 0.70
-- Partial index (only high-confidence validated patterns)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_patterns_sector_region_recent
  ON email_patterns(sector, region, verified_at DESC)
  WHERE confidence >= 0.70
    AND last_source IN ('rag', 'llm', 'manual', 'nb_validation');

COMMENT ON INDEX idx_email_patterns_sector_region_recent IS
  'Evidence query: Sector + Region with recency weighting';

-- Index 2: Sector-only evidence queries
-- Supports: WHERE sector ILIKE '%X%' AND confidence >= 0.70
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_patterns_sector_recent
  ON email_patterns(sector, verified_at DESC)
  WHERE confidence >= 0.70
    AND last_source IN ('rag', 'llm', 'manual', 'nb_validation');

COMMENT ON INDEX idx_email_patterns_sector_recent IS
  'Evidence query: Sector-only with recency weighting';

-- Index 3: TLD evidence queries
-- Supports: WHERE domain LIKE '%.ae' AND confidence >= 0.70
-- Use functional index on TLD extraction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_patterns_tld_recent
  ON email_patterns(
    (SPLIT_PART(domain, '.', -1)), -- Extract TLD (last segment)
    verified_at DESC
  )
  WHERE confidence >= 0.70
    AND last_source IN ('rag', 'llm', 'manual', 'nb_validation');

COMMENT ON INDEX idx_email_patterns_tld_recent IS
  'Evidence query: TLD with recency weighting';

-- Index 4: Region + TLD evidence queries
-- Supports: WHERE region ILIKE '%X%' AND domain LIKE '%.ae'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_patterns_region_tld_recent
  ON email_patterns(
    region,
    (SPLIT_PART(domain, '.', -1)),
    verified_at DESC
  )
  WHERE confidence >= 0.70
    AND last_source IN ('rag', 'llm', 'manual', 'nb_validation');

COMMENT ON INDEX idx_email_patterns_region_tld_recent IS
  'Evidence query: Region + TLD with recency weighting';

-- Index 5: pgvector IVFFlat optimization (if not already tuned)
-- Check current index parameters
DO $$
DECLARE
  idx_exists boolean;
BEGIN
  -- Check if vector index exists
  SELECT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE tablename = 'email_patterns'
      AND indexname LIKE '%embedding%'
  ) INTO idx_exists;

  IF idx_exists THEN
    RAISE NOTICE 'Vector index exists. Consider tuning lists parameter based on table size.';
    RAISE NOTICE 'Current table size: %', (SELECT COUNT(*) FROM email_patterns);
    RAISE NOTICE 'Recommended lists: 64 for <50k rows, 128 for 50k-200k rows, 256 for >200k rows';
    RAISE NOTICE 'Re-index with: CREATE INDEX CONCURRENTLY ... USING ivfflat (embedding vector_cosine_ops) WITH (lists = N);';
  END IF;
END $$;

-- Vacuum analyze after index creation
ANALYZE email_patterns;

-- Performance verification queries
-- Run these to verify indexes are being used:

/*
-- Test 1: Sector + Region
EXPLAIN (ANALYZE, BUFFERS)
SELECT pattern, COUNT(*) FROM email_patterns
WHERE sector ILIKE '%Banking%'
  AND region ILIKE '%UAE%'
  AND confidence >= 0.70
  AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
GROUP BY pattern;

-- Test 2: TLD
EXPLAIN (ANALYZE, BUFFERS)
SELECT pattern, COUNT(*) FROM email_patterns
WHERE SPLIT_PART(domain, '.', -1) = 'ae'
  AND confidence >= 0.70
  AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
GROUP BY pattern;

-- Test 3: Recency weighting
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  pattern,
  SUM(
    EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - verified_at))/86400, 0) / 180)
    * LEAST(GREATEST(confidence, 0.70), 1.0)
  ) AS weighted_count
FROM email_patterns
WHERE sector ILIKE '%Banking%'
  AND confidence >= 0.70
  AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
GROUP BY pattern;
*/
