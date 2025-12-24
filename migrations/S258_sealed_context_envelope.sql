-- S258 AUTHORITY: Sealed Context Envelope v1
-- Sprint: S258
-- Date: 2025-12-24
--
-- This migration enforces:
-- 1. Envelope storage table (os_envelopes)
-- 2. SHA256 hash is MANDATORY (NOT NULL constraint)
-- 3. Envelope version is persisted
-- 4. Envelope ID is UUID and tracked
-- 5. Control plane version bump to 2.4

-- ============================================================================
-- STEP 1: Create os_envelopes table
-- ============================================================================

CREATE TABLE IF NOT EXISTS os_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_version VARCHAR(20) NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,  -- MANDATORY: SHA256 is always 64 hex chars

    -- Context references
    tenant_id UUID NOT NULL,
    workspace_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),

    -- Resolved references
    persona_id UUID NOT NULL,
    policy_id UUID NOT NULL,
    policy_version INTEGER NOT NULL,
    territory_id UUID,

    -- Resolution metadata
    persona_resolution_path TEXT,
    persona_resolution_scope VARCHAR(20),
    territory_resolution_path TEXT,

    -- Full envelope content (for replay)
    envelope_content JSONB NOT NULL,

    -- Audit fields
    sealed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sealed_by VARCHAR(255),  -- 'system' or user identifier

    -- Status
    status VARCHAR(20) DEFAULT 'SEALED' CHECK (status IN ('SEALED', 'EXPIRED', 'REVOKED')),
    expires_at TIMESTAMP WITH TIME ZONE,

    -- Indexes for fast lookup
    CONSTRAINT uq_envelope_hash UNIQUE (sha256_hash)
);

-- Add comments
COMMENT ON TABLE os_envelopes IS 'S258 Authority: Sealed context envelopes for SIVA execution. Each envelope is immutable once sealed.';
COMMENT ON COLUMN os_envelopes.sha256_hash IS 'MANDATORY: SHA256 hash of envelope content. Used for verification and deduplication.';
COMMENT ON COLUMN os_envelopes.envelope_content IS 'Full envelope JSON for replay. Immutable.';

-- ============================================================================
-- STEP 2: Create indexes for fast lookup
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_envelopes_tenant_workspace
ON os_envelopes (tenant_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_envelopes_persona
ON os_envelopes (persona_id);

CREATE INDEX IF NOT EXISTS idx_envelopes_sealed_at
ON os_envelopes (sealed_at DESC);

CREATE INDEX IF NOT EXISTS idx_envelopes_status
ON os_envelopes (status)
WHERE status = 'SEALED';

-- ============================================================================
-- STEP 3: Create function to seal envelope
-- ============================================================================

CREATE OR REPLACE FUNCTION seal_envelope(
    p_envelope_version VARCHAR,
    p_sha256_hash VARCHAR,
    p_tenant_id UUID,
    p_workspace_id VARCHAR,
    p_user_id VARCHAR,
    p_persona_id UUID,
    p_policy_id UUID,
    p_policy_version INTEGER,
    p_territory_id UUID,
    p_persona_resolution_path TEXT,
    p_persona_resolution_scope VARCHAR,
    p_territory_resolution_path TEXT,
    p_envelope_content JSONB,
    p_sealed_by VARCHAR DEFAULT 'system',
    p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
    envelope_id UUID,
    is_new BOOLEAN,
    sealed_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_existing_id UUID;
    v_new_id UUID;
    v_sealed_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Check if envelope with same hash already exists
    SELECT id, os_envelopes.sealed_at INTO v_existing_id, v_sealed_at
    FROM os_envelopes
    WHERE os_envelopes.sha256_hash = p_sha256_hash;

    IF FOUND THEN
        -- Return existing envelope (idempotent)
        RETURN QUERY SELECT v_existing_id, false, v_sealed_at;
        RETURN;
    END IF;

    -- Create new envelope
    v_sealed_at := NOW();

    INSERT INTO os_envelopes (
        envelope_version, sha256_hash, tenant_id, workspace_id, user_id,
        persona_id, policy_id, policy_version, territory_id,
        persona_resolution_path, persona_resolution_scope, territory_resolution_path,
        envelope_content, sealed_at, sealed_by, expires_at
    ) VALUES (
        p_envelope_version, p_sha256_hash, p_tenant_id, p_workspace_id, p_user_id,
        p_persona_id, p_policy_id, p_policy_version, p_territory_id,
        p_persona_resolution_path, p_persona_resolution_scope, p_territory_resolution_path,
        p_envelope_content, v_sealed_at, p_sealed_by, p_expires_at
    )
    RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_new_id, true, v_sealed_at;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION seal_envelope IS
'S258 Authority: Seals envelope and stores for audit replay. Idempotent - returns existing if hash matches.';

-- ============================================================================
-- STEP 4: Create function to verify envelope
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_envelope(
    p_envelope_id UUID DEFAULT NULL,
    p_sha256_hash VARCHAR DEFAULT NULL
) RETURNS TABLE (
    is_valid BOOLEAN,
    envelope_id UUID,
    status VARCHAR,
    sealed_at TIMESTAMP WITH TIME ZONE,
    verification_message TEXT
) AS $$
DECLARE
    v_envelope RECORD;
BEGIN
    -- Require at least one identifier
    IF p_envelope_id IS NULL AND p_sha256_hash IS NULL THEN
        RETURN QUERY SELECT
            false,
            NULL::UUID,
            NULL::VARCHAR,
            NULL::TIMESTAMP WITH TIME ZONE,
            'ENVELOPE_NOT_SEALED: No identifier provided'::TEXT;
        RETURN;
    END IF;

    -- Look up envelope
    IF p_envelope_id IS NOT NULL THEN
        SELECT * INTO v_envelope FROM os_envelopes WHERE id = p_envelope_id;
    ELSE
        SELECT * INTO v_envelope FROM os_envelopes WHERE sha256_hash = p_sha256_hash;
    END IF;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            false,
            NULL::UUID,
            NULL::VARCHAR,
            NULL::TIMESTAMP WITH TIME ZONE,
            'ENVELOPE_NOT_SEALED: Envelope not found in registry'::TEXT;
        RETURN;
    END IF;

    -- Check status
    IF v_envelope.status = 'REVOKED' THEN
        RETURN QUERY SELECT
            false,
            v_envelope.id,
            v_envelope.status,
            v_envelope.sealed_at,
            'ENVELOPE_REVOKED: Envelope has been revoked'::TEXT;
        RETURN;
    END IF;

    IF v_envelope.status = 'EXPIRED' OR
       (v_envelope.expires_at IS NOT NULL AND v_envelope.expires_at < NOW()) THEN
        RETURN QUERY SELECT
            false,
            v_envelope.id,
            'EXPIRED'::VARCHAR,
            v_envelope.sealed_at,
            'ENVELOPE_EXPIRED: Envelope has expired'::TEXT;
        RETURN;
    END IF;

    -- Envelope is valid
    RETURN QUERY SELECT
        true,
        v_envelope.id,
        v_envelope.status,
        v_envelope.sealed_at,
        'ENVELOPE_VALID: Sealed and verified'::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION verify_envelope IS
'S258 Authority: Verifies envelope exists and is valid. Returns ENVELOPE_NOT_SEALED if not found.';

-- ============================================================================
-- STEP 5: Create function to get envelope content (for replay)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_envelope_content(
    p_envelope_id UUID DEFAULT NULL,
    p_sha256_hash VARCHAR DEFAULT NULL
) RETURNS TABLE (
    envelope_id UUID,
    envelope_version VARCHAR,
    sha256_hash VARCHAR,
    envelope_content JSONB,
    sealed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR
) AS $$
BEGIN
    IF p_envelope_id IS NOT NULL THEN
        RETURN QUERY
        SELECT e.id, e.envelope_version, e.sha256_hash, e.envelope_content, e.sealed_at, e.status
        FROM os_envelopes e
        WHERE e.id = p_envelope_id;
    ELSIF p_sha256_hash IS NOT NULL THEN
        RETURN QUERY
        SELECT e.id, e.envelope_version, e.sha256_hash, e.envelope_content, e.sealed_at, e.status
        FROM os_envelopes e
        WHERE e.sha256_hash = p_sha256_hash;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_envelope_content IS
'S258 Authority: Retrieves sealed envelope content for replay.';

-- ============================================================================
-- STEP 6: Update control plane version
-- ============================================================================

INSERT INTO os_control_plane_version (version, description)
VALUES ('2.4', 'S258: Sealed Context Envelope v1');

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify os_envelopes table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'os_envelopes'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: os_envelopes table exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: os_envelopes table not created';
    END IF;
END $$;

-- Verify sha256_hash is NOT NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'os_envelopes'
        AND column_name = 'sha256_hash'
        AND is_nullable = 'NO'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: sha256_hash is NOT NULL';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: sha256_hash is not properly constrained';
    END IF;
END $$;

-- Verify seal_envelope function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'seal_envelope'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: seal_envelope function exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: seal_envelope function not created';
    END IF;
END $$;

-- Verify verify_envelope function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'verify_envelope'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: verify_envelope function exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: verify_envelope function not created';
    END IF;
END $$;
