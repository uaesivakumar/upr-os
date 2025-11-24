-- NeverBounce Cache & Token Bucket
-- Week 2 Day 3-4: Production cost controls
--
-- Purpose:
-- 1. nb_cache: 24-hour cache of NB validation results per email
-- 2. nb_token_bucket: Rate limiting (max 5 validations per domain per day)
--
-- Usage:
-- psql $DATABASE_URL -f db/migrations/2025_10_21_nb_cache_and_token_bucket.sql

BEGIN;

-- Table 1: NeverBounce result cache
-- Stores exact email validation results for 24 hours
-- Prevents duplicate API calls for same email
CREATE TABLE IF NOT EXISTS nb_cache (
  email VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL,           -- 'valid', 'invalid', 'accept_all', 'unknown', 'error'
  result VARCHAR(50),                    -- NB result code
  score NUMERIC(3, 2),                   -- Validation score (0.0 - 1.0)
  flags JSONB DEFAULT '{}'::jsonb,       -- Additional NB flags
  cached_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for cache expiry cleanup (no WHERE clause due to NOW() immutability)
CREATE INDEX IF NOT EXISTS idx_nb_cache_expiry
  ON nb_cache(cached_at);

COMMENT ON TABLE nb_cache IS
  'NeverBounce validation result cache (24h TTL)';

COMMENT ON COLUMN nb_cache.email IS
  'Exact email address (case-sensitive)';

COMMENT ON COLUMN nb_cache.status IS
  'Validation status: valid, invalid, accept_all, unknown, error';

COMMENT ON COLUMN nb_cache.cached_at IS
  'When this result was cached (used for TTL)';

-- Table 2: Token bucket for domain-level rate limiting
-- Limits NB API calls per domain to prevent cost overruns
CREATE TABLE IF NOT EXISTS nb_token_bucket (
  domain VARCHAR(255) PRIMARY KEY,
  tokens INTEGER NOT NULL DEFAULT 5,     -- Current token count
  last_refill TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT tokens_nonnegative CHECK (tokens >= 0),
  CONSTRAINT tokens_max CHECK (tokens <= 10)  -- Safety limit
);

-- Index for refill queries
CREATE INDEX IF NOT EXISTS idx_nb_token_bucket_refill
  ON nb_token_bucket(last_refill)
  WHERE tokens < 5;

COMMENT ON TABLE nb_token_bucket IS
  'Token bucket rate limiter for NeverBounce API (5 calls/domain/day)';

COMMENT ON COLUMN nb_token_bucket.tokens IS
  'Available tokens (max 5, refills to 5 every 24 hours)';

COMMENT ON COLUMN nb_token_bucket.last_refill IS
  'Last time tokens were refilled to max';

-- Function: Auto-refill tokens on access
-- This is handled in application code, but this function
-- can be used for manual maintenance/monitoring
CREATE OR REPLACE FUNCTION refill_nb_tokens()
RETURNS void AS $$
BEGIN
  UPDATE nb_token_bucket
  SET
    tokens = 5,
    last_refill = NOW(),
    updated_at = NOW()
  WHERE EXTRACT(EPOCH FROM (NOW() - last_refill)) / 3600 >= 24;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refill_nb_tokens IS
  'Manually refill tokens for domains where 24h have passed';

-- Monitoring views

-- View 1: Domains approaching rate limit
CREATE OR REPLACE VIEW v_nb_rate_limit_status AS
SELECT
  domain,
  tokens,
  last_refill,
  EXTRACT(EPOCH FROM (NOW() - last_refill)) / 3600 AS hours_since_refill,
  CASE
    WHEN tokens = 0 THEN 'EXHAUSTED'
    WHEN tokens <= 1 THEN 'CRITICAL'
    WHEN tokens <= 2 THEN 'WARNING'
    ELSE 'OK'
  END AS status
FROM nb_token_bucket
ORDER BY tokens ASC, last_refill DESC;

COMMENT ON VIEW v_nb_rate_limit_status IS
  'Monitor NeverBounce rate limit status per domain';

-- View 2: Cache hit rate (last 24h)
CREATE OR REPLACE VIEW v_nb_cache_stats AS
SELECT
  COUNT(*) AS total_cached,
  COUNT(*) FILTER (WHERE status = 'valid') AS valid_count,
  COUNT(*) FILTER (WHERE status = 'invalid') AS invalid_count,
  COUNT(*) FILTER (WHERE status = 'accept_all') AS accept_all_count,
  COUNT(*) FILTER (WHERE status = 'unknown') AS unknown_count,
  COUNT(*) FILTER (WHERE cached_at > NOW() - INTERVAL '1 hour') AS cached_last_hour,
  COUNT(*) FILTER (WHERE cached_at > NOW() - INTERVAL '24 hours') AS cached_last_day,
  ROUND(AVG(score), 3) AS avg_score
FROM nb_cache;

COMMENT ON VIEW v_nb_cache_stats IS
  'NeverBounce cache statistics and hit rates';

COMMIT;

-- Example usage and monitoring queries:

/*
-- Check rate limit status for a domain
SELECT * FROM v_nb_rate_limit_status WHERE domain = 'example.com';

-- Check cache stats
SELECT * FROM v_nb_cache_stats;

-- Find domains that hit rate limit
SELECT domain, tokens, hours_since_refill
FROM v_nb_rate_limit_status
WHERE status IN ('EXHAUSTED', 'CRITICAL')
ORDER BY tokens ASC;

-- Manually refill all eligible buckets
SELECT refill_nb_tokens();

-- Clear expired cache (>30 days)
DELETE FROM nb_cache WHERE cached_at < NOW() - INTERVAL '30 days';
*/
