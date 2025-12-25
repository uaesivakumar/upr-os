/**
 * S263: ENTERPRISE & USER MODEL - v2
 * Sprint: S263
 * Authorization: Enterprise Isolation + User Identity
 *
 * ARCHITECTURE CLARIFICATION:
 * - SaaS has `users` table (auth identity: email, password, MFA)
 * - SaaS has `tenants` table (billing entity: Stripe, plans)
 * - OS has `enterprises` table (isolation boundary: pure, no billing)
 * - OS has `os_user_identities` table (execution identity: pure, no auth)
 *
 * These models COEXIST:
 * - SaaS auth links to OS identity via os_user_id
 * - Enterprise is the AUTHORITY for isolation
 * - Tenant is the SaaS billing wrapper
 *
 * NON-NEGOTIABLE PRINCIPLES:
 * - Enterprise is an ISOLATION BOUNDARY, not a customer record
 * - OS User Identity is an EXECUTION IDENTITY, not a CRM contact
 * - Workspace is the UNIT OF BEHAVIOR
 * - No implicit inheritance
 */

-- ============================================================
-- CHECK AND CREATE ENUMS (idempotent)
-- ============================================================

DO $$
BEGIN
  -- Only create if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enterprise_type') THEN
    CREATE TYPE enterprise_type AS ENUM ('REAL', 'DEMO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enterprise_status') THEN
    CREATE TYPE enterprise_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ENTERPRISE_ADMIN', 'USER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_mode') THEN
    CREATE TYPE user_mode AS ENUM ('REAL', 'DEMO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');
  END IF;
END $$;

-- ============================================================
-- S263-F2: OS_USER_IDENTITIES TABLE (EXECUTION IDENTITY)
-- ============================================================

-- This is the OS execution identity, separate from SaaS auth
CREATE TABLE IF NOT EXISTS os_user_identities (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id UUID NOT NULL REFERENCES enterprises(enterprise_id),
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
  sub_vertical_id UUID NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  mode user_mode NOT NULL DEFAULT 'REAL',
  status user_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Link to SaaS auth user (optional, for joined queries)
  saas_user_id UUID,

  -- NO email/password logic here
  -- NO auth provider coupling
  -- Identity ≠ authentication
  -- SaaS auth is handled by the separate 'users' table

  -- HARD CONSTRAINT: Each user can only be in one workspace
  CONSTRAINT os_users_unique_user_workspace UNIQUE (user_id)
);

-- Indexes for OS user lookups
CREATE INDEX IF NOT EXISTS idx_os_users_enterprise ON os_user_identities(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_os_users_workspace ON os_user_identities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_os_users_sub_vertical ON os_user_identities(sub_vertical_id);
CREATE INDEX IF NOT EXISTS idx_os_users_role ON os_user_identities(role);
CREATE INDEX IF NOT EXISTS idx_os_users_status ON os_user_identities(status);
CREATE INDEX IF NOT EXISTS idx_os_users_mode ON os_user_identities(mode);
CREATE INDEX IF NOT EXISTS idx_os_users_saas_user ON os_user_identities(saas_user_id);

-- Comments
COMMENT ON TABLE os_user_identities IS 'OS Execution identity. One user → one enterprise (FOREVER). One user → one workspace. Separate from SaaS auth.';
COMMENT ON COLUMN os_user_identities.enterprise_id IS 'IMMUTABLE after creation. User cannot change enterprise.';
COMMENT ON COLUMN os_user_identities.workspace_id IS 'IMMUTABLE after creation. User cannot change workspace.';
COMMENT ON COLUMN os_user_identities.sub_vertical_id IS 'Can only change via service-level approval.';
COMMENT ON COLUMN os_user_identities.saas_user_id IS 'Optional link to SaaS auth users table.';
COMMENT ON COLUMN os_user_identities.mode IS 'REAL or DEMO - explicit and queryable.';

-- ============================================================
-- CROSS-ENTERPRISE REASSIGNMENT PREVENTION (TRIGGER)
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_os_user_reassignment()
RETURNS TRIGGER AS $$
BEGIN
  -- HARD: User cannot change enterprise
  IF OLD.enterprise_id IS DISTINCT FROM NEW.enterprise_id THEN
    RAISE EXCEPTION 'Cross-enterprise reassignment is forbidden. User % cannot change enterprise from % to %.',
      OLD.user_id, OLD.enterprise_id, NEW.enterprise_id;
  END IF;

  -- HARD: User cannot change workspace
  IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'Workspace reassignment is forbidden. User % cannot change workspace from % to %.',
      OLD.user_id, OLD.workspace_id, NEW.workspace_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_os_user_no_reassignment ON os_user_identities;
CREATE TRIGGER trigger_os_user_no_reassignment
  BEFORE UPDATE ON os_user_identities
  FOR EACH ROW
  EXECUTE FUNCTION prevent_os_user_reassignment();

-- ============================================================
-- USER-ENTERPRISE CONSISTENCY CHECK (TRIGGER)
-- ============================================================

CREATE OR REPLACE FUNCTION check_os_user_workspace_enterprise()
RETURNS TRIGGER AS $$
DECLARE
  workspace_enterprise UUID;
BEGIN
  SELECT enterprise_id INTO workspace_enterprise
  FROM workspaces
  WHERE workspace_id = NEW.workspace_id;

  IF workspace_enterprise IS NULL THEN
    RAISE EXCEPTION 'Workspace % does not exist.', NEW.workspace_id;
  END IF;

  IF workspace_enterprise != NEW.enterprise_id THEN
    RAISE EXCEPTION 'User enterprise (%) does not match workspace enterprise (%). Cross-enterprise binding forbidden.',
      NEW.enterprise_id, workspace_enterprise;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_os_user_workspace_enterprise_check ON os_user_identities;
CREATE TRIGGER trigger_os_user_workspace_enterprise_check
  BEFORE INSERT OR UPDATE ON os_user_identities
  FOR EACH ROW
  EXECUTE FUNCTION check_os_user_workspace_enterprise();

-- ============================================================
-- ROLE ESCALATION PREVENTION (TRIGGER)
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_os_user_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Block direct escalation from USER to SUPER_ADMIN
  IF OLD.role = 'USER' AND NEW.role = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Silent role escalation forbidden. User % cannot escalate from USER to SUPER_ADMIN directly.',
      OLD.user_id;
  END IF;

  -- Block direct escalation from ENTERPRISE_ADMIN to SUPER_ADMIN
  IF OLD.role = 'ENTERPRISE_ADMIN' AND NEW.role = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Silent role escalation forbidden. User % cannot escalate from ENTERPRISE_ADMIN to SUPER_ADMIN directly.',
      OLD.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_os_user_no_role_escalation ON os_user_identities;
CREATE TRIGGER trigger_os_user_no_role_escalation
  BEFORE UPDATE ON os_user_identities
  FOR EACH ROW
  EXECUTE FUNCTION prevent_os_user_role_escalation();

-- ============================================================
-- VALIDATION QUERIES
-- ============================================================

-- A) Confirm tables:
--    \d+ enterprises
--    \d+ workspaces
--    \d+ os_user_identities

-- B) Test cross-enterprise reassignment (MUST FAIL):
--    UPDATE os_user_identities SET enterprise_id = 'other-uuid' WHERE user_id = 'test-uuid';
