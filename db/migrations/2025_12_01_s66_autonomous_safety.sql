-- =====================================================
-- S66: Autonomous Safety & Control
-- Sprint 66: Safety Infrastructure for Autonomous Operations
-- =====================================================
-- Features:
--   1. Emergency Kill Switch - Global autonomous off switch
--   2. Autonomous Activity Log - Centralized event log
--   3. Human-in-the-Loop Checkpoints - Manual approval gates
--   4. Autonomous Task Queue - Unified job orchestration
--
-- Architecture:
--   - NO tenant awareness (OS-only)
--   - Context via territoryId, verticalSlug parameters
--   - Integrates with S67 Auto-Discovery
--   - Integrates with S68 Auto-Outreach
--   - ConfigLoader for all thresholds and limits
-- =====================================================

-- =====================================================
-- KILL SWITCH / CONTROL STATE
-- =====================================================

-- Global and scoped control state for autonomous operations
CREATE TABLE IF NOT EXISTS autonomous_control_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope (NULL = global)
    scope_type VARCHAR(50) NOT NULL DEFAULT 'global',
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- State
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    disabled_reason TEXT,
    disabled_by VARCHAR(255),
    disabled_at TIMESTAMPTZ,

    -- Limits (can override global)
    max_concurrent_tasks INTEGER,
    max_tasks_per_hour INTEGER,
    max_tasks_per_day INTEGER,

    -- Safety thresholds
    error_rate_threshold DECIMAL(5,4) DEFAULT 0.1,
    auto_disable_on_threshold BOOLEAN DEFAULT true,

    -- Metadata
    config_override JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(scope_type, vertical_slug, territory_id)
);

-- Control state change history
CREATE TABLE IF NOT EXISTS autonomous_control_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference
    control_state_id UUID NOT NULL REFERENCES autonomous_control_state(id),

    -- Change details
    action VARCHAR(50) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    reason TEXT,
    changed_by VARCHAR(255),

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- AUTONOMOUS ACTIVITY LOG
-- =====================================================

-- Centralized event log for all autonomous operations
CREATE TABLE IF NOT EXISTS autonomous_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event identification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,
    event_severity VARCHAR(20) NOT NULL DEFAULT 'info',

    -- Context (NO tenant)
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Source identification
    source_service VARCHAR(100) NOT NULL,
    source_action VARCHAR(100),
    source_id UUID,

    -- Target (what was affected)
    target_type VARCHAR(100),
    target_id UUID,

    -- Event data
    event_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    error_message TEXT,
    error_stack TEXT,

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Correlation
    correlation_id UUID,
    parent_event_id UUID,
    trace_id VARCHAR(100),

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- HUMAN-IN-THE-LOOP CHECKPOINTS
-- =====================================================

-- Checkpoint definitions
CREATE TABLE IF NOT EXISTS autonomous_checkpoint_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Scope
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Trigger conditions
    trigger_conditions JSONB NOT NULL DEFAULT '{}',
    applies_to_services JSONB DEFAULT '["*"]',
    applies_to_actions JSONB DEFAULT '["*"]',

    -- Checkpoint settings
    approval_required BOOLEAN NOT NULL DEFAULT true,
    auto_approve_after_hours INTEGER,
    auto_reject_after_hours INTEGER DEFAULT 72,
    requires_reason BOOLEAN DEFAULT false,

    -- Notification
    notify_on_pending JSONB DEFAULT '[]',
    escalation_policy JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(slug, vertical_slug, territory_id)
);

-- Pending checkpoints (approval requests)
CREATE TABLE IF NOT EXISTS autonomous_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Definition reference
    definition_id UUID REFERENCES autonomous_checkpoint_definitions(id),
    definition_slug VARCHAR(100),

    -- Context
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- What needs approval
    service VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id UUID,

    -- Request details
    request_data JSONB NOT NULL DEFAULT '{}',
    risk_assessment JSONB DEFAULT '{}',
    impact_summary TEXT,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 5,

    -- Resolution
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMPTZ,
    resolution_reason TEXT,
    resolution_data JSONB DEFAULT '{}',

    -- Timing
    expires_at TIMESTAMPTZ,
    escalated_at TIMESTAMPTZ,
    escalation_level INTEGER DEFAULT 0,

    -- Correlation
    correlation_id UUID,
    task_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Checkpoint approval history
CREATE TABLE IF NOT EXISTS autonomous_checkpoint_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    checkpoint_id UUID NOT NULL REFERENCES autonomous_checkpoints(id),

    action VARCHAR(50) NOT NULL,
    actor VARCHAR(255),
    reason TEXT,
    data JSONB DEFAULT '{}',

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- AUTONOMOUS TASK QUEUE
-- =====================================================

-- Unified task queue for all autonomous operations
CREATE TABLE IF NOT EXISTS autonomous_task_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Task identification
    task_type VARCHAR(100) NOT NULL,
    task_category VARCHAR(50) NOT NULL,

    -- Context (NO tenant)
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Task definition
    service VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',

    -- Target
    target_type VARCHAR(100),
    target_id UUID,

    -- Scheduling
    priority INTEGER NOT NULL DEFAULT 5,
    scheduled_at TIMESTAMPTZ,
    not_before TIMESTAMPTZ,
    not_after TIMESTAMPTZ,

    -- Execution
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,

    -- Checkpoints
    requires_checkpoint BOOLEAN DEFAULT false,
    checkpoint_id UUID REFERENCES autonomous_checkpoints(id),
    checkpoint_status VARCHAR(50),

    -- Results
    result JSONB,
    error_log JSONB DEFAULT '[]',

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Correlation
    correlation_id UUID,
    parent_task_id UUID,
    source VARCHAR(100),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Task execution history
CREATE TABLE IF NOT EXISTS autonomous_task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    task_id UUID NOT NULL REFERENCES autonomous_task_queue(id),

    event_type VARCHAR(50) NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    data JSONB DEFAULT '{}',
    error_message TEXT,

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- VIEWS
-- =====================================================

-- Current control state view
CREATE OR REPLACE VIEW v_autonomous_control_active AS
SELECT
    acs.*,
    COALESCE(
        (SELECT COUNT(*) FROM autonomous_task_queue atq
         WHERE atq.status = 'processing'
         AND (acs.vertical_slug IS NULL OR atq.vertical_slug = acs.vertical_slug)
         AND (acs.territory_id IS NULL OR atq.territory_id = acs.territory_id)),
        0
    ) as active_tasks,
    COALESCE(
        (SELECT COUNT(*) FROM autonomous_task_queue atq
         WHERE atq.status IN ('pending', 'scheduled')
         AND (acs.vertical_slug IS NULL OR atq.vertical_slug = acs.vertical_slug)
         AND (acs.territory_id IS NULL OR atq.territory_id = acs.territory_id)),
        0
    ) as pending_tasks
FROM autonomous_control_state acs
ORDER BY
    CASE WHEN acs.scope_type = 'global' THEN 0 ELSE 1 END,
    acs.vertical_slug,
    acs.territory_id;

-- Activity log summary view
CREATE OR REPLACE VIEW v_autonomous_activity_summary AS
SELECT
    DATE_TRUNC('hour', occurred_at) as hour,
    source_service,
    event_category,
    event_severity,
    vertical_slug,
    COUNT(*) as event_count,
    COUNT(*) FILTER (WHERE status = 'completed') as success_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failure_count,
    AVG(duration_ms) as avg_duration_ms
FROM autonomous_activity_log
WHERE occurred_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', occurred_at), source_service, event_category, event_severity, vertical_slug;

-- Pending checkpoints view
CREATE OR REPLACE VIEW v_pending_checkpoints AS
SELECT
    ac.*,
    acd.name as definition_name,
    acd.auto_approve_after_hours,
    acd.auto_reject_after_hours,
    acd.escalation_policy,
    CASE
        WHEN ac.expires_at < NOW() THEN 'expired'
        WHEN ac.expires_at < NOW() + INTERVAL '4 hours' THEN 'expiring_soon'
        ELSE 'active'
    END as urgency
FROM autonomous_checkpoints ac
LEFT JOIN autonomous_checkpoint_definitions acd ON acd.id = ac.definition_id
WHERE ac.status = 'pending'
ORDER BY ac.priority DESC, ac.created_at ASC;

-- Task queue health view
CREATE OR REPLACE VIEW v_task_queue_health AS
SELECT
    vertical_slug,
    territory_id,
    task_category,
    service,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
    COUNT(*) FILTER (WHERE status = 'processing') as processing,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) FILTER (WHERE status = 'blocked') as blocked,
    AVG(attempts) FILTER (WHERE status IN ('completed', 'failed')) as avg_attempts,
    AVG(duration_ms) FILTER (WHERE status = 'completed') as avg_duration_ms,
    MAX(created_at) as last_task_created
FROM autonomous_task_queue
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY vertical_slug, territory_id, task_category, service;

-- Error rate monitoring view
CREATE OR REPLACE VIEW v_autonomous_error_rates AS
SELECT
    source_service,
    vertical_slug,
    DATE_TRUNC('hour', occurred_at) as hour,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_events,
    CASE WHEN COUNT(*) > 0 THEN
        COUNT(*) FILTER (WHERE status = 'failed')::DECIMAL / COUNT(*)
    ELSE 0 END as error_rate
FROM autonomous_activity_log
WHERE occurred_at > NOW() - INTERVAL '6 hours'
GROUP BY source_service, vertical_slug, DATE_TRUNC('hour', occurred_at)
HAVING COUNT(*) >= 10;

-- =====================================================
-- INDEXES
-- =====================================================

-- Control state indexes
CREATE INDEX IF NOT EXISTS idx_control_state_scope ON autonomous_control_state(scope_type, vertical_slug, territory_id);
CREATE INDEX IF NOT EXISTS idx_control_state_enabled ON autonomous_control_state(is_enabled);
CREATE INDEX IF NOT EXISTS idx_control_history_state ON autonomous_control_history(control_state_id);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_occurred ON autonomous_activity_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON autonomous_activity_log(event_type, event_category);
CREATE INDEX IF NOT EXISTS idx_activity_log_service ON autonomous_activity_log(source_service);
CREATE INDEX IF NOT EXISTS idx_activity_log_severity ON autonomous_activity_log(event_severity) WHERE event_severity IN ('error', 'critical');
CREATE INDEX IF NOT EXISTS idx_activity_log_correlation ON autonomous_activity_log(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_vertical ON autonomous_activity_log(vertical_slug) WHERE vertical_slug IS NOT NULL;

-- Checkpoint indexes
CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON autonomous_checkpoints(status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_pending ON autonomous_checkpoints(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_checkpoints_expires ON autonomous_checkpoints(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_checkpoints_service ON autonomous_checkpoints(service, action);
CREATE INDEX IF NOT EXISTS idx_checkpoints_correlation ON autonomous_checkpoints(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkpoint_history_checkpoint ON autonomous_checkpoint_history(checkpoint_id);

-- Task queue indexes
CREATE INDEX IF NOT EXISTS idx_task_queue_status ON autonomous_task_queue(status);
CREATE INDEX IF NOT EXISTS idx_task_queue_pending ON autonomous_task_queue(priority DESC, created_at ASC) WHERE status IN ('pending', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_task_queue_scheduled ON autonomous_task_queue(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_task_queue_service ON autonomous_task_queue(service, action);
CREATE INDEX IF NOT EXISTS idx_task_queue_category ON autonomous_task_queue(task_category);
CREATE INDEX IF NOT EXISTS idx_task_queue_vertical ON autonomous_task_queue(vertical_slug) WHERE vertical_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_queue_correlation ON autonomous_task_queue(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_queue_checkpoint ON autonomous_task_queue(checkpoint_id) WHERE checkpoint_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_history_task ON autonomous_task_history(task_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to check if autonomous operations are enabled
CREATE OR REPLACE FUNCTION is_autonomy_enabled(
    p_vertical_slug VARCHAR DEFAULT NULL,
    p_territory_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_global_enabled BOOLEAN;
    v_scoped_enabled BOOLEAN;
BEGIN
    -- Check global state
    SELECT is_enabled INTO v_global_enabled
    FROM autonomous_control_state
    WHERE scope_type = 'global'
    LIMIT 1;

    -- If global is disabled, return false
    IF v_global_enabled = false THEN
        RETURN false;
    END IF;

    -- If no scope provided, return global state
    IF p_vertical_slug IS NULL AND p_territory_id IS NULL THEN
        RETURN COALESCE(v_global_enabled, true);
    END IF;

    -- Check scoped state (vertical or territory)
    SELECT is_enabled INTO v_scoped_enabled
    FROM autonomous_control_state
    WHERE (vertical_slug = p_vertical_slug OR territory_id = p_territory_id)
      AND scope_type != 'global'
    ORDER BY
        CASE WHEN territory_id IS NOT NULL THEN 0 ELSE 1 END
    LIMIT 1;

    RETURN COALESCE(v_scoped_enabled, v_global_enabled, true);
END;
$$ LANGUAGE plpgsql;

-- Function to get next task batch
CREATE OR REPLACE FUNCTION get_autonomous_task_batch(
    p_batch_size INTEGER DEFAULT 10,
    p_service VARCHAR DEFAULT NULL,
    p_vertical_slug VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    task_type VARCHAR,
    service VARCHAR,
    action VARCHAR,
    payload JSONB,
    target_type VARCHAR,
    target_id UUID,
    priority INTEGER,
    attempts INTEGER
) AS $$
BEGIN
    -- First check if autonomy is enabled
    IF NOT is_autonomy_enabled(p_vertical_slug, NULL) THEN
        RETURN;
    END IF;

    RETURN QUERY
    UPDATE autonomous_task_queue atq
    SET
        status = 'processing',
        started_at = NOW(),
        last_attempt_at = NOW(),
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE atq.id IN (
        SELECT atq2.id
        FROM autonomous_task_queue atq2
        WHERE atq2.status IN ('pending', 'scheduled')
          AND (atq2.scheduled_at IS NULL OR atq2.scheduled_at <= NOW())
          AND (atq2.not_before IS NULL OR atq2.not_before <= NOW())
          AND (atq2.not_after IS NULL OR atq2.not_after > NOW())
          AND (atq2.requires_checkpoint = false OR atq2.checkpoint_status = 'approved')
          AND (p_service IS NULL OR atq2.service = p_service)
          AND (p_vertical_slug IS NULL OR atq2.vertical_slug = p_vertical_slug)
        ORDER BY atq2.priority DESC, atq2.created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    RETURNING atq.id, atq.task_type, atq.service, atq.action, atq.payload, atq.target_type, atq.target_id, atq.priority, atq.attempts;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a task
CREATE OR REPLACE FUNCTION complete_autonomous_task(
    p_task_id UUID,
    p_success BOOLEAN,
    p_result JSONB DEFAULT NULL,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_task autonomous_task_queue%ROWTYPE;
BEGIN
    SELECT * INTO v_task FROM autonomous_task_queue WHERE id = p_task_id;

    IF v_task IS NULL THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    IF p_success THEN
        UPDATE autonomous_task_queue
        SET
            status = 'completed',
            result = p_result,
            completed_at = NOW(),
            duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
            updated_at = NOW()
        WHERE id = p_task_id;

        INSERT INTO autonomous_task_history (task_id, event_type, previous_status, new_status)
        VALUES (p_task_id, 'completed', v_task.status, 'completed');
    ELSE
        IF v_task.attempts >= v_task.max_attempts THEN
            UPDATE autonomous_task_queue
            SET
                status = 'failed',
                error_log = error_log || jsonb_build_object('attempt', v_task.attempts, 'error', p_error, 'at', NOW()),
                completed_at = NOW(),
                duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
                updated_at = NOW()
            WHERE id = p_task_id;

            INSERT INTO autonomous_task_history (task_id, event_type, previous_status, new_status, error_message)
            VALUES (p_task_id, 'failed', v_task.status, 'failed', p_error);
        ELSE
            UPDATE autonomous_task_queue
            SET
                status = 'pending',
                next_attempt_at = NOW() + (POWER(2, v_task.attempts) || ' minutes')::INTERVAL,
                error_log = error_log || jsonb_build_object('attempt', v_task.attempts, 'error', p_error, 'at', NOW()),
                updated_at = NOW()
            WHERE id = p_task_id;

            INSERT INTO autonomous_task_history (task_id, event_type, previous_status, new_status, error_message)
            VALUES (p_task_id, 'retry_scheduled', v_task.status, 'pending', p_error);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check and auto-expire checkpoints
CREATE OR REPLACE FUNCTION process_expired_checkpoints()
RETURNS TABLE (
    checkpoint_id UUID,
    action_taken VARCHAR
) AS $$
BEGIN
    -- Auto-approve checkpoints past auto_approve_after_hours
    RETURN QUERY
    UPDATE autonomous_checkpoints ac
    SET
        status = 'approved',
        resolved_at = NOW(),
        resolved_by = 'system:auto_approve',
        resolution_reason = 'Auto-approved after timeout',
        updated_at = NOW()
    WHERE ac.id IN (
        SELECT ac2.id
        FROM autonomous_checkpoints ac2
        JOIN autonomous_checkpoint_definitions acd ON acd.id = ac2.definition_id
        WHERE ac2.status = 'pending'
          AND acd.auto_approve_after_hours IS NOT NULL
          AND ac2.created_at + (acd.auto_approve_after_hours || ' hours')::INTERVAL < NOW()
    )
    RETURNING ac.id, 'auto_approved'::VARCHAR;

    -- Auto-reject checkpoints past auto_reject_after_hours
    RETURN QUERY
    UPDATE autonomous_checkpoints ac
    SET
        status = 'rejected',
        resolved_at = NOW(),
        resolved_by = 'system:auto_reject',
        resolution_reason = 'Auto-rejected after timeout',
        updated_at = NOW()
    WHERE ac.id IN (
        SELECT ac2.id
        FROM autonomous_checkpoints ac2
        JOIN autonomous_checkpoint_definitions acd ON acd.id = ac2.definition_id
        WHERE ac2.status = 'pending'
          AND ac2.created_at + (COALESCE(acd.auto_reject_after_hours, 72) || ' hours')::INTERVAL < NOW()
    )
    RETURNING ac.id, 'auto_rejected'::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- Function to check error rate and auto-disable if threshold exceeded
CREATE OR REPLACE FUNCTION check_error_rate_threshold(
    p_service VARCHAR,
    p_vertical_slug VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_error_rate DECIMAL;
    v_threshold DECIMAL;
    v_auto_disable BOOLEAN;
BEGIN
    -- Calculate error rate for last hour
    SELECT
        CASE WHEN COUNT(*) > 10 THEN
            COUNT(*) FILTER (WHERE status = 'failed')::DECIMAL / COUNT(*)
        ELSE 0 END
    INTO v_error_rate
    FROM autonomous_activity_log
    WHERE source_service = p_service
      AND (p_vertical_slug IS NULL OR vertical_slug = p_vertical_slug)
      AND occurred_at > NOW() - INTERVAL '1 hour';

    -- Get threshold from control state
    SELECT error_rate_threshold, auto_disable_on_threshold
    INTO v_threshold, v_auto_disable
    FROM autonomous_control_state
    WHERE (vertical_slug = p_vertical_slug OR (vertical_slug IS NULL AND scope_type = 'global'))
    ORDER BY CASE WHEN vertical_slug IS NOT NULL THEN 0 ELSE 1 END
    LIMIT 1;

    v_threshold := COALESCE(v_threshold, 0.1);
    v_auto_disable := COALESCE(v_auto_disable, true);

    -- If error rate exceeds threshold and auto-disable is on
    IF v_error_rate > v_threshold AND v_auto_disable THEN
        UPDATE autonomous_control_state
        SET
            is_enabled = false,
            disabled_reason = 'Auto-disabled due to high error rate: ' || ROUND(v_error_rate * 100, 2) || '%',
            disabled_by = 'system:error_rate_monitor',
            disabled_at = NOW(),
            updated_at = NOW()
        WHERE (vertical_slug = p_vertical_slug OR (vertical_slug IS NULL AND scope_type = 'global'));

        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Initialize global control state (enabled by default)
INSERT INTO autonomous_control_state (
    scope_type,
    is_enabled,
    max_concurrent_tasks,
    max_tasks_per_hour,
    max_tasks_per_day,
    error_rate_threshold,
    auto_disable_on_threshold
)
VALUES (
    'global',
    true,
    100,
    1000,
    10000,
    0.1,
    true
)
ON CONFLICT (scope_type, vertical_slug, territory_id) DO NOTHING;

-- Default checkpoint definitions
INSERT INTO autonomous_checkpoint_definitions (slug, name, description, trigger_conditions, applies_to_services, approval_required, auto_reject_after_hours)
VALUES
    ('high-volume-outreach', 'High Volume Outreach', 'Requires approval for outreach campaigns exceeding 100 recipients',
     '{"min_recipients": 100}', '["autoOutreach"]', true, 48),
    ('bulk-enrichment', 'Bulk Enrichment', 'Requires approval for enrichment jobs exceeding 500 objects',
     '{"min_objects": 500}', '["autoDiscovery"]', true, 24),
    ('delete-operation', 'Delete Operations', 'Requires approval for any bulk delete operation',
     '{"action_type": "delete"}', '["*"]', true, 72),
    ('cross-territory', 'Cross-Territory Operations', 'Requires approval for operations spanning multiple territories',
     '{"cross_territory": true}', '["*"]', true, 24)
ON CONFLICT (slug, vertical_slug, territory_id) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE autonomous_control_state IS 'S66: Global and scoped control state for autonomous operations (kill switch)';
COMMENT ON TABLE autonomous_control_history IS 'S66: History of control state changes';
COMMENT ON TABLE autonomous_activity_log IS 'S66: Centralized event log for all autonomous operations';
COMMENT ON TABLE autonomous_checkpoint_definitions IS 'S66: Definitions for human-in-the-loop approval checkpoints';
COMMENT ON TABLE autonomous_checkpoints IS 'S66: Pending and resolved checkpoint approval requests';
COMMENT ON TABLE autonomous_checkpoint_history IS 'S66: History of checkpoint actions';
COMMENT ON TABLE autonomous_task_queue IS 'S66: Unified task queue for all autonomous operations';
COMMENT ON TABLE autonomous_task_history IS 'S66: History of task state changes';

COMMENT ON FUNCTION is_autonomy_enabled IS 'S66: Check if autonomous operations are enabled for given scope';
COMMENT ON FUNCTION get_autonomous_task_batch IS 'S66: Get next batch of tasks for processing (respects kill switch)';
COMMENT ON FUNCTION complete_autonomous_task IS 'S66: Complete a task with success or failure';
COMMENT ON FUNCTION process_expired_checkpoints IS 'S66: Auto-approve or auto-reject expired checkpoints';
COMMENT ON FUNCTION check_error_rate_threshold IS 'S66: Check error rate and auto-disable if threshold exceeded';
