-- ============================================================================
-- Migration 022: Suite Versioning
-- ============================================================================
-- Adds version tracking to benchmark suites.
-- Enables:
-- - Iterative suite evolution (v1 → v2 → v3)
-- - Comparison between versions
-- - Regression detection
-- - Historical traceability
--
-- Version naming: {base_key}-v{N}
-- Example: banking-eb-uae-pre-entry-v1, banking-eb-uae-pre-entry-v2
-- ============================================================================

-- ============================================================================
-- 1. ADD VERSION FIELDS TO SUITES
-- ============================================================================

ALTER TABLE sales_bench_suites
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS base_suite_key VARCHAR(100),
    ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES sales_bench_suites(id),
    ADD COLUMN IF NOT EXISTS is_latest_version BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS version_notes TEXT,
    ADD COLUMN IF NOT EXISTS version_created_at TIMESTAMPTZ DEFAULT NOW();

-- Index for version lookups
CREATE INDEX IF NOT EXISTS idx_suites_base_key ON sales_bench_suites(base_suite_key);
CREATE INDEX IF NOT EXISTS idx_suites_version ON sales_bench_suites(base_suite_key, version);
CREATE INDEX IF NOT EXISTS idx_suites_latest ON sales_bench_suites(is_latest_version) WHERE is_latest_version = true;

-- ============================================================================
-- 2. VERSION HISTORY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW sales_bench_suite_versions AS
SELECT
    s.id,
    s.suite_key,
    s.base_suite_key,
    s.version,
    s.name,
    s.description,
    s.scenario_count,
    s.is_frozen,
    s.is_latest_version,
    s.version_notes,
    s.version_created_at,
    ss.status,
    ss.system_validated_at,
    ss.human_validated_at,
    ss.ga_approved_at,
    parent.suite_key AS parent_version_key,
    parent.version AS parent_version_number
FROM sales_bench_suites s
LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
LEFT JOIN sales_bench_suites parent ON parent.id = s.parent_version_id
WHERE s.is_active = true
ORDER BY s.base_suite_key, s.version DESC;

-- ============================================================================
-- 3. HELPER FUNCTION: Create new version
-- ============================================================================

CREATE OR REPLACE FUNCTION sales_bench_create_suite_version(
    p_source_suite_id UUID,
    p_version_notes TEXT DEFAULT NULL,
    p_created_by VARCHAR DEFAULT 'SYSTEM'
) RETURNS UUID AS $$
DECLARE
    v_source_suite sales_bench_suites%ROWTYPE;
    v_new_suite_id UUID;
    v_new_version INTEGER;
    v_new_suite_key VARCHAR;
BEGIN
    -- Get source suite
    SELECT * INTO v_source_suite
    FROM sales_bench_suites
    WHERE id = p_source_suite_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source suite not found: %', p_source_suite_id;
    END IF;

    -- Determine base key and next version
    IF v_source_suite.base_suite_key IS NULL THEN
        -- First version - use current key as base
        v_source_suite.base_suite_key := regexp_replace(v_source_suite.suite_key, '-v\d+$', '');
    END IF;

    -- Get next version number
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
    FROM sales_bench_suites
    WHERE base_suite_key = v_source_suite.base_suite_key;

    -- Generate new suite key
    v_new_suite_key := v_source_suite.base_suite_key || '-v' || v_new_version;

    -- Mark old version as not latest
    UPDATE sales_bench_suites
    SET is_latest_version = false
    WHERE base_suite_key = v_source_suite.base_suite_key
      AND is_latest_version = true;

    -- Create new suite version
    INSERT INTO sales_bench_suites (
        suite_key, name, description,
        vertical_id, sub_vertical_id, region_code, stage,
        version, base_suite_key, parent_version_id, is_latest_version,
        version_notes, version_created_at, created_by
    ) VALUES (
        v_new_suite_key,
        v_source_suite.name || ' v' || v_new_version,
        COALESCE(p_version_notes, v_source_suite.description),
        v_source_suite.vertical_id,
        v_source_suite.sub_vertical_id,
        v_source_suite.region_code,
        v_source_suite.stage,
        v_new_version,
        v_source_suite.base_suite_key,
        p_source_suite_id,
        true,
        p_version_notes,
        NOW(),
        p_created_by
    )
    RETURNING id INTO v_new_suite_id;

    -- Create status record
    INSERT INTO sales_bench_suite_status (suite_id, status)
    VALUES (v_new_suite_id, 'DRAFT');

    -- Copy scenarios from source
    INSERT INTO sales_bench_suite_scenarios (suite_id, scenario_id, sequence_order, selected_by, selection_reason)
    SELECT v_new_suite_id, scenario_id, sequence_order, p_created_by, 'Copied from version ' || v_source_suite.version
    FROM sales_bench_suite_scenarios
    WHERE suite_id = p_source_suite_id;

    -- Update scenario count
    UPDATE sales_bench_suites
    SET scenario_count = (SELECT COUNT(*) FROM sales_bench_suite_scenarios WHERE suite_id = v_new_suite_id)
    WHERE id = v_new_suite_id;

    RETURN v_new_suite_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. BACKFILL EXISTING SUITES
-- ============================================================================
-- Set base_suite_key for existing suites

UPDATE sales_bench_suites
SET base_suite_key = regexp_replace(suite_key, '-v\d+$', ''),
    version = COALESCE(
        (regexp_match(suite_key, '-v(\d+)$'))[1]::INTEGER,
        1
    )
WHERE base_suite_key IS NULL;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON COLUMN sales_bench_suites.version IS 'Suite version number (1, 2, 3...)';
COMMENT ON COLUMN sales_bench_suites.base_suite_key IS 'Base suite key without version suffix';
COMMENT ON COLUMN sales_bench_suites.parent_version_id IS 'ID of the suite version this was derived from';
COMMENT ON COLUMN sales_bench_suites.is_latest_version IS 'True if this is the most recent version of the suite';
COMMENT ON FUNCTION sales_bench_create_suite_version IS 'Creates a new version of a suite, copying scenarios';
