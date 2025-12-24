-- S256 AUTHORITY: Persona Resolution & Policy Hard Gate
-- Sprint: S256
-- Date: 2025-12-24
--
-- This migration enforces:
-- 1. Exactly ONE ACTIVE policy per persona (partial unique index)
-- 2. Persona scope hierarchy (GLOBAL, REGIONAL, LOCAL)
-- 3. Control plane version bump to 2.2

-- ============================================================================
-- STEP 1: Drop existing unique constraint on persona_id (allows multiple versions)
-- ============================================================================

-- First check if the constraint exists, then drop it
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'os_persona_policies_persona_id_key'
    ) THEN
        DROP INDEX os_persona_policies_persona_id_key;
        RAISE NOTICE 'Dropped unique index os_persona_policies_persona_id_key';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Create partial unique index - EXACTLY ONE ACTIVE per persona
-- ============================================================================

-- This enforces the hard gate: only one policy can be ACTIVE at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_policies_one_active_per_persona
ON os_persona_policies (persona_id)
WHERE status = 'ACTIVE';

COMMENT ON INDEX idx_persona_policies_one_active_per_persona IS
'S256 Hard Gate: Ensures exactly ONE ACTIVE policy per persona. Multiple DRAFT/STAGED/DEPRECATED allowed.';

-- ============================================================================
-- STEP 3: Ensure persona scope column is properly typed
-- ============================================================================

-- Add check constraint for valid scope values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_persona_scope'
    ) THEN
        ALTER TABLE os_personas
        ADD CONSTRAINT chk_persona_scope
        CHECK (scope IN ('GLOBAL', 'REGIONAL', 'LOCAL'));
        RAISE NOTICE 'Added scope check constraint';
    END IF;
END $$;

-- Set default scope to GLOBAL if null
UPDATE os_personas
SET scope = 'GLOBAL'
WHERE scope IS NULL;

-- ============================================================================
-- STEP 4: Create persona resolution function with inheritance
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_persona_with_inheritance(
    p_sub_vertical_id UUID,
    p_region_code TEXT DEFAULT NULL
) RETURNS TABLE (
    persona_id UUID,
    persona_key VARCHAR,
    persona_name VARCHAR,
    resolution_path TEXT,
    resolution_scope VARCHAR
) AS $$
DECLARE
    v_persona RECORD;
    v_path TEXT;
BEGIN
    -- Resolution order: LOCAL → REGIONAL → GLOBAL

    -- 1. Try LOCAL (exact region match)
    IF p_region_code IS NOT NULL THEN
        SELECT p.id, p.key, p.name, p.scope INTO v_persona
        FROM os_personas p
        WHERE p.sub_vertical_id = p_sub_vertical_id
          AND p.scope = 'LOCAL'
          AND p.region_code = p_region_code
          AND p.is_active = true
        LIMIT 1;

        IF FOUND THEN
            v_path := 'LOCAL(' || p_region_code || ')';
            RETURN QUERY SELECT v_persona.id, v_persona.key, v_persona.name, v_path, 'LOCAL'::VARCHAR;
            RETURN;
        END IF;
    END IF;

    -- 2. Try REGIONAL (region prefix match - e.g., UAE matches UAE-DUBAI)
    IF p_region_code IS NOT NULL THEN
        SELECT p.id, p.key, p.name, p.scope INTO v_persona
        FROM os_personas p
        WHERE p.sub_vertical_id = p_sub_vertical_id
          AND p.scope = 'REGIONAL'
          AND (
              p.region_code = SPLIT_PART(p_region_code, '-', 1) -- Match parent region
              OR p_region_code LIKE p.region_code || '%'
          )
          AND p.is_active = true
        LIMIT 1;

        IF FOUND THEN
            v_path := 'LOCAL(' || COALESCE(p_region_code, 'none') || ') → REGIONAL(' || COALESCE(v_persona.scope, 'none') || ')';
            RETURN QUERY SELECT v_persona.id, v_persona.key, v_persona.name, v_path, 'REGIONAL'::VARCHAR;
            RETURN;
        END IF;
    END IF;

    -- 3. Try GLOBAL (fallback)
    SELECT p.id, p.key, p.name, p.scope INTO v_persona
    FROM os_personas p
    WHERE p.sub_vertical_id = p_sub_vertical_id
      AND p.scope = 'GLOBAL'
      AND p.is_active = true
    LIMIT 1;

    IF FOUND THEN
        v_path := 'LOCAL(' || COALESCE(p_region_code, 'none') || ') → REGIONAL(none) → GLOBAL';
        RETURN QUERY SELECT v_persona.id, v_persona.key, v_persona.name, v_path, 'GLOBAL'::VARCHAR;
        RETURN;
    END IF;

    -- No persona found - return empty (caller must handle as PERSONA_NOT_RESOLVED)
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION resolve_persona_with_inheritance IS
'S256 Authority: Resolves persona using LOCAL → REGIONAL → GLOBAL inheritance. Returns resolution path for audit.';

-- ============================================================================
-- STEP 5: Create function to get active policy for persona (with hard gate)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_active_persona_policy(
    p_persona_id UUID
) RETURNS TABLE (
    policy_id UUID,
    policy_version INTEGER,
    policy_status VARCHAR,
    active_count INTEGER
) AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Count ACTIVE policies for this persona
    SELECT COUNT(*) INTO v_count
    FROM os_persona_policies pp
    WHERE pp.persona_id = p_persona_id AND pp.status = 'ACTIVE';

    -- Return policy with metadata
    RETURN QUERY
    SELECT
        pp.id,
        pp.policy_version,
        pp.status::VARCHAR,
        v_count
    FROM os_persona_policies pp
    WHERE pp.persona_id = p_persona_id
      AND pp.status = 'ACTIVE'
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_active_persona_policy IS
'S256 Authority: Returns active policy for persona. Caller must check active_count: 0=POLICY_NOT_FOUND, >1=MULTIPLE_ACTIVE_POLICIES';

-- ============================================================================
-- STEP 6: Update control plane version
-- ============================================================================

DO $$
BEGIN
    -- Create version table if not exists
    CREATE TABLE IF NOT EXISTS os_control_plane_version (
        id SERIAL PRIMARY KEY,
        version VARCHAR(20) NOT NULL,
        description TEXT,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Insert new version
    INSERT INTO os_control_plane_version (version, description)
    VALUES ('2.2', 'S256: Persona Resolution & Policy Hard Gate');

    RAISE NOTICE 'Control plane upgraded to version 2.2';
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify the partial unique index exists
DO $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_persona_policies_one_active_per_persona'
    ) INTO v_exists;

    IF v_exists THEN
        RAISE NOTICE 'VERIFICATION PASSED: Partial unique index for ACTIVE policies exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: Partial unique index not created';
    END IF;
END $$;

-- Verify the resolve function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'resolve_persona_with_inheritance'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: resolve_persona_with_inheritance function exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: resolve_persona_with_inheritance function not created';
    END IF;
END $$;
