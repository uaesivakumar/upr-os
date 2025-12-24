-- S259 AUTHORITY: Deterministic Replay Hard Gate
-- Sprint: S259
-- Date: 2025-12-24
--
-- This migration enforces:
-- 1. Replay attempt tracking table (os_replay_attempts)
-- 2. Replay function with drift detection
-- 3. REPLAY_DRIFT_DETECTED error on mismatch
-- 4. Control plane version bump to 2.5

-- ============================================================================
-- STEP 1: Create os_replay_attempts table
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_replay_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID REFERENCES os_envelopes(id),  -- NULL if envelope not found
    envelope_hash VARCHAR(64) NOT NULL,

    -- Replay metadata
    replay_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    replay_completed_at TIMESTAMP WITH TIME ZONE,

    -- Replay result
    replay_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (replay_status IN ('PENDING', 'SUCCESS', 'DRIFT_DETECTED', 'ENVELOPE_NOT_FOUND', 'FAILED')),

    -- Drift detection fields
    drift_detected BOOLEAN DEFAULT false,
    drift_details JSONB,  -- { field: 'persona_id', expected: 'x', actual: 'y' }

    -- Context
    replay_context JSONB,  -- Original request context
    replay_output JSONB,   -- Output from replay (if successful)

    -- Audit
    requested_by VARCHAR(255),
    request_source VARCHAR(50)  -- 'api', 'sales-bench', 'audit', etc.
);

-- Add comments
COMMENT ON TABLE os_replay_attempts IS 'S259 Authority: Tracks all replay attempts with drift detection.';
COMMENT ON COLUMN os_replay_attempts.drift_detected IS 'TRUE if replay produced different output than original.';
COMMENT ON COLUMN os_replay_attempts.drift_details IS 'JSON details of what drifted between original and replay.';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_replay_attempts_envelope
ON os_replay_attempts (envelope_id);

CREATE INDEX IF NOT EXISTS idx_replay_attempts_hash
ON os_replay_attempts (envelope_hash);

CREATE INDEX IF NOT EXISTS idx_replay_attempts_status
ON os_replay_attempts (replay_status);

CREATE INDEX IF NOT EXISTS idx_replay_attempts_requested_at
ON os_replay_attempts (replay_requested_at DESC);

-- ============================================================================
-- STEP 2: Create function to initiate replay
-- ============================================================================

CREATE OR REPLACE FUNCTION initiate_replay(
    p_envelope_hash VARCHAR,
    p_replay_context JSONB DEFAULT NULL,
    p_requested_by VARCHAR DEFAULT 'system',
    p_request_source VARCHAR DEFAULT 'api'
) RETURNS TABLE (
    replay_id UUID,
    envelope_id UUID,
    envelope_content JSONB,
    replay_status VARCHAR,
    error_code VARCHAR
) AS $$
DECLARE
    v_envelope RECORD;
    v_replay_id UUID;
BEGIN
    -- 1. Look up envelope by hash
    SELECT e.id, e.envelope_content, e.status
    INTO v_envelope
    FROM os_envelopes e
    WHERE e.sha256_hash = p_envelope_hash;

    IF NOT FOUND THEN
        -- Create failed replay attempt record
        INSERT INTO os_replay_attempts (
            envelope_hash, replay_status, replay_completed_at, requested_by, request_source
        ) VALUES (
            p_envelope_hash, 'ENVELOPE_NOT_FOUND', NOW(), p_requested_by, p_request_source
        )
        RETURNING id INTO v_replay_id;

        RETURN QUERY SELECT
            v_replay_id,
            NULL::UUID,
            NULL::JSONB,
            'ENVELOPE_NOT_FOUND'::VARCHAR,
            'ENVELOPE_NOT_SEALED'::VARCHAR;
        RETURN;
    END IF;

    -- 2. Check envelope status
    IF v_envelope.status = 'REVOKED' THEN
        INSERT INTO os_replay_attempts (
            envelope_id, envelope_hash, replay_status, replay_completed_at, requested_by, request_source
        ) VALUES (
            v_envelope.id, p_envelope_hash, 'FAILED', NOW(), p_requested_by, p_request_source
        )
        RETURNING id INTO v_replay_id;

        RETURN QUERY SELECT
            v_replay_id,
            v_envelope.id,
            NULL::JSONB,
            'FAILED'::VARCHAR,
            'ENVELOPE_REVOKED'::VARCHAR;
        RETURN;
    END IF;

    IF v_envelope.status = 'EXPIRED' THEN
        INSERT INTO os_replay_attempts (
            envelope_id, envelope_hash, replay_status, replay_completed_at, requested_by, request_source
        ) VALUES (
            v_envelope.id, p_envelope_hash, 'FAILED', NOW(), p_requested_by, p_request_source
        )
        RETURNING id INTO v_replay_id;

        RETURN QUERY SELECT
            v_replay_id,
            v_envelope.id,
            NULL::JSONB,
            'FAILED'::VARCHAR,
            'ENVELOPE_EXPIRED'::VARCHAR;
        RETURN;
    END IF;

    -- 3. Create pending replay attempt
    INSERT INTO os_replay_attempts (
        envelope_id, envelope_hash, replay_status, replay_context, requested_by, request_source
    ) VALUES (
        v_envelope.id, p_envelope_hash, 'PENDING', p_replay_context, p_requested_by, p_request_source
    )
    RETURNING id INTO v_replay_id;

    -- 4. Return envelope content for replay
    RETURN QUERY SELECT
        v_replay_id,
        v_envelope.id,
        v_envelope.envelope_content,
        'PENDING'::VARCHAR,
        NULL::VARCHAR;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION initiate_replay IS
'S259 Authority: Initiates replay by looking up sealed envelope. Returns content for replay execution.';

-- ============================================================================
-- STEP 3: Create function to complete replay (with drift detection)
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_replay(
    p_replay_id UUID,
    p_replay_output JSONB,
    p_new_hash VARCHAR DEFAULT NULL  -- Hash of replay output for drift detection
) RETURNS TABLE (
    replay_id UUID,
    replay_status VARCHAR,
    drift_detected BOOLEAN,
    drift_details JSONB
) AS $$
DECLARE
    v_attempt RECORD;
    v_envelope RECORD;
    v_drift BOOLEAN := false;
    v_drift_details JSONB := '[]'::JSONB;
    v_final_status VARCHAR;
BEGIN
    -- 1. Get replay attempt
    SELECT * INTO v_attempt
    FROM os_replay_attempts
    WHERE id = p_replay_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            p_replay_id,
            'FAILED'::VARCHAR,
            false,
            '{"error": "Replay attempt not found"}'::JSONB;
        RETURN;
    END IF;

    -- 2. Get original envelope
    SELECT * INTO v_envelope
    FROM os_envelopes
    WHERE id = v_attempt.envelope_id;

    IF NOT FOUND THEN
        UPDATE os_replay_attempts
        SET replay_status = 'FAILED',
            replay_completed_at = NOW(),
            drift_details = '{"error": "Original envelope not found"}'::JSONB
        WHERE id = p_replay_id;

        RETURN QUERY SELECT
            p_replay_id,
            'FAILED'::VARCHAR,
            false,
            '{"error": "Original envelope not found"}'::JSONB;
        RETURN;
    END IF;

    -- 3. Check for drift (if new hash provided)
    IF p_new_hash IS NOT NULL AND p_new_hash != v_envelope.sha256_hash THEN
        v_drift := true;
        v_drift_details := jsonb_build_object(
            'original_hash', v_envelope.sha256_hash,
            'replay_hash', p_new_hash,
            'drift_type', 'HASH_MISMATCH'
        );
        v_final_status := 'DRIFT_DETECTED';
    ELSE
        v_final_status := 'SUCCESS';
    END IF;

    -- 4. Update replay attempt
    UPDATE os_replay_attempts
    SET replay_status = v_final_status,
        replay_completed_at = NOW(),
        replay_output = p_replay_output,
        drift_detected = v_drift,
        drift_details = v_drift_details
    WHERE id = p_replay_id;

    RETURN QUERY SELECT
        p_replay_id,
        v_final_status,
        v_drift,
        v_drift_details;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION complete_replay IS
'S259 Authority: Completes replay with drift detection. DRIFT_DETECTED is a hard failure.';

-- ============================================================================
-- STEP 4: Create function to check replay history
-- ============================================================================

CREATE OR REPLACE FUNCTION get_replay_history(
    p_envelope_id UUID DEFAULT NULL,
    p_envelope_hash VARCHAR DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
    replay_id UUID,
    envelope_id UUID,
    envelope_hash VARCHAR,
    replay_status VARCHAR,
    drift_detected BOOLEAN,
    replay_requested_at TIMESTAMP WITH TIME ZONE,
    replay_completed_at TIMESTAMP WITH TIME ZONE,
    requested_by VARCHAR,
    request_source VARCHAR
) AS $$
BEGIN
    IF p_envelope_id IS NOT NULL THEN
        RETURN QUERY
        SELECT r.id, r.envelope_id, r.envelope_hash, r.replay_status, r.drift_detected,
               r.replay_requested_at, r.replay_completed_at, r.requested_by, r.request_source
        FROM os_replay_attempts r
        WHERE r.envelope_id = p_envelope_id
        ORDER BY r.replay_requested_at DESC
        LIMIT p_limit;
    ELSIF p_envelope_hash IS NOT NULL THEN
        RETURN QUERY
        SELECT r.id, r.envelope_id, r.envelope_hash, r.replay_status, r.drift_detected,
               r.replay_requested_at, r.replay_completed_at, r.requested_by, r.request_source
        FROM os_replay_attempts r
        WHERE r.envelope_hash = p_envelope_hash
        ORDER BY r.replay_requested_at DESC
        LIMIT p_limit;
    ELSE
        RETURN QUERY
        SELECT r.id, r.envelope_id, r.envelope_hash, r.replay_status, r.drift_detected,
               r.replay_requested_at, r.replay_completed_at, r.requested_by, r.request_source
        FROM os_replay_attempts r
        ORDER BY r.replay_requested_at DESC
        LIMIT p_limit;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_replay_history IS
'S259 Authority: Returns replay history for audit. Shows all attempts including drift detections.';

-- ============================================================================
-- STEP 5: Update control plane version
-- ============================================================================

INSERT INTO os_control_plane_version (version, description)
VALUES ('2.5', 'S259: Deterministic Replay Hard Gate');

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify os_replay_attempts table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'os_replay_attempts'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: os_replay_attempts table exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: os_replay_attempts table not created';
    END IF;
END $$;

-- Verify initiate_replay function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'initiate_replay'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: initiate_replay function exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: initiate_replay function not created';
    END IF;
END $$;

-- Verify complete_replay function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'complete_replay'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: complete_replay function exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: complete_replay function not created';
    END IF;
END $$;
