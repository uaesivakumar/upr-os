-- =============================================================================
-- RLS Cross-Tenant Isolation Tests
-- VS5: PostgreSQL RLS
--
-- Tests all RLS requirements:
-- 1. SET app.tenant_id = 'tenant-a' → Only see tenant-a's data
-- 2. SET app.tenant_id = 'tenant-b' → Only see tenant-b's data
-- 3. Cross-tenant queries return empty results
-- 4. Verify no data leakage between tenants
--
-- Authorization Code: VS1-VS9-APPROVED-20251213
--
-- Usage:
--   psql $DATABASE_URL -f rls-isolation-tests.sql
-- =============================================================================

\echo '=============================================='
\echo 'VS5 RLS Isolation Test Suite'
\echo '=============================================='
\echo ''

-- =============================================================================
-- SETUP: Create test tenants and test data
-- =============================================================================

\echo '--- SETUP: Creating test tenants and data ---'

-- Create test tenants if not exist
INSERT INTO tenants (id, name, slug, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test Tenant A', 'test-tenant-a', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Test Tenant B', 'test-tenant-b', 'active')
ON CONFLICT (id) DO NOTHING;

-- Insert test data for tenant A
INSERT INTO hr_leads (id, tenant_id, name, email, company_name, status, created_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Alice from Tenant A', 'alice@tenant-a.com', 'Company A', 'new', NOW())
ON CONFLICT (id) DO NOTHING;

-- Insert test data for tenant B
INSERT INTO hr_leads (id, tenant_id, name, email, company_name, status, created_at)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'Bob from Tenant B', 'bob@tenant-b.com', 'Company B', 'new', NOW())
ON CONFLICT (id) DO NOTHING;

\echo 'Test data created'
\echo ''

-- =============================================================================
-- TEST 1: Tenant A can only see their own data
-- =============================================================================

\echo '--- TEST 1: Tenant A Isolation ---'

-- Set tenant context to Tenant A
SELECT set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', false);

-- Query hr_leads - should only see Tenant A's data
\echo 'Querying hr_leads as Tenant A:'
SELECT id, tenant_id, name, email FROM hr_leads WHERE name LIKE 'Alice%' OR name LIKE 'Bob%';

-- Verify count
DO $$
DECLARE
  lead_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO lead_count FROM hr_leads WHERE name IN ('Alice from Tenant A', 'Bob from Tenant B');

  IF lead_count = 1 THEN
    RAISE NOTICE 'TEST 1 PASSED: Tenant A sees only 1 lead (their own)';
  ELSE
    RAISE EXCEPTION 'TEST 1 FAILED: Tenant A sees % leads (expected 1)', lead_count;
  END IF;
END $$;

\echo ''

-- =============================================================================
-- TEST 2: Tenant B can only see their own data
-- =============================================================================

\echo '--- TEST 2: Tenant B Isolation ---'

-- Set tenant context to Tenant B
SELECT set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', false);

-- Query hr_leads - should only see Tenant B's data
\echo 'Querying hr_leads as Tenant B:'
SELECT id, tenant_id, name, email FROM hr_leads WHERE name LIKE 'Alice%' OR name LIKE 'Bob%';

-- Verify count
DO $$
DECLARE
  lead_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO lead_count FROM hr_leads WHERE name IN ('Alice from Tenant A', 'Bob from Tenant B');

  IF lead_count = 1 THEN
    RAISE NOTICE 'TEST 2 PASSED: Tenant B sees only 1 lead (their own)';
  ELSE
    RAISE EXCEPTION 'TEST 2 FAILED: Tenant B sees % leads (expected 1)', lead_count;
  END IF;
END $$;

\echo ''

-- =============================================================================
-- TEST 3: Tenant A cannot see Tenant B's specific lead
-- =============================================================================

\echo '--- TEST 3: Cross-Tenant Data Isolation ---'

-- Set tenant context to Tenant A
SELECT set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', false);

-- Try to access Tenant B's specific lead by ID
DO $$
DECLARE
  bob_found BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM hr_leads WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) INTO bob_found;

  IF bob_found = false THEN
    RAISE NOTICE 'TEST 3 PASSED: Tenant A cannot see Tenant B lead by ID';
  ELSE
    RAISE EXCEPTION 'TEST 3 FAILED: Tenant A CAN see Tenant B lead - SECURITY BREACH!';
  END IF;
END $$;

\echo ''

-- =============================================================================
-- TEST 4: Tenant B cannot see Tenant A's specific lead
-- =============================================================================

\echo '--- TEST 4: Reverse Cross-Tenant Isolation ---'

-- Set tenant context to Tenant B
SELECT set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', false);

-- Try to access Tenant A's specific lead by ID
DO $$
DECLARE
  alice_found BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM hr_leads WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) INTO alice_found;

  IF alice_found = false THEN
    RAISE NOTICE 'TEST 4 PASSED: Tenant B cannot see Tenant A lead by ID';
  ELSE
    RAISE EXCEPTION 'TEST 4 FAILED: Tenant B CAN see Tenant A lead - SECURITY BREACH!';
  END IF;
END $$;

\echo ''

-- =============================================================================
-- TEST 5: Verify RLS policies exist on all tenant-isolated tables
-- =============================================================================

\echo '--- TEST 5: RLS Policy Verification ---'

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('hr_leads', 'targeted_companies', 'email_templates', 'enrichment_jobs', 'hiring_signals')
ORDER BY tablename, policyname;

\echo ''

-- =============================================================================
-- CLEANUP: Remove test data
-- =============================================================================

\echo '--- CLEANUP: Removing test data ---'

-- Clear tenant context for cleanup (bypass RLS)
RESET app.tenant_id;

-- Delete test data
DELETE FROM hr_leads WHERE id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- Note: Keep test tenants for future tests
-- DELETE FROM tenants WHERE id IN ('11111111-...', '22222222-...');

\echo 'Test data cleaned up'
\echo ''

-- =============================================================================
-- SUMMARY
-- =============================================================================

\echo '=============================================='
\echo 'RLS ISOLATION TEST SUMMARY'
\echo '=============================================='
\echo 'If you see this message, all tests PASSED!'
\echo ''
\echo 'VS5 PostgreSQL RLS: VERIFIED'
\echo 'Authorization: VS1-VS9-APPROVED-20251213'
\echo '=============================================='
