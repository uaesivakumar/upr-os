-- ============================================================================
-- Migration 021: Evaluator Invites for Human Calibration
-- ============================================================================
-- Enables email-based evaluator invites with secure tokens.
-- Solo founder friendly: Simple link-based access, no user registration.
--
-- Flow:
-- 1. Super Admin enters evaluator emails
-- 2. OS creates invite tokens (one per email)
-- 3. System sends email with unique scoring link
-- 4. Evaluator clicks link, scores scenarios (no login required)
-- 5. System captures scores, computes correlation when all complete
-- ============================================================================

-- ============================================================================
-- 1. EVALUATOR INVITES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS sales_bench_evaluator_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sales_bench_human_sessions(id) ON DELETE CASCADE,

    -- Evaluator identity
    evaluator_id VARCHAR(20) NOT NULL,           -- EVAL_1, EVAL_2, etc.
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),                   -- Optional name for display

    -- Secure access token (URL-safe, unique)
    token VARCHAR(64) UNIQUE NOT NULL,

    -- Status tracking
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'SENT', 'OPENED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED')
    ),

    -- Scoring progress
    scenarios_assigned INTEGER DEFAULT 0,
    scenarios_completed INTEGER DEFAULT 0,
    current_scenario_index INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,                         -- When email was sent
    first_accessed_at TIMESTAMPTZ,               -- When link was first opened
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,                      -- Token expiry (7 days default)

    -- Metadata
    user_agent TEXT,                             -- Browser info on first access
    ip_address INET,                             -- IP on first access

    UNIQUE(session_id, email)
);

CREATE INDEX idx_evaluator_invites_session ON sales_bench_evaluator_invites(session_id);
CREATE INDEX idx_evaluator_invites_token ON sales_bench_evaluator_invites(token);
CREATE INDEX idx_evaluator_invites_email ON sales_bench_evaluator_invites(email);

-- ============================================================================
-- 2. UPDATE HUMAN SESSIONS TABLE
-- ============================================================================
-- Add fields for invite tracking
ALTER TABLE sales_bench_human_sessions
    ADD COLUMN IF NOT EXISTS invites_sent INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS invites_completed INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- ============================================================================
-- 3. UPDATE HUMAN SCORES TABLE
-- ============================================================================
-- Link scores to invites (for traceability)
ALTER TABLE sales_bench_human_scores
    ADD COLUMN IF NOT EXISTS invite_id UUID REFERENCES sales_bench_evaluator_invites(id);

CREATE INDEX IF NOT EXISTS idx_human_scores_invite ON sales_bench_human_scores(invite_id);

-- ============================================================================
-- 4. SCENARIO QUEUE FOR EACH EVALUATOR
-- ============================================================================
-- Tracks which scenarios each evaluator should score (randomized order)
CREATE TABLE IF NOT EXISTS sales_bench_evaluator_scenario_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_id UUID NOT NULL REFERENCES sales_bench_evaluator_invites(id) ON DELETE CASCADE,
    scenario_id UUID NOT NULL,

    -- Ordering (shuffled per evaluator for bias reduction)
    queue_position INTEGER NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'SKIPPED', 'COMPLETED')
    ),

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    time_spent_seconds INTEGER,

    UNIQUE(invite_id, scenario_id)
);

CREATE INDEX idx_evaluator_queue_invite ON sales_bench_evaluator_scenario_queue(invite_id);

-- ============================================================================
-- 5. EMAIL LOG
-- ============================================================================
-- Track all emails sent (for debugging/compliance)
CREATE TABLE IF NOT EXISTS sales_bench_email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_id UUID REFERENCES sales_bench_evaluator_invites(id),

    email_type VARCHAR(50) NOT NULL,             -- INVITE, REMINDER, DEADLINE_WARNING
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255),

    -- Status
    status VARCHAR(20) DEFAULT 'QUEUED' CHECK (
        status IN ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED')
    ),

    -- Timing
    queued_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,

    -- Error tracking
    error_message TEXT,
    provider_response JSONB
);

CREATE INDEX idx_email_log_invite ON sales_bench_email_log(invite_id);
CREATE INDEX idx_email_log_status ON sales_bench_email_log(status);

-- ============================================================================
-- 6. HELPER FUNCTION: Generate secure token
-- ============================================================================
CREATE OR REPLACE FUNCTION sales_bench_generate_token()
RETURNS VARCHAR(64) AS $$
BEGIN
    -- Generate URL-safe random token (48 bytes = 64 base64 chars)
    RETURN replace(replace(encode(gen_random_bytes(48), 'base64'), '+', '-'), '/', '_');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. VIEW: Session progress with invite status
-- ============================================================================
CREATE OR REPLACE VIEW sales_bench_session_progress AS
SELECT
    s.id AS session_id,
    s.suite_id,
    s.session_name,
    s.evaluator_count AS target_evaluators,
    s.status AS session_status,
    COUNT(i.id) AS invites_created,
    COUNT(i.id) FILTER (WHERE i.status = 'SENT') AS invites_sent,
    COUNT(i.id) FILTER (WHERE i.status = 'COMPLETED') AS invites_completed,
    COUNT(i.id) FILTER (WHERE i.status = 'EXPIRED') AS invites_expired,
    CASE
        WHEN COUNT(i.id) > 0
        THEN ROUND(COUNT(i.id) FILTER (WHERE i.status = 'COMPLETED')::NUMERIC / COUNT(i.id) * 100, 1)
        ELSE 0
    END AS completion_rate,
    s.started_at,
    s.completed_at,
    s.deadline
FROM sales_bench_human_sessions s
LEFT JOIN sales_bench_evaluator_invites i ON i.session_id = s.id
GROUP BY s.id;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================
COMMENT ON TABLE sales_bench_evaluator_invites IS 'Evaluator invites with secure access tokens for Human Calibration';
COMMENT ON COLUMN sales_bench_evaluator_invites.token IS 'URL-safe token for passwordless access to scoring page';
COMMENT ON TABLE sales_bench_evaluator_scenario_queue IS 'Per-evaluator scenario queue (shuffled for bias reduction)';
COMMENT ON TABLE sales_bench_email_log IS 'Audit log for all calibration-related emails';
