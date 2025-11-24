-- Entity Abstraction Layer Migration
-- Sprint 68: Entity Abstraction Layer
--
-- Unified entity model for Company, Individual, and Hybrid entities

-- ==================================================================
-- 1. Core Entities Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Entity type: company, individual, hybrid
  type VARCHAR(20) NOT NULL DEFAULT 'company',
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Common fields
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  source VARCHAR(50) DEFAULT 'manual',
  source_id VARCHAR(255),

  -- Company fields
  domain VARCHAR(255),
  website VARCHAR(500),
  industry VARCHAR(100),
  employee_count INTEGER,
  revenue BIGINT,
  locations JSONB DEFAULT '[]',
  linkedin_url VARCHAR(500),
  description TEXT,
  technologies JSONB DEFAULT '[]',
  funding_stage VARCHAR(50),
  funding_total BIGINT,
  founded_year INTEGER,

  -- UAE-specific company fields
  is_uae_based BOOLEAN DEFAULT false,
  emirate VARCHAR(50),
  free_zone VARCHAR(100),
  license_number VARCHAR(100),

  -- Individual fields
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  title VARCHAR(200),
  department VARCHAR(100),
  seniority VARCHAR(50),
  location VARCHAR(255),
  country VARCHAR(100),
  city VARCHAR(100),
  skills JSONB DEFAULT '[]',
  experience JSONB DEFAULT '[]',
  education JSONB DEFAULT '[]',

  -- Hybrid fields (for company+contact pairs)
  company_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  relationship VARCHAR(50) DEFAULT 'primary',
  is_primary_contact BOOLEAN DEFAULT false,

  -- Scoring
  scores JSONB DEFAULT '{}',
  tier VARCHAR(20),
  rank INTEGER,

  -- Signals
  signal_count INTEGER DEFAULT 0,

  -- Enrichment
  enrichment_status VARCHAR(20) DEFAULT 'pending',
  enrichment_data JSONB DEFAULT '{}',
  last_enriched_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================================
-- 2. Indexes
-- ==================================================================

CREATE INDEX IF NOT EXISTS idx_entities_tenant ON entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);
CREATE INDEX IF NOT EXISTS idx_entities_domain ON entities(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_email ON entities(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_industry ON entities(industry) WHERE industry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_tier ON entities(tier) WHERE tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_rank ON entities(rank) WHERE rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_enrichment ON entities(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_entities_company_id ON entities(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_contact_id ON entities(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_name_search ON entities USING gin(to_tsvector('english', name));

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_entities_tenant_type ON entities(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_entities_tenant_status ON entities(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_entities_tenant_tier ON entities(tenant_id, tier);

-- ==================================================================
-- 3. Entity Signals Junction Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS entity_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL,
  signal_type VARCHAR(50) NOT NULL,
  signal_strength DECIMAL(3,2) DEFAULT 0.50,
  signal_data JSONB DEFAULT '{}',
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, signal_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_signals_entity ON entity_signals(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_signals_type ON entity_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_entity_signals_discovered ON entity_signals(discovered_at);

-- ==================================================================
-- 4. Entity Relationships Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,
  strength DECIMAL(3,2) DEFAULT 0.50,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_entity_id, target_entity_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_entity_rel_source ON entity_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_rel_target ON entity_relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_rel_type ON entity_relationships(relationship_type);

-- ==================================================================
-- 5. Entity History Table (Audit Trail)
-- ==================================================================

CREATE TABLE IF NOT EXISTS entity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  operation VARCHAR(20) NOT NULL, -- create, update, delete, score, enrich
  field_name VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  changed_by VARCHAR(100),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_history_entity ON entity_history(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_history_tenant ON entity_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entity_history_operation ON entity_history(operation);
CREATE INDEX IF NOT EXISTS idx_entity_history_changed_at ON entity_history(changed_at);

-- ==================================================================
-- 6. Entity Tags Table
-- ==================================================================

CREATE TABLE IF NOT EXISTS entity_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,
  tag_type VARCHAR(50) DEFAULT 'user', -- user, system, auto
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag);
CREATE INDEX IF NOT EXISTS idx_entity_tags_tenant ON entity_tags(tenant_id);

-- ==================================================================
-- 7. Helper Functions
-- ==================================================================

-- Get entity with all related data
CREATE OR REPLACE FUNCTION get_entity_full(p_entity_id UUID, p_tenant_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'entity', row_to_json(e.*),
    'signals', COALESCE((
      SELECT json_agg(row_to_json(es.*))
      FROM entity_signals es
      WHERE es.entity_id = e.id
    ), '[]'::json),
    'tags', COALESCE((
      SELECT json_agg(et.tag)
      FROM entity_tags et
      WHERE et.entity_id = e.id
    ), '[]'::json),
    'relationships', COALESCE((
      SELECT json_agg(json_build_object(
        'type', er.relationship_type,
        'target_id', er.target_entity_id,
        'strength', er.strength
      ))
      FROM entity_relationships er
      WHERE er.source_entity_id = e.id
    ), '[]'::json)
  ) INTO v_result
  FROM entities e
  WHERE e.id = p_entity_id AND e.tenant_id = p_tenant_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update entity signal count
CREATE OR REPLACE FUNCTION update_entity_signal_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE entities SET signal_count = signal_count + 1 WHERE id = NEW.entity_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE entities SET signal_count = signal_count - 1 WHERE id = OLD.entity_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entity_signal_count
AFTER INSERT OR DELETE ON entity_signals
FOR EACH ROW EXECUTE FUNCTION update_entity_signal_count();

-- ==================================================================
-- 8. Row Level Security
-- ==================================================================

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_tags ENABLE ROW LEVEL SECURITY;

-- Entities RLS
CREATE POLICY entities_tenant_isolation ON entities
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Entity signals RLS
CREATE POLICY entity_signals_tenant_isolation ON entity_signals
  USING (entity_id IN (
    SELECT id FROM entities WHERE tenant_id = current_setting('app.tenant_id', true)::uuid
  ));

-- Entity relationships RLS
CREATE POLICY entity_relationships_tenant_isolation ON entity_relationships
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Entity history RLS
CREATE POLICY entity_history_tenant_isolation ON entity_history
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Entity tags RLS
CREATE POLICY entity_tags_tenant_isolation ON entity_tags
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ==================================================================
-- 9. Comments
-- ==================================================================

COMMENT ON TABLE entities IS 'Sprint 68: Unified entity model for all entity types';
COMMENT ON TABLE entity_signals IS 'Sprint 68: Entity-signal associations';
COMMENT ON TABLE entity_relationships IS 'Sprint 68: Entity-to-entity relationships';
COMMENT ON TABLE entity_history IS 'Sprint 68: Entity audit trail';
COMMENT ON TABLE entity_tags IS 'Sprint 68: Entity tagging system';

COMMENT ON COLUMN entities.type IS 'Entity type: company, individual, hybrid';
COMMENT ON COLUMN entities.status IS 'Entity status: active, enriching, disqualified, archived';
COMMENT ON COLUMN entities.enrichment_status IS 'Enrichment status: pending, partial, complete, failed';
