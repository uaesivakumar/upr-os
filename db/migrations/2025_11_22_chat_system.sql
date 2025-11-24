-- Sprint 53: Chat System Tables
-- Migration: 2025_11_22_chat_system.sql
-- Purpose: Persistent chat history with intent tracking and tool metadata

-- ============================================================================
-- Chat Sessions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Session metadata
    title VARCHAR(255),
    context JSONB DEFAULT '{}',  -- {page, data, user preferences}

    -- State tracking
    is_active BOOLEAN DEFAULT true,
    message_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,

    -- Indexes
    CONSTRAINT chat_sessions_tenant_user_idx UNIQUE (tenant_id, user_id, id)
);

-- ============================================================================
-- Chat Messages Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

    -- Message content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,

    -- NLU metadata (for user messages)
    intent VARCHAR(50),
    intent_confidence DECIMAL(5, 4),  -- 0.0000 to 1.0000
    entities JSONB DEFAULT '[]',  -- [{type, value, confidence}]

    -- Tool execution (for assistant messages)
    tools_used JSONB DEFAULT '[]',  -- [{tool_name, input, output, latency_ms}]
    reasoning TEXT,  -- Chain-of-thought reasoning
    citations JSONB DEFAULT '[]',  -- [{source, text, relevance}]

    -- LLM metadata
    model VARCHAR(50),
    tokens_input INTEGER,
    tokens_output INTEGER,
    latency_ms INTEGER,
    cost_usd DECIMAL(10, 6),

    -- Status
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'streaming', 'error')),
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Chat Rate Limiting Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_rate_limits (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ip_address INET,

    -- Rate tracking
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMPTZ DEFAULT NOW(),

    -- Limits
    max_requests INTEGER DEFAULT 50,
    window_minutes INTEGER DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chat_rate_unique UNIQUE (tenant_id, user_id, ip_address)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Chat sessions indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant_user
    ON chat_sessions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_active
    ON chat_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated
    ON chat_sessions(updated_at DESC);

-- Chat messages indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session
    ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
    ON chat_messages(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_intent
    ON chat_messages(intent) WHERE intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_tools
    ON chat_messages USING GIN(tools_used) WHERE tools_used != '[]';

-- Rate limiting indexes
CREATE INDEX IF NOT EXISTS idx_chat_rate_limits_lookup
    ON chat_rate_limits(tenant_id, user_id, ip_address);
CREATE INDEX IF NOT EXISTS idx_chat_rate_limits_window
    ON chat_rate_limits(window_start);

-- ============================================================================
-- Trigger: Update session timestamps and message count
-- ============================================================================
CREATE OR REPLACE FUNCTION update_chat_session_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_sessions
    SET
        updated_at = NOW(),
        last_message_at = NOW(),
        message_count = message_count + 1
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_message_insert ON chat_messages;
CREATE TRIGGER trg_chat_message_insert
    AFTER INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_session_on_message();

-- ============================================================================
-- Function: Clean up old rate limit windows
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_chat_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM chat_rate_limits
    WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Check and update rate limit
-- Returns: {allowed: boolean, remaining: integer, reset_at: timestamp}
-- ============================================================================
CREATE OR REPLACE FUNCTION check_chat_rate_limit(
    p_tenant_id INTEGER,
    p_user_id INTEGER,
    p_ip_address INET,
    p_max_requests INTEGER DEFAULT 50,
    p_window_minutes INTEGER DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
    v_record chat_rate_limits%ROWTYPE;
    v_window_start TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    v_window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;

    -- Try to get existing record
    SELECT * INTO v_record
    FROM chat_rate_limits
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND ip_address = p_ip_address;

    IF v_record.id IS NULL THEN
        -- Create new record
        INSERT INTO chat_rate_limits (tenant_id, user_id, ip_address, request_count, max_requests, window_minutes)
        VALUES (p_tenant_id, p_user_id, p_ip_address, 1, p_max_requests, p_window_minutes)
        RETURNING * INTO v_record;

        v_result := jsonb_build_object(
            'allowed', true,
            'remaining', p_max_requests - 1,
            'reset_at', NOW() + (p_window_minutes || ' minutes')::INTERVAL
        );
    ELSIF v_record.window_start < v_window_start THEN
        -- Window expired, reset
        UPDATE chat_rate_limits
        SET request_count = 1, window_start = NOW(), updated_at = NOW()
        WHERE id = v_record.id;

        v_result := jsonb_build_object(
            'allowed', true,
            'remaining', p_max_requests - 1,
            'reset_at', NOW() + (p_window_minutes || ' minutes')::INTERVAL
        );
    ELSIF v_record.request_count >= p_max_requests THEN
        -- Rate limited
        v_result := jsonb_build_object(
            'allowed', false,
            'remaining', 0,
            'reset_at', v_record.window_start + (v_record.window_minutes || ' minutes')::INTERVAL
        );
    ELSE
        -- Increment counter
        UPDATE chat_rate_limits
        SET request_count = request_count + 1, updated_at = NOW()
        WHERE id = v_record.id;

        v_result := jsonb_build_object(
            'allowed', true,
            'remaining', p_max_requests - v_record.request_count - 1,
            'reset_at', v_record.window_start + (v_record.window_minutes || ' minutes')::INTERVAL
        );
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_sessions TO upr_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_messages TO upr_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_rate_limits TO upr_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO upr_app;
