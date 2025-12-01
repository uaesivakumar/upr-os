-- =====================================================
-- S68: Auto-Outreach Engine
-- Sprint 68: Autonomous Outreach System
-- =====================================================
-- Features:
--   1. Outreach Queue Manager - centralized queue for all outreach
--   2. Send Time Optimization - ML-based optimal send time prediction
--   3. Auto-Follow-up Sequences - automated sequence management
--   4. Response Classification - AI-powered response categorization
--
-- Architecture:
--   - NO tenant awareness (OS-only)
--   - Context via territoryId, verticalSlug parameters
--   - Integrates with S64 Object Intelligence
--   - Integrates with S65 Evidence System
--   - Integrates with S67 Auto-Discovery
-- =====================================================

-- =====================================================
-- OUTREACH QUEUE TABLES
-- =====================================================

-- Main outreach queue
CREATE TABLE IF NOT EXISTS outreach_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Target identification
    object_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    contact_id UUID,

    -- Context (NO tenant)
    territory_id UUID,
    vertical_slug VARCHAR(100),

    -- Outreach details
    channel VARCHAR(50) NOT NULL,
    template_id UUID,
    sequence_id UUID,
    step_number INTEGER DEFAULT 1,

    -- Content
    subject TEXT,
    body TEXT,
    personalization JSONB DEFAULT '{}',

    -- Scheduling
    scheduled_at TIMESTAMPTZ,
    send_window_start TIME,
    send_window_end TIME,
    timezone VARCHAR(100) DEFAULT 'UTC',
    optimal_send_time TIMESTAMPTZ,

    -- Priority and state
    priority INTEGER NOT NULL DEFAULT 5,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,

    -- Results
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,

    -- Metadata
    source VARCHAR(100),
    correlation_id UUID,
    error_log JSONB DEFAULT '[]',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Outreach channels configuration
CREATE TABLE IF NOT EXISTS outreach_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Channel type
    channel_type VARCHAR(50) NOT NULL,
    provider VARCHAR(100),

    -- Configuration
    config JSONB NOT NULL DEFAULT '{}',
    rate_limits JSONB DEFAULT '{"per_minute": 60, "per_hour": 500, "per_day": 2000}',

    -- Send windows
    default_send_window_start TIME DEFAULT '09:00',
    default_send_window_end TIME DEFAULT '18:00',
    allowed_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- SEND TIME OPTIMIZATION TABLES
-- =====================================================

-- Send time patterns (learned from historical data)
CREATE TABLE IF NOT EXISTS send_time_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope
    vertical_slug VARCHAR(100),
    territory_id UUID,
    object_type VARCHAR(100),
    channel VARCHAR(50) NOT NULL,

    -- Pattern data
    day_of_week INTEGER NOT NULL,
    hour_of_day INTEGER NOT NULL,

    -- Metrics
    send_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    bounce_count INTEGER DEFAULT 0,

    -- Computed scores
    open_rate DECIMAL(5,4) DEFAULT 0,
    click_rate DECIMAL(5,4) DEFAULT 0,
    reply_rate DECIMAL(5,4) DEFAULT 0,
    engagement_score DECIMAL(5,4) DEFAULT 0,

    -- Confidence
    sample_size INTEGER DEFAULT 0,
    confidence DECIMAL(5,4) DEFAULT 0,

    last_updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(vertical_slug, territory_id, object_type, channel, day_of_week, hour_of_day)
);

-- Send time predictions
CREATE TABLE IF NOT EXISTS send_time_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Target
    object_id UUID NOT NULL,
    contact_id UUID,
    channel VARCHAR(50) NOT NULL,

    -- Context
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Prediction
    predicted_optimal_time TIMESTAMPTZ NOT NULL,
    predicted_open_rate DECIMAL(5,4),
    predicted_reply_rate DECIMAL(5,4),

    -- Model info
    model_version VARCHAR(50),
    features_used JSONB DEFAULT '{}',
    confidence DECIMAL(5,4),

    -- Outcome (for learning)
    actual_sent_at TIMESTAMPTZ,
    actual_opened BOOLEAN,
    actual_replied BOOLEAN,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- FOLLOW-UP SEQUENCE TABLES
-- =====================================================

-- Sequence definitions
CREATE TABLE IF NOT EXISTS outreach_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Context scope
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Sequence configuration
    channel VARCHAR(50) NOT NULL DEFAULT 'email',
    trigger_conditions JSONB DEFAULT '{}',
    exit_conditions JSONB DEFAULT '{}',

    -- Settings
    max_steps INTEGER DEFAULT 5,
    default_delay_hours INTEGER DEFAULT 48,
    respect_send_window BOOLEAN DEFAULT true,
    stop_on_reply BOOLEAN DEFAULT true,
    stop_on_bounce BOOLEAN DEFAULT true,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(slug, vertical_slug, territory_id)
);

-- Sequence steps
CREATE TABLE IF NOT EXISTS outreach_sequence_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent sequence
    sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,

    -- Step configuration
    delay_hours INTEGER DEFAULT 48,
    template_id UUID,

    -- Content overrides
    subject_template TEXT,
    body_template TEXT,

    -- Conditions
    conditions JSONB DEFAULT '{}',

    -- A/B testing
    variants JSONB DEFAULT '[]',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(sequence_id, step_number)
);

-- Sequence instances (enrollments)
CREATE TABLE IF NOT EXISTS sequence_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    sequence_id UUID NOT NULL REFERENCES outreach_sequences(id),
    object_id UUID NOT NULL,
    contact_id UUID,

    -- Context
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- State
    current_step INTEGER DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'active',

    -- Timing
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_step_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    exited_at TIMESTAMPTZ,
    exit_reason VARCHAR(100),

    -- Results
    steps_completed INTEGER DEFAULT 0,
    emails_sent INTEGER DEFAULT 0,
    opens INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,

    -- Metadata
    personalization_context JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(sequence_id, object_id, contact_id)
);

-- Sequence instance events
CREATE TABLE IF NOT EXISTS sequence_instance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    instance_id UUID NOT NULL REFERENCES sequence_instances(id) ON DELETE CASCADE,
    step_number INTEGER,
    outreach_id UUID,

    -- Event details
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- RESPONSE CLASSIFICATION TABLES
-- =====================================================

-- Response categories
CREATE TABLE IF NOT EXISTS response_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Category configuration
    sentiment VARCHAR(20),
    intent VARCHAR(50),
    priority INTEGER DEFAULT 100,

    -- Auto-actions
    auto_actions JSONB DEFAULT '[]',

    -- Classification hints
    keywords JSONB DEFAULT '[]',
    patterns JSONB DEFAULT '[]',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Classified responses
CREATE TABLE IF NOT EXISTS response_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    outreach_id UUID,
    object_id UUID,
    contact_id UUID,

    -- Context
    vertical_slug VARCHAR(100),
    territory_id UUID,

    -- Original response
    channel VARCHAR(50),
    response_text TEXT,
    response_subject TEXT,
    received_at TIMESTAMPTZ,

    -- Classification
    category_id UUID REFERENCES response_categories(id),
    category_slug VARCHAR(100),
    sentiment VARCHAR(20),
    intent VARCHAR(50),
    confidence DECIMAL(5,4),

    -- AI analysis
    ai_analysis JSONB DEFAULT '{}',
    extracted_entities JSONB DEFAULT '{}',
    suggested_actions JSONB DEFAULT '[]',

    -- Status
    is_reviewed BOOLEAN DEFAULT false,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    final_category_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Response templates (for auto-reply suggestions)
CREATE TABLE IF NOT EXISTS response_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,

    -- Scope
    vertical_slug VARCHAR(100),
    category_slug VARCHAR(100),

    -- Content
    subject_template TEXT,
    body_template TEXT,
    personalization_fields JSONB DEFAULT '[]',

    -- Usage
    is_auto_send BOOLEAN DEFAULT false,
    approval_required BOOLEAN DEFAULT true,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(slug, vertical_slug)
);

-- =====================================================
-- VIEWS
-- =====================================================

-- Active outreach queue view
CREATE OR REPLACE VIEW v_outreach_queue_active AS
SELECT
    oq.*,
    oc.name as channel_name,
    os.name as sequence_name
FROM outreach_queue oq
LEFT JOIN outreach_channels oc ON oc.slug = oq.channel
LEFT JOIN outreach_sequences os ON os.id = oq.sequence_id
WHERE oq.status IN ('pending', 'scheduled', 'retry')
ORDER BY oq.priority DESC, oq.scheduled_at ASC NULLS LAST;

-- Outreach performance by channel view
CREATE OR REPLACE VIEW v_outreach_performance_by_channel AS
SELECT
    channel,
    vertical_slug,
    territory_id,
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as total_sent,
    COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) as delivered,
    COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
    COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked,
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as replied,
    COUNT(*) FILTER (WHERE bounced_at IS NOT NULL) as bounced,
    CASE WHEN COUNT(*) > 0 THEN
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::DECIMAL / COUNT(*)
    ELSE 0 END as open_rate,
    CASE WHEN COUNT(*) > 0 THEN
        COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::DECIMAL / COUNT(*)
    ELSE 0 END as reply_rate
FROM outreach_queue
WHERE status = 'completed'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY channel, vertical_slug, territory_id, DATE_TRUNC('day', created_at);

-- Sequence performance view
CREATE OR REPLACE VIEW v_sequence_performance AS
SELECT
    os.id as sequence_id,
    os.slug,
    os.name,
    os.vertical_slug,
    COUNT(si.id) as total_enrolled,
    COUNT(si.id) FILTER (WHERE si.status = 'active') as active,
    COUNT(si.id) FILTER (WHERE si.status = 'completed') as completed,
    COUNT(si.id) FILTER (WHERE si.status = 'exited') as exited,
    AVG(si.steps_completed) as avg_steps_completed,
    SUM(si.opens) as total_opens,
    SUM(si.replies) as total_replies,
    CASE WHEN SUM(si.emails_sent) > 0 THEN
        SUM(si.opens)::DECIMAL / SUM(si.emails_sent)
    ELSE 0 END as avg_open_rate,
    CASE WHEN SUM(si.emails_sent) > 0 THEN
        SUM(si.replies)::DECIMAL / SUM(si.emails_sent)
    ELSE 0 END as avg_reply_rate
FROM outreach_sequences os
LEFT JOIN sequence_instances si ON si.sequence_id = os.id
GROUP BY os.id, os.slug, os.name, os.vertical_slug;

-- Response classification summary view
CREATE OR REPLACE VIEW v_response_summary AS
SELECT
    rc.slug as category_slug,
    rc.name as category_name,
    rc.sentiment,
    rc.intent,
    COUNT(rcl.id) as response_count,
    AVG(rcl.confidence) as avg_confidence,
    COUNT(rcl.id) FILTER (WHERE rcl.is_reviewed) as reviewed_count
FROM response_categories rc
LEFT JOIN response_classifications rcl ON rcl.category_id = rc.id
WHERE rcl.created_at > NOW() - INTERVAL '30 days' OR rcl.created_at IS NULL
GROUP BY rc.id, rc.slug, rc.name, rc.sentiment, rc.intent;

-- Optimal send times view
CREATE OR REPLACE VIEW v_optimal_send_times AS
SELECT
    vertical_slug,
    territory_id,
    channel,
    day_of_week,
    hour_of_day,
    engagement_score,
    sample_size,
    confidence,
    RANK() OVER (
        PARTITION BY vertical_slug, territory_id, channel
        ORDER BY engagement_score DESC
    ) as rank
FROM send_time_patterns
WHERE sample_size >= 10
ORDER BY vertical_slug, territory_id, channel, engagement_score DESC;

-- =====================================================
-- INDEXES
-- =====================================================

-- Outreach queue indexes
CREATE INDEX IF NOT EXISTS idx_outreach_queue_status ON outreach_queue(status);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_scheduled ON outreach_queue(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_outreach_queue_object ON outreach_queue(object_id);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_contact ON outreach_queue(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_queue_sequence ON outreach_queue(sequence_id) WHERE sequence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_queue_channel ON outreach_queue(channel);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_territory ON outreach_queue(territory_id) WHERE territory_id IS NOT NULL;

-- Send time pattern indexes
CREATE INDEX IF NOT EXISTS idx_send_time_patterns_channel ON send_time_patterns(channel);
CREATE INDEX IF NOT EXISTS idx_send_time_patterns_score ON send_time_patterns(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_send_time_predictions_object ON send_time_predictions(object_id);

-- Sequence indexes
CREATE INDEX IF NOT EXISTS idx_sequences_vertical ON outreach_sequences(vertical_slug);
CREATE INDEX IF NOT EXISTS idx_sequences_active ON outreach_sequences(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON outreach_sequence_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_sequence_instances_sequence ON sequence_instances(sequence_id);
CREATE INDEX IF NOT EXISTS idx_sequence_instances_object ON sequence_instances(object_id);
CREATE INDEX IF NOT EXISTS idx_sequence_instances_status ON sequence_instances(status);
CREATE INDEX IF NOT EXISTS idx_sequence_instances_next_step ON sequence_instances(next_step_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sequence_events_instance ON sequence_instance_events(instance_id);

-- Response classification indexes
CREATE INDEX IF NOT EXISTS idx_response_classifications_outreach ON response_classifications(outreach_id) WHERE outreach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_response_classifications_object ON response_classifications(object_id);
CREATE INDEX IF NOT EXISTS idx_response_classifications_category ON response_classifications(category_id);
CREATE INDEX IF NOT EXISTS idx_response_classifications_unreviewed ON response_classifications(created_at) WHERE is_reviewed = false;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to get next outreach batch
CREATE OR REPLACE FUNCTION get_outreach_batch(
    p_batch_size INTEGER DEFAULT 10,
    p_channel VARCHAR DEFAULT NULL,
    p_vertical_slug VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    object_id UUID,
    contact_id UUID,
    channel VARCHAR,
    template_id UUID,
    subject TEXT,
    body TEXT,
    personalization JSONB
) AS $$
BEGIN
    RETURN QUERY
    UPDATE outreach_queue oq
    SET
        status = 'processing',
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE oq.id IN (
        SELECT oq2.id
        FROM outreach_queue oq2
        WHERE oq2.status IN ('pending', 'scheduled', 'retry')
          AND (oq2.scheduled_at IS NULL OR oq2.scheduled_at <= NOW())
          AND (p_channel IS NULL OR oq2.channel = p_channel)
          AND (p_vertical_slug IS NULL OR oq2.vertical_slug = p_vertical_slug)
        ORDER BY oq2.priority DESC, oq2.scheduled_at ASC NULLS LAST
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    RETURNING oq.id, oq.object_id, oq.contact_id, oq.channel, oq.template_id, oq.subject, oq.body, oq.personalization;
END;
$$ LANGUAGE plpgsql;

-- Function to record outreach event
CREATE OR REPLACE FUNCTION record_outreach_event(
    p_outreach_id UUID,
    p_event_type VARCHAR,
    p_event_data JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
DECLARE
    v_instance_id UUID;
BEGIN
    -- Update outreach queue based on event type
    CASE p_event_type
        WHEN 'sent' THEN
            UPDATE outreach_queue SET sent_at = NOW(), status = 'sent', updated_at = NOW() WHERE id = p_outreach_id;
        WHEN 'delivered' THEN
            UPDATE outreach_queue SET delivered_at = NOW(), status = 'delivered', updated_at = NOW() WHERE id = p_outreach_id;
        WHEN 'opened' THEN
            UPDATE outreach_queue SET opened_at = COALESCE(opened_at, NOW()), updated_at = NOW() WHERE id = p_outreach_id;
        WHEN 'clicked' THEN
            UPDATE outreach_queue SET clicked_at = COALESCE(clicked_at, NOW()), updated_at = NOW() WHERE id = p_outreach_id;
        WHEN 'replied' THEN
            UPDATE outreach_queue SET replied_at = COALESCE(replied_at, NOW()), status = 'completed', updated_at = NOW() WHERE id = p_outreach_id;
        WHEN 'bounced' THEN
            UPDATE outreach_queue SET bounced_at = NOW(), status = 'bounced', updated_at = NOW() WHERE id = p_outreach_id;
        WHEN 'failed' THEN
            UPDATE outreach_queue
            SET
                status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retry' END,
                error_log = error_log || jsonb_build_object('event', p_event_type, 'data', p_event_data, 'at', NOW()),
                updated_at = NOW()
            WHERE id = p_outreach_id;
        ELSE
            NULL;
    END CASE;

    -- Update sequence instance if applicable
    SELECT si.id INTO v_instance_id
    FROM sequence_instances si
    JOIN outreach_queue oq ON oq.sequence_id = si.sequence_id AND oq.object_id = si.object_id
    WHERE oq.id = p_outreach_id;

    IF v_instance_id IS NOT NULL THEN
        INSERT INTO sequence_instance_events (instance_id, outreach_id, event_type, event_data)
        VALUES (v_instance_id, p_outreach_id, p_event_type, p_event_data);

        CASE p_event_type
            WHEN 'sent' THEN
                UPDATE sequence_instances SET emails_sent = emails_sent + 1, updated_at = NOW() WHERE id = v_instance_id;
            WHEN 'opened' THEN
                UPDATE sequence_instances SET opens = opens + 1, updated_at = NOW() WHERE id = v_instance_id;
            WHEN 'clicked' THEN
                UPDATE sequence_instances SET clicks = clicks + 1, updated_at = NOW() WHERE id = v_instance_id;
            WHEN 'replied' THEN
                UPDATE sequence_instances
                SET replies = replies + 1, status = 'completed', completed_at = NOW(), exit_reason = 'reply_received', updated_at = NOW()
                WHERE id = v_instance_id;
            WHEN 'bounced' THEN
                UPDATE sequence_instances
                SET status = 'exited', exited_at = NOW(), exit_reason = 'bounced', updated_at = NOW()
                WHERE id = v_instance_id;
            ELSE
                NULL;
        END CASE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to advance sequence instances
CREATE OR REPLACE FUNCTION advance_sequence_instances()
RETURNS TABLE (
    instance_id UUID,
    sequence_id UUID,
    object_id UUID,
    next_step INTEGER,
    scheduled_for TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    UPDATE sequence_instances si
    SET
        current_step = current_step + 1,
        steps_completed = steps_completed + 1,
        next_step_at = NOW() + (
            SELECT COALESCE(ss.delay_hours, 48) * INTERVAL '1 hour'
            FROM outreach_sequence_steps ss
            WHERE ss.sequence_id = si.sequence_id AND ss.step_number = si.current_step + 1
        ),
        updated_at = NOW()
    WHERE si.id IN (
        SELECT si2.id
        FROM sequence_instances si2
        JOIN outreach_sequences os ON os.id = si2.sequence_id
        WHERE si2.status = 'active'
          AND si2.next_step_at <= NOW()
          AND si2.current_step < os.max_steps
          AND EXISTS (
              SELECT 1 FROM outreach_sequence_steps ss
              WHERE ss.sequence_id = si2.sequence_id AND ss.step_number = si2.current_step + 1
          )
        FOR UPDATE SKIP LOCKED
    )
    RETURNING si.id, si.sequence_id, si.object_id, si.current_step, si.next_step_at;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate optimal send time
CREATE OR REPLACE FUNCTION calculate_optimal_send_time(
    p_object_id UUID,
    p_channel VARCHAR,
    p_vertical_slug VARCHAR DEFAULT NULL,
    p_territory_id UUID DEFAULT NULL,
    p_window_start TIME DEFAULT '09:00',
    p_window_end TIME DEFAULT '18:00',
    p_timezone VARCHAR DEFAULT 'UTC'
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    v_best_day INTEGER;
    v_best_hour INTEGER;
    v_result TIMESTAMPTZ;
BEGIN
    -- Find best day/hour combination from patterns
    SELECT day_of_week, hour_of_day
    INTO v_best_day, v_best_hour
    FROM send_time_patterns
    WHERE channel = p_channel
      AND (vertical_slug IS NULL OR vertical_slug = p_vertical_slug)
      AND (territory_id IS NULL OR territory_id = p_territory_id)
      AND hour_of_day >= EXTRACT(HOUR FROM p_window_start)
      AND hour_of_day <= EXTRACT(HOUR FROM p_window_end)
      AND sample_size >= 10
    ORDER BY engagement_score DESC
    LIMIT 1;

    -- Default to next business day at 10am if no patterns
    IF v_best_day IS NULL THEN
        v_best_day := EXTRACT(DOW FROM NOW())::INTEGER;
        IF v_best_day IN (0, 6) THEN v_best_day := 1; END IF;
        v_best_hour := 10;
    END IF;

    -- Calculate next occurrence of that day/hour
    v_result := DATE_TRUNC('day', NOW() AT TIME ZONE p_timezone)
        + ((7 + v_best_day - EXTRACT(DOW FROM NOW()))::INTEGER % 7) * INTERVAL '1 day'
        + v_best_hour * INTERVAL '1 hour';

    -- If it's in the past, add a week
    IF v_result < NOW() THEN
        v_result := v_result + INTERVAL '7 days';
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to update send time patterns from events
CREATE OR REPLACE FUNCTION update_send_time_patterns(
    p_channel VARCHAR,
    p_vertical_slug VARCHAR,
    p_territory_id UUID,
    p_object_type VARCHAR,
    p_sent_at TIMESTAMPTZ,
    p_opened BOOLEAN DEFAULT false,
    p_clicked BOOLEAN DEFAULT false,
    p_replied BOOLEAN DEFAULT false,
    p_bounced BOOLEAN DEFAULT false
)
RETURNS VOID AS $$
DECLARE
    v_day INTEGER;
    v_hour INTEGER;
BEGIN
    v_day := EXTRACT(DOW FROM p_sent_at)::INTEGER;
    v_hour := EXTRACT(HOUR FROM p_sent_at)::INTEGER;

    INSERT INTO send_time_patterns (
        vertical_slug, territory_id, object_type, channel, day_of_week, hour_of_day,
        send_count, open_count, click_count, reply_count, bounce_count, sample_size
    )
    VALUES (
        p_vertical_slug, p_territory_id, p_object_type, p_channel, v_day, v_hour,
        1,
        CASE WHEN p_opened THEN 1 ELSE 0 END,
        CASE WHEN p_clicked THEN 1 ELSE 0 END,
        CASE WHEN p_replied THEN 1 ELSE 0 END,
        CASE WHEN p_bounced THEN 1 ELSE 0 END,
        1
    )
    ON CONFLICT (vertical_slug, territory_id, object_type, channel, day_of_week, hour_of_day)
    DO UPDATE SET
        send_count = send_time_patterns.send_count + 1,
        open_count = send_time_patterns.open_count + CASE WHEN p_opened THEN 1 ELSE 0 END,
        click_count = send_time_patterns.click_count + CASE WHEN p_clicked THEN 1 ELSE 0 END,
        reply_count = send_time_patterns.reply_count + CASE WHEN p_replied THEN 1 ELSE 0 END,
        bounce_count = send_time_patterns.bounce_count + CASE WHEN p_bounced THEN 1 ELSE 0 END,
        sample_size = send_time_patterns.sample_size + 1,
        open_rate = (send_time_patterns.open_count + CASE WHEN p_opened THEN 1 ELSE 0 END)::DECIMAL / (send_time_patterns.send_count + 1),
        click_rate = (send_time_patterns.click_count + CASE WHEN p_clicked THEN 1 ELSE 0 END)::DECIMAL / (send_time_patterns.send_count + 1),
        reply_rate = (send_time_patterns.reply_count + CASE WHEN p_replied THEN 1 ELSE 0 END)::DECIMAL / (send_time_patterns.send_count + 1),
        engagement_score = (
            (send_time_patterns.open_count + CASE WHEN p_opened THEN 1 ELSE 0 END) * 1 +
            (send_time_patterns.click_count + CASE WHEN p_clicked THEN 1 ELSE 0 END) * 2 +
            (send_time_patterns.reply_count + CASE WHEN p_replied THEN 1 ELSE 0 END) * 5
        )::DECIMAL / (send_time_patterns.send_count + 1),
        confidence = LEAST((send_time_patterns.sample_size + 1)::DECIMAL / 100, 1),
        last_updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Default channels
INSERT INTO outreach_channels (slug, name, channel_type, provider, rate_limits)
VALUES
    ('email', 'Email', 'email', 'sendgrid', '{"per_minute": 100, "per_hour": 1000, "per_day": 10000}'),
    ('linkedin', 'LinkedIn', 'social', 'linkedin', '{"per_minute": 5, "per_hour": 50, "per_day": 100}'),
    ('phone', 'Phone', 'voice', 'twilio', '{"per_minute": 10, "per_hour": 100, "per_day": 500}'),
    ('sms', 'SMS', 'text', 'twilio', '{"per_minute": 30, "per_hour": 300, "per_day": 2000}')
ON CONFLICT (slug) DO NOTHING;

-- Default response categories
INSERT INTO response_categories (slug, name, sentiment, intent, priority, auto_actions)
VALUES
    ('interested', 'Interested', 'positive', 'engage', 100, '[{"type": "notify", "priority": "high"}]'),
    ('not-interested', 'Not Interested', 'negative', 'disengage', 50, '[{"type": "sequence_exit"}]'),
    ('out-of-office', 'Out of Office', 'neutral', 'delay', 30, '[{"type": "reschedule", "delay_days": 7}]'),
    ('unsubscribe', 'Unsubscribe Request', 'negative', 'unsubscribe', 90, '[{"type": "unsubscribe"}, {"type": "sequence_exit"}]'),
    ('referral', 'Referral', 'positive', 'refer', 80, '[{"type": "create_referral"}]'),
    ('meeting-request', 'Meeting Request', 'positive', 'schedule', 100, '[{"type": "calendar_link"}, {"type": "notify", "priority": "high"}]'),
    ('question', 'Has Questions', 'neutral', 'engage', 70, '[{"type": "notify"}]'),
    ('wrong-person', 'Wrong Person', 'neutral', 'redirect', 60, '[{"type": "update_contact"}]')
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE outreach_queue IS 'S68: Central queue for all outreach messages';
COMMENT ON TABLE outreach_channels IS 'S68: Configuration for outreach channels';
COMMENT ON TABLE send_time_patterns IS 'S68: Learned patterns for optimal send times';
COMMENT ON TABLE send_time_predictions IS 'S68: Individual send time predictions';
COMMENT ON TABLE outreach_sequences IS 'S68: Follow-up sequence definitions';
COMMENT ON TABLE outreach_sequence_steps IS 'S68: Steps within follow-up sequences';
COMMENT ON TABLE sequence_instances IS 'S68: Active sequence enrollments';
COMMENT ON TABLE sequence_instance_events IS 'S68: Events within sequence instances';
COMMENT ON TABLE response_categories IS 'S68: Categories for response classification';
COMMENT ON TABLE response_classifications IS 'S68: Classified responses with AI analysis';
COMMENT ON TABLE response_templates IS 'S68: Response templates for auto-replies';
