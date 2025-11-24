-- Phase 0: Entity Resolution Tables
-- Date: October 19, 2025
-- Purpose: Create canonical entity tables for company and person deduplication

BEGIN;

-- Create entities_company (canonical company records)
CREATE TABLE entities_company (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  legal_name TEXT NOT NULL,
  domain_norm TEXT, -- Normalized domain (lowercase, no www)
  group_id UUID, -- Parent company if part of group
  primary_industry TEXT,
  employee_count_bucket TEXT,
  uae_presence_confidence NUMERIC(3,2),
  qscore INTEGER DEFAULT 0,
  country_code TEXT DEFAULT 'AE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_company_domain ON entities_company(domain_norm);
CREATE INDEX idx_entities_company_tenant ON entities_company(tenant_id);
CREATE INDEX idx_entities_company_qscore ON entities_company(qscore);
CREATE INDEX idx_entities_company_industry ON entities_company(primary_industry);

-- Create entities_person (canonical people records)
CREATE TABLE entities_person (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name_norm TEXT NOT NULL,
  current_company_id UUID REFERENCES entities_company(id),
  linkedin_url TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_person_company ON entities_person(current_company_id);
CREATE INDEX idx_entities_person_tenant ON entities_person(tenant_id);
CREATE INDEX idx_entities_person_linkedin ON entities_person(linkedin_url);
CREATE INDEX idx_entities_person_name ON entities_person(name_norm);

COMMIT;

-- Notes:
-- - domain_norm should be lowercase with no 'www' prefix for deduplication
-- - group_id allows hierarchical company relationships (subsidiaries, etc.)
-- - uae_presence_confidence: 0.00 to 1.00 score for UAE market presence
-- - qscore: quality score from targeted_companies (0-100)
-- - name_norm should be normalized (lowercase, no middle initials variations)
