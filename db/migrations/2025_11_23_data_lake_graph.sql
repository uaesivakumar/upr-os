-- ============================================================================
-- Sprint 74: Data Lake v0 + UPR Graph Schema
-- Event emission, data lake storage, and UPR Graph for entities, signals, relationships
-- ============================================================================

-- ============================================================================
-- 1. DATA LAKE - EVENT STORE
-- ============================================================================

-- Main events table (partitioned by date for performance)
CREATE TABLE IF NOT EXISTS data_lake_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    entity_type VARCHAR(50),
    tenant_id UUID NOT NULL,
    region_id UUID,
    vertical_id VARCHAR(50),
    pipeline_id UUID,
    step_name VARCHAR(50),
    payload JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    partition_key DATE GENERATED ALWAYS AS (DATE(created_at)) STORED
);

-- Event types lookup
CREATE TABLE IF NOT EXISTS data_lake_event_types (
    event_type VARCHAR(100) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    schema_version VARCHAR(20) DEFAULT '1.0',
    payload_schema JSONB,
    retention_days INTEGER DEFAULT 90,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert standard event types
INSERT INTO data_lake_event_types (event_type, category, description) VALUES
    ('lead_discovered', 'pipeline', 'Lead discovered through discovery sources'),
    ('lead_enriched', 'pipeline', 'Lead enriched with additional data'),
    ('lead_scored', 'pipeline', 'Lead scored with Q/T/L/E scores'),
    ('lead_ranked', 'pipeline', 'Lead ranked against others'),
    ('outreach_generated', 'pipeline', 'Outreach content generated'),
    ('outreach_sent', 'engagement', 'Outreach message sent'),
    ('outreach_opened', 'engagement', 'Outreach message opened'),
    ('outreach_clicked', 'engagement', 'Outreach link clicked'),
    ('outreach_replied', 'engagement', 'Reply received to outreach'),
    ('pipeline_started', 'system', 'Pipeline execution started'),
    ('pipeline_completed', 'system', 'Pipeline execution completed'),
    ('pipeline_failed', 'system', 'Pipeline execution failed'),
    ('score_changed', 'analytics', 'Lead score changed'),
    ('tier_changed', 'analytics', 'Lead tier changed'),
    ('signal_detected', 'intelligence', 'New signal detected'),
    ('relationship_discovered', 'intelligence', 'New relationship discovered')
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================================
-- 2. UPR GRAPH - ENTITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS graph_entities (
    entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('company', 'individual', 'hybrid')),
    entity_name VARCHAR(500) NOT NULL,
    tenant_id UUID NOT NULL,
    region_id UUID,
    properties JSONB DEFAULT '{}',
    scores JSONB DEFAULT '{}',
    tags VARCHAR(100)[],
    source VARCHAR(100),
    confidence DECIMAL(4,3) DEFAULT 1.000,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_enriched_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, external_id)
);

-- ============================================================================
-- 3. UPR GRAPH - SIGNALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS graph_signals (
    signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type VARCHAR(100) NOT NULL,
    source_entity_id UUID NOT NULL REFERENCES graph_entities(entity_id) ON DELETE CASCADE,
    target_entity_id UUID REFERENCES graph_entities(entity_id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL,
    strength DECIMAL(4,3) DEFAULT 1.000 CHECK (strength BETWEEN 0 AND 1),
    decay_rate DECIMAL(4,3) DEFAULT 0.100 CHECK (decay_rate BETWEEN 0 AND 1),
    signal_data JSONB DEFAULT '{}',
    source VARCHAR(100),
    confidence DECIMAL(4,3) DEFAULT 1.000,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Signal types lookup
CREATE TABLE IF NOT EXISTS graph_signal_types (
    signal_type VARCHAR(100) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    default_strength DECIMAL(4,3) DEFAULT 0.500,
    default_decay_rate DECIMAL(4,3) DEFAULT 0.100,
    ttl_days INTEGER DEFAULT 30,
    active BOOLEAN DEFAULT true
);

-- Insert standard signal types
INSERT INTO graph_signal_types (signal_type, category, description, default_strength, ttl_days) VALUES
    ('hiring_signal', 'growth', 'Company is hiring in relevant roles', 0.7, 60),
    ('funding_signal', 'growth', 'Company received funding', 0.8, 90),
    ('expansion_signal', 'growth', 'Company expanding to new markets', 0.75, 60),
    ('tech_adoption', 'technology', 'Adopted new technology stack', 0.6, 45),
    ('leadership_change', 'organization', 'C-level or leadership change', 0.7, 30),
    ('news_mention', 'media', 'Company mentioned in news', 0.5, 14),
    ('job_change', 'career', 'Individual changed jobs', 0.8, 30),
    ('promotion', 'career', 'Individual got promoted', 0.7, 30),
    ('relocation', 'life_event', 'Individual relocated', 0.6, 60),
    ('engagement', 'interaction', 'Engaged with content/outreach', 0.9, 7)
ON CONFLICT (signal_type) DO NOTHING;

-- ============================================================================
-- 4. UPR GRAPH - RELATIONSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS graph_relationships (
    rel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_entity_id UUID NOT NULL REFERENCES graph_entities(entity_id) ON DELETE CASCADE,
    to_entity_id UUID NOT NULL REFERENCES graph_entities(entity_id) ON DELETE CASCADE,
    rel_type VARCHAR(100) NOT NULL,
    tenant_id UUID NOT NULL,
    strength DECIMAL(4,3) DEFAULT 1.000 CHECK (strength BETWEEN 0 AND 1),
    bidirectional BOOLEAN DEFAULT false,
    properties JSONB DEFAULT '{}',
    source VARCHAR(100),
    confidence DECIMAL(4,3) DEFAULT 1.000,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_entity_id, to_entity_id, rel_type, tenant_id)
);

-- Relationship types lookup
CREATE TABLE IF NOT EXISTS graph_relationship_types (
    rel_type VARCHAR(100) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    inverse_type VARCHAR(100),
    is_hierarchical BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true
);

-- Insert standard relationship types
INSERT INTO graph_relationship_types (rel_type, category, description, inverse_type, is_hierarchical) VALUES
    ('works_at', 'employment', 'Person works at company', 'employs', true),
    ('employs', 'employment', 'Company employs person', 'works_at', true),
    ('reports_to', 'hierarchy', 'Person reports to another person', 'manages', true),
    ('manages', 'hierarchy', 'Person manages another person', 'reports_to', true),
    ('connected_to', 'network', 'Professional connection', 'connected_to', false),
    ('partner_of', 'business', 'Business partnership', 'partner_of', false),
    ('customer_of', 'business', 'Customer relationship', 'vendor_for', true),
    ('vendor_for', 'business', 'Vendor relationship', 'customer_of', true),
    ('invested_in', 'investment', 'Investment relationship', 'funded_by', true),
    ('funded_by', 'investment', 'Received funding from', 'invested_in', true),
    ('competitor_of', 'market', 'Competitor relationship', 'competitor_of', false),
    ('subsidiary_of', 'corporate', 'Subsidiary relationship', 'parent_of', true),
    ('parent_of', 'corporate', 'Parent company relationship', 'subsidiary_of', true)
ON CONFLICT (rel_type) DO NOTHING;

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

-- Data Lake Events
CREATE INDEX IF NOT EXISTS idx_events_type ON data_lake_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_entity ON data_lake_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON data_lake_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_pipeline ON data_lake_events(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON data_lake_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_partition ON data_lake_events(partition_key);
CREATE INDEX IF NOT EXISTS idx_events_tenant_type ON data_lake_events(tenant_id, event_type);

-- Graph Entities
CREATE INDEX IF NOT EXISTS idx_graph_entities_tenant ON graph_entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_type ON graph_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_graph_entities_region ON graph_entities(region_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_external ON graph_entities(external_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_active ON graph_entities(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_graph_entities_tags ON graph_entities USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_graph_entities_properties ON graph_entities USING GIN(properties jsonb_path_ops);

-- Graph Signals
CREATE INDEX IF NOT EXISTS idx_graph_signals_entity ON graph_signals(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_signals_target ON graph_signals(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_signals_tenant ON graph_signals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_graph_signals_type ON graph_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_graph_signals_active ON graph_signals(is_active, expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_graph_signals_captured ON graph_signals(captured_at);

-- Graph Relationships
CREATE INDEX IF NOT EXISTS idx_graph_rels_from ON graph_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_rels_to ON graph_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_rels_tenant ON graph_relationships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_graph_rels_type ON graph_relationships(rel_type);
CREATE INDEX IF NOT EXISTS idx_graph_rels_active ON graph_relationships(is_active) WHERE is_active = true;

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- Update timestamp trigger for graph tables
DROP TRIGGER IF EXISTS update_graph_entities_timestamp ON graph_entities;
CREATE TRIGGER update_graph_entities_timestamp
    BEFORE UPDATE ON graph_entities
    FOR EACH ROW EXECUTE FUNCTION update_region_timestamp();

DROP TRIGGER IF EXISTS update_graph_relationships_timestamp ON graph_relationships;
CREATE TRIGGER update_graph_relationships_timestamp
    BEFORE UPDATE ON graph_relationships
    FOR EACH ROW EXECUTE FUNCTION update_region_timestamp();

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE data_lake_events IS 'Event stream storage for pipeline events, engagement tracking, and analytics';
COMMENT ON TABLE graph_entities IS 'UPR Graph - Core entity store for companies, individuals, and hybrid entities';
COMMENT ON TABLE graph_signals IS 'UPR Graph - Time-decaying signals attached to entities';
COMMENT ON TABLE graph_relationships IS 'UPR Graph - Typed relationships between entities';

COMMENT ON COLUMN graph_signals.decay_rate IS 'Rate at which signal strength decays over time (0-1, per day)';
COMMENT ON COLUMN graph_entities.version IS 'Entity version for optimistic concurrency control';
