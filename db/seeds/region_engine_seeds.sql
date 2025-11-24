-- ============================================================================
-- Sprint 71: Region Engine - Seed Data
-- Initial regions: UAE (country), India (city), US (state)
-- ============================================================================

-- ============================================================================
-- 1. REGION PROFILES
-- ============================================================================

-- UAE Region Profile (Country-level granularity)
INSERT INTO region_profiles (
    region_id, region_code, region_name, country_code, granularity_level,
    timezone, currency_code, work_week_start, work_week_end,
    business_hours_start, business_hours_end,
    regulations, scoring_modifiers, sales_cycle_multiplier, preferred_channels
) VALUES (
    'a1000000-0000-0000-0000-000000000001',
    'UAE',
    'United Arab Emirates',
    'AE',
    'country',
    'Asia/Dubai',
    'AED',
    0,  -- Sunday
    4,  -- Thursday
    '09:00:00',
    '18:00:00',
    '{"data_protection": "PDPL", "free_zones": true, "labor_law": "UAE_Labor_Law", "notes": "Fast decision making, relationship-driven"}',
    '{"q_modifier": 1.15, "t_modifier": 1.10, "l_modifier": 1.20, "e_modifier": 1.05}',
    0.80,  -- Faster sales cycle
    '["whatsapp", "linkedin", "email"]'
) ON CONFLICT (region_code) DO UPDATE SET
    region_name = EXCLUDED.region_name,
    scoring_modifiers = EXCLUDED.scoring_modifiers,
    preferred_channels = EXCLUDED.preferred_channels,
    updated_at = CURRENT_TIMESTAMP;

-- India Region Profile (City-level granularity)
INSERT INTO region_profiles (
    region_id, region_code, region_name, country_code, granularity_level,
    timezone, currency_code, work_week_start, work_week_end,
    business_hours_start, business_hours_end,
    regulations, scoring_modifiers, sales_cycle_multiplier, preferred_channels
) VALUES (
    'a1000000-0000-0000-0000-000000000002',
    'IND',
    'India',
    'IN',
    'city',
    'Asia/Kolkata',
    'INR',
    1,  -- Monday
    5,  -- Friday
    '10:00:00',
    '19:00:00',
    '{"data_protection": "DPDP_Act_2023", "gst_required": true, "labor_law": "India_Labor_Code", "notes": "Hierarchical decision making, relationship building takes time"}',
    '{"q_modifier": 1.00, "t_modifier": 1.05, "l_modifier": 1.10, "e_modifier": 1.00}',
    1.20,  -- Longer sales cycle
    '["email", "phone", "linkedin"]'
) ON CONFLICT (region_code) DO UPDATE SET
    region_name = EXCLUDED.region_name,
    scoring_modifiers = EXCLUDED.scoring_modifiers,
    preferred_channels = EXCLUDED.preferred_channels,
    updated_at = CURRENT_TIMESTAMP;

-- US Region Profile (State-level granularity)
INSERT INTO region_profiles (
    region_id, region_code, region_name, country_code, granularity_level,
    timezone, currency_code, work_week_start, work_week_end,
    business_hours_start, business_hours_end,
    regulations, scoring_modifiers, sales_cycle_multiplier, preferred_channels
) VALUES (
    'a1000000-0000-0000-0000-000000000003',
    'USA',
    'United States of America',
    'US',
    'state',
    'America/New_York',
    'USD',
    1,  -- Monday
    5,  -- Friday
    '09:00:00',
    '17:00:00',
    '{"data_protection": "CCPA", "state_variations": true, "labor_law": "FLSA", "notes": "Direct communication, mid-level empowered decisions"}',
    '{"q_modifier": 1.00, "t_modifier": 1.00, "l_modifier": 1.00, "e_modifier": 1.00}',
    1.00,  -- Baseline sales cycle
    '["email", "linkedin"]'
) ON CONFLICT (region_code) DO UPDATE SET
    region_name = EXCLUDED.region_name,
    scoring_modifiers = EXCLUDED.scoring_modifiers,
    preferred_channels = EXCLUDED.preferred_channels,
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- 2. TERRITORY DEFINITIONS - UAE (All Emirates)
-- ============================================================================

-- UAE Country Level
INSERT INTO territory_definitions (territory_id, region_id, territory_code, territory_name, territory_level, parent_territory_id, latitude, longitude, population_estimate)
VALUES ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'AE', 'United Arab Emirates', 1, NULL, 23.4241, 53.8478, 9890000)
ON CONFLICT (region_id, territory_code) DO NOTHING;

-- Emirates (Level 2)
INSERT INTO territory_definitions (territory_id, region_id, territory_code, territory_name, territory_level, parent_territory_id, latitude, longitude, population_estimate) VALUES
('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'AE-DU', 'Dubai', 2, 'b1000000-0000-0000-0000-000000000001', 25.2048, 55.2708, 3500000),
('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'AE-AZ', 'Abu Dhabi', 2, 'b1000000-0000-0000-0000-000000000001', 24.4539, 54.3773, 1500000),
('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'AE-SH', 'Sharjah', 2, 'b1000000-0000-0000-0000-000000000001', 25.3573, 55.4033, 1400000),
('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'AE-AJ', 'Ajman', 2, 'b1000000-0000-0000-0000-000000000001', 25.4052, 55.5136, 500000),
('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'AE-RK', 'Ras Al Khaimah', 2, 'b1000000-0000-0000-0000-000000000001', 25.7895, 55.9432, 400000),
('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'AE-FU', 'Fujairah', 2, 'b1000000-0000-0000-0000-000000000001', 25.1288, 56.3265, 250000),
('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001', 'AE-UQ', 'Umm Al Quwain', 2, 'b1000000-0000-0000-0000-000000000001', 25.5647, 55.5552, 80000)
ON CONFLICT (region_id, territory_code) DO NOTHING;

-- ============================================================================
-- 3. TERRITORY DEFINITIONS - INDIA (Top 20 Cities)
-- ============================================================================

-- India Country Level
INSERT INTO territory_definitions (territory_id, region_id, territory_code, territory_name, territory_level, parent_territory_id, latitude, longitude, population_estimate)
VALUES ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'IN', 'India', 1, NULL, 20.5937, 78.9629, 1400000000)
ON CONFLICT (region_id, territory_code) DO NOTHING;

-- Major States (Level 2)
INSERT INTO territory_definitions (territory_id, region_id, territory_code, territory_name, territory_level, parent_territory_id, latitude, longitude, population_estimate) VALUES
('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'IN-MH', 'Maharashtra', 2, 'b2000000-0000-0000-0000-000000000001', 19.7515, 75.7139, 125000000),
('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'IN-KA', 'Karnataka', 2, 'b2000000-0000-0000-0000-000000000001', 15.3173, 75.7139, 67000000),
('b2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'IN-TN', 'Tamil Nadu', 2, 'b2000000-0000-0000-0000-000000000001', 11.1271, 78.6569, 77000000),
('b2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'IN-DL', 'Delhi NCR', 2, 'b2000000-0000-0000-0000-000000000001', 28.7041, 77.1025, 32000000),
('b2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002', 'IN-TG', 'Telangana', 2, 'b2000000-0000-0000-0000-000000000001', 18.1124, 79.0193, 35000000),
('b2000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000002', 'IN-WB', 'West Bengal', 2, 'b2000000-0000-0000-0000-000000000001', 22.9868, 87.8550, 100000000),
('b2000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000002', 'IN-GJ', 'Gujarat', 2, 'b2000000-0000-0000-0000-000000000001', 22.2587, 71.1924, 64000000)
ON CONFLICT (region_id, territory_code) DO NOTHING;

-- Major Cities (Level 3)
INSERT INTO territory_definitions (territory_id, region_id, territory_code, territory_name, territory_level, parent_territory_id, latitude, longitude, population_estimate, metadata) VALUES
('b2000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000002', 'IN-MH-MUM', 'Mumbai', 3, 'b2000000-0000-0000-0000-000000000002', 19.0760, 72.8777, 21000000, '{"metro": true, "tech_hub": true, "financial_center": true}'),
('b2000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000002', 'IN-MH-PUN', 'Pune', 3, 'b2000000-0000-0000-0000-000000000002', 18.5204, 73.8567, 7500000, '{"metro": true, "tech_hub": true, "it_corridor": true}'),
('b2000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000002', 'IN-KA-BLR', 'Bangalore', 3, 'b2000000-0000-0000-0000-000000000003', 12.9716, 77.5946, 13000000, '{"metro": true, "tech_hub": true, "startup_capital": true}'),
('b2000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000002', 'IN-TN-CHN', 'Chennai', 3, 'b2000000-0000-0000-0000-000000000004', 13.0827, 80.2707, 11000000, '{"metro": true, "manufacturing_hub": true}'),
('b2000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000002', 'IN-DL-DEL', 'Delhi', 3, 'b2000000-0000-0000-0000-000000000005', 28.6139, 77.2090, 19000000, '{"metro": true, "capital": true}'),
('b2000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000002', 'IN-DL-GGN', 'Gurugram', 3, 'b2000000-0000-0000-0000-000000000005', 28.4595, 77.0266, 3000000, '{"metro": false, "tech_hub": true, "corporate_hub": true}'),
('b2000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000002', 'IN-DL-NOI', 'Noida', 3, 'b2000000-0000-0000-0000-000000000005', 28.5355, 77.3910, 2500000, '{"metro": false, "tech_hub": true, "it_corridor": true}'),
('b2000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000002', 'IN-TG-HYD', 'Hyderabad', 3, 'b2000000-0000-0000-0000-000000000006', 17.3850, 78.4867, 10500000, '{"metro": true, "tech_hub": true, "pharma_hub": true}'),
('b2000000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000002', 'IN-WB-KOL', 'Kolkata', 3, 'b2000000-0000-0000-0000-000000000007', 22.5726, 88.3639, 15000000, '{"metro": true, "financial_center": true}'),
('b2000000-0000-0000-0000-000000000019', 'a1000000-0000-0000-0000-000000000002', 'IN-GJ-AMD', 'Ahmedabad', 3, 'b2000000-0000-0000-0000-000000000008', 23.0225, 72.5714, 8500000, '{"metro": true, "textile_hub": true}')
ON CONFLICT (region_id, territory_code) DO NOTHING;

-- ============================================================================
-- 4. TERRITORY DEFINITIONS - USA (Key States)
-- ============================================================================

-- USA Country Level
INSERT INTO territory_definitions (territory_id, region_id, territory_code, territory_name, territory_level, parent_territory_id, latitude, longitude, population_estimate)
VALUES ('b3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'US', 'United States', 1, NULL, 37.0902, -95.7129, 335000000)
ON CONFLICT (region_id, territory_code) DO NOTHING;

-- Key States (Level 2)
INSERT INTO territory_definitions (territory_id, region_id, territory_code, territory_name, territory_level, parent_territory_id, latitude, longitude, population_estimate, timezone_override, metadata) VALUES
('b3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 'US-CA', 'California', 2, 'b3000000-0000-0000-0000-000000000001', 36.7783, -119.4179, 39500000, 'America/Los_Angeles', '{"tech_hub": true, "enterprise_dense": true}'),
('b3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'US-NY', 'New York', 2, 'b3000000-0000-0000-0000-000000000001', 40.7128, -74.0060, 19500000, 'America/New_York', '{"financial_center": true, "enterprise_dense": true}'),
('b3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'US-TX', 'Texas', 2, 'b3000000-0000-0000-0000-000000000001', 31.9686, -99.9018, 30000000, 'America/Chicago', '{"energy_hub": true, "tech_growth": true}'),
('b3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000003', 'US-FL', 'Florida', 2, 'b3000000-0000-0000-0000-000000000001', 27.6648, -81.5158, 22000000, 'America/New_York', '{"fintech_growth": true}'),
('b3000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003', 'US-WA', 'Washington', 2, 'b3000000-0000-0000-0000-000000000001', 47.7511, -120.7401, 7700000, 'America/Los_Angeles', '{"tech_hub": true, "cloud_hq": true}'),
('b3000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000003', 'US-MA', 'Massachusetts', 2, 'b3000000-0000-0000-0000-000000000001', 42.4072, -71.3824, 7000000, 'America/New_York', '{"biotech_hub": true, "education_center": true}'),
('b3000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000003', 'US-IL', 'Illinois', 2, 'b3000000-0000-0000-0000-000000000001', 40.6331, -89.3985, 12800000, 'America/Chicago', '{"midwest_hub": true, "financial_center": true}'),
('b3000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000003', 'US-GA', 'Georgia', 2, 'b3000000-0000-0000-0000-000000000001', 32.1656, -82.9001, 10700000, 'America/New_York', '{"logistics_hub": true, "fintech_growth": true}'),
('b3000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000003', 'US-CO', 'Colorado', 2, 'b3000000-0000-0000-0000-000000000001', 39.5501, -105.7821, 5800000, 'America/Denver', '{"tech_growth": true, "aerospace": true}'),
('b3000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000003', 'US-NC', 'North Carolina', 2, 'b3000000-0000-0000-0000-000000000001', 35.7596, -79.0193, 10600000, 'America/New_York', '{"research_triangle": true, "banking_hub": true}')
ON CONFLICT (region_id, territory_code) DO NOTHING;

-- ============================================================================
-- 5. REGION SCORE MODIFIERS (Vertical-Specific)
-- ============================================================================

-- UAE - Banking
INSERT INTO region_score_modifiers (region_id, vertical_id, q_modifier, t_modifier, l_modifier, e_modifier, stakeholder_depth_norm, notes)
VALUES ('a1000000-0000-0000-0000-000000000001', 'banking_employee', 1.20, 1.15, 1.25, 1.10, 2, 'UAE banking: Fast decisions, senior access, relationship-driven')
ON CONFLICT (region_id, vertical_id) DO UPDATE SET q_modifier = EXCLUDED.q_modifier, updated_at = CURRENT_TIMESTAMP;

-- UAE - Insurance
INSERT INTO region_score_modifiers (region_id, vertical_id, q_modifier, t_modifier, l_modifier, e_modifier, stakeholder_depth_norm, notes)
VALUES ('a1000000-0000-0000-0000-000000000001', 'insurance_individual', 1.15, 1.20, 1.30, 1.05, 1, 'UAE insurance: Expat-heavy, life events frequent')
ON CONFLICT (region_id, vertical_id) DO UPDATE SET q_modifier = EXCLUDED.q_modifier, updated_at = CURRENT_TIMESTAMP;

-- India - SaaS B2B
INSERT INTO region_score_modifiers (region_id, vertical_id, q_modifier, t_modifier, l_modifier, e_modifier, stakeholder_depth_norm, notes)
VALUES ('a1000000-0000-0000-0000-000000000002', 'saas_b2b', 1.05, 1.00, 1.15, 1.00, 4, 'India SaaS: Large tech talent pool, cost-conscious, hierarchical')
ON CONFLICT (region_id, vertical_id) DO UPDATE SET q_modifier = EXCLUDED.q_modifier, updated_at = CURRENT_TIMESTAMP;

-- US - SaaS B2B
INSERT INTO region_score_modifiers (region_id, vertical_id, q_modifier, t_modifier, l_modifier, e_modifier, stakeholder_depth_norm, notes)
VALUES ('a1000000-0000-0000-0000-000000000003', 'saas_b2b', 1.00, 1.00, 1.00, 1.00, 3, 'US SaaS: Baseline, mid-level empowered')
ON CONFLICT (region_id, vertical_id) DO UPDATE SET q_modifier = EXCLUDED.q_modifier, updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- 6. REGION TIMING PACKS
-- ============================================================================

-- UAE Default Timing
INSERT INTO region_timing_packs (region_id, pack_name, optimal_days, optimal_hours_start, optimal_hours_end, contact_frequency_days, follow_up_delay_days, max_attempts)
VALUES ('a1000000-0000-0000-0000-000000000001', 'default', '{0,1,2,3,4}', '10:00:00', '16:00:00', 5, 2, 4)
ON CONFLICT (region_id, pack_name) DO UPDATE SET optimal_days = EXCLUDED.optimal_days, updated_at = CURRENT_TIMESTAMP;

-- India Default Timing
INSERT INTO region_timing_packs (region_id, pack_name, optimal_days, optimal_hours_start, optimal_hours_end, contact_frequency_days, follow_up_delay_days, max_attempts)
VALUES ('a1000000-0000-0000-0000-000000000002', 'default', '{1,2,3,4,5}', '11:00:00', '17:00:00', 7, 4, 6)
ON CONFLICT (region_id, pack_name) DO UPDATE SET optimal_days = EXCLUDED.optimal_days, updated_at = CURRENT_TIMESTAMP;

-- US Default Timing (East Coast)
INSERT INTO region_timing_packs (region_id, pack_name, optimal_days, optimal_hours_start, optimal_hours_end, contact_frequency_days, follow_up_delay_days, max_attempts)
VALUES ('a1000000-0000-0000-0000-000000000003', 'default', '{1,2,3,4,5}', '09:00:00', '16:00:00', 7, 3, 5)
ON CONFLICT (region_id, pack_name) DO UPDATE SET optimal_days = EXCLUDED.optimal_days, updated_at = CURRENT_TIMESTAMP;

-- US West Coast Timing
INSERT INTO region_timing_packs (region_id, pack_name, optimal_days, optimal_hours_start, optimal_hours_end, contact_frequency_days, follow_up_delay_days, max_attempts, metadata)
VALUES ('a1000000-0000-0000-0000-000000000003', 'west_coast', '{1,2,3,4,5}', '09:00:00', '16:00:00', 7, 3, 5, '{"timezone": "America/Los_Angeles", "states": ["CA", "WA", "OR"]}')
ON CONFLICT (region_id, pack_name) DO UPDATE SET optimal_days = EXCLUDED.optimal_days, updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- 7. DEFAULT TENANT BINDINGS (for testing)
-- ============================================================================

-- Bind default tenant to all regions
INSERT INTO tenant_region_bindings (tenant_id, region_id, is_default, active)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', true, true),
    ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', false, true),
    ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', false, true)
ON CONFLICT (tenant_id, region_id) DO UPDATE SET is_default = EXCLUDED.is_default, updated_at = CURRENT_TIMESTAMP;

-- Verification queries
SELECT 'Region Profiles' as table_name, COUNT(*) as count FROM region_profiles;
SELECT 'Territory Definitions' as table_name, COUNT(*) as count FROM territory_definitions;
SELECT 'Score Modifiers' as table_name, COUNT(*) as count FROM region_score_modifiers;
SELECT 'Timing Packs' as table_name, COUNT(*) as count FROM region_timing_packs;
SELECT 'Tenant Bindings' as table_name, COUNT(*) as count FROM tenant_region_bindings;
