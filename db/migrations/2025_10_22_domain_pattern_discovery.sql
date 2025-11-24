-- Domain + Pattern Discovery Cache
-- Stores both domain AND email pattern learned from SERP API
-- Eliminates need for NeverBounce validation in many cases
-- 87% cost savings: $0.005 (SERP) vs $0.039 (SERP + Apollo + NeverBounce)

CREATE TABLE IF NOT EXISTS domain_pattern_discovery_cache (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    domain TEXT,
    pattern TEXT, -- Email pattern like {first}.{last}
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
    source TEXT NOT NULL, -- 'rocketreach', 'leadiq', 'percentage_based', 'ai_overview', 'explicit_notation'
    alternative_patterns JSONB, -- Other patterns found with confidence scores
    evidence JSONB, -- SERP results, matched text, source URLs
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT unique_company_discovery UNIQUE (company_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discovery_cache_company ON domain_pattern_discovery_cache(company_name);
CREATE INDEX IF NOT EXISTS idx_discovery_cache_domain ON domain_pattern_discovery_cache(domain);
CREATE INDEX IF NOT EXISTS idx_discovery_cache_confidence ON domain_pattern_discovery_cache(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_cache_created ON domain_pattern_discovery_cache(created_at DESC);

-- Track discovery attempts and costs
CREATE TABLE IF NOT EXISTS domain_pattern_discovery_attempts (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    search_query TEXT NOT NULL,
    results_found INTEGER DEFAULT 0,
    domain_discovered TEXT,
    pattern_discovered TEXT,
    confidence NUMERIC(4,3),
    source TEXT,
    status TEXT NOT NULL, -- 'success', 'low_confidence', 'no_results', 'error'
    cost_usd NUMERIC(10,6) DEFAULT 0.005, -- SERP API cost
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_attempts_company ON domain_pattern_discovery_attempts(company_name);
CREATE INDEX IF NOT EXISTS idx_discovery_attempts_status ON domain_pattern_discovery_attempts(status);
CREATE INDEX IF NOT EXISTS idx_discovery_attempts_created ON domain_pattern_discovery_attempts(created_at DESC);

-- Add discovery tracking to email_patterns
ALTER TABLE email_patterns
ADD COLUMN IF NOT EXISTS discovered_via_serp BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS serp_source TEXT, -- 'rocketreach', 'leadiq', etc.
ADD COLUMN IF NOT EXISTS serp_confidence NUMERIC(4,3),
ADD COLUMN IF NOT EXISTS serp_evidence JSONB;

COMMENT ON TABLE domain_pattern_discovery_cache IS 'Caches domain AND pattern learned from SERP API - eliminates need for NeverBounce in many cases (87% cost savings)';
COMMENT ON TABLE domain_pattern_discovery_attempts IS 'Audit trail of all domain+pattern discovery attempts with costs and processing times';
COMMENT ON COLUMN email_patterns.discovered_via_serp IS 'TRUE if pattern was discovered via SERP (not Apollo validation)';
COMMENT ON COLUMN email_patterns.serp_source IS 'Source of SERP discovery: rocketreach, leadiq, percentage_based, ai_overview, etc.';
COMMENT ON COLUMN email_patterns.serp_confidence IS 'Confidence score from SERP source (0-1)';
COMMENT ON COLUMN email_patterns.serp_evidence IS 'Evidence from SERP: matched text, URLs, search results';
