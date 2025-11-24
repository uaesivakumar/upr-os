-- Multi-Tenant Isolation Migration
-- Sprint 65: Multi-Tenant Isolation Layer
--
-- This migration enables Row Level Security (RLS) on all tenant-isolated tables

-- ==================================================================
-- 1. Enable RLS on all tenant-isolated tables
-- ==================================================================

-- hr_leads
ALTER TABLE hr_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_hr_leads ON hr_leads;
CREATE POLICY tenant_isolation_hr_leads ON hr_leads
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- targeted_companies
ALTER TABLE targeted_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_targeted_companies ON targeted_companies;
CREATE POLICY tenant_isolation_targeted_companies ON targeted_companies
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- email_templates
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_email_templates ON email_templates;
CREATE POLICY tenant_isolation_email_templates ON email_templates
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- enrichment_jobs
ALTER TABLE enrichment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_enrichment_jobs ON enrichment_jobs;
CREATE POLICY tenant_isolation_enrichment_jobs ON enrichment_jobs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- hiring_signals
ALTER TABLE hiring_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_hiring_signals ON hiring_signals;
CREATE POLICY tenant_isolation_hiring_signals ON hiring_signals
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ==================================================================
-- 2. Add tenant_id to tables missing it
-- ==================================================================

-- Add tenant_id to email_patterns if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_patterns' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE email_patterns ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

-- Add tenant_id to news_items if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'news_items' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE news_items ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

-- Add tenant_id to templates if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'templates' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE templates ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

-- Add tenant_id to template_versions if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_versions' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE template_versions ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

-- Add tenant_id to enrich_audit if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'enrich_audit' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE enrich_audit ADD COLUMN tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  END IF;
END $$;

-- ==================================================================
-- 3. Create indexes for tenant_id columns
-- ==================================================================

CREATE INDEX IF NOT EXISTS idx_hr_leads_tenant_id ON hr_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_targeted_companies_tenant_id ON targeted_companies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant_id ON email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_tenant_id ON enrichment_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hiring_signals_tenant_id ON hiring_signals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_patterns_tenant_id ON email_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_news_items_tenant_id ON news_items(tenant_id);

-- ==================================================================
-- 4. Create tenant_violations audit log table
-- ==================================================================

CREATE TABLE IF NOT EXISTS tenant_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  violation_type VARCHAR(50) NOT NULL,
  path VARCHAR(255),
  method VARCHAR(10),
  attempted_tenant_id UUID,
  actual_tenant_id UUID,
  ip_address INET,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_violations_timestamp ON tenant_violations(timestamp);
CREATE INDEX IF NOT EXISTS idx_tenant_violations_type ON tenant_violations(violation_type);

-- ==================================================================
-- 5. Create function to set tenant context
-- ==================================================================

CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.tenant_id', tenant_uuid::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================================
-- 6. Create function to get current tenant
-- ==================================================================

CREATE OR REPLACE FUNCTION get_current_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.tenant_id', true)::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN '00000000-0000-0000-0000-000000000001'::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================================
-- 7. Grant necessary permissions
-- ==================================================================

-- Allow application user to set tenant context
-- GRANT EXECUTE ON FUNCTION set_tenant_context(UUID) TO app_user;
-- GRANT EXECUTE ON FUNCTION get_current_tenant() TO app_user;

-- ==================================================================
-- 8. Add comments for documentation
-- ==================================================================

COMMENT ON POLICY tenant_isolation_hr_leads ON hr_leads IS 'Sprint 65: Enforces tenant isolation on hr_leads table';
COMMENT ON POLICY tenant_isolation_targeted_companies ON targeted_companies IS 'Sprint 65: Enforces tenant isolation on targeted_companies table';
COMMENT ON TABLE tenant_violations IS 'Sprint 65: Audit log for tenant isolation violations';
COMMENT ON FUNCTION set_tenant_context(UUID) IS 'Sprint 65: Sets the current tenant context for RLS policies';
COMMENT ON FUNCTION get_current_tenant() IS 'Sprint 65: Returns the current tenant ID from session context';
