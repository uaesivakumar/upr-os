-- =====================================================
-- S67: Auto-Discovery Engine
-- Sprint 67: Autonomous Discovery System
-- =====================================================
-- Features:
--   1. Auto-Enrichment Pipeline - automated enrichment queues
--   2. Discovery Quality Filter - filter/validate discovered data
--   3. Signal-Triggered Discovery - event-driven discovery initiation
--   4. Auto-Discovery Scheduler - scheduled discovery jobs
--
-- Architecture:
--   - NO tenant awareness (OS-only)
--   - Context via territoryId, verticalSlug parameters
--   - Integrates with S64 Object Intelligence
--   - Integrates with S65 Evidence System
--   - Integrates with S58-61 Journey Engine
-- =====================================================

-- =====================================================
-- ENRICHMENT PIPELINE TABLES
-- =====================================================

-- Enrichment queue items
CREATE TABLE IF NOT EXISTS enrichment_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Target identification
    object_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,

    -- Context (NO tenant)
    territory_id UUID,
    vertical_slug VARCHAR(100),

    -- Pipeline configuration
    pipeline_config JSONB NOT NULL DEFAULT '{}',
    providers JSONB NOT NULL DEFAULT '[]',
    priority INTEGER NOT NULL DEFAULT 5,

    -- State machine
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,

    -- Results
    enrichment_result JSONB,
    error_log JSONB DEFAULT '[]',

    -- Metadata
    source VARCHAR(100),
    triggered_by VARCHAR(100),
    correlation_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Enrichment pipeline definitions
CREATE TABLE IF NOT EXISTS enrichment_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Context scope
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Pipeline definition
    stages JSONB NOT NULL DEFAULT '[]',
    provider_chain JSONB NOT NULL DEFAULT '[]',
    fallback_strategy VARCHAR(50) DEFAULT 'next',

    -- Execution settings
    timeout_ms INTEGER DEFAULT 30000,
    retry_policy JSONB DEFAULT '{"max_attempts": 3, "backoff": "exponential"}',
    concurrency_limit INTEGER DEFAULT 10,

    -- Quality thresholds
    min_confidence DECIMAL(5,4) DEFAULT 0.7,
    required_fields JSONB DEFAULT '[]',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- DISCOVERY QUALITY FILTER TABLES
-- =====================================================

-- Quality filter rules
CREATE TABLE IF NOT EXISTS discovery_quality_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Context scope
    vertical_slug VARCHAR(100),
    territory_id UUID,
    object_type VARCHAR(100),

    -- Rule definition
    rule_type VARCHAR(50) NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]',
    actions JSONB NOT NULL DEFAULT '[]',

    -- Scoring impact
    score_modifier DECIMAL(5,2) DEFAULT 0,
    confidence_threshold DECIMAL(5,4),

    -- Priority and status
    priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(slug, vertical_slug, territory_id)
);

-- Quality assessment results
CREATE TABLE IF NOT EXISTS discovery_quality_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Target
    object_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,

    -- Context
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Assessment results
    overall_score DECIMAL(5,4) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,

    -- Detailed breakdown
    field_scores JSONB NOT NULL DEFAULT '{}',
    rules_applied JSONB NOT NULL DEFAULT '[]',
    issues_found JSONB NOT NULL DEFAULT '[]',

    -- Outcome
    passed BOOLEAN NOT NULL,
    rejection_reasons JSONB DEFAULT '[]',

    -- Metadata
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assessor_version VARCHAR(50),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- SIGNAL-TRIGGERED DISCOVERY TABLES
-- =====================================================

-- Signal trigger definitions
CREATE TABLE IF NOT EXISTS discovery_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Context scope
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Trigger definition
    signal_type VARCHAR(100) NOT NULL,
    signal_conditions JSONB NOT NULL DEFAULT '{}',

    -- Discovery action
    discovery_config JSONB NOT NULL DEFAULT '{}',
    pipeline_slug VARCHAR(100),
    priority_boost INTEGER DEFAULT 0,

    -- Throttling
    cooldown_seconds INTEGER DEFAULT 300,
    max_triggers_per_hour INTEGER DEFAULT 100,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(slug, vertical_slug, territory_id)
);

-- Signal trigger executions log
CREATE TABLE IF NOT EXISTS discovery_trigger_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    trigger_id UUID NOT NULL REFERENCES discovery_triggers(id),
    signal_id UUID,

    -- Context
    object_id UUID,
    object_type VARCHAR(100),
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Execution details
    signal_data JSONB,
    discovery_initiated BOOLEAN NOT NULL DEFAULT false,
    queue_item_id UUID,

    -- Status
    status VARCHAR(50) NOT NULL,
    error_message TEXT,

    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- AUTO-DISCOVERY SCHEDULER TABLES
-- =====================================================

-- Scheduled discovery jobs
CREATE TABLE IF NOT EXISTS discovery_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Context scope
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Schedule definition (cron-like)
    schedule_type VARCHAR(50) NOT NULL,
    cron_expression VARCHAR(100),
    interval_seconds INTEGER,

    -- Discovery configuration
    discovery_config JSONB NOT NULL DEFAULT '{}',
    target_query JSONB NOT NULL DEFAULT '{}',
    pipeline_slug VARCHAR(100),
    batch_size INTEGER DEFAULT 100,

    -- Execution window
    timezone VARCHAR(100) DEFAULT 'UTC',
    start_time TIME,
    end_time TIME,
    days_of_week INTEGER[] DEFAULT ARRAY[1,2,3,4,5],

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(slug, vertical_slug, territory_id)
);

-- Schedule execution history
CREATE TABLE IF NOT EXISTS discovery_schedule_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    schedule_id UUID NOT NULL REFERENCES discovery_schedules(id),

    -- Context
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Execution results
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,

    -- Metrics
    objects_discovered INTEGER DEFAULT 0,
    objects_enriched INTEGER DEFAULT 0,
    objects_filtered INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(50) NOT NULL,
    error_log JSONB DEFAULT '[]',

    -- Statistics
    duration_ms INTEGER,
    queue_items_created INTEGER DEFAULT 0
);

-- =====================================================
-- VIEWS
-- =====================================================

-- Active enrichment queue view
CREATE OR REPLACE VIEW v_enrichment_queue_active AS
SELECT
    eq.*,
    ep.name as pipeline_name,
    ep.stages as pipeline_stages
FROM enrichment_queue eq
LEFT JOIN enrichment_pipelines ep ON ep.slug = eq.pipeline_config->>'pipeline_slug'
WHERE eq.status IN ('pending', 'processing', 'retry')
  AND (eq.next_attempt_at IS NULL OR eq.next_attempt_at <= NOW())
ORDER BY eq.priority DESC, eq.created_at ASC;

-- Discovery health dashboard view
CREATE OR REPLACE VIEW v_discovery_health AS
SELECT
    vertical_slug,
    territory_id,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    AVG(attempts) FILTER (WHERE status = 'completed') as avg_attempts,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) FILTER (WHERE completed_at IS NOT NULL) as avg_duration_seconds
FROM enrichment_queue
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY vertical_slug, territory_id;

-- Quality assessment summary view
CREATE OR REPLACE VIEW v_quality_summary AS
SELECT
    vertical_slug,
    territory_id,
    object_type,
    COUNT(*) as total_assessments,
    COUNT(*) FILTER (WHERE passed) as passed_count,
    COUNT(*) FILTER (WHERE NOT passed) as failed_count,
    AVG(overall_score) as avg_score,
    AVG(confidence) as avg_confidence,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY overall_score) as median_score
FROM discovery_quality_assessments
WHERE assessed_at > NOW() - INTERVAL '7 days'
GROUP BY vertical_slug, territory_id, object_type;

-- Active triggers view
CREATE OR REPLACE VIEW v_active_triggers AS
SELECT
    dt.*,
    COALESCE(
        (SELECT COUNT(*) FROM discovery_trigger_log dtl
         WHERE dtl.trigger_id = dt.id
         AND dtl.executed_at > NOW() - INTERVAL '1 hour'),
        0
    ) as triggers_last_hour
FROM discovery_triggers dt
WHERE dt.is_active = true;

-- Upcoming schedules view
CREATE OR REPLACE VIEW v_upcoming_schedules AS
SELECT
    ds.*,
    dsr.started_at as last_run_started,
    dsr.status as last_run_status,
    dsr.objects_discovered as last_run_discovered
FROM discovery_schedules ds
LEFT JOIN LATERAL (
    SELECT * FROM discovery_schedule_runs
    WHERE schedule_id = ds.id
    ORDER BY started_at DESC
    LIMIT 1
) dsr ON true
WHERE ds.is_active = true
ORDER BY ds.next_run_at ASC NULLS LAST;

-- =====================================================
-- INDEXES
-- =====================================================

-- Enrichment queue indexes
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_status ON enrichment_queue(status);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_priority ON enrichment_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_object ON enrichment_queue(object_id, object_type);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_next_attempt ON enrichment_queue(next_attempt_at) WHERE status IN ('pending', 'retry');
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_territory ON enrichment_queue(territory_id) WHERE territory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_vertical ON enrichment_queue(vertical_slug) WHERE vertical_slug IS NOT NULL;

-- Quality rules indexes
CREATE INDEX IF NOT EXISTS idx_quality_rules_vertical ON discovery_quality_rules(vertical_slug);
CREATE INDEX IF NOT EXISTS idx_quality_rules_type ON discovery_quality_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_quality_rules_active ON discovery_quality_rules(is_active) WHERE is_active = true;

-- Quality assessments indexes
CREATE INDEX IF NOT EXISTS idx_quality_assessments_object ON discovery_quality_assessments(object_id);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_passed ON discovery_quality_assessments(passed);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_date ON discovery_quality_assessments(assessed_at);

-- Triggers indexes
CREATE INDEX IF NOT EXISTS idx_triggers_signal_type ON discovery_triggers(signal_type);
CREATE INDEX IF NOT EXISTS idx_triggers_active ON discovery_triggers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_trigger_log_trigger ON discovery_trigger_log(trigger_id);
CREATE INDEX IF NOT EXISTS idx_trigger_log_executed ON discovery_trigger_log(executed_at);

-- Schedules indexes
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON discovery_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_schedules_vertical ON discovery_schedules(vertical_slug);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule ON discovery_schedule_runs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_started ON discovery_schedule_runs(started_at);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to get next enrichment batch
CREATE OR REPLACE FUNCTION get_enrichment_batch(
    p_batch_size INTEGER DEFAULT 10,
    p_vertical_slug VARCHAR DEFAULT NULL,
    p_territory_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    object_id UUID,
    object_type VARCHAR,
    pipeline_config JSONB,
    providers JSONB,
    priority INTEGER,
    attempts INTEGER
) AS $$
BEGIN
    RETURN QUERY
    UPDATE enrichment_queue eq
    SET
        status = 'processing',
        last_attempt_at = NOW(),
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE eq.id IN (
        SELECT eq2.id
        FROM enrichment_queue eq2
        WHERE eq2.status IN ('pending', 'retry')
          AND (eq2.next_attempt_at IS NULL OR eq2.next_attempt_at <= NOW())
          AND (p_vertical_slug IS NULL OR eq2.vertical_slug = p_vertical_slug)
          AND (p_territory_id IS NULL OR eq2.territory_id = p_territory_id)
        ORDER BY eq2.priority DESC, eq2.created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    RETURNING eq.id, eq.object_id, eq.object_type, eq.pipeline_config, eq.providers, eq.priority, eq.attempts;
END;
$$ LANGUAGE plpgsql;

-- Function to complete enrichment item
CREATE OR REPLACE FUNCTION complete_enrichment_item(
    p_item_id UUID,
    p_success BOOLEAN,
    p_result JSONB DEFAULT NULL,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_item enrichment_queue%ROWTYPE;
BEGIN
    SELECT * INTO v_item FROM enrichment_queue WHERE id = p_item_id;

    IF v_item IS NULL THEN
        RAISE EXCEPTION 'Enrichment item not found: %', p_item_id;
    END IF;

    IF p_success THEN
        UPDATE enrichment_queue
        SET
            status = 'completed',
            enrichment_result = p_result,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_item_id;
    ELSE
        IF v_item.attempts >= v_item.max_attempts THEN
            UPDATE enrichment_queue
            SET
                status = 'failed',
                error_log = error_log || jsonb_build_object('attempt', v_item.attempts, 'error', p_error, 'at', NOW()),
                updated_at = NOW()
            WHERE id = p_item_id;
        ELSE
            UPDATE enrichment_queue
            SET
                status = 'retry',
                next_attempt_at = NOW() + (POWER(2, v_item.attempts) || ' minutes')::INTERVAL,
                error_log = error_log || jsonb_build_object('attempt', v_item.attempts, 'error', p_error, 'at', NOW()),
                updated_at = NOW()
            WHERE id = p_item_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check and fire triggers
CREATE OR REPLACE FUNCTION check_discovery_triggers(
    p_signal_type VARCHAR,
    p_signal_data JSONB,
    p_vertical_slug VARCHAR DEFAULT NULL,
    p_territory_id UUID DEFAULT NULL
)
RETURNS TABLE (
    trigger_id UUID,
    trigger_slug VARCHAR,
    discovery_config JSONB,
    pipeline_slug VARCHAR,
    priority_boost INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dt.id,
        dt.slug,
        dt.discovery_config,
        dt.pipeline_slug,
        dt.priority_boost
    FROM discovery_triggers dt
    WHERE dt.is_active = true
      AND dt.signal_type = p_signal_type
      AND (dt.vertical_slug IS NULL OR dt.vertical_slug = p_vertical_slug)
      AND (dt.territory_id IS NULL OR dt.territory_id = p_territory_id)
      AND (dt.last_triggered_at IS NULL OR dt.last_triggered_at < NOW() - (dt.cooldown_seconds || ' seconds')::INTERVAL)
      AND (
          SELECT COUNT(*) FROM discovery_trigger_log dtl
          WHERE dtl.trigger_id = dt.id
          AND dtl.executed_at > NOW() - INTERVAL '1 hour'
      ) < dt.max_triggers_per_hour
      AND (
          dt.signal_conditions = '{}'::JSONB
          OR p_signal_data @> dt.signal_conditions
      );
END;
$$ LANGUAGE plpgsql;

-- Function to calculate next run time for schedule
CREATE OR REPLACE FUNCTION calculate_next_run(
    p_schedule_type VARCHAR,
    p_cron_expression VARCHAR,
    p_interval_seconds INTEGER,
    p_timezone VARCHAR DEFAULT 'UTC'
)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    IF p_schedule_type = 'interval' THEN
        RETURN NOW() + (p_interval_seconds || ' seconds')::INTERVAL;
    ELSIF p_schedule_type = 'cron' THEN
        -- Simplified: return next hour for cron (real implementation would parse cron)
        RETURN DATE_TRUNC('hour', NOW() AT TIME ZONE p_timezone) + INTERVAL '1 hour';
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Default enrichment pipelines
INSERT INTO enrichment_pipelines (slug, name, description, stages, provider_chain, min_confidence)
VALUES
    ('standard', 'Standard Enrichment', 'Default enrichment pipeline for all objects',
     '[{"name": "basic", "providers": ["clearbit", "apollo"]}, {"name": "deep", "providers": ["zoominfo"]}]',
     '["clearbit", "apollo", "zoominfo"]', 0.7),
    ('fast', 'Fast Enrichment', 'Quick enrichment with minimal providers',
     '[{"name": "quick", "providers": ["clearbit"]}]',
     '["clearbit"]', 0.5),
    ('comprehensive', 'Comprehensive Enrichment', 'Full enrichment with all available providers',
     '[{"name": "tier1", "providers": ["clearbit", "apollo"]}, {"name": "tier2", "providers": ["zoominfo", "lusha"]}, {"name": "verification", "providers": ["hunter"]}]',
     '["clearbit", "apollo", "zoominfo", "lusha", "hunter"]', 0.85)
ON CONFLICT (slug) DO NOTHING;

-- Default quality rules
INSERT INTO discovery_quality_rules (slug, name, rule_type, conditions, actions, priority)
VALUES
    ('email-valid', 'Valid Email Required', 'validation',
     '[{"field": "email", "operator": "matches", "value": "^[^@]+@[^@]+\\.[^@]+$"}]',
     '[{"type": "reject", "reason": "Invalid email format"}]', 100),
    ('company-name', 'Company Name Required', 'validation',
     '[{"field": "company_name", "operator": "not_empty"}]',
     '[{"type": "reject", "reason": "Company name is required"}]', 90),
    ('confidence-min', 'Minimum Confidence', 'threshold',
     '[{"field": "_confidence", "operator": "gte", "value": 0.5}]',
     '[{"type": "flag", "reason": "Low confidence data"}]', 80)
ON CONFLICT (slug, vertical_slug, territory_id) DO NOTHING;

-- Default triggers
INSERT INTO discovery_triggers (slug, name, signal_type, signal_conditions, discovery_config, pipeline_slug, cooldown_seconds)
VALUES
    ('new-company-mention', 'New Company Mention', 'company_mentioned',
     '{"source": "news"}',
     '{"priority": 8, "enrich_depth": "standard"}',
     'standard', 600),
    ('funding-round', 'Funding Round Signal', 'funding_announced',
     '{}',
     '{"priority": 10, "enrich_depth": "comprehensive"}',
     'comprehensive', 300),
    ('hiring-signal', 'Hiring Activity', 'job_posted',
     '{"department": "engineering"}',
     '{"priority": 6, "enrich_depth": "fast"}',
     'fast', 900)
ON CONFLICT (slug, vertical_slug, territory_id) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE enrichment_queue IS 'S67: Queue for automated enrichment pipeline processing';
COMMENT ON TABLE enrichment_pipelines IS 'S67: Enrichment pipeline definitions with provider chains';
COMMENT ON TABLE discovery_quality_rules IS 'S67: Rules for filtering and validating discovered data';
COMMENT ON TABLE discovery_quality_assessments IS 'S67: Quality assessment results for discovered objects';
COMMENT ON TABLE discovery_triggers IS 'S67: Signal-based triggers for automated discovery';
COMMENT ON TABLE discovery_trigger_log IS 'S67: Log of trigger executions';
COMMENT ON TABLE discovery_schedules IS 'S67: Scheduled discovery job definitions';
COMMENT ON TABLE discovery_schedule_runs IS 'S67: History of scheduled discovery executions';
