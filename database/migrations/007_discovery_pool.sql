-- ============================================================================
-- S121.1: Discovery Pool Tables
-- Intelligent Discovery Pool Architecture (Dec 2025)
--
-- OS-OWNED: Mechanical, tenant-level storage for discovered opportunities
-- SIVA never discovers - it only reasons over what OS provides
-- ============================================================================

-- Discovery Pool: Shared cache of discovered opportunities (tenant-level)
CREATE TABLE IF NOT EXISTS discovery_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,

  -- Company data
  company_name VARCHAR(255) NOT NULL,
  company_domain VARCHAR(255),
  industry VARCHAR(100),
  sector VARCHAR(50), -- private, government, semi-government
  estimated_size VARCHAR(50), -- startup, sme, mid-market, enterprise
  estimated_headcount INTEGER,
  location VARCHAR(255),
  location_city VARCHAR(100),
  location_country VARCHAR(100),

  -- Signal data (why this company was discovered)
  signal_type VARCHAR(100),
  signal_title TEXT,
  signal_description TEXT,
  signal_source VARCHAR(255),
  signal_source_url TEXT,
  signal_date TIMESTAMP,
  signal_confidence DECIMAL(3,2) DEFAULT 0.5,

  -- Discovery metadata
  discovered_at TIMESTAMP DEFAULT NOW(),
  discovered_by VARCHAR(50) DEFAULT 'crawler', -- 'crawler', 'user_search', 'apollo', 'serp'
  source_query TEXT,
  query_template_id UUID,

  -- Pre-computed scoring (EdgeCases already applied by OS)
  edge_case_type VARCHAR(50), -- 'enterprise', 'government', 'normal', 'free_zone'
  edge_case_multiplier DECIMAL(3,2) DEFAULT 1.0,
  base_score INTEGER DEFAULT 50,
  has_expansion_signals BOOLEAN DEFAULT FALSE,
  has_recent_signals BOOLEAN DEFAULT FALSE,

  -- Freshness management
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
  is_stale BOOLEAN DEFAULT FALSE,
  last_refreshed_at TIMESTAMP DEFAULT NOW(),
  refresh_count INTEGER DEFAULT 0,

  -- Deduplication
  company_hash VARCHAR(64) NOT NULL, -- SHA256 of normalized company name + domain

  -- Vertical/sub-vertical context
  vertical_id VARCHAR(100),
  sub_vertical_id VARCHAR(100),
  region_code VARCHAR(50),

  -- Raw data (for re-processing)
  raw_data JSONB,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint for deduplication within tenant
  CONSTRAINT unique_company_per_tenant UNIQUE (tenant_id, company_hash)
);

-- Lead Assignments: Per-user tracking to prevent collision
CREATE TABLE IF NOT EXISTS lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES discovery_pool(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,

  -- Assignment metadata
  assigned_at TIMESTAMP DEFAULT NOW(),
  assignment_type VARCHAR(50) DEFAULT 'auto', -- 'auto', 'claimed', 'territory', 'manual'

  -- Status tracking
  status VARCHAR(50) DEFAULT 'assigned', -- 'assigned', 'viewed', 'contacted', 'converted', 'released', 'expired'
  viewed_at TIMESTAMP,
  contacted_at TIMESTAMP,
  converted_at TIMESTAMP,
  released_at TIMESTAMP,
  release_reason VARCHAR(100), -- 'no_action', 'manual', 'territory_change', 'expired'

  -- Contact tracking
  contact_attempts INTEGER DEFAULT 0,
  last_contact_at TIMESTAMP,
  contact_channel VARCHAR(50), -- 'email', 'linkedin', 'phone', 'sms'

  -- Notes
  user_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Prevent same lead going to multiple active users
  CONSTRAINT unique_active_assignment UNIQUE (pool_id, tenant_id, user_id)
);

-- User Territories: Geographic distribution
CREATE TABLE IF NOT EXISTS user_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,

  -- Territory definition
  territory_type VARCHAR(50) NOT NULL, -- 'country', 'city', 'district', 'free_zone'
  territory_value VARCHAR(100) NOT NULL, -- 'UAE', 'Dubai', 'Dubai South', 'DIFC', 'JAFZA'

  -- Hierarchy
  parent_territory_id UUID REFERENCES user_territories(id),

  -- Priority (user can have multiple territories)
  priority INTEGER DEFAULT 1,

  -- Active/Inactive
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint
  CONSTRAINT unique_user_territory UNIQUE (tenant_id, user_id, territory_type, territory_value)
);

-- Discovery Crawl Logs: Track crawler runs
CREATE TABLE IF NOT EXISTS discovery_crawl_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,

  -- Crawl metadata
  crawl_type VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'manual', 'triggered'
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  -- Configuration used
  vertical_id VARCHAR(100),
  sub_vertical_id VARCHAR(100),
  region_code VARCHAR(50),
  query_templates_used INTEGER DEFAULT 0,

  -- Results
  queries_executed INTEGER DEFAULT 0,
  signals_extracted INTEGER DEFAULT 0,
  companies_discovered INTEGER DEFAULT 0,
  companies_new INTEGER DEFAULT 0,
  companies_updated INTEGER DEFAULT 0,
  companies_deduplicated INTEGER DEFAULT 0,

  -- Costs
  serp_calls INTEGER DEFAULT 0,
  apollo_calls INTEGER DEFAULT 0,
  estimated_cost_usd DECIMAL(10,4) DEFAULT 0,

  -- Errors
  errors_count INTEGER DEFAULT 0,
  error_details JSONB,

  -- Status
  status VARCHAR(50) DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_discovery_pool_tenant ON discovery_pool(tenant_id);
CREATE INDEX IF NOT EXISTS idx_discovery_pool_freshness ON discovery_pool(tenant_id, is_stale, expires_at);
CREATE INDEX IF NOT EXISTS idx_discovery_pool_vertical ON discovery_pool(tenant_id, vertical_id, sub_vertical_id);
CREATE INDEX IF NOT EXISTS idx_discovery_pool_location ON discovery_pool(tenant_id, location_city, location_country);
CREATE INDEX IF NOT EXISTS idx_discovery_pool_score ON discovery_pool(tenant_id, base_score DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_pool_discovered ON discovery_pool(tenant_id, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_user ON lead_assignments(tenant_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_pool ON lead_assignments(pool_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_status ON lead_assignments(status, assigned_at);

CREATE INDEX IF NOT EXISTS idx_user_territories_user ON user_territories(tenant_id, user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_territories_value ON user_territories(tenant_id, territory_type, territory_value);

CREATE INDEX IF NOT EXISTS idx_crawl_logs_tenant ON discovery_crawl_logs(tenant_id, started_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_discovery_pool_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discovery_pool_updated
  BEFORE UPDATE ON discovery_pool
  FOR EACH ROW
  EXECUTE FUNCTION update_discovery_pool_timestamp();

CREATE TRIGGER lead_assignments_updated
  BEFORE UPDATE ON lead_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_discovery_pool_timestamp();

CREATE TRIGGER user_territories_updated
  BEFORE UPDATE ON user_territories
  FOR EACH ROW
  EXECUTE FUNCTION update_discovery_pool_timestamp();

-- Function to auto-expire stale leads
CREATE OR REPLACE FUNCTION mark_stale_discovery_pool()
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE discovery_pool
  SET is_stale = TRUE
  WHERE expires_at < NOW()
    AND is_stale = FALSE;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-release abandoned assignments (7 days no action)
CREATE OR REPLACE FUNCTION release_abandoned_assignments()
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE lead_assignments
  SET
    status = 'released',
    released_at = NOW(),
    release_reason = 'no_action'
  WHERE status = 'assigned'
    AND viewed_at IS NULL
    AND assigned_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE discovery_pool IS 'OS-owned shared cache of discovered opportunities. SIVA reads from here, never writes directly.';
COMMENT ON TABLE lead_assignments IS 'Prevents 25 salespeople from chasing same 6 leads. OS manages collision prevention.';
COMMENT ON TABLE user_territories IS 'Geographic distribution - Dubai South rep sees different leads than DIFC rep.';
COMMENT ON TABLE discovery_crawl_logs IS 'Audit trail for background crawler runs.';
