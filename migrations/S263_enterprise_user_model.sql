/**
 * S263: ENTERPRISE & USER MODEL
 * Sprint: S263
 * Authorization: Enterprise Isolation + User Identity
 *
 * NON-NEGOTIABLE PRINCIPLES:
 * - Enterprise is an ISOLATION BOUNDARY, not a customer record
 * - User is an EXECUTION IDENTITY, not a CRM contact
 * - Workspace is the UNIT OF BEHAVIOR
 * - Constraints > flexibility
 * - No implicit inheritance
 * - No convenience shortcuts
 *
 * HARD CONSTRAINTS (ENFORCED AT DB LEVEL):
 * - One user → one enterprise (FOREVER)
 * - One user → one workspace
 * - One user → one sub-vertical
 * - No cross-enterprise reassignment
 * - Workspace never moves across enterprises
 */

-- ============================================================
-- ENUMS
-- ============================================================

-- Enterprise type: REAL (production) or DEMO (trial/sandbox)
CREATE TYPE enterprise_type AS ENUM ('REAL', 'DEMO');

-- Enterprise status: Active, Suspended, or Deleted
CREATE TYPE enterprise_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- User role: Super Admin, Enterprise Admin, or standard User
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ENTERPRISE_ADMIN', 'USER');

-- User mode: mirrors enterprise type for explicit querying
CREATE TYPE user_mode AS ENUM ('REAL', 'DEMO');

-- User status: Active, Suspended, or Expired (for demo)
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');

-- ============================================================
-- S263-F1: ENTERPRISES TABLE (AUTHORITATIVE)
-- ============================================================

CREATE TABLE IF NOT EXISTS enterprises (
  enterprise_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type enterprise_type NOT NULL DEFAULT 'REAL',
  region TEXT NOT NULL,
  status enterprise_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NO billing fields
  -- NO plan logic
  -- NO usage counters
  -- NO owner_user_id (ownership is role-based, not relational)

  -- Name must be non-empty
  CONSTRAINT enterprises_name_not_empty CHECK (char_length(name) > 0),
  -- Region must be non-empty
  CONSTRAINT enterprises_region_not_empty CHECK (char_length(region) > 0)
);

-- Indexes for enterprise lookups
CREATE INDEX idx_enterprises_status ON enterprises(status);
CREATE INDEX idx_enterprises_type ON enterprises(type);
CREATE INDEX idx_enterprises_region ON enterprises(region);

-- Comments
COMMENT ON TABLE enterprises IS 'Enterprise isolation boundary. Controlled by Super Admin only. No billing, no plan logic, no usage counters.';
COMMENT ON COLUMN enterprises.type IS 'REAL = production, DEMO = trial/sandbox';
COMMENT ON COLUMN enterprises.status IS 'Lifecycle controlled by Super Admin only';

-- ============================================================
-- S263-F3: WORKSPACES TABLE (EXPLICIT BINDING)
-- ============================================================

-- Workspaces must exist before users (FK dependency)
CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id UUID NOT NULL REFERENCES enterprises(enterprise_id),
  name TEXT NOT NULL,
  sub_vertical_id UUID NOT NULL,
  status enterprise_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Workspace name must be non-empty
  CONSTRAINT workspaces_name_not_empty CHECK (char_length(name) > 0)
);

-- Indexes for workspace lookups
CREATE INDEX idx_workspaces_enterprise ON workspaces(enterprise_id);
CREATE INDEX idx_workspaces_sub_vertical ON workspaces(sub_vertical_id);
CREATE INDEX idx_workspaces_status ON workspaces(status);

-- Comments
COMMENT ON TABLE workspaces IS 'Unit of behavior. Anchor for BTE, NBA, State, Events. Never moves across enterprises.';
COMMENT ON COLUMN workspaces.enterprise_id IS 'IMMUTABLE after creation. Workspace never changes enterprise.';

-- ============================================================
-- WORKSPACE REASSIGNMENT PREVENTION (TRIGGER)
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_workspace_reassignment()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.enterprise_id IS DISTINCT FROM NEW.enterprise_id THEN
    RAISE EXCEPTION 'Workspace reassignment is forbidden. Workspace % cannot change enterprise from % to %.',
      OLD.workspace_id, OLD.enterprise_id, NEW.enterprise_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_workspace_no_reassignment
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION prevent_workspace_reassignment();

-- ============================================================
-- S263-F2: USERS TABLE (HARD CONSTRAINTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id UUID NOT NULL REFERENCES enterprises(enterprise_id),
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
  sub_vertical_id UUID NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  mode user_mode NOT NULL DEFAULT 'REAL',
  status user_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NO email/password logic here
  -- NO auth provider coupling
  -- Identity ≠ authentication

  -- HARD CONSTRAINT: One user per workspace
  -- (A user cannot be in multiple workspaces)
  CONSTRAINT users_unique_workspace UNIQUE (user_id, workspace_id)
);

-- Indexes for user lookups
CREATE INDEX idx_users_enterprise ON users(enterprise_id);
CREATE INDEX idx_users_workspace ON users(workspace_id);
CREATE INDEX idx_users_sub_vertical ON users(sub_vertical_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_mode ON users(mode);

-- Comments
COMMENT ON TABLE users IS 'Execution identity. One user → one enterprise (FOREVER). One user → one workspace. No cross-enterprise reassignment.';
COMMENT ON COLUMN users.enterprise_id IS 'IMMUTABLE after creation. User cannot change enterprise.';
COMMENT ON COLUMN users.workspace_id IS 'IMMUTABLE after creation. User cannot change workspace.';
COMMENT ON COLUMN users.sub_vertical_id IS 'Can only change via service-level approval (not direct UPDATE).';
COMMENT ON COLUMN users.role IS 'Role within enterprise. Role changes require service approval.';
COMMENT ON COLUMN users.mode IS 'REAL or DEMO - explicit and queryable.';

-- ============================================================
-- CROSS-ENTERPRISE REASSIGNMENT PREVENTION (TRIGGER)
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_user_reassignment()
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

CREATE TRIGGER trigger_user_no_reassignment
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_user_reassignment();

-- ============================================================
-- USER-ENTERPRISE CONSISTENCY CHECK (TRIGGER)
-- ============================================================

-- Ensure user's workspace belongs to user's enterprise
CREATE OR REPLACE FUNCTION check_user_workspace_enterprise()
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

CREATE TRIGGER trigger_user_workspace_enterprise_check
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION check_user_workspace_enterprise();

-- ============================================================
-- ROLE ESCALATION PREVENTION (TRIGGER)
-- ============================================================

-- No silent role escalation: USER cannot become SUPER_ADMIN directly
CREATE OR REPLACE FUNCTION prevent_silent_role_escalation()
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

CREATE TRIGGER trigger_user_no_role_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_silent_role_escalation();

-- ============================================================
-- VALIDATION QUERIES (Run after migration)
-- ============================================================

-- A) Confirm tables exist:
--    \d+ enterprises
--    \d+ workspaces
--    \d+ users

-- B) Confirm constraints:
--    SELECT conname, contype, conrelid::regclass
--    FROM pg_constraint
--    WHERE conrelid IN ('enterprises'::regclass, 'workspaces'::regclass, 'users'::regclass);

-- C) Confirm triggers:
--    SELECT tgname, tgrelid::regclass
--    FROM pg_trigger
--    WHERE tgrelid IN ('workspaces'::regclass, 'users'::regclass);

-- D) Test cross-enterprise reassignment (MUST FAIL):
--    UPDATE users SET enterprise_id = 'other-uuid' WHERE user_id = 'test-uuid';
--    Expected: ERROR: Cross-enterprise reassignment is forbidden.
