-- Sprint 56: Discovery Target Types
-- UPR OS - Intelligence Engine
-- Define different types of discovery targets with their strategies

-- ============================================================================
-- TARGET TYPES
-- ============================================================================

CREATE TABLE IF NOT EXISTS discovery_target_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Target category
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'company',           -- Company/organization discovery
        'contact',           -- Individual contact discovery
        'signal',            -- Signal/event discovery
        'relationship',      -- Relationship/connection discovery
        'market',            -- Market/industry discovery
        'product',           -- Product/service discovery
        'technology'         -- Technology stack discovery
    )),

    -- Entity type this produces
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
        'company', 'contact', 'signal', 'opportunity', 'event', 'technology', 'market'
    )),

    -- Discovery configuration
    discovery_config JSONB DEFAULT '{}',
    -- Example:
    -- {
    --   "sources": ["linkedin", "apollo", "crunchbase"],
    --   "priority_sources": ["linkedin"],
    --   "required_fields": ["name", "industry"],
    --   "enrichment_enabled": true,
    --   "scoring_enabled": true
    -- }

    -- Source weights per target type
    source_weights JSONB DEFAULT '{}',
    -- Example:
    -- {
    --   "linkedin": 1.0,
    --   "apollo": 0.8,
    --   "crunchbase": 0.6
    -- }

    -- Filtering rules
    filters JSONB DEFAULT '{}',
    -- Example:
    -- {
    --   "min_employee_count": 10,
    --   "industries": ["technology", "finance"],
    --   "locations": ["UAE", "US"]
    -- }

    -- Output schema
    output_schema JSONB DEFAULT '{}',

    -- Vertical associations
    verticals JSONB DEFAULT '[]',  -- Array of vertical slugs this type applies to

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,  -- System-defined (non-editable)

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_target_types_category ON discovery_target_types(category);
CREATE INDEX IF NOT EXISTS idx_target_types_entity ON discovery_target_types(entity_type);
CREATE INDEX IF NOT EXISTS idx_target_types_active ON discovery_target_types(is_active);
CREATE INDEX IF NOT EXISTS idx_target_types_verticals ON discovery_target_types USING GIN(verticals);

-- ============================================================================
-- DISCOVERY STRATEGIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS discovery_strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type_id UUID NOT NULL REFERENCES discovery_target_types(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Strategy type
    strategy_type VARCHAR(50) NOT NULL CHECK (strategy_type IN (
        'search',           -- Keyword/query based search
        'crawl',            -- Web/social crawling
        'api',              -- Direct API calls
        'inbound',          -- Inbound signal processing
        'relationship',     -- Relationship graph traversal
        'predictive',       -- ML-based prediction
        'aggregation'       -- Multi-source aggregation
    )),

    -- Strategy configuration
    config JSONB NOT NULL DEFAULT '{}',
    -- Example for 'search':
    -- {
    --   "query_template": "{industry} companies in {location}",
    --   "max_results": 100,
    --   "sources": ["google", "linkedin"],
    --   "pagination": true
    -- }

    -- Execution settings
    execution_settings JSONB DEFAULT '{}',
    -- Example:
    -- {
    --   "parallel": true,
    --   "batch_size": 25,
    --   "rate_limit": {"requests_per_minute": 30},
    --   "timeout_seconds": 30,
    --   "retry_count": 3
    -- }

    -- Priority (lower = higher priority)
    priority INTEGER DEFAULT 100,

    -- Conditions for when to use this strategy
    conditions JSONB DEFAULT '[]',
    -- Example:
    -- [
    --   {"field": "industry", "op": "in", "value": ["technology"]},
    --   {"field": "company_size", "op": "gte", "value": 100}
    -- ]

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategies_target ON discovery_strategies(target_type_id);
CREATE INDEX IF NOT EXISTS idx_strategies_type ON discovery_strategies(strategy_type);
CREATE INDEX IF NOT EXISTS idx_strategies_priority ON discovery_strategies(priority);
CREATE INDEX IF NOT EXISTS idx_strategies_active ON discovery_strategies(is_active);

-- ============================================================================
-- DISCOVERY SOURCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS discovery_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Source type
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN (
        'api',              -- REST/GraphQL API
        'scraper',          -- Web scraping
        'database',         -- Database/data warehouse
        'stream',           -- Real-time stream
        'webhook',          -- Inbound webhook
        'file',             -- File import
        'manual'            -- Manual entry
    )),

    -- Connection configuration (sensitive, encrypted)
    connection_config JSONB DEFAULT '{}',
    -- Example:
    -- {
    --   "base_url": "https://api.apollo.io/v1",
    --   "auth_type": "api_key",
    --   "headers": {"X-Api-Key": "${APOLLO_API_KEY}"}
    -- }

    -- Capabilities
    capabilities JSONB DEFAULT '{}',
    -- Example:
    -- {
    --   "search": true,
    --   "enrich": true,
    --   "bulk": true,
    --   "real_time": false,
    --   "entity_types": ["company", "contact"]
    -- }

    -- Rate limits
    rate_limits JSONB DEFAULT '{}',
    -- Example:
    -- {
    --   "requests_per_minute": 60,
    --   "requests_per_day": 10000,
    --   "burst_limit": 10
    -- }

    -- Quality metrics
    quality_score DECIMAL(5,2) DEFAULT 0.0,  -- 0-100
    freshness_hours INTEGER DEFAULT 24,       -- Data freshness in hours
    coverage_score DECIMAL(5,2) DEFAULT 0.0, -- 0-100

    -- Health status
    health_status VARCHAR(50) DEFAULT 'unknown' CHECK (health_status IN (
        'healthy', 'degraded', 'unhealthy', 'unknown'
    )),
    last_health_check TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false,  -- Primary source for its type

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sources_type ON discovery_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_sources_health ON discovery_sources(health_status);
CREATE INDEX IF NOT EXISTS idx_sources_active ON discovery_sources(is_active);

-- ============================================================================
-- TARGET TYPE SOURCE MAPPINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS target_type_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type_id UUID NOT NULL REFERENCES discovery_target_types(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES discovery_sources(id) ON DELETE CASCADE,

    -- Priority for this source (lower = higher priority)
    priority INTEGER DEFAULT 100,

    -- Source-specific config override
    config_override JSONB DEFAULT '{}',

    -- Weight for scoring (0.0 - 1.0)
    weight DECIMAL(3,2) DEFAULT 1.0,

    -- Is this the primary source for this target type?
    is_primary BOOLEAN DEFAULT false,

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(target_type_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_type_sources_target ON target_type_sources(target_type_id);
CREATE INDEX IF NOT EXISTS idx_type_sources_source ON target_type_sources(source_id);

-- ============================================================================
-- DISCOVERY RUNS (EXECUTION HISTORY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS discovery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type_id UUID REFERENCES discovery_target_types(id) ON DELETE SET NULL,
    strategy_id UUID REFERENCES discovery_strategies(id) ON DELETE SET NULL,

    -- Run status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled', 'paused'
    )),

    -- Input parameters
    input_params JSONB DEFAULT '{}',

    -- Results
    results_count INTEGER DEFAULT 0,
    entities_created INTEGER DEFAULT 0,
    entities_updated INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,

    -- Execution details
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Sources used
    sources_used JSONB DEFAULT '[]',
    source_results JSONB DEFAULT '{}',

    -- Error details
    error_details JSONB,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_runs_target ON discovery_runs(target_type_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON discovery_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created ON discovery_runs(created_at DESC);

-- ============================================================================
-- SEED: DEFAULT TARGET TYPES
-- ============================================================================

INSERT INTO discovery_target_types (slug, name, description, category, entity_type, discovery_config, source_weights, is_system)
VALUES
    -- Company Discovery
    ('company_search', 'Company Search', 'Search for companies by criteria', 'company', 'company',
     '{
         "sources": ["linkedin", "apollo", "crunchbase", "google"],
         "required_fields": ["name", "domain", "industry"],
         "enrichment_enabled": true,
         "scoring_enabled": true,
         "dedup_enabled": true
     }',
     '{"linkedin": 1.0, "apollo": 0.9, "crunchbase": 0.8, "google": 0.6}',
     true),

    ('company_similar', 'Similar Companies', 'Find companies similar to a given company', 'company', 'company',
     '{
         "sources": ["apollo", "crunchbase"],
         "required_fields": ["name", "industry", "employee_count"],
         "enrichment_enabled": true,
         "scoring_enabled": true,
         "similarity_threshold": 0.7
     }',
     '{"apollo": 1.0, "crunchbase": 0.9}',
     true),

    ('company_technographic', 'Technographic Discovery', 'Discover companies by technology stack', 'company', 'company',
     '{
         "sources": ["builtwith", "wappalyzer", "apollo"],
         "required_fields": ["name", "technologies"],
         "enrichment_enabled": true
     }',
     '{"builtwith": 1.0, "wappalyzer": 0.9, "apollo": 0.7}',
     true),

    -- Contact Discovery
    ('contact_search', 'Contact Search', 'Search for contacts by criteria', 'contact', 'contact',
     '{
         "sources": ["linkedin", "apollo", "zoominfo"],
         "required_fields": ["name", "title", "company", "email"],
         "enrichment_enabled": true,
         "scoring_enabled": true,
         "email_verification": true
     }',
     '{"linkedin": 1.0, "apollo": 0.9, "zoominfo": 0.8}',
     true),

    ('contact_decision_makers', 'Decision Maker Discovery', 'Find decision makers at target companies', 'contact', 'contact',
     '{
         "sources": ["linkedin", "apollo"],
         "required_fields": ["name", "title", "seniority", "company"],
         "filters": {
             "seniority": ["Director", "VP", "C-Level"],
             "departments": ["Engineering", "Product", "Sales", "Marketing"]
         },
         "enrichment_enabled": true
     }',
     '{"linkedin": 1.0, "apollo": 0.9}',
     true),

    -- Signal Discovery
    ('signal_hiring', 'Hiring Signals', 'Discover hiring signals from job postings', 'signal', 'signal',
     '{
         "sources": ["linkedin_jobs", "indeed", "glassdoor"],
         "required_fields": ["company", "title", "location"],
         "signal_type": "hiring",
         "freshness_days": 7
     }',
     '{"linkedin_jobs": 1.0, "indeed": 0.8, "glassdoor": 0.7}',
     true),

    ('signal_funding', 'Funding Signals', 'Discover funding and investment signals', 'signal', 'signal',
     '{
         "sources": ["crunchbase", "pitchbook", "news"],
         "required_fields": ["company", "amount", "round", "investors"],
         "signal_type": "funding",
         "freshness_days": 30
     }',
     '{"crunchbase": 1.0, "pitchbook": 0.9, "news": 0.7}',
     true),

    ('signal_news', 'News Signals', 'Discover company news and events', 'signal', 'signal',
     '{
         "sources": ["google_news", "bing_news", "press_releases"],
         "required_fields": ["company", "headline", "date"],
         "signal_type": "news",
         "freshness_days": 7
     }',
     '{"google_news": 1.0, "bing_news": 0.8, "press_releases": 0.9}',
     true),

    ('signal_technology_change', 'Technology Change Signals', 'Discover technology adoption/changes', 'signal', 'signal',
     '{
         "sources": ["builtwith", "wappalyzer"],
         "required_fields": ["company", "technology", "change_type"],
         "signal_type": "technology_change",
         "freshness_days": 14
     }',
     '{"builtwith": 1.0, "wappalyzer": 0.9}',
     true),

    -- Market Discovery
    ('market_analysis', 'Market Analysis', 'Discover market trends and segments', 'market', 'market',
     '{
         "sources": ["statista", "gartner", "industry_reports"],
         "required_fields": ["market_name", "size", "growth_rate"],
         "enrichment_enabled": false
     }',
     '{"statista": 1.0, "gartner": 0.9}',
     true),

    -- Technology Discovery
    ('technology_stack', 'Technology Stack', 'Discover technology stacks', 'technology', 'technology',
     '{
         "sources": ["builtwith", "wappalyzer", "stackshare"],
         "required_fields": ["company", "category", "technology"],
         "enrichment_enabled": true
     }',
     '{"builtwith": 1.0, "wappalyzer": 0.9, "stackshare": 0.7}',
     true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED: DEFAULT DISCOVERY SOURCES
-- ============================================================================

INSERT INTO discovery_sources (slug, name, description, source_type, capabilities, rate_limits, quality_score, is_active)
VALUES
    ('linkedin', 'LinkedIn', 'LinkedIn company and people data', 'api',
     '{"search": true, "enrich": true, "bulk": false, "real_time": false, "entity_types": ["company", "contact"]}',
     '{"requests_per_minute": 30, "requests_per_day": 1000}',
     95.0, true),

    ('apollo', 'Apollo.io', 'B2B data enrichment and prospecting', 'api',
     '{"search": true, "enrich": true, "bulk": true, "real_time": false, "entity_types": ["company", "contact"]}',
     '{"requests_per_minute": 60, "requests_per_day": 10000}',
     90.0, true),

    ('crunchbase', 'Crunchbase', 'Startup and funding data', 'api',
     '{"search": true, "enrich": true, "bulk": false, "real_time": false, "entity_types": ["company", "signal"]}',
     '{"requests_per_minute": 30, "requests_per_day": 5000}',
     85.0, true),

    ('clearbit', 'Clearbit', 'Company and contact enrichment', 'api',
     '{"search": false, "enrich": true, "bulk": true, "real_time": true, "entity_types": ["company", "contact"]}',
     '{"requests_per_minute": 100, "requests_per_day": 25000}',
     92.0, true),

    ('zoominfo', 'ZoomInfo', 'B2B contact database', 'api',
     '{"search": true, "enrich": true, "bulk": true, "real_time": false, "entity_types": ["company", "contact"]}',
     '{"requests_per_minute": 50, "requests_per_day": 15000}',
     88.0, true),

    ('builtwith', 'BuiltWith', 'Technology profiling', 'api',
     '{"search": true, "enrich": true, "bulk": false, "real_time": false, "entity_types": ["technology"]}',
     '{"requests_per_minute": 20, "requests_per_day": 2000}',
     85.0, true),

    ('google_news', 'Google News', 'News and press coverage', 'api',
     '{"search": true, "enrich": false, "bulk": false, "real_time": true, "entity_types": ["signal"]}',
     '{"requests_per_minute": 100, "requests_per_day": 10000}',
     80.0, true),

    ('linkedin_jobs', 'LinkedIn Jobs', 'Job postings and hiring signals', 'api',
     '{"search": true, "enrich": false, "bulk": false, "real_time": false, "entity_types": ["signal"]}',
     '{"requests_per_minute": 20, "requests_per_day": 1000}',
     90.0, true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED: DEFAULT STRATEGIES
-- ============================================================================

INSERT INTO discovery_strategies (target_type_id, name, strategy_type, config, execution_settings, priority)
SELECT
    t.id,
    'Default Search Strategy',
    'search',
    '{"query_template": "{criteria}", "max_results": 100}',
    '{"parallel": true, "batch_size": 25, "timeout_seconds": 30}',
    100
FROM discovery_target_types t
WHERE t.slug = 'company_search'
ON CONFLICT DO NOTHING;

INSERT INTO discovery_strategies (target_type_id, name, strategy_type, config, execution_settings, priority)
SELECT
    t.id,
    'API-based Discovery',
    'api',
    '{"endpoints": ["search", "company_lookup"], "pagination": true}',
    '{"parallel": true, "batch_size": 50, "timeout_seconds": 30}',
    50
FROM discovery_target_types t
WHERE t.slug = 'company_search'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get effective sources for a target type
CREATE OR REPLACE FUNCTION get_target_type_sources(p_target_type_slug VARCHAR)
RETURNS TABLE (
    source_id UUID,
    source_slug VARCHAR,
    source_name VARCHAR,
    priority INTEGER,
    weight DECIMAL,
    is_primary BOOLEAN,
    capabilities JSONB,
    rate_limits JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.slug,
        s.name,
        ts.priority,
        ts.weight,
        ts.is_primary,
        s.capabilities,
        s.rate_limits
    FROM discovery_target_types t
    JOIN target_type_sources ts ON t.id = ts.target_type_id
    JOIN discovery_sources s ON ts.source_id = s.id
    WHERE t.slug = p_target_type_slug
      AND t.is_active = true
      AND ts.is_active = true
      AND s.is_active = true
    ORDER BY ts.priority, ts.is_primary DESC;
END;
$$ LANGUAGE plpgsql;

-- Get strategies for a target type
CREATE OR REPLACE FUNCTION get_target_type_strategies(
    p_target_type_slug VARCHAR,
    p_context JSONB DEFAULT '{}'
)
RETURNS TABLE (
    strategy_id UUID,
    strategy_name VARCHAR,
    strategy_type VARCHAR,
    config JSONB,
    execution_settings JSONB,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        st.id,
        st.name,
        st.strategy_type,
        st.config,
        st.execution_settings,
        st.priority
    FROM discovery_target_types t
    JOIN discovery_strategies st ON t.id = st.target_type_id
    WHERE t.slug = p_target_type_slug
      AND t.is_active = true
      AND st.is_active = true
    ORDER BY st.priority;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Target type summary
CREATE OR REPLACE VIEW discovery_target_type_summary AS
SELECT
    t.id,
    t.slug,
    t.name,
    t.category,
    t.entity_type,
    t.is_active,
    t.is_system,
    (SELECT COUNT(*) FROM discovery_strategies WHERE target_type_id = t.id AND is_active) as strategy_count,
    (SELECT COUNT(*) FROM target_type_sources WHERE target_type_id = t.id AND is_active) as source_count,
    (SELECT COUNT(*) FROM discovery_runs WHERE target_type_id = t.id AND created_at > NOW() - INTERVAL '24 hours') as runs_24h,
    t.created_at,
    t.updated_at
FROM discovery_target_types t;

-- Source health summary
CREATE OR REPLACE VIEW discovery_source_health AS
SELECT
    s.id,
    s.slug,
    s.name,
    s.source_type,
    s.health_status,
    s.last_health_check,
    s.quality_score,
    s.is_active,
    (SELECT COUNT(*) FROM target_type_sources WHERE source_id = s.id AND is_active) as target_types_using
FROM discovery_sources s;
