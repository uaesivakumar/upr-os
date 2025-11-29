-- Sprint 50: API Provider Registry Schema
-- Foundational infrastructure for managing external API providers
--
-- Key Features:
-- 1. Provider Registry - catalog of all API providers
-- 2. Provider Configurations - per-tenant and global configs
-- 3. Rate Limiting - track and enforce API usage limits
-- 4. Health Monitoring - track provider status and performance
-- 5. Fallback Chains - define provider priority and fallback rules
-- 6. Accuracy Scoring - track provider data quality

-- ============================================================================
-- 1. API PROVIDERS (Master Registry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider Identity
    slug VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    provider_type VARCHAR(50) NOT NULL DEFAULT 'enrichment',  -- enrichment, scraper, verification, llm

    -- Provider Metadata
    base_url VARCHAR(500),
    docs_url VARCHAR(500),
    logo_url VARCHAR(500),

    -- Capabilities (what data this provider can return)
    capabilities JSONB NOT NULL DEFAULT '[]',  -- ['company_enrichment', 'email_verification', 'contact_lookup']
    supported_verticals JSONB DEFAULT '[]',     -- ['banking', 'insurance', 'real_estate'] or empty for all

    -- Default Rate Limits
    default_rate_limit_per_minute INTEGER DEFAULT 60,
    default_rate_limit_per_day INTEGER DEFAULT 10000,
    default_rate_limit_per_month INTEGER DEFAULT 100000,

    -- Cost Configuration (for optimization)
    cost_per_request DECIMAL(10, 6) DEFAULT 0,
    cost_currency VARCHAR(3) DEFAULT 'USD',

    -- Quality Metrics (baseline)
    baseline_accuracy_score DECIMAL(5, 4) DEFAULT 0.85,  -- 0.0 to 1.0
    baseline_freshness_days INTEGER DEFAULT 30,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, deprecated, disabled, beta
    is_global BOOLEAN DEFAULT TRUE,  -- Available to all tenants or specific ones

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deprecated_at TIMESTAMPTZ,

    -- Indexes and constraints
    CONSTRAINT valid_status CHECK (status IN ('active', 'deprecated', 'disabled', 'beta')),
    CONSTRAINT valid_provider_type CHECK (provider_type IN ('enrichment', 'scraper', 'verification', 'llm', 'mcp'))
);

CREATE INDEX idx_api_providers_slug ON api_providers(slug);
CREATE INDEX idx_api_providers_type ON api_providers(provider_type);
CREATE INDEX idx_api_providers_status ON api_providers(status);
CREATE INDEX idx_api_providers_capabilities ON api_providers USING GIN (capabilities);

-- ============================================================================
-- 2. PROVIDER CONFIGURATIONS (Per-tenant settings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider Reference
    provider_id UUID NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,

    -- Tenant Scope (NULL = global default)
    tenant_id UUID,  -- FK to tenants table if exists

    -- API Credentials (encrypted at application level)
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    additional_credentials JSONB DEFAULT '{}',  -- For OAuth tokens, etc.

    -- Custom Rate Limits (overrides provider defaults)
    rate_limit_per_minute INTEGER,
    rate_limit_per_day INTEGER,
    rate_limit_per_month INTEGER,

    -- Priority and Fallback
    priority INTEGER DEFAULT 50,  -- Lower = higher priority (1-100)
    is_enabled BOOLEAN DEFAULT TRUE,
    is_fallback BOOLEAN DEFAULT FALSE,  -- Use only when primary fails

    -- Vertical Override
    vertical_overrides JSONB DEFAULT '{}',  -- {"banking": {"priority": 10}, "insurance": {"enabled": false}}

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ,  -- Last time credentials were verified

    -- Unique constraint
    UNIQUE(provider_id, tenant_id)
);

CREATE INDEX idx_provider_config_provider ON provider_configurations(provider_id);
CREATE INDEX idx_provider_config_tenant ON provider_configurations(tenant_id);
CREATE INDEX idx_provider_config_enabled ON provider_configurations(is_enabled);
CREATE INDEX idx_provider_config_priority ON provider_configurations(priority);

-- ============================================================================
-- 3. RATE LIMIT TRACKING (Sliding window)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    provider_id UUID NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
    tenant_id UUID,  -- NULL = global usage tracking

    -- Time Window
    window_type VARCHAR(10) NOT NULL,  -- minute, hour, day, month
    window_start TIMESTAMPTZ NOT NULL,

    -- Usage Counts
    request_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,

    -- Rate Limit Status
    limit_value INTEGER NOT NULL,
    is_exceeded BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint per window
    UNIQUE(provider_id, tenant_id, window_type, window_start)
);

CREATE INDEX idx_rate_limits_provider ON provider_rate_limits(provider_id);
CREATE INDEX idx_rate_limits_tenant ON provider_rate_limits(tenant_id);
CREATE INDEX idx_rate_limits_window ON provider_rate_limits(window_type, window_start);
CREATE INDEX idx_rate_limits_exceeded ON provider_rate_limits(is_exceeded) WHERE is_exceeded = TRUE;

-- ============================================================================
-- 4. PROVIDER HEALTH MONITORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider Reference
    provider_id UUID NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,

    -- Health Check Details
    check_type VARCHAR(50) NOT NULL DEFAULT 'api_call',  -- api_call, health_endpoint, synthetic

    -- Request Details
    endpoint VARCHAR(255),
    request_method VARCHAR(10) DEFAULT 'GET',

    -- Response Details
    status_code INTEGER,
    response_time_ms INTEGER,
    is_success BOOLEAN NOT NULL,
    error_type VARCHAR(50),  -- timeout, rate_limit, auth_error, server_error, invalid_response
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_logs_provider ON provider_health_logs(provider_id);
CREATE INDEX idx_health_logs_created ON provider_health_logs(created_at);
CREATE INDEX idx_health_logs_success ON provider_health_logs(is_success);
CREATE INDEX idx_health_logs_provider_time ON provider_health_logs(provider_id, created_at DESC);

-- Aggregated health status (updated periodically)
CREATE TABLE IF NOT EXISTS provider_health_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider Reference
    provider_id UUID NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE UNIQUE,

    -- Current Status
    status VARCHAR(20) NOT NULL DEFAULT 'healthy',  -- healthy, degraded, unhealthy, unknown
    status_message TEXT,

    -- Performance Metrics (rolling 24h)
    uptime_percentage DECIMAL(5, 2) DEFAULT 100.00,
    avg_response_time_ms INTEGER,
    p95_response_time_ms INTEGER,
    p99_response_time_ms INTEGER,

    -- Error Metrics (rolling 24h)
    total_requests_24h INTEGER DEFAULT 0,
    success_rate_24h DECIMAL(5, 4) DEFAULT 1.0000,
    error_rate_24h DECIMAL(5, 4) DEFAULT 0.0000,
    timeout_rate_24h DECIMAL(5, 4) DEFAULT 0.0000,

    -- Last Check
    last_check_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    consecutive_failures INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_health_status CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown'))
);

CREATE INDEX idx_health_status_provider ON provider_health_status(provider_id);
CREATE INDEX idx_health_status_status ON provider_health_status(status);

-- ============================================================================
-- 5. PROVIDER FALLBACK CHAINS
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_fallback_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Chain Identity
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,

    -- Scope
    capability VARCHAR(100) NOT NULL,  -- company_enrichment, email_verification, etc.
    vertical VARCHAR(50),  -- NULL = all verticals
    tenant_id UUID,  -- NULL = global chain

    -- Chain Configuration
    chain_config JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   {"provider_id": "uuid1", "timeout_ms": 5000, "required": true},
    --   {"provider_id": "uuid2", "timeout_ms": 3000, "required": false, "fallback_only": true}
    -- ]

    -- Behavior
    fail_fast BOOLEAN DEFAULT FALSE,  -- Stop on first success?
    merge_results BOOLEAN DEFAULT FALSE,  -- Merge results from all providers?
    max_retries INTEGER DEFAULT 2,
    retry_delay_ms INTEGER DEFAULT 1000,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fallback_chains_capability ON provider_fallback_chains(capability);
CREATE INDEX idx_fallback_chains_vertical ON provider_fallback_chains(vertical);
CREATE INDEX idx_fallback_chains_tenant ON provider_fallback_chains(tenant_id);
CREATE INDEX idx_fallback_chains_active ON provider_fallback_chains(is_active);

-- ============================================================================
-- 6. PROVIDER ACCURACY SCORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_accuracy_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider Reference
    provider_id UUID NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,

    -- Scoring Dimension
    field_name VARCHAR(100) NOT NULL,  -- email, company_name, title, industry, etc.
    vertical VARCHAR(50),  -- NULL = all verticals

    -- Accuracy Metrics
    total_validations INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    partial_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    missing_count INTEGER DEFAULT 0,

    -- Calculated Scores
    accuracy_score DECIMAL(5, 4) DEFAULT 0.0000,  -- correct / total
    completeness_score DECIMAL(5, 4) DEFAULT 0.0000,  -- (total - missing) / total
    quality_score DECIMAL(5, 4) DEFAULT 0.0000,  -- weighted combination

    -- Freshness Tracking
    avg_data_age_days INTEGER,
    stale_percentage DECIMAL(5, 2) DEFAULT 0.00,

    -- Time Period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique per provider/field/vertical/period
    UNIQUE(provider_id, field_name, vertical, period_start)
);

CREATE INDEX idx_accuracy_provider ON provider_accuracy_scores(provider_id);
CREATE INDEX idx_accuracy_field ON provider_accuracy_scores(field_name);
CREATE INDEX idx_accuracy_vertical ON provider_accuracy_scores(vertical);
CREATE INDEX idx_accuracy_period ON provider_accuracy_scores(period_start, period_end);

-- ============================================================================
-- 7. PROVIDER REQUEST LOGS (for auditing and debugging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    provider_id UUID NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
    tenant_id UUID,

    -- Request Context
    request_id VARCHAR(100),  -- Correlation ID
    operation_type VARCHAR(50) NOT NULL,  -- enrich, verify, lookup, etc.

    -- Request Details (redacted for security)
    endpoint VARCHAR(255),
    request_method VARCHAR(10),
    request_params_hash VARCHAR(64),  -- SHA256 hash of params for dedup

    -- Response Details
    status_code INTEGER,
    response_time_ms INTEGER,
    is_success BOOLEAN NOT NULL,
    is_cached BOOLEAN DEFAULT FALSE,

    -- Error Details
    error_type VARCHAR(50),
    error_message TEXT,

    -- Cost Tracking
    cost_incurred DECIMAL(10, 6) DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition by month for efficient querying and cleanup
-- Note: In production, consider partitioning this table

CREATE INDEX idx_request_logs_provider ON provider_request_logs(provider_id);
CREATE INDEX idx_request_logs_tenant ON provider_request_logs(tenant_id);
CREATE INDEX idx_request_logs_created ON provider_request_logs(created_at);
CREATE INDEX idx_request_logs_request_id ON provider_request_logs(request_id);
CREATE INDEX idx_request_logs_provider_time ON provider_request_logs(provider_id, created_at DESC);

-- ============================================================================
-- 8. SEED DATA: Default Providers
-- ============================================================================

INSERT INTO api_providers (slug, name, description, provider_type, base_url, docs_url, capabilities, default_rate_limit_per_minute, default_rate_limit_per_day, cost_per_request, baseline_accuracy_score, status)
VALUES
    -- Enrichment Providers
    ('apollo', 'Apollo.io', 'B2B contact and company enrichment platform', 'enrichment',
     'https://api.apollo.io/v1', 'https://docs.apollo.io',
     '["company_enrichment", "contact_lookup", "email_finder", "person_enrichment"]'::jsonb,
     50, 5000, 0.03, 0.88, 'active'),

    ('hunter', 'Hunter.io', 'Email finder and verification service', 'enrichment',
     'https://api.hunter.io/v2', 'https://hunter.io/api-documentation',
     '["email_finder", "email_verification", "domain_search"]'::jsonb,
     50, 2500, 0.02, 0.85, 'active'),

    ('clearbit', 'Clearbit', 'Business intelligence and enrichment API', 'enrichment',
     'https://api.clearbit.com/v2', 'https://clearbit.com/docs',
     '["company_enrichment", "person_enrichment", "reveal"]'::jsonb,
     100, 10000, 0.05, 0.90, 'active'),

    ('zoominfo', 'ZoomInfo', 'B2B database and intelligence platform', 'enrichment',
     'https://api.zoominfo.com', 'https://api.zoominfo.com/docs',
     '["company_enrichment", "contact_lookup", "intent_data", "org_chart"]'::jsonb,
     30, 3000, 0.10, 0.92, 'active'),

    -- Scrapers/MCP Tools
    ('linkedin_scraper', 'LinkedIn MCP Scraper', 'MCP-based LinkedIn profile scraper', 'mcp',
     NULL, NULL,
     '["profile_scraping", "company_scraping", "job_scraping"]'::jsonb,
     10, 500, 0.00, 0.95, 'beta'),

    ('salesnav_mcp', 'SalesNav MCP', 'MCP-based Sales Navigator scraper', 'mcp',
     NULL, NULL,
     '["salesnav_search", "lead_lists", "company_insights"]'::jsonb,
     5, 200, 0.00, 0.95, 'beta'),

    -- Verification Providers
    ('neverbounce', 'NeverBounce', 'Email verification service', 'verification',
     'https://api.neverbounce.com/v4', 'https://neverbounce.com/docs',
     '["email_verification"]'::jsonb,
     100, 10000, 0.004, 0.98, 'active'),

    ('zerobounce', 'ZeroBounce', 'Email validation and deliverability', 'verification',
     'https://api.zerobounce.net/v2', 'https://www.zerobounce.net/docs',
     '["email_verification", "ai_scoring"]'::jsonb,
     100, 10000, 0.005, 0.98, 'active')
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    updated_at = NOW();

-- Initialize health status for all providers
INSERT INTO provider_health_status (provider_id, status, uptime_percentage)
SELECT id, 'unknown', 100.00
FROM api_providers
ON CONFLICT (provider_id) DO NOTHING;

-- Create default fallback chains
INSERT INTO provider_fallback_chains (name, slug, capability, chain_config, is_active)
VALUES
    ('Company Enrichment Chain', 'company_enrichment_default',
     'company_enrichment',
     '[
       {"provider_slug": "clearbit", "timeout_ms": 5000, "required": false},
       {"provider_slug": "apollo", "timeout_ms": 5000, "required": false},
       {"provider_slug": "zoominfo", "timeout_ms": 8000, "required": false, "fallback_only": true}
     ]'::jsonb,
     true),

    ('Email Verification Chain', 'email_verification_default',
     'email_verification',
     '[
       {"provider_slug": "neverbounce", "timeout_ms": 3000, "required": false},
       {"provider_slug": "zerobounce", "timeout_ms": 3000, "required": false, "fallback_only": true}
     ]'::jsonb,
     true),

    ('Contact Lookup Chain', 'contact_lookup_default',
     'contact_lookup',
     '[
       {"provider_slug": "apollo", "timeout_ms": 5000, "required": false},
       {"provider_slug": "hunter", "timeout_ms": 4000, "required": false, "fallback_only": true}
     ]'::jsonb,
     true)
ON CONFLICT (slug) DO UPDATE SET
    chain_config = EXCLUDED.chain_config,
    updated_at = NOW();

-- ============================================================================
-- 9. HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a provider is rate limited
CREATE OR REPLACE FUNCTION is_provider_rate_limited(
    p_provider_id UUID,
    p_tenant_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_is_limited BOOLEAN := FALSE;
    v_config provider_configurations%ROWTYPE;
    v_provider api_providers%ROWTYPE;
    v_minute_usage INTEGER;
    v_day_usage INTEGER;
    v_minute_limit INTEGER;
    v_day_limit INTEGER;
BEGIN
    -- Get provider and config
    SELECT * INTO v_provider FROM api_providers WHERE id = p_provider_id;
    SELECT * INTO v_config FROM provider_configurations
    WHERE provider_id = p_provider_id AND (tenant_id = p_tenant_id OR tenant_id IS NULL)
    ORDER BY tenant_id NULLS LAST LIMIT 1;

    -- Determine limits (config overrides provider defaults)
    v_minute_limit := COALESCE(v_config.rate_limit_per_minute, v_provider.default_rate_limit_per_minute);
    v_day_limit := COALESCE(v_config.rate_limit_per_day, v_provider.default_rate_limit_per_day);

    -- Check minute window
    SELECT COALESCE(SUM(request_count), 0) INTO v_minute_usage
    FROM provider_rate_limits
    WHERE provider_id = p_provider_id
      AND (tenant_id = p_tenant_id OR (p_tenant_id IS NULL AND tenant_id IS NULL))
      AND window_type = 'minute'
      AND window_start >= date_trunc('minute', NOW());

    IF v_minute_usage >= v_minute_limit THEN
        RETURN TRUE;
    END IF;

    -- Check day window
    SELECT COALESCE(SUM(request_count), 0) INTO v_day_usage
    FROM provider_rate_limits
    WHERE provider_id = p_provider_id
      AND (tenant_id = p_tenant_id OR (p_tenant_id IS NULL AND tenant_id IS NULL))
      AND window_type = 'day'
      AND window_start >= date_trunc('day', NOW());

    IF v_day_usage >= v_day_limit THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to record a provider request
CREATE OR REPLACE FUNCTION record_provider_request(
    p_provider_id UUID,
    p_tenant_id UUID DEFAULT NULL,
    p_is_success BOOLEAN DEFAULT TRUE
) RETURNS VOID AS $$
BEGIN
    -- Update minute window
    INSERT INTO provider_rate_limits (provider_id, tenant_id, window_type, window_start, request_count, success_count, error_count, limit_value)
    VALUES (
        p_provider_id,
        p_tenant_id,
        'minute',
        date_trunc('minute', NOW()),
        1,
        CASE WHEN p_is_success THEN 1 ELSE 0 END,
        CASE WHEN p_is_success THEN 0 ELSE 1 END,
        (SELECT COALESCE(
            (SELECT rate_limit_per_minute FROM provider_configurations WHERE provider_id = p_provider_id AND tenant_id = p_tenant_id),
            (SELECT default_rate_limit_per_minute FROM api_providers WHERE id = p_provider_id)
        ))
    )
    ON CONFLICT (provider_id, tenant_id, window_type, window_start) DO UPDATE SET
        request_count = provider_rate_limits.request_count + 1,
        success_count = provider_rate_limits.success_count + CASE WHEN p_is_success THEN 1 ELSE 0 END,
        error_count = provider_rate_limits.error_count + CASE WHEN p_is_success THEN 0 ELSE 1 END,
        updated_at = NOW();

    -- Update day window
    INSERT INTO provider_rate_limits (provider_id, tenant_id, window_type, window_start, request_count, success_count, error_count, limit_value)
    VALUES (
        p_provider_id,
        p_tenant_id,
        'day',
        date_trunc('day', NOW()),
        1,
        CASE WHEN p_is_success THEN 1 ELSE 0 END,
        CASE WHEN p_is_success THEN 0 ELSE 1 END,
        (SELECT COALESCE(
            (SELECT rate_limit_per_day FROM provider_configurations WHERE provider_id = p_provider_id AND tenant_id = p_tenant_id),
            (SELECT default_rate_limit_per_day FROM api_providers WHERE id = p_provider_id)
        ))
    )
    ON CONFLICT (provider_id, tenant_id, window_type, window_start) DO UPDATE SET
        request_count = provider_rate_limits.request_count + 1,
        success_count = provider_rate_limits.success_count + CASE WHEN p_is_success THEN 1 ELSE 0 END,
        error_count = provider_rate_limits.error_count + CASE WHEN p_is_success THEN 0 ELSE 1 END,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get the best provider for a capability
CREATE OR REPLACE FUNCTION get_best_provider_for_capability(
    p_capability VARCHAR,
    p_vertical VARCHAR DEFAULT NULL,
    p_tenant_id UUID DEFAULT NULL
) RETURNS TABLE (
    provider_id UUID,
    provider_slug VARCHAR,
    priority INTEGER,
    is_fallback BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ap.id as provider_id,
        ap.slug as provider_slug,
        COALESCE(pc.priority, 50) as priority,
        COALESCE(pc.is_fallback, FALSE) as is_fallback
    FROM api_providers ap
    LEFT JOIN provider_configurations pc ON pc.provider_id = ap.id
        AND (pc.tenant_id = p_tenant_id OR pc.tenant_id IS NULL)
    LEFT JOIN provider_health_status phs ON phs.provider_id = ap.id
    WHERE ap.status = 'active'
      AND ap.capabilities ? p_capability
      AND (p_vertical IS NULL OR ap.supported_verticals = '[]' OR ap.supported_verticals ? p_vertical)
      AND COALESCE(pc.is_enabled, TRUE) = TRUE
      AND COALESCE(phs.status, 'unknown') != 'unhealthy'
      AND NOT is_provider_rate_limited(ap.id, p_tenant_id)
    ORDER BY
        COALESCE(pc.is_fallback, FALSE),  -- Primary providers first
        COALESCE(pc.priority, 50),         -- Then by priority
        phs.avg_response_time_ms NULLS LAST;  -- Then by response time
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. VIEWS FOR DASHBOARD
-- ============================================================================

-- Provider overview with health and usage
CREATE OR REPLACE VIEW v_provider_dashboard AS
SELECT
    ap.id,
    ap.slug,
    ap.name,
    ap.provider_type,
    ap.status,
    ap.capabilities,
    phs.status as health_status,
    phs.uptime_percentage,
    phs.avg_response_time_ms,
    phs.success_rate_24h,
    phs.total_requests_24h,
    phs.last_check_at,
    phs.consecutive_failures,
    COALESCE(rl_minute.request_count, 0) as requests_this_minute,
    COALESCE(rl_day.request_count, 0) as requests_today,
    ap.default_rate_limit_per_minute,
    ap.default_rate_limit_per_day,
    ap.cost_per_request,
    ap.baseline_accuracy_score
FROM api_providers ap
LEFT JOIN provider_health_status phs ON phs.provider_id = ap.id
LEFT JOIN provider_rate_limits rl_minute ON rl_minute.provider_id = ap.id
    AND rl_minute.window_type = 'minute'
    AND rl_minute.window_start = date_trunc('minute', NOW())
    AND rl_minute.tenant_id IS NULL
LEFT JOIN provider_rate_limits rl_day ON rl_day.provider_id = ap.id
    AND rl_day.window_type = 'day'
    AND rl_day.window_start = date_trunc('day', NOW())
    AND rl_day.tenant_id IS NULL
ORDER BY ap.name;

-- Fallback chain overview
CREATE OR REPLACE VIEW v_fallback_chains_overview AS
SELECT
    fc.id,
    fc.slug,
    fc.name,
    fc.capability,
    fc.vertical,
    fc.is_active,
    jsonb_array_length(fc.chain_config) as provider_count,
    fc.chain_config,
    fc.fail_fast,
    fc.merge_results,
    fc.created_at,
    fc.updated_at
FROM provider_fallback_chains fc
ORDER BY fc.capability, fc.vertical NULLS FIRST;

COMMENT ON TABLE api_providers IS 'Master registry of all external API providers';
COMMENT ON TABLE provider_configurations IS 'Per-tenant provider configurations and credentials';
COMMENT ON TABLE provider_rate_limits IS 'Sliding window rate limit tracking';
COMMENT ON TABLE provider_health_logs IS 'Individual health check logs';
COMMENT ON TABLE provider_health_status IS 'Aggregated provider health status';
COMMENT ON TABLE provider_fallback_chains IS 'Provider fallback chain definitions';
COMMENT ON TABLE provider_accuracy_scores IS 'Provider data quality metrics';
COMMENT ON TABLE provider_request_logs IS 'Request audit log for debugging and analytics';
