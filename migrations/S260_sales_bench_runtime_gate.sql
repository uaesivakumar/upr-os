-- S260 AUTHORITY: Sales-Bench Mandatory Runtime Gate
-- Sprint: S260
-- Date: 2025-12-24
--
-- This migration enforces:
-- 1. Runtime gate violations table (os_runtime_gate_violations)
-- 2. Gate check function for SIVA execution
-- 3. RUNTIME_GATE_VIOLATION error on missing envelope
-- 4. Full context logging for blocked calls
-- 5. Control plane version bump to 2.6

-- ============================================================================
-- STEP 1: Create os_runtime_gate_violations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_runtime_gate_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Violation metadata
    violation_type VARCHAR(50) NOT NULL DEFAULT 'RUNTIME_GATE_VIOLATION',
    violation_code VARCHAR(50) NOT NULL,
    violation_message TEXT,

    -- Request context
    request_source VARCHAR(50) NOT NULL,  -- 'sales-bench', 'api', 'internal'
    request_endpoint VARCHAR(255),
    request_method VARCHAR(10),
    request_tenant_id UUID,
    request_workspace_id VARCHAR(255),
    request_user_id VARCHAR(255),

    -- Envelope context (what was missing/invalid)
    expected_envelope_id UUID,
    expected_envelope_hash VARCHAR(64),
    provided_envelope_id UUID,
    provided_envelope_hash VARCHAR(64),

    -- Full request context (for debugging)
    request_context JSONB,

    -- Timing
    violated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Resolution
    resolution_status VARCHAR(20) DEFAULT 'UNRESOLVED'
        CHECK (resolution_status IN ('UNRESOLVED', 'RESOLVED', 'IGNORED', 'ESCALATED')),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_notes TEXT
);

-- Add comments
COMMENT ON TABLE os_runtime_gate_violations IS 'S260 Authority: Tracks all runtime gate violations. SIVA calls without valid envelope are logged here.';
COMMENT ON COLUMN os_runtime_gate_violations.violation_code IS 'Specific violation: NO_ENVELOPE, INVALID_ENVELOPE, EXPIRED_ENVELOPE, REVOKED_ENVELOPE';
COMMENT ON COLUMN os_runtime_gate_violations.request_context IS 'Full request context for debugging and audit.';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_gate_violations_source
ON os_runtime_gate_violations (request_source);

CREATE INDEX IF NOT EXISTS idx_gate_violations_tenant
ON os_runtime_gate_violations (request_tenant_id);

CREATE INDEX IF NOT EXISTS idx_gate_violations_violated_at
ON os_runtime_gate_violations (violated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gate_violations_unresolved
ON os_runtime_gate_violations (resolution_status)
WHERE resolution_status = 'UNRESOLVED';

-- ============================================================================
-- STEP 2: Create runtime gate check function
-- ============================================================================

CREATE OR REPLACE FUNCTION check_runtime_gate(
    p_source VARCHAR,
    p_endpoint VARCHAR,
    p_method VARCHAR,
    p_tenant_id UUID,
    p_workspace_id VARCHAR,
    p_user_id VARCHAR,
    p_envelope_id UUID DEFAULT NULL,
    p_envelope_hash VARCHAR DEFAULT NULL,
    p_request_context JSONB DEFAULT NULL
) RETURNS TABLE (
    gate_passed BOOLEAN,
    violation_id UUID,
    violation_code VARCHAR,
    violation_message TEXT,
    envelope_status VARCHAR
) AS $$
DECLARE
    v_envelope RECORD;
    v_violation_id UUID;
    v_violation_code VARCHAR;
    v_violation_message TEXT;
BEGIN
    -- 1. Check if envelope identifier provided
    IF p_envelope_id IS NULL AND p_envelope_hash IS NULL THEN
        v_violation_code := 'NO_ENVELOPE';
        v_violation_message := 'SIVA call attempted without envelope. Runtime gate violation.';

        INSERT INTO os_runtime_gate_violations (
            violation_code, violation_message, request_source, request_endpoint,
            request_method, request_tenant_id, request_workspace_id, request_user_id,
            request_context
        ) VALUES (
            v_violation_code, v_violation_message, p_source, p_endpoint,
            p_method, p_tenant_id, p_workspace_id, p_user_id,
            p_request_context
        )
        RETURNING id INTO v_violation_id;

        RETURN QUERY SELECT
            false,
            v_violation_id,
            v_violation_code,
            v_violation_message,
            NULL::VARCHAR;
        RETURN;
    END IF;

    -- 2. Look up envelope
    IF p_envelope_id IS NOT NULL THEN
        SELECT * INTO v_envelope FROM os_envelopes WHERE id = p_envelope_id;
    ELSE
        SELECT * INTO v_envelope FROM os_envelopes WHERE sha256_hash = p_envelope_hash;
    END IF;

    IF NOT FOUND THEN
        v_violation_code := 'INVALID_ENVELOPE';
        v_violation_message := 'Envelope not found in registry. Runtime gate violation.';

        INSERT INTO os_runtime_gate_violations (
            violation_code, violation_message, request_source, request_endpoint,
            request_method, request_tenant_id, request_workspace_id, request_user_id,
            provided_envelope_id, provided_envelope_hash, request_context
        ) VALUES (
            v_violation_code, v_violation_message, p_source, p_endpoint,
            p_method, p_tenant_id, p_workspace_id, p_user_id,
            p_envelope_id, p_envelope_hash, p_request_context
        )
        RETURNING id INTO v_violation_id;

        RETURN QUERY SELECT
            false,
            v_violation_id,
            v_violation_code,
            v_violation_message,
            NULL::VARCHAR;
        RETURN;
    END IF;

    -- 3. Check envelope status
    IF v_envelope.status = 'REVOKED' THEN
        v_violation_code := 'REVOKED_ENVELOPE';
        v_violation_message := 'Envelope has been revoked. Runtime gate violation.';

        INSERT INTO os_runtime_gate_violations (
            violation_code, violation_message, request_source, request_endpoint,
            request_method, request_tenant_id, request_workspace_id, request_user_id,
            expected_envelope_id, expected_envelope_hash, request_context
        ) VALUES (
            v_violation_code, v_violation_message, p_source, p_endpoint,
            p_method, p_tenant_id, p_workspace_id, p_user_id,
            v_envelope.id, v_envelope.sha256_hash, p_request_context
        )
        RETURNING id INTO v_violation_id;

        RETURN QUERY SELECT
            false,
            v_violation_id,
            v_violation_code,
            v_violation_message,
            v_envelope.status;
        RETURN;
    END IF;

    IF v_envelope.status = 'EXPIRED' OR
       (v_envelope.expires_at IS NOT NULL AND v_envelope.expires_at < NOW()) THEN
        v_violation_code := 'EXPIRED_ENVELOPE';
        v_violation_message := 'Envelope has expired. Runtime gate violation.';

        INSERT INTO os_runtime_gate_violations (
            violation_code, violation_message, request_source, request_endpoint,
            request_method, request_tenant_id, request_workspace_id, request_user_id,
            expected_envelope_id, expected_envelope_hash, request_context
        ) VALUES (
            v_violation_code, v_violation_message, p_source, p_endpoint,
            p_method, p_tenant_id, p_workspace_id, p_user_id,
            v_envelope.id, v_envelope.sha256_hash, p_request_context
        )
        RETURNING id INTO v_violation_id;

        RETURN QUERY SELECT
            false,
            v_violation_id,
            v_violation_code,
            v_violation_message,
            'EXPIRED'::VARCHAR;
        RETURN;
    END IF;

    -- 4. Gate passed - no violation
    RETURN QUERY SELECT
        true,
        NULL::UUID,
        NULL::VARCHAR,
        NULL::TEXT,
        v_envelope.status;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_runtime_gate IS
'S260 Authority: Checks runtime gate before SIVA execution. Returns violation if envelope missing/invalid.';

-- ============================================================================
-- STEP 3: Create function to get violation statistics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_violation_statistics(
    p_since TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '24 hours',
    p_source VARCHAR DEFAULT NULL
) RETURNS TABLE (
    total_violations BIGINT,
    unresolved_count BIGINT,
    by_code JSONB,
    by_source JSONB,
    recent_violations JSONB
) AS $$
DECLARE
    v_total BIGINT;
    v_unresolved BIGINT;
    v_by_code JSONB;
    v_by_source JSONB;
    v_recent JSONB;
BEGIN
    -- Total violations
    SELECT COUNT(*) INTO v_total
    FROM os_runtime_gate_violations
    WHERE violated_at >= p_since
    AND (p_source IS NULL OR request_source = p_source);

    -- Unresolved count
    SELECT COUNT(*) INTO v_unresolved
    FROM os_runtime_gate_violations
    WHERE violated_at >= p_since
    AND resolution_status = 'UNRESOLVED'
    AND (p_source IS NULL OR request_source = p_source);

    -- By violation code
    SELECT jsonb_object_agg(violation_code, cnt) INTO v_by_code
    FROM (
        SELECT violation_code, COUNT(*) as cnt
        FROM os_runtime_gate_violations
        WHERE violated_at >= p_since
        AND (p_source IS NULL OR request_source = p_source)
        GROUP BY violation_code
    ) sub;

    -- By source
    SELECT jsonb_object_agg(request_source, cnt) INTO v_by_source
    FROM (
        SELECT request_source, COUNT(*) as cnt
        FROM os_runtime_gate_violations
        WHERE violated_at >= p_since
        AND (p_source IS NULL OR request_source = p_source)
        GROUP BY request_source
    ) sub;

    -- Recent violations (last 5)
    SELECT jsonb_agg(sub) INTO v_recent
    FROM (
        SELECT id, violation_code, request_source, violated_at
        FROM os_runtime_gate_violations
        WHERE violated_at >= p_since
        AND (p_source IS NULL OR request_source = p_source)
        ORDER BY violated_at DESC
        LIMIT 5
    ) sub;

    RETURN QUERY SELECT
        v_total,
        v_unresolved,
        COALESCE(v_by_code, '{}'::JSONB),
        COALESCE(v_by_source, '{}'::JSONB),
        COALESCE(v_recent, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_violation_statistics IS
'S260 Authority: Returns violation statistics for monitoring and alerting.';

-- ============================================================================
-- STEP 4: Update control plane version
-- ============================================================================

INSERT INTO os_control_plane_version (version, description)
VALUES ('2.6', 'S260: Sales-Bench Mandatory Runtime Gate');

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify os_runtime_gate_violations table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'os_runtime_gate_violations'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: os_runtime_gate_violations table exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: os_runtime_gate_violations table not created';
    END IF;
END $$;

-- Verify check_runtime_gate function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'check_runtime_gate'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: check_runtime_gate function exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: check_runtime_gate function not created';
    END IF;
END $$;

-- Verify get_violation_statistics function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'get_violation_statistics'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: get_violation_statistics function exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: get_violation_statistics function not created';
    END IF;
END $$;
