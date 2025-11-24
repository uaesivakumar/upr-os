-- ============================================================================
-- Sprint 71: Region Engine Registry
-- Phase 1.5 - Region as First-Class Dimension in OS Pipelines
-- ============================================================================

-- Region Profile Table
-- Stores region configuration including granularity, timezone, currency, regulations
CREATE TABLE IF NOT EXISTS region_profiles (
    region_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_code VARCHAR(50) NOT NULL UNIQUE,
    region_name VARCHAR(255) NOT NULL,
    country_code VARCHAR(3) NOT NULL,
    granularity_level VARCHAR(20) NOT NULL CHECK (granularity_level IN ('country', 'state', 'city')),
    timezone VARCHAR(50) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    work_week_start INTEGER NOT NULL DEFAULT 1 CHECK (work_week_start BETWEEN 0 AND 6),
    work_week_end INTEGER NOT NULL DEFAULT 5 CHECK (work_week_end BETWEEN 0 AND 6),
    business_hours_start TIME NOT NULL DEFAULT '09:00:00',
    business_hours_end TIME NOT NULL DEFAULT '18:00:00',
    regulations JSONB DEFAULT '{}',
    scoring_modifiers JSONB DEFAULT '{"q_modifier": 1.0, "t_modifier": 1.0, "l_modifier": 1.0, "e_modifier": 1.0}',
    sales_cycle_multiplier DECIMAL(3,2) DEFAULT 1.00,
    preferred_channels JSONB DEFAULT '["email"]',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Territory Definition Table
-- Hierarchical territory model: country -> state -> city_cluster
CREATE TABLE IF NOT EXISTS territory_definitions (
    territory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID NOT NULL REFERENCES region_profiles(region_id) ON DELETE CASCADE,
    territory_code VARCHAR(100) NOT NULL,
    territory_name VARCHAR(255) NOT NULL,
    territory_level INTEGER NOT NULL CHECK (territory_level BETWEEN 1 AND 3),
    parent_territory_id UUID REFERENCES territory_definitions(territory_id) ON DELETE CASCADE,
    latitude DECIMAL(10, 6),
    longitude DECIMAL(10, 6),
    population_estimate BIGINT,
    timezone_override VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(region_id, territory_code)
);

-- Tenant Region Binding Table
-- Maps tenants to their active regions with defaults
CREATE TABLE IF NOT EXISTS tenant_region_bindings (
    binding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    region_id UUID NOT NULL REFERENCES region_profiles(region_id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT false,
    coverage_territories JSONB DEFAULT '[]',
    custom_scoring_modifiers JSONB,
    custom_sales_cycle_multiplier DECIMAL(3,2),
    custom_preferred_channels JSONB,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, region_id)
);

-- Region Score Modifiers Table (Sprint 73 prep)
-- Allows vertical-specific score modifiers per region
CREATE TABLE IF NOT EXISTS region_score_modifiers (
    modifier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID NOT NULL REFERENCES region_profiles(region_id) ON DELETE CASCADE,
    vertical_id VARCHAR(50),
    q_modifier DECIMAL(4,3) DEFAULT 1.000,
    t_modifier DECIMAL(4,3) DEFAULT 1.000,
    l_modifier DECIMAL(4,3) DEFAULT 1.000,
    e_modifier DECIMAL(4,3) DEFAULT 1.000,
    stakeholder_depth_norm INTEGER DEFAULT 3,
    notes TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(region_id, vertical_id)
);

-- Region Timing Packs Table (Sprint 73 prep)
-- Optimal contact timing per region
CREATE TABLE IF NOT EXISTS region_timing_packs (
    pack_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID NOT NULL REFERENCES region_profiles(region_id) ON DELETE CASCADE,
    pack_name VARCHAR(100) NOT NULL,
    optimal_days INTEGER[] NOT NULL,
    optimal_hours_start TIME NOT NULL,
    optimal_hours_end TIME NOT NULL,
    contact_frequency_days INTEGER DEFAULT 7,
    follow_up_delay_days INTEGER DEFAULT 3,
    max_attempts INTEGER DEFAULT 5,
    metadata JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(region_id, pack_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_region_profiles_country ON region_profiles(country_code);
CREATE INDEX IF NOT EXISTS idx_region_profiles_active ON region_profiles(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_territory_definitions_region ON territory_definitions(region_id);
CREATE INDEX IF NOT EXISTS idx_territory_definitions_parent ON territory_definitions(parent_territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_definitions_level ON territory_definitions(territory_level);
CREATE INDEX IF NOT EXISTS idx_tenant_region_bindings_tenant ON tenant_region_bindings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_region_bindings_region ON tenant_region_bindings(region_id);
CREATE INDEX IF NOT EXISTS idx_tenant_region_bindings_default ON tenant_region_bindings(tenant_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_region_score_modifiers_region ON region_score_modifiers(region_id);
CREATE INDEX IF NOT EXISTS idx_region_score_modifiers_vertical ON region_score_modifiers(region_id, vertical_id);
CREATE INDEX IF NOT EXISTS idx_region_timing_packs_region ON region_timing_packs(region_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_region_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all region tables
DROP TRIGGER IF EXISTS update_region_profiles_timestamp ON region_profiles;
CREATE TRIGGER update_region_profiles_timestamp
    BEFORE UPDATE ON region_profiles
    FOR EACH ROW EXECUTE FUNCTION update_region_timestamp();

DROP TRIGGER IF EXISTS update_territory_definitions_timestamp ON territory_definitions;
CREATE TRIGGER update_territory_definitions_timestamp
    BEFORE UPDATE ON territory_definitions
    FOR EACH ROW EXECUTE FUNCTION update_region_timestamp();

DROP TRIGGER IF EXISTS update_tenant_region_bindings_timestamp ON tenant_region_bindings;
CREATE TRIGGER update_tenant_region_bindings_timestamp
    BEFORE UPDATE ON tenant_region_bindings
    FOR EACH ROW EXECUTE FUNCTION update_region_timestamp();

DROP TRIGGER IF EXISTS update_region_score_modifiers_timestamp ON region_score_modifiers;
CREATE TRIGGER update_region_score_modifiers_timestamp
    BEFORE UPDATE ON region_score_modifiers
    FOR EACH ROW EXECUTE FUNCTION update_region_timestamp();

DROP TRIGGER IF EXISTS update_region_timing_packs_timestamp ON region_timing_packs;
CREATE TRIGGER update_region_timing_packs_timestamp
    BEFORE UPDATE ON region_timing_packs
    FOR EACH ROW EXECUTE FUNCTION update_region_timestamp();

-- Comments for documentation
COMMENT ON TABLE region_profiles IS 'Core region configuration including granularity, timezone, currency, and scoring modifiers';
COMMENT ON TABLE territory_definitions IS 'Hierarchical territory model supporting country/state/city granularity per region';
COMMENT ON TABLE tenant_region_bindings IS 'Maps tenants to their active regions with optional customizations';
COMMENT ON TABLE region_score_modifiers IS 'Vertical-specific Q/T/L/E score modifiers per region';
COMMENT ON TABLE region_timing_packs IS 'Optimal contact timing configurations per region';

COMMENT ON COLUMN region_profiles.granularity_level IS 'country=UAE, state=US, city=India';
COMMENT ON COLUMN region_profiles.work_week_start IS '0=Sunday, 1=Monday, ..., 6=Saturday';
COMMENT ON COLUMN region_profiles.sales_cycle_multiplier IS '1.0=baseline, <1=faster (UAE), >1=slower (India)';
COMMENT ON COLUMN territory_definitions.territory_level IS '1=country, 2=state, 3=city';
