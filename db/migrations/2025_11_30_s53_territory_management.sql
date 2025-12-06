-- Sprint 53: Territory Management System
-- UPR OS - Intelligence Engine
-- Hierarchical territory management with config inheritance

-- Enable ltree extension for hierarchical path queries
CREATE EXTENSION IF NOT EXISTS ltree;

-- ============================================================================
-- TERRITORY HIERARCHY
-- ============================================================================

-- Main territories table with hierarchical structure
CREATE TABLE IF NOT EXISTS territories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Hierarchy
    parent_id UUID REFERENCES territories(id) ON DELETE CASCADE,
    level VARCHAR(50) NOT NULL CHECK (level IN ('global', 'region', 'country', 'state', 'city', 'district')),
    path LTREE,  -- Materialized path for efficient hierarchy queries (requires ltree extension)

    -- Geographic data
    country_code VARCHAR(3),        -- ISO 3166-1 alpha-3
    region_code VARCHAR(50),        -- Custom region code
    timezone VARCHAR(50),           -- e.g., 'Asia/Dubai'
    currency VARCHAR(3),            -- ISO 4217 currency code
    languages JSONB DEFAULT '[]',   -- Array of ISO 639-1 language codes

    -- Configuration (inherited down hierarchy)
    config JSONB DEFAULT '{}',
    -- Example config:
    -- {
    --   "scoring_weights": {...},
    --   "signal_priorities": [...],
    --   "enrichment_providers": [...],
    --   "outreach_rules": {...},
    --   "business_hours": {...},
    --   "holidays": [...],
    --   "compliance_rules": {...}
    -- }

    -- Inherited config (computed from ancestors)
    inherited_config JSONB DEFAULT '{}',

    -- Vertical associations
    verticals JSONB DEFAULT '[]',  -- Array of vertical slugs active in this territory

    -- Status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- Enable ltree extension for hierarchical queries
CREATE EXTENSION IF NOT EXISTS ltree;

-- Indexes for territories
CREATE INDEX IF NOT EXISTS idx_territories_parent ON territories(parent_id);
CREATE INDEX IF NOT EXISTS idx_territories_level ON territories(level);
CREATE INDEX IF NOT EXISTS idx_territories_path ON territories USING GIST(path);
CREATE INDEX IF NOT EXISTS idx_territories_country ON territories(country_code);
CREATE INDEX IF NOT EXISTS idx_territories_status ON territories(status);
CREATE INDEX IF NOT EXISTS idx_territories_verticals ON territories USING GIN(verticals);

-- ============================================================================
-- TERRITORY CONFIG INHERITANCE
-- ============================================================================

-- Function to get effective config (merges inherited + local)
CREATE OR REPLACE FUNCTION get_effective_territory_config(territory_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}';
    current_id UUID := territory_id;
    configs JSONB[] := ARRAY[]::JSONB[];
    current_config JSONB;
BEGIN
    -- Walk up the hierarchy collecting configs
    WHILE current_id IS NOT NULL LOOP
        SELECT config, parent_id INTO current_config, current_id
        FROM territories WHERE id = current_id;

        IF current_config IS NOT NULL THEN
            configs := array_prepend(current_config, configs);
        END IF;
    END LOOP;

    -- Merge configs (later configs override earlier ones)
    FOR i IN 1..array_length(configs, 1) LOOP
        result := result || configs[i];
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to update inherited_config for a territory and descendants
CREATE OR REPLACE FUNCTION update_territory_inherited_config(territory_id UUID)
RETURNS void AS $$
DECLARE
    territory_record RECORD;
BEGIN
    -- Update the territory itself
    UPDATE territories
    SET inherited_config = get_effective_territory_config(id),
        updated_at = NOW()
    WHERE id = territory_id;

    -- Update all descendants
    FOR territory_record IN
        SELECT id FROM territories
        WHERE path <@ (SELECT path FROM territories WHERE id = territory_id)
        AND id != territory_id
    LOOP
        UPDATE territories
        SET inherited_config = get_effective_territory_config(territory_record.id),
            updated_at = NOW()
        WHERE id = territory_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update path when parent changes
CREATE OR REPLACE FUNCTION update_territory_path()
RETURNS TRIGGER AS $$
DECLARE
    parent_path LTREE;
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.path := text2ltree(NEW.slug);
    ELSE
        SELECT path INTO parent_path FROM territories WHERE id = NEW.parent_id;
        NEW.path := parent_path || text2ltree(NEW.slug);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER territories_path_trigger
    BEFORE INSERT OR UPDATE OF parent_id ON territories
    FOR EACH ROW
    EXECUTE FUNCTION update_territory_path();

-- Trigger to cascade inherited config updates
CREATE OR REPLACE FUNCTION cascade_territory_config()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.config IS DISTINCT FROM NEW.config THEN
        PERFORM update_territory_inherited_config(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER territories_config_cascade_trigger
    AFTER UPDATE OF config ON territories
    FOR EACH ROW
    EXECUTE FUNCTION cascade_territory_config();

-- ============================================================================
-- TERRITORY ASSIGNMENT RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS territory_assignment_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    territory_id UUID NOT NULL REFERENCES territories(id) ON DELETE CASCADE,

    -- Rule priority (lower = higher priority)
    priority INTEGER DEFAULT 100,

    -- Rule conditions (evaluated in order)
    conditions JSONB NOT NULL,
    -- Example conditions:
    -- [
    --   {"field": "country_code", "op": "eq", "value": "UAE"},
    --   {"field": "company_size", "op": "gte", "value": 100},
    --   {"field": "industry", "op": "in", "value": ["banking", "finance"]}
    -- ]

    -- Rule actions
    actions JSONB DEFAULT '{}',
    -- Example actions:
    -- {
    --   "assign_to_territory": true,
    --   "set_vertical": "banking_uae",
    --   "notify_team": true
    -- }

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_territory_rules_territory ON territory_assignment_rules(territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_rules_priority ON territory_assignment_rules(priority);
CREATE INDEX IF NOT EXISTS idx_territory_rules_active ON territory_assignment_rules(is_active);

-- ============================================================================
-- TERRITORY AUDIT LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS territory_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_id UUID REFERENCES territories(id) ON DELETE SET NULL,
    territory_slug VARCHAR(100),  -- Keep for history even if territory deleted

    -- Action details
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'create', 'update', 'delete', 'activate', 'deactivate',
        'config_change', 'hierarchy_change', 'vertical_assign', 'vertical_remove',
        'rule_add', 'rule_update', 'rule_delete'
    )),

    -- Change details
    changes JSONB,  -- What changed
    previous_state JSONB,  -- State before change
    new_state JSONB,  -- State after change

    -- Actor information (passed from SaaS, not stored in OS)
    actor_id VARCHAR(255),
    actor_type VARCHAR(50),  -- 'super_admin', 'system', 'api'
    actor_ip VARCHAR(45),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    request_id VARCHAR(255),  -- For tracing
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_territory_audit_territory ON territory_audit_logs(territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_audit_action ON territory_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_territory_audit_actor ON territory_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_territory_audit_created ON territory_audit_logs(created_at DESC);

-- ============================================================================
-- TERRITORY PERFORMANCE METRICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS territory_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_id UUID NOT NULL REFERENCES territories(id) ON DELETE CASCADE,

    -- Time period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    granularity VARCHAR(20) DEFAULT 'daily' CHECK (granularity IN ('hourly', 'daily', 'weekly', 'monthly')),

    -- Discovery metrics
    signals_discovered INTEGER DEFAULT 0,
    signals_by_type JSONB DEFAULT '{}',
    unique_companies INTEGER DEFAULT 0,
    unique_contacts INTEGER DEFAULT 0,

    -- Enrichment metrics
    enrichment_requests INTEGER DEFAULT 0,
    enrichment_successes INTEGER DEFAULT 0,
    enrichment_rate DECIMAL(5,2),

    -- Scoring metrics
    avg_q_score DECIMAL(5,2),
    avg_t_score DECIMAL(5,2),
    avg_l_score DECIMAL(5,2),
    avg_e_score DECIMAL(5,2),
    score_distribution JSONB DEFAULT '{}',

    -- Outreach metrics
    outreach_generated INTEGER DEFAULT 0,
    outreach_by_channel JSONB DEFAULT '{}',

    -- Provider metrics
    provider_usage JSONB DEFAULT '{}',
    provider_costs JSONB DEFAULT '{}',

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_territory_metrics_unique
    ON territory_metrics(territory_id, period_start, granularity);
CREATE INDEX IF NOT EXISTS idx_territory_metrics_period
    ON territory_metrics(period_start, period_end);

-- ============================================================================
-- TERRITORY-VERTICAL ASSOCIATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS territory_verticals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_id UUID NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    vertical_slug VARCHAR(100) NOT NULL,

    -- Override config for this vertical in this territory
    config_override JSONB DEFAULT '{}',

    -- Status
    is_primary BOOLEAN DEFAULT false,  -- Primary vertical for this territory
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(territory_id, vertical_slug)
);

CREATE INDEX IF NOT EXISTS idx_territory_verticals_territory ON territory_verticals(territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_verticals_vertical ON territory_verticals(vertical_slug);

-- ============================================================================
-- SUB-VERTICALS (TERRITORY-SPECIFIC SPECIALIZATIONS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS territory_sub_verticals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_id UUID NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    vertical_slug VARCHAR(100) NOT NULL,  -- Parent vertical

    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Sub-vertical specific config
    config JSONB DEFAULT '{}',
    -- Example:
    -- {
    --   "signal_types": [...],
    --   "scoring_adjustments": {...},
    --   "persona_mappings": {...}
    -- }

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(territory_id, vertical_slug, slug)
);

CREATE INDEX IF NOT EXISTS idx_territory_sub_verticals_territory ON territory_sub_verticals(territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_sub_verticals_vertical ON territory_sub_verticals(vertical_slug);

-- ============================================================================
-- SEED DATA: UAE TERRITORIES
-- ============================================================================

-- Global root
INSERT INTO territories (slug, name, level, country_code, timezone, currency, languages, config, status)
VALUES (
    'global',
    'Global',
    'global',
    NULL,
    'UTC',
    'USD',
    '["en"]',
    '{
        "scoring_weights": {
            "q_score": 0.3,
            "t_score": 0.25,
            "l_score": 0.25,
            "e_score": 0.2
        },
        "enrichment_providers": ["apollo", "clearbit", "linkedin"],
        "business_hours": {
            "start": "09:00",
            "end": "18:00",
            "days": [1, 2, 3, 4, 5]
        }
    }',
    'active'
) ON CONFLICT (slug) DO NOTHING;

-- Middle East region
INSERT INTO territories (slug, name, level, parent_id, region_code, timezone, currency, languages, config, status)
SELECT
    'middle_east',
    'Middle East',
    'region',
    id,
    'MENA',
    'Asia/Dubai',
    'AED',
    '["en", "ar"]',
    '{
        "scoring_weights": {
            "q_score": 0.35,
            "t_score": 0.25,
            "l_score": 0.20,
            "e_score": 0.20
        },
        "enrichment_providers": ["apollo", "linkedin", "local_registry"],
        "business_hours": {
            "start": "09:00",
            "end": "18:00",
            "days": [0, 1, 2, 3, 4]
        },
        "compliance_rules": {
            "require_local_presence": true,
            "data_residency": "UAE"
        }
    }',
    'active'
FROM territories WHERE slug = 'global'
ON CONFLICT (slug) DO NOTHING;

-- UAE country
INSERT INTO territories (slug, name, level, parent_id, country_code, region_code, timezone, currency, languages, config, status)
SELECT
    'uae',
    'United Arab Emirates',
    'country',
    id,
    'UAE',
    'MENA',
    'Asia/Dubai',
    'AED',
    '["en", "ar"]',
    '{
        "enrichment_providers": ["apollo", "linkedin", "uae_trade_registry"],
        "holidays": [
            {"name": "National Day", "date": "12-02"},
            {"name": "Eid Al Fitr", "type": "lunar"},
            {"name": "Eid Al Adha", "type": "lunar"}
        ],
        "compliance_rules": {
            "require_trade_license": true,
            "vat_registration": true
        }
    }',
    'active'
FROM territories WHERE slug = 'middle_east'
ON CONFLICT (slug) DO NOTHING;

-- UAE Emirates (States)
WITH uae_parent AS (SELECT id FROM territories WHERE slug = 'uae')
INSERT INTO territories (slug, name, level, parent_id, country_code, timezone, currency, languages, config, status)
SELECT * FROM (
    VALUES
    ('dubai', 'Dubai', 'state', (SELECT id FROM uae_parent), 'UAE', 'Asia/Dubai', 'AED', '["en", "ar"]'::JSONB,
     '{"hub_type": "financial", "free_zones": ["DIFC", "DMCC", "JAFZA", "DIC", "DMC"], "priority": 1}'::JSONB, 'active'),
    ('abu_dhabi', 'Abu Dhabi', 'state', (SELECT id FROM uae_parent), 'UAE', 'Asia/Dubai', 'AED', '["en", "ar"]'::JSONB,
     '{"hub_type": "government", "free_zones": ["ADGM", "Masdar", "KIZAD"], "priority": 2}'::JSONB, 'active'),
    ('sharjah', 'Sharjah', 'state', (SELECT id FROM uae_parent), 'UAE', 'Asia/Dubai', 'AED', '["en", "ar"]'::JSONB,
     '{"hub_type": "industrial", "free_zones": ["SAIF Zone", "Hamriyah"], "priority": 3}'::JSONB, 'active'),
    ('ajman', 'Ajman', 'state', (SELECT id FROM uae_parent), 'UAE', 'Asia/Dubai', 'AED', '["en", "ar"]'::JSONB,
     '{"hub_type": "sme", "free_zones": ["AFZA"], "priority": 4}'::JSONB, 'active'),
    ('ras_al_khaimah', 'Ras Al Khaimah', 'state', (SELECT id FROM uae_parent), 'UAE', 'Asia/Dubai', 'AED', '["en", "ar"]'::JSONB,
     '{"hub_type": "industrial", "free_zones": ["RAKEZ", "RAK FTZ"], "priority": 5}'::JSONB, 'active'),
    ('fujairah', 'Fujairah', 'state', (SELECT id FROM uae_parent), 'UAE', 'Asia/Dubai', 'AED', '["en", "ar"]'::JSONB,
     '{"hub_type": "port", "free_zones": ["FOIZ"], "priority": 6}'::JSONB, 'active'),
    ('umm_al_quwain', 'Umm Al Quwain', 'state', (SELECT id FROM uae_parent), 'UAE', 'Asia/Dubai', 'AED', '["en", "ar"]'::JSONB,
     '{"hub_type": "emerging", "free_zones": ["UAQ FTZ"], "priority": 7}'::JSONB, 'active')
) AS t(slug, name, level, parent_id, country_code, timezone, currency, languages, config, status)
ON CONFLICT (slug) DO NOTHING;

-- Dubai districts
WITH dubai_parent AS (SELECT id FROM territories WHERE slug = 'dubai')
INSERT INTO territories (slug, name, level, parent_id, country_code, timezone, currency, config, status)
SELECT * FROM (
    VALUES
    ('difc', 'DIFC (Dubai International Financial Centre)', 'district', (SELECT id FROM dubai_parent), 'UAE', 'Asia/Dubai', 'AED',
     '{"zone_type": "free_zone", "specialization": "financial_services", "regulations": "common_law"}'::JSONB, 'active'),
    ('business_bay', 'Business Bay', 'district', (SELECT id FROM dubai_parent), 'UAE', 'Asia/Dubai', 'AED',
     '{"zone_type": "business", "specialization": "corporate_hq"}'::JSONB, 'active'),
    ('dubai_marina', 'Dubai Marina', 'district', (SELECT id FROM dubai_parent), 'UAE', 'Asia/Dubai', 'AED',
     '{"zone_type": "mixed", "specialization": "hospitality_real_estate"}'::JSONB, 'active'),
    ('jlt', 'Jumeirah Lake Towers', 'district', (SELECT id FROM dubai_parent), 'UAE', 'Asia/Dubai', 'AED',
     '{"zone_type": "free_zone", "specialization": "sme_startups"}'::JSONB, 'active'),
    ('deira', 'Deira', 'district', (SELECT id FROM dubai_parent), 'UAE', 'Asia/Dubai', 'AED',
     '{"zone_type": "traditional", "specialization": "trading_retail"}'::JSONB, 'active'),
    ('jebel_ali', 'Jebel Ali', 'district', (SELECT id FROM dubai_parent), 'UAE', 'Asia/Dubai', 'AED',
     '{"zone_type": "free_zone", "specialization": "logistics_manufacturing"}'::JSONB, 'active')
) AS t(slug, name, level, parent_id, country_code, timezone, currency, config, status)
ON CONFLICT (slug) DO NOTHING;

-- Abu Dhabi districts
WITH ad_parent AS (SELECT id FROM territories WHERE slug = 'abu_dhabi')
INSERT INTO territories (slug, name, level, parent_id, country_code, timezone, currency, config, status)
SELECT * FROM (
    VALUES
    ('adgm', 'ADGM (Abu Dhabi Global Market)', 'district', (SELECT id FROM ad_parent), 'UAE', 'Asia/Dubai', 'AED',
     '{"zone_type": "free_zone", "specialization": "financial_services", "regulations": "common_law"}'::JSONB, 'active'),
    ('masdar_city', 'Masdar City', 'district', (SELECT id FROM ad_parent), 'UAE', 'Asia/Dubai', 'AED',
     '{"zone_type": "free_zone", "specialization": "clean_tech_sustainability"}'::JSONB, 'active'),
    ('mussafah', 'Mussafah', 'district', (SELECT id FROM ad_parent), 'UAE', 'Asia/Dubai', 'AED',
     '{"zone_type": "industrial", "specialization": "manufacturing_logistics"}'::JSONB, 'active')
) AS t(slug, name, level, parent_id, country_code, timezone, currency, config, status)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED: TERRITORY ASSIGNMENT RULES FOR UAE
-- ============================================================================

-- Rule: Assign UAE companies to UAE territory
INSERT INTO territory_assignment_rules (name, description, territory_id, priority, conditions, actions, is_active)
SELECT
    'UAE Company Detection',
    'Assign companies with UAE indicators to UAE territory',
    id,
    10,
    '[
        {"field": "country_code", "op": "eq", "value": "UAE"},
        {"field": "country_code", "op": "eq", "value": "AE"}
    ]'::JSONB,
    '{"assign_to_territory": true, "set_region": "middle_east"}'::JSONB,
    true
FROM territories WHERE slug = 'uae';

-- Rule: Assign DIFC companies to DIFC district
INSERT INTO territory_assignment_rules (name, description, territory_id, priority, conditions, actions, is_active)
SELECT
    'DIFC Company Detection',
    'Assign companies in DIFC to DIFC territory',
    id,
    5,
    '[
        {"field": "free_zone", "op": "eq", "value": "DIFC"},
        {"field": "address", "op": "contains", "value": "DIFC"},
        {"field": "address", "op": "contains", "value": "Gate Avenue"}
    ]'::JSONB,
    '{"assign_to_territory": true, "set_vertical": "banking"}'::JSONB,
    true
FROM territories WHERE slug = 'difc';

-- Rule: Assign financial services companies to DIFC
INSERT INTO territory_assignment_rules (name, description, territory_id, priority, conditions, actions, is_active)
SELECT
    'Financial Services to DIFC',
    'Route financial services companies in Dubai to DIFC territory',
    id,
    15,
    '[
        {"field": "industry", "op": "in", "value": ["banking", "finance", "insurance", "wealth_management"]},
        {"field": "territory", "op": "eq", "value": "dubai"}
    ]'::JSONB,
    '{"suggest_territory": true, "priority_boost": 10}'::JSONB,
    true
FROM territories WHERE slug = 'difc';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get all territories in a hierarchy
CREATE OR REPLACE FUNCTION get_territory_hierarchy(root_id UUID)
RETURNS TABLE (
    id UUID,
    slug VARCHAR,
    name VARCHAR,
    level VARCHAR,
    depth INTEGER,
    path LTREE
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE hierarchy AS (
        SELECT t.id, t.slug, t.name, t.level, 0 AS depth, t.path
        FROM territories t
        WHERE t.id = root_id

        UNION ALL

        SELECT t.id, t.slug, t.name, t.level, h.depth + 1, t.path
        FROM territories t
        INNER JOIN hierarchy h ON t.parent_id = h.id
    )
    SELECT * FROM hierarchy ORDER BY depth, name;
END;
$$ LANGUAGE plpgsql;

-- Get ancestors of a territory
CREATE OR REPLACE FUNCTION get_territory_ancestors(territory_id UUID)
RETURNS TABLE (
    id UUID,
    slug VARCHAR,
    name VARCHAR,
    level VARCHAR,
    depth INTEGER
) AS $$
DECLARE
    territory_path LTREE;
BEGIN
    SELECT path INTO territory_path FROM territories WHERE territories.id = territory_id;

    RETURN QUERY
    SELECT t.id, t.slug, t.name, t.level, nlevel(t.path) - 1 AS depth
    FROM territories t
    WHERE territory_path <@ t.path OR t.path <@ territory_path
    ORDER BY nlevel(t.path);
END;
$$ LANGUAGE plpgsql;

-- Assign entity to territory based on rules
CREATE OR REPLACE FUNCTION assign_entity_to_territory(entity_data JSONB)
RETURNS JSONB AS $$
DECLARE
    rule_record RECORD;
    result JSONB := '{"assigned": false, "territory_id": null, "actions": []}'::JSONB;
    condition_match BOOLEAN;
    all_conditions_match BOOLEAN;
    condition JSONB;
    field_value TEXT;
    condition_value JSONB;
BEGIN
    FOR rule_record IN
        SELECT r.*, t.slug as territory_slug
        FROM territory_assignment_rules r
        JOIN territories t ON r.territory_id = t.id
        WHERE r.is_active = true
        ORDER BY r.priority
    LOOP
        all_conditions_match := false;

        FOR condition IN SELECT * FROM jsonb_array_elements(rule_record.conditions)
        LOOP
            field_value := entity_data->>condition->>'field';
            condition_value := condition->'value';

            CASE condition->>'op'
                WHEN 'eq' THEN
                    condition_match := field_value = condition_value#>>'{}';
                WHEN 'in' THEN
                    condition_match := field_value = ANY(SELECT jsonb_array_elements_text(condition_value));
                WHEN 'contains' THEN
                    condition_match := field_value ILIKE '%' || (condition_value#>>'{}') || '%';
                WHEN 'gte' THEN
                    condition_match := (field_value::NUMERIC) >= (condition_value#>>'{}')::NUMERIC;
                WHEN 'lte' THEN
                    condition_match := (field_value::NUMERIC) <= (condition_value#>>'{}')::NUMERIC;
                ELSE
                    condition_match := false;
            END CASE;

            -- Any condition in the array can match (OR logic within conditions)
            IF condition_match THEN
                all_conditions_match := true;
                EXIT;  -- Found a match, check this rule
            END IF;
        END LOOP;

        IF all_conditions_match THEN
            result := jsonb_build_object(
                'assigned', true,
                'territory_id', rule_record.territory_id,
                'territory_slug', rule_record.territory_slug,
                'rule_id', rule_record.id,
                'rule_name', rule_record.name,
                'actions', rule_record.actions
            );
            EXIT;  -- First matching rule wins
        END IF;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Territory summary view
CREATE OR REPLACE VIEW territory_summary AS
SELECT
    t.id,
    t.slug,
    t.name,
    t.level,
    t.country_code,
    t.timezone,
    t.status,
    p.slug AS parent_slug,
    p.name AS parent_name,
    nlevel(t.path) - 1 AS depth,
    (SELECT COUNT(*) FROM territories WHERE parent_id = t.id) AS child_count,
    (SELECT COUNT(*) FROM territory_assignment_rules WHERE territory_id = t.id AND is_active) AS active_rules,
    (SELECT COUNT(*) FROM territory_verticals WHERE territory_id = t.id AND is_active) AS active_verticals,
    t.created_at,
    t.updated_at
FROM territories t
LEFT JOIN territories p ON t.parent_id = p.id;

-- Territory metrics summary
CREATE OR REPLACE VIEW territory_metrics_summary AS
SELECT
    t.slug,
    t.name,
    t.level,
    COALESCE(SUM(m.signals_discovered), 0) AS total_signals,
    COALESCE(SUM(m.unique_companies), 0) AS total_companies,
    COALESCE(AVG(m.avg_q_score), 0) AS avg_q_score,
    COALESCE(AVG(m.enrichment_rate), 0) AS avg_enrichment_rate,
    MAX(m.period_end) AS last_activity
FROM territories t
LEFT JOIN territory_metrics m ON t.id = m.territory_id
GROUP BY t.id, t.slug, t.name, t.level;

-- Update inherited config for all existing territories
DO $$
DECLARE
    t_record RECORD;
BEGIN
    FOR t_record IN SELECT id FROM territories ORDER BY nlevel(path) LOOP
        UPDATE territories
        SET inherited_config = get_effective_territory_config(t_record.id)
        WHERE id = t_record.id;
    END LOOP;
END $$;
