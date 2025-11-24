-- scripts/20251009_add_enrichment_cache.sql

-- A table to cache the JSON results of expensive enrichment lookups.
-- The cache_key can be a search query, a domain, or any other unique identifier.
CREATE TABLE enrichment_cache (
    cache_key TEXT PRIMARY KEY,
    cache_value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An index to efficiently find and purge old cache entries if needed.
CREATE INDEX idx_enrichment_cache_created_at ON enrichment_cache(created_at);

COMMENT ON TABLE enrichment_cache IS 'Caches the results of expensive enrichment API calls (e.g., LLM analysis of a company) to reduce costs and improve latency.';