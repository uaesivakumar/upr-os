-- Sprint 55: Config-Driven OS Kernel
-- UPR OS - Intelligence Engine
-- Centralized configuration management with versioning and hot reload

-- ============================================================================
-- OS KERNEL CONFIGURATION
-- ============================================================================

-- Main configuration store
CREATE TABLE IF NOT EXISTS os_kernel_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace VARCHAR(100) NOT NULL,  -- e.g., 'discovery', 'enrichment', 'scoring', 'llm'
    key VARCHAR(255) NOT NULL,
    value JSONB NOT NULL,

    -- Config metadata
    description TEXT,
    schema JSONB,  -- JSON Schema for validation
    data_type VARCHAR(50) DEFAULT 'json' CHECK (data_type IN ('json', 'string', 'number', 'boolean', 'array')),

    -- Sensitivity and caching
    is_sensitive BOOLEAN DEFAULT false,  -- Mask in logs/responses
    is_cacheable BOOLEAN DEFAULT true,
    cache_ttl_seconds INTEGER DEFAULT 300,  -- 5 minutes default

    -- Environment support
    environment VARCHAR(50) DEFAULT 'all' CHECK (environment IN ('all', 'development', 'staging', 'production')),

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Versioning
    version INTEGER DEFAULT 1,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255),

    UNIQUE(namespace, key, environment)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kernel_config_namespace ON os_kernel_config(namespace);
CREATE INDEX IF NOT EXISTS idx_kernel_config_key ON os_kernel_config(key);
CREATE INDEX IF NOT EXISTS idx_kernel_config_env ON os_kernel_config(environment);
CREATE INDEX IF NOT EXISTS idx_kernel_config_active ON os_kernel_config(is_active);

-- ============================================================================
-- CONFIG VERSIONS (HISTORY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_kernel_config_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES os_kernel_config(id) ON DELETE CASCADE,

    -- Snapshot of config at this version
    namespace VARCHAR(100) NOT NULL,
    key VARCHAR(255) NOT NULL,
    value JSONB NOT NULL,
    version INTEGER NOT NULL,

    -- Change info
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'rollback')),
    change_reason TEXT,

    -- Actor
    changed_by VARCHAR(255),
    changed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Rollback support
    can_rollback BOOLEAN DEFAULT true,
    rolled_back_at TIMESTAMPTZ,
    rolled_back_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_config_versions_config ON os_kernel_config_versions(config_id);
CREATE INDEX IF NOT EXISTS idx_config_versions_changed ON os_kernel_config_versions(changed_at DESC);

-- ============================================================================
-- CONFIG PRESETS (TEMPLATES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_kernel_config_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Preset configuration
    config JSONB NOT NULL,  -- Full config set: { "namespace.key": value, ... }

    -- Preset type
    preset_type VARCHAR(50) DEFAULT 'custom' CHECK (preset_type IN ('default', 'vertical', 'custom', 'template')),
    vertical_slug VARCHAR(100),  -- If vertical-specific

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_presets_type ON os_kernel_config_presets(preset_type);
CREATE INDEX IF NOT EXISTS idx_config_presets_vertical ON os_kernel_config_presets(vertical_slug);

-- ============================================================================
-- CONFIG DEPENDENCIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_kernel_config_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES os_kernel_config(id) ON DELETE CASCADE,
    depends_on_id UUID NOT NULL REFERENCES os_kernel_config(id) ON DELETE CASCADE,

    -- Dependency type
    dependency_type VARCHAR(50) DEFAULT 'requires' CHECK (dependency_type IN ('requires', 'conflicts', 'suggests')),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(config_id, depends_on_id)
);

-- ============================================================================
-- CONFIG CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_kernel_config_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key VARCHAR(500) NOT NULL UNIQUE,
    namespace VARCHAR(100),

    -- Cached data
    value JSONB NOT NULL,

    -- Cache metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_config_cache_expires ON os_kernel_config_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_config_cache_namespace ON os_kernel_config_cache(namespace);

-- Function to clean expired cache
CREATE OR REPLACE FUNCTION clean_expired_config_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM os_kernel_config_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: VERSION HISTORY
-- ============================================================================

CREATE OR REPLACE FUNCTION record_config_version()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO os_kernel_config_versions (
            config_id, namespace, key, value, version, change_type, changed_by
        ) VALUES (
            NEW.id, NEW.namespace, NEW.key, NEW.value, NEW.version, 'create', NEW.created_by
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.value IS DISTINCT FROM NEW.value THEN
        NEW.version := OLD.version + 1;
        NEW.updated_at := NOW();

        INSERT INTO os_kernel_config_versions (
            config_id, namespace, key, value, version, change_type, changed_by
        ) VALUES (
            NEW.id, NEW.namespace, NEW.key, NEW.value, NEW.version, 'update', NEW.updated_by
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER config_version_trigger
    BEFORE INSERT OR UPDATE ON os_kernel_config
    FOR EACH ROW
    EXECUTE FUNCTION record_config_version();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get effective config value (with environment fallback)
CREATE OR REPLACE FUNCTION get_config_value(
    p_namespace VARCHAR,
    p_key VARCHAR,
    p_environment VARCHAR DEFAULT 'production'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Try environment-specific first
    SELECT value INTO result
    FROM os_kernel_config
    WHERE namespace = p_namespace
      AND key = p_key
      AND environment = p_environment
      AND is_active = true;

    -- Fall back to 'all' environment
    IF result IS NULL THEN
        SELECT value INTO result
        FROM os_kernel_config
        WHERE namespace = p_namespace
          AND key = p_key
          AND environment = 'all'
          AND is_active = true;
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Get all config for a namespace
CREATE OR REPLACE FUNCTION get_namespace_config(
    p_namespace VARCHAR,
    p_environment VARCHAR DEFAULT 'production'
)
RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}'::JSONB;
    config_record RECORD;
BEGIN
    FOR config_record IN
        SELECT key, value
        FROM os_kernel_config
        WHERE namespace = p_namespace
          AND (environment = p_environment OR environment = 'all')
          AND is_active = true
        ORDER BY environment DESC  -- Prefer environment-specific over 'all'
    LOOP
        -- Only set if not already set (environment-specific takes precedence)
        IF NOT result ? config_record.key THEN
            result := result || jsonb_build_object(config_record.key, config_record.value);
        END IF;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Apply preset to config
CREATE OR REPLACE FUNCTION apply_config_preset(
    p_preset_slug VARCHAR,
    p_environment VARCHAR DEFAULT 'all',
    p_changed_by VARCHAR DEFAULT 'system'
)
RETURNS INTEGER AS $$
DECLARE
    preset_config JSONB;
    config_key TEXT;
    config_value JSONB;
    namespace_key TEXT[];
    applied_count INTEGER := 0;
BEGIN
    SELECT config INTO preset_config
    FROM os_kernel_config_presets
    WHERE slug = p_preset_slug AND is_active = true;

    IF preset_config IS NULL THEN
        RAISE EXCEPTION 'Preset not found: %', p_preset_slug;
    END IF;

    FOR config_key, config_value IN SELECT * FROM jsonb_each(preset_config)
    LOOP
        namespace_key := string_to_array(config_key, '.');

        INSERT INTO os_kernel_config (namespace, key, value, environment, created_by, updated_by)
        VALUES (
            namespace_key[1],
            array_to_string(namespace_key[2:], '.'),
            config_value,
            p_environment,
            p_changed_by,
            p_changed_by
        )
        ON CONFLICT (namespace, key, environment)
        DO UPDATE SET
            value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();

        applied_count := applied_count + 1;
    END LOOP;

    RETURN applied_count;
END;
$$ LANGUAGE plpgsql;

-- Rollback config to specific version
CREATE OR REPLACE FUNCTION rollback_config_to_version(
    p_config_id UUID,
    p_version INTEGER,
    p_rolled_back_by VARCHAR DEFAULT 'system'
)
RETURNS BOOLEAN AS $$
DECLARE
    version_record RECORD;
BEGIN
    SELECT * INTO version_record
    FROM os_kernel_config_versions
    WHERE config_id = p_config_id AND version = p_version AND can_rollback = true;

    IF version_record IS NULL THEN
        RETURN false;
    END IF;

    -- Update main config
    UPDATE os_kernel_config
    SET value = version_record.value,
        updated_by = p_rolled_back_by
    WHERE id = p_config_id;

    -- Mark version as rolled back
    UPDATE os_kernel_config_versions
    SET rolled_back_at = NOW(),
        rolled_back_by = p_rolled_back_by
    WHERE config_id = p_config_id AND version > p_version;

    -- Record rollback in history
    INSERT INTO os_kernel_config_versions (
        config_id, namespace, key, value, version, change_type, changed_by
    )
    SELECT id, namespace, key, value, version + 1, 'rollback', p_rolled_back_by
    FROM os_kernel_config WHERE id = p_config_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED: DEFAULT OS KERNEL CONFIGURATION
-- ============================================================================

-- Discovery configuration
INSERT INTO os_kernel_config (namespace, key, value, description, environment, created_by)
VALUES
    ('discovery', 'enabled_sources', '["linkedin", "apollo", "clearbit", "google_news", "crunchbase"]',
     'List of enabled discovery sources', 'all', 'system'),
    ('discovery', 'default_batch_size', '50',
     'Default batch size for discovery operations', 'all', 'system'),
    ('discovery', 'max_concurrent_requests', '10',
     'Maximum concurrent requests per source', 'all', 'system'),
    ('discovery', 'retry_config', '{"max_retries": 3, "backoff_ms": 1000, "backoff_multiplier": 2}',
     'Retry configuration for failed requests', 'all', 'system'),
    ('discovery', 'rate_limits', '{"linkedin": {"requests_per_minute": 30}, "apollo": {"requests_per_minute": 60}}',
     'Rate limits per source', 'all', 'system')
ON CONFLICT (namespace, key, environment) DO NOTHING;

-- Enrichment configuration
INSERT INTO os_kernel_config (namespace, key, value, description, environment, created_by)
VALUES
    ('enrichment', 'provider_priority', '["apollo", "clearbit", "linkedin", "zoominfo"]',
     'Order of enrichment providers to try', 'all', 'system'),
    ('enrichment', 'cache_ttl_hours', '24',
     'Cache TTL for enrichment results in hours', 'all', 'system'),
    ('enrichment', 'required_fields', '["company_name", "industry", "employee_count"]',
     'Required fields for enrichment completion', 'all', 'system'),
    ('enrichment', 'fallback_enabled', 'true',
     'Enable fallback to next provider on failure', 'all', 'system')
ON CONFLICT (namespace, key, environment) DO NOTHING;

-- Scoring configuration
INSERT INTO os_kernel_config (namespace, key, value, description, environment, created_by)
VALUES
    ('scoring', 'default_weights', '{"q_score": 0.3, "t_score": 0.25, "l_score": 0.25, "e_score": 0.2}',
     'Default scoring weights', 'all', 'system'),
    ('scoring', 'thresholds', '{"hot": 80, "warm": 60, "cold": 40}',
     'Lead classification thresholds', 'all', 'system'),
    ('scoring', 'decay_enabled', 'true',
     'Enable score decay over time', 'all', 'system'),
    ('scoring', 'decay_rate_per_day', '0.02',
     'Score decay rate per day', 'all', 'system')
ON CONFLICT (namespace, key, environment) DO NOTHING;

-- LLM configuration
INSERT INTO os_kernel_config (namespace, key, value, description, environment, created_by)
VALUES
    ('llm', 'default_provider', '"openai"',
     'Default LLM provider', 'all', 'system'),
    ('llm', 'default_model', '"gpt-4o"',
     'Default LLM model', 'all', 'system'),
    ('llm', 'temperature', '0.7',
     'Default temperature for LLM requests', 'all', 'system'),
    ('llm', 'max_tokens', '4096',
     'Default max tokens for LLM responses', 'all', 'system'),
    ('llm', 'timeout_seconds', '30',
     'Timeout for LLM requests', 'all', 'system'),
    ('llm', 'retry_on_rate_limit', 'true',
     'Retry on rate limit errors', 'all', 'system')
ON CONFLICT (namespace, key, environment) DO NOTHING;

-- Outreach configuration
INSERT INTO os_kernel_config (namespace, key, value, description, environment, created_by)
VALUES
    ('outreach', 'channels', '["email", "linkedin", "phone"]',
     'Enabled outreach channels', 'all', 'system'),
    ('outreach', 'personalization_level', '"high"',
     'Level of personalization (low, medium, high)', 'all', 'system'),
    ('outreach', 'max_daily_per_channel', '{"email": 100, "linkedin": 25, "phone": 50}',
     'Maximum outreach per channel per day', 'all', 'system'),
    ('outreach', 'ab_testing_enabled', 'true',
     'Enable A/B testing for outreach', 'all', 'system')
ON CONFLICT (namespace, key, environment) DO NOTHING;

-- Pipeline configuration
INSERT INTO os_kernel_config (namespace, key, value, description, environment, created_by)
VALUES
    ('pipeline', 'default_mode', '"balanced"',
     'Default pipeline mode (fast, balanced, thorough)', 'all', 'system'),
    ('pipeline', 'stages', '["discovery", "enrichment", "scoring", "ranking", "outreach"]',
     'Pipeline stages in order', 'all', 'system'),
    ('pipeline', 'parallel_stages', '["enrichment", "scoring"]',
     'Stages that can run in parallel', 'all', 'system'),
    ('pipeline', 'checkpoint_enabled', 'true',
     'Enable checkpointing for resumable pipelines', 'all', 'system')
ON CONFLICT (namespace, key, environment) DO NOTHING;

-- System configuration
INSERT INTO os_kernel_config (namespace, key, value, description, environment, created_by)
VALUES
    ('system', 'log_level', '"info"',
     'Logging level', 'all', 'system'),
    ('system', 'metrics_enabled', 'true',
     'Enable metrics collection', 'all', 'system'),
    ('system', 'health_check_interval_seconds', '30',
     'Health check interval', 'all', 'system'),
    ('system', 'max_memory_mb', '4096',
     'Maximum memory usage in MB', 'all', 'system')
ON CONFLICT (namespace, key, environment) DO NOTHING;

-- Environment-specific overrides
INSERT INTO os_kernel_config (namespace, key, value, description, environment, created_by)
VALUES
    ('system', 'log_level', '"debug"',
     'Debug logging for development', 'development', 'system'),
    ('discovery', 'max_concurrent_requests', '5',
     'Reduced concurrency for development', 'development', 'system'),
    ('llm', 'default_model', '"gpt-4o-mini"',
     'Cheaper model for development', 'development', 'system')
ON CONFLICT (namespace, key, environment) DO NOTHING;

-- ============================================================================
-- SEED: DEFAULT PRESETS
-- ============================================================================

INSERT INTO os_kernel_config_presets (slug, name, description, preset_type, config)
VALUES
    ('minimal', 'Minimal Configuration', 'Minimal resource usage for testing', 'template',
     '{
         "discovery.enabled_sources": ["apollo"],
         "discovery.max_concurrent_requests": 5,
         "enrichment.provider_priority": ["apollo"],
         "llm.default_model": "gpt-4o-mini",
         "pipeline.default_mode": "fast"
     }'),
    ('high_volume', 'High Volume', 'Optimized for high-volume processing', 'template',
     '{
         "discovery.max_concurrent_requests": 20,
         "discovery.default_batch_size": 100,
         "enrichment.cache_ttl_hours": 48,
         "pipeline.default_mode": "fast",
         "outreach.max_daily_per_channel": {"email": 500, "linkedin": 100, "phone": 200}
     }'),
    ('quality_focus', 'Quality Focus', 'Prioritize quality over speed', 'template',
     '{
         "discovery.enabled_sources": ["linkedin", "apollo", "clearbit", "crunchbase", "zoominfo"],
         "enrichment.required_fields": ["company_name", "industry", "employee_count", "revenue", "headquarters"],
         "scoring.thresholds": {"hot": 85, "warm": 70, "cold": 50},
         "pipeline.default_mode": "thorough",
         "outreach.personalization_level": "high"
     }'),
    ('banking_vertical', 'Banking Vertical', 'Configuration for banking vertical', 'vertical',
     '{
         "scoring.default_weights": {"q_score": 0.35, "t_score": 0.25, "l_score": 0.2, "e_score": 0.2},
         "enrichment.required_fields": ["company_name", "industry", "employee_count", "compliance_status"],
         "outreach.channels": ["email", "phone"],
         "discovery.enabled_sources": ["linkedin", "apollo", "crunchbase"]
     }')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Config summary view
CREATE OR REPLACE VIEW os_kernel_config_summary AS
SELECT
    namespace,
    COUNT(*) as config_count,
    COUNT(*) FILTER (WHERE is_active) as active_count,
    COUNT(*) FILTER (WHERE is_sensitive) as sensitive_count,
    MAX(updated_at) as last_updated
FROM os_kernel_config
GROUP BY namespace;

-- Config with latest version
CREATE OR REPLACE VIEW os_kernel_config_latest AS
SELECT
    c.*,
    v.change_type as last_change_type,
    v.changed_by as last_changed_by,
    v.changed_at as last_changed_at
FROM os_kernel_config c
LEFT JOIN LATERAL (
    SELECT * FROM os_kernel_config_versions
    WHERE config_id = c.id
    ORDER BY version DESC
    LIMIT 1
) v ON true;
