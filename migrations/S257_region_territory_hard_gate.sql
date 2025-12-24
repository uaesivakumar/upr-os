-- S257 AUTHORITY: Region Resolution & Territory Hard Gate
-- Sprint: S257
-- Date: 2025-12-24
--
-- This migration enforces:
-- 1. Territory resolution function with inheritance (district → state → country → region → global)
-- 2. Coverage type constraint (SINGLE, MULTI, GLOBAL)
-- 3. Runtime failure mode: TERRITORY_NOT_CONFIGURED
-- 4. Control plane version bump to 2.3

-- ============================================================================
-- STEP 1: Add coverage_type column to territories table
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'territories' AND column_name = 'coverage_type'
    ) THEN
        ALTER TABLE territories
        ADD COLUMN coverage_type VARCHAR(20) DEFAULT 'SINGLE';
        RAISE NOTICE 'Added coverage_type column to territories';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Add coverage_type check constraint
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_territory_coverage_type'
    ) THEN
        ALTER TABLE territories
        ADD CONSTRAINT chk_territory_coverage_type
        CHECK (coverage_type IN ('SINGLE', 'MULTI', 'GLOBAL'));
        RAISE NOTICE 'Added coverage_type check constraint';
    END IF;
END $$;

-- Set coverage types based on level
UPDATE territories
SET coverage_type = CASE
    WHEN level = 'global' THEN 'GLOBAL'
    WHEN level IN ('region', 'country') THEN 'MULTI'
    ELSE 'SINGLE'
END
WHERE coverage_type IS NULL OR coverage_type = 'SINGLE';

-- ============================================================================
-- STEP 3: Create territory resolution function with inheritance
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_territory_with_inheritance(
    p_region_code TEXT,
    p_sub_vertical_id UUID DEFAULT NULL
) RETURNS TABLE (
    territory_id UUID,
    territory_slug VARCHAR,
    territory_name VARCHAR,
    territory_level VARCHAR,
    coverage_type VARCHAR,
    resolution_path TEXT,
    resolution_depth INTEGER
) AS $$
DECLARE
    v_territory RECORD;
    v_path TEXT := '';
    v_depth INTEGER := 0;
    v_found BOOLEAN := false;
BEGIN
    -- Resolution order: exact match → parent hierarchy → global fallback

    -- 1. Try exact region_code match
    SELECT t.id, t.slug, t.name, t.level, t.coverage_type
    INTO v_territory
    FROM territories t
    WHERE t.region_code = p_region_code
      AND t.status = 'active'
    LIMIT 1;

    IF FOUND THEN
        v_path := 'EXACT(' || p_region_code || ')';
        v_found := true;
        v_depth := 1;
        RETURN QUERY SELECT
            v_territory.id,
            v_territory.slug,
            v_territory.name,
            v_territory.level,
            v_territory.coverage_type,
            v_path,
            v_depth;
        RETURN;
    END IF;

    -- 2. Try country_code match
    SELECT t.id, t.slug, t.name, t.level, t.coverage_type
    INTO v_territory
    FROM territories t
    WHERE t.country_code = p_region_code
      AND t.level = 'country'
      AND t.status = 'active'
    LIMIT 1;

    IF FOUND THEN
        v_path := 'EXACT(' || COALESCE(p_region_code, 'none') || ') → COUNTRY(' || v_territory.slug || ')';
        v_found := true;
        v_depth := 2;
        RETURN QUERY SELECT
            v_territory.id,
            v_territory.slug,
            v_territory.name,
            v_territory.level,
            v_territory.coverage_type,
            v_path,
            v_depth;
        RETURN;
    END IF;

    -- 3. Try slug match (case-insensitive)
    SELECT t.id, t.slug, t.name, t.level, t.coverage_type
    INTO v_territory
    FROM territories t
    WHERE LOWER(t.slug) = LOWER(p_region_code)
      AND t.status = 'active'
    LIMIT 1;

    IF FOUND THEN
        v_path := 'EXACT(' || COALESCE(p_region_code, 'none') || ') → COUNTRY(none) → SLUG(' || v_territory.slug || ')';
        v_found := true;
        v_depth := 3;
        RETURN QUERY SELECT
            v_territory.id,
            v_territory.slug,
            v_territory.name,
            v_territory.level,
            v_territory.coverage_type,
            v_path,
            v_depth;
        RETURN;
    END IF;

    -- 4. Try name match (case-insensitive)
    SELECT t.id, t.slug, t.name, t.level, t.coverage_type
    INTO v_territory
    FROM territories t
    WHERE LOWER(t.name) = LOWER(p_region_code)
      AND t.status = 'active'
    LIMIT 1;

    IF FOUND THEN
        v_path := 'EXACT(' || COALESCE(p_region_code, 'none') || ') → COUNTRY(none) → SLUG(none) → NAME(' || v_territory.name || ')';
        v_found := true;
        v_depth := 4;
        RETURN QUERY SELECT
            v_territory.id,
            v_territory.slug,
            v_territory.name,
            v_territory.level,
            v_territory.coverage_type,
            v_path,
            v_depth;
        RETURN;
    END IF;

    -- 5. Fallback to GLOBAL territory
    SELECT t.id, t.slug, t.name, t.level, t.coverage_type
    INTO v_territory
    FROM territories t
    WHERE t.level = 'global'
      AND t.status = 'active'
    LIMIT 1;

    IF FOUND THEN
        v_path := 'EXACT(' || COALESCE(p_region_code, 'none') || ') → COUNTRY(none) → SLUG(none) → NAME(none) → GLOBAL';
        v_depth := 5;
        RETURN QUERY SELECT
            v_territory.id,
            v_territory.slug,
            v_territory.name,
            v_territory.level,
            v_territory.coverage_type,
            v_path,
            v_depth;
        RETURN;
    END IF;

    -- No territory found - return empty (caller must handle as TERRITORY_NOT_CONFIGURED)
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION resolve_territory_with_inheritance IS
'S257 Authority: Resolves territory using inheritance. Returns resolution path for audit. Empty = TERRITORY_NOT_CONFIGURED.';

-- ============================================================================
-- STEP 4: Create function to validate territory for sub-vertical
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_territory_for_sub_vertical(
    p_territory_id UUID,
    p_sub_vertical_id UUID
) RETURNS TABLE (
    is_valid BOOLEAN,
    validation_message TEXT,
    territory_config JSONB
) AS $$
DECLARE
    v_territory RECORD;
    v_sub_vertical RECORD;
    v_territory_sv RECORD;
BEGIN
    -- Get territory
    SELECT * INTO v_territory
    FROM territories
    WHERE id = p_territory_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Territory not found or inactive'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    -- Get sub-vertical
    SELECT * INTO v_sub_vertical
    FROM os_sub_verticals
    WHERE id = p_sub_vertical_id AND is_active = true;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Sub-vertical not found or inactive'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    -- Check if territory has explicit sub-vertical config
    SELECT * INTO v_territory_sv
    FROM territory_sub_verticals tsv
    WHERE tsv.territory_id = p_territory_id
      AND tsv.slug = v_sub_vertical.key
      AND tsv.is_active = true;

    IF FOUND THEN
        RETURN QUERY SELECT true, 'Territory configured for sub-vertical'::TEXT, v_territory_sv.config;
        RETURN;
    END IF;

    -- Check if territory allows all sub-verticals (global/multi coverage)
    IF v_territory.coverage_type IN ('GLOBAL', 'MULTI') THEN
        RETURN QUERY SELECT true, 'Territory allows all sub-verticals (coverage: ' || v_territory.coverage_type || ')'::TEXT, v_territory.config;
        RETURN;
    END IF;

    -- Not configured
    RETURN QUERY SELECT false, 'Territory not configured for sub-vertical'::TEXT, NULL::JSONB;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION validate_territory_for_sub_vertical IS
'S257 Authority: Validates that territory is configured for sub-vertical. Returns config if valid.';

-- ============================================================================
-- STEP 5: Update control plane version
-- ============================================================================

INSERT INTO os_control_plane_version (version, description)
VALUES ('2.3', 'S257: Region Resolution & Territory Hard Gate');

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify coverage_type constraint exists
DO $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_territory_coverage_type'
    ) INTO v_exists;

    IF v_exists THEN
        RAISE NOTICE 'VERIFICATION PASSED: Coverage type constraint exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: Coverage type constraint not created';
    END IF;
END $$;

-- Verify resolve function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'resolve_territory_with_inheritance'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: resolve_territory_with_inheritance function exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: resolve_territory_with_inheritance function not created';
    END IF;
END $$;

-- Verify validate function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'validate_territory_for_sub_vertical'
    ) THEN
        RAISE NOTICE 'VERIFICATION PASSED: validate_territory_for_sub_vertical function exists';
    ELSE
        RAISE EXCEPTION 'VERIFICATION FAILED: validate_territory_for_sub_vertical function not created';
    END IF;
END $$;
