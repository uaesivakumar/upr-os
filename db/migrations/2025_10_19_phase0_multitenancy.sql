-- Phase 0: Multi-tenancy Foundation
-- Date: October 19, 2025
-- Purpose: Add tenant isolation for targeted_companies, kb_companies, people, and other core tables

BEGIN;

-- Multi-tenancy foundation
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'solo', -- 'solo', 'team', 'enterprise'
  max_companies INTEGER DEFAULT 1000,
  max_enrichments_per_month INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add tenant_id to existing tables
ALTER TABLE targeted_companies ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE kb_companies ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE people ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE leads ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE hr_leads ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- Create indexes for tenant-scoped queries
CREATE INDEX idx_targeted_companies_tenant ON targeted_companies(tenant_id);
CREATE INDEX idx_kb_companies_tenant ON kb_companies(tenant_id);
CREATE INDEX idx_people_tenant ON people(tenant_id);
CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_hr_leads_tenant ON hr_leads(tenant_id);

-- Create your own tenant (first user)
INSERT INTO tenants (name, plan, max_companies, max_enrichments_per_month)
VALUES ('Your Name - Solo', 'solo', 10000, 5000)
RETURNING id;

COMMIT;

-- Note: Save the returned tenant ID - you'll use this as your tenant_id for all operations
