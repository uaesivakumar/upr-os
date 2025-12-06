-- ============================================================================
-- Fix S55 FK Constraint Issue
-- December 6, 2025
--
-- Problem: The config_version_trigger was BEFORE INSERT, but tried to insert
-- into os_kernel_config_versions with config_id = NEW.id. Since the row
-- doesn't exist yet (BEFORE trigger), the FK constraint fails.
--
-- Solution: Split into two triggers:
-- 1. BEFORE UPDATE - increment version number (requires modifying NEW)
-- 2. AFTER INSERT OR UPDATE - record version history (row exists by then)
-- ============================================================================

-- Drop the existing problematic trigger
DROP TRIGGER IF EXISTS config_version_trigger ON os_kernel_config;

-- ============================================================================
-- FUNCTION: Increment version on update (runs BEFORE UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_config_version()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
        NEW.version := OLD.version + 1;
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Record version history (runs AFTER INSERT/UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION record_config_version_after()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO os_kernel_config_versions (
            config_id, namespace, key, value, version, change_type, changed_by
        ) VALUES (
            NEW.id, NEW.namespace, NEW.key, NEW.value, NEW.version, 'create', NEW.created_by
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.value IS DISTINCT FROM NEW.value THEN
        INSERT INTO os_kernel_config_versions (
            config_id, namespace, key, value, version, change_type, changed_by
        ) VALUES (
            NEW.id, NEW.namespace, NEW.key, NEW.value, NEW.version, 'update', NEW.updated_by
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER 1: BEFORE UPDATE - increment version number
-- ============================================================================
CREATE TRIGGER config_version_increment_trigger
    BEFORE UPDATE ON os_kernel_config
    FOR EACH ROW
    EXECUTE FUNCTION increment_config_version();

-- ============================================================================
-- TRIGGER 2: AFTER INSERT OR UPDATE - record version history
-- ============================================================================
CREATE TRIGGER config_version_history_trigger
    AFTER INSERT OR UPDATE ON os_kernel_config
    FOR EACH ROW
    EXECUTE FUNCTION record_config_version_after();

-- ============================================================================
-- TEST: Verify the fix works by inserting a test config
-- ============================================================================
-- This should now work without FK violation
INSERT INTO os_kernel_config (namespace, key, value, description, environment, created_by)
VALUES ('test', 'fk_fix_verification', '"success"', 'Test to verify FK fix works', 'all', 'migration')
ON CONFLICT (namespace, key, environment) DO UPDATE SET
    value = '"success_updated"',
    updated_by = 'migration';

-- Clean up test record
DELETE FROM os_kernel_config WHERE namespace = 'test' AND key = 'fk_fix_verification';
