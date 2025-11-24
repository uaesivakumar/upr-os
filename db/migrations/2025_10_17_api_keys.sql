-- API Keys for External Integrations
-- Enables secure access to Lead Propensity API

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL, -- First 8 chars for identification (e.g., "sk_live_")
    name TEXT NOT NULL, -- Human-readable name (e.g., "HubSpot Production")
    organization TEXT, -- Organization name

    -- Permissions
    scopes JSONB DEFAULT '["propensity:read"]'::jsonb, -- ["propensity:read", "propensity:write", "features:read"]

    -- Rate limiting
    rate_limit_per_minute INT DEFAULT 60,
    rate_limit_per_day INT DEFAULT 10000,

    -- Usage tracking
    total_requests INT DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    environment TEXT DEFAULT 'production', -- 'production', 'sandbox', 'development'

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    expires_at TIMESTAMPTZ, -- NULL = never expires
    notes TEXT,

    -- IP whitelist (optional security layer)
    allowed_ips JSONB -- ["203.0.113.0/24", "198.51.100.42"]
);

-- Track API usage for analytics and billing
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    api_key_id INT REFERENCES api_keys(id) ON DELETE CASCADE,

    -- Request details
    endpoint TEXT NOT NULL, -- '/api/v1/propensity/score'
    method TEXT NOT NULL, -- 'POST', 'GET'
    status_code INT, -- 200, 400, 429, 500

    -- Performance
    response_time_ms INT,

    -- Payload size
    request_size_bytes INT,
    response_size_bytes INT,

    -- Batch details (for batch endpoints)
    batch_size INT, -- Number of leads scored in one request

    -- Timestamps
    requested_at TIMESTAMPTZ DEFAULT NOW(),

    -- Client info
    ip_address INET,
    user_agent TEXT,

    -- Error tracking
    error_message TEXT
);

-- Rate limiting tracking (in-memory alternative: Redis)
CREATE TABLE IF NOT EXISTS api_rate_limits (
    api_key_id INT REFERENCES api_keys(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    window_type TEXT NOT NULL, -- 'minute', 'hour', 'day'
    request_count INT DEFAULT 0,
    PRIMARY KEY (api_key_id, window_start, window_type)
);

-- Indexes for performance
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_api_usage_key_id_time ON api_usage(api_key_id, requested_at DESC);
CREATE INDEX idx_api_usage_endpoint ON api_usage(endpoint, requested_at DESC);
CREATE INDEX idx_rate_limits_key_window ON api_rate_limits(api_key_id, window_start DESC);

-- Clean up old rate limit records (keep last 2 days only)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM api_rate_limits
    WHERE window_start < NOW() - INTERVAL '2 days';
END;
$$ LANGUAGE plpgsql;

-- Sample API key for development (NEVER use in production!)
-- Key: sk_test_12345678901234567890123456789012
-- SHA-256 hash below
INSERT INTO api_keys (key_hash, key_prefix, name, organization, scopes, environment, created_by)
VALUES (
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', -- SHA-256 of 'sk_test_12345678901234567890123456789012'
    'sk_test_',
    'Development Test Key',
    'UPR Internal',
    '["propensity:read", "propensity:write", "features:read", "batch:score"]'::jsonb,
    'development',
    'system'
)
ON CONFLICT (key_hash) DO NOTHING;

COMMENT ON TABLE api_keys IS 'API keys for external CRM integrations (HubSpot, Zoho, Salesforce)';
COMMENT ON TABLE api_usage IS 'API usage analytics for monitoring and billing';
COMMENT ON TABLE api_rate_limits IS 'Rate limiting enforcement (alternative: Redis)';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters for safe logging (e.g., sk_live_abc123**)';
COMMENT ON COLUMN api_keys.scopes IS 'Permissions: propensity:read, propensity:write, features:read, batch:score';
