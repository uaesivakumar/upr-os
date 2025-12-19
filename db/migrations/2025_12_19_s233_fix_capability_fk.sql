-- ============================================================================
-- Sprint 233: Fix Capability FK Constraint
-- ============================================================================
--
-- S233 Validation Test 1.3 revealed a bypass path:
-- The FK from os_model_capability_mappings → os_model_capabilities had
-- ON DELETE CASCADE, which means deleting a capability would silently
-- delete all model mappings.
--
-- This is a security issue: capability deletion should be BLOCKED if
-- any models reference it. Fix: Change to ON DELETE RESTRICT.
--
-- INVARIANT: Cannot delete a capability that has model mappings.
-- ============================================================================

BEGIN;

-- ============================================================================
-- DROP AND RECREATE FK WITH RESTRICT
-- ============================================================================

-- Find and drop the existing FK constraint
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    AND tc.constraint_schema = kcu.constraint_schema
  WHERE tc.table_name = 'os_model_capability_mappings'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'capability_id';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE os_model_capability_mappings DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped FK constraint: %', constraint_name;
  END IF;
END $$;

-- Add FK with RESTRICT
ALTER TABLE os_model_capability_mappings
  ADD CONSTRAINT os_model_capability_mappings_capability_id_fkey
  FOREIGN KEY (capability_id) REFERENCES os_model_capabilities(id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT os_model_capability_mappings_capability_id_fkey ON os_model_capability_mappings IS
  'RESTRICT: Cannot delete a capability that has model mappings. Delete mappings first.';

-- ============================================================================
-- VERIFY
-- ============================================================================

DO $$
DECLARE
  delete_rule TEXT;
BEGIN
  SELECT rc.delete_rule INTO delete_rule
  FROM information_schema.referential_constraints rc
  JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
    AND rc.constraint_schema = kcu.constraint_schema
  WHERE kcu.table_name = 'os_model_capability_mappings'
    AND kcu.column_name = 'capability_id';

  IF delete_rule IS NULL THEN
    RAISE EXCEPTION 'FK constraint not found after recreation!';
  END IF;

  IF delete_rule = 'CASCADE' THEN
    RAISE EXCEPTION 'FK still has CASCADE! Expected RESTRICT/NO ACTION';
  END IF;

  RAISE NOTICE 'FK constraint verified: delete_rule = %', delete_rule;
END $$;

COMMIT;
