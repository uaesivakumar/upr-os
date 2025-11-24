-- Company Preview Cache Table
-- Purpose: Cache SerpAPI + LLM results for 48 hours
-- Reduces cost from $0.006 to $0.00 on cache hits

CREATE TABLE IF NOT EXISTS company_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  cache_data JSONB NOT NULL,
  serp_cost_usd NUMERIC(8,4) DEFAULT 0.005,
  llm_cost_usd NUMERIC(8,4) DEFAULT 0.001,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '48 hours')
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_company_cache_key ON company_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_company_cache_expires ON company_cache(expires_at);

-- Cleanup expired cache entries (run nightly)
CREATE INDEX IF NOT EXISTS idx_company_cache_cleanup ON company_cache(expires_at)
  WHERE expires_at < now();

-- View for cache analytics
CREATE OR REPLACE VIEW company_cache_stats AS
SELECT
  COUNT(*) as total_cached,
  SUM(hit_count) as total_hits,
  SUM(serp_cost_usd + llm_cost_usd) as total_cost_saved,
  AVG(hit_count) as avg_hit_count,
  COUNT(*) FILTER (WHERE expires_at > now()) as active_cache,
  COUNT(*) FILTER (WHERE expires_at <= now()) as expired_cache
FROM company_cache;

COMMENT ON TABLE company_cache IS 'Caches company preview results from SerpAPI + LLM for 48h';
COMMENT ON COLUMN company_cache.cache_key IS 'Format: preview:{company_name_lowercase}';
COMMENT ON COLUMN company_cache.cache_data IS 'Full enriched company profile JSON';
COMMENT ON COLUMN company_cache.hit_count IS 'Number of times this cache entry was used';
