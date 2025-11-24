/**
 * Region Engine Unit Tests
 * Sprint 71: Region Engine Registry
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

// Mock the database pool
jest.mock('../../../../utils/db.js', () => ({
  pool: {
    query: jest.fn()
  }
}));

import { pool } from '../../../../utils/db.js';
import { regionRegistry } from '../RegionRegistry.js';
import { tenantRegionService } from '../TenantRegionService.js';
import {
  GRANULARITY_LEVELS,
  REGION_CODES,
  DEFAULT_SCORING_MODIFIERS,
  SCORING_MODIFIER_BOUNDS
} from '../types.js';

// Sample test data
const mockRegions = [
  {
    region_id: 'a1000000-0000-0000-0000-000000000001',
    region_code: 'UAE',
    region_name: 'United Arab Emirates',
    country_code: 'AE',
    granularity_level: 'country',
    timezone: 'Asia/Dubai',
    currency_code: 'AED',
    work_week_start: 0,
    work_week_end: 4,
    business_hours_start: '09:00:00',
    business_hours_end: '18:00:00',
    regulations: { data_protection: 'PDPL' },
    scoring_modifiers: { q_modifier: 1.15, t_modifier: 1.10, l_modifier: 1.20, e_modifier: 1.05 },
    sales_cycle_multiplier: 0.80,
    preferred_channels: ['whatsapp', 'linkedin', 'email'],
    active: true
  },
  {
    region_id: 'a1000000-0000-0000-0000-000000000002',
    region_code: 'IND',
    region_name: 'India',
    country_code: 'IN',
    granularity_level: 'city',
    timezone: 'Asia/Kolkata',
    currency_code: 'INR',
    work_week_start: 1,
    work_week_end: 5,
    business_hours_start: '10:00:00',
    business_hours_end: '19:00:00',
    regulations: { data_protection: 'DPDP_Act_2023' },
    scoring_modifiers: { q_modifier: 1.00, t_modifier: 1.05, l_modifier: 1.10, e_modifier: 1.00 },
    sales_cycle_multiplier: 1.20,
    preferred_channels: ['email', 'phone', 'linkedin'],
    active: true
  },
  {
    region_id: 'a1000000-0000-0000-0000-000000000003',
    region_code: 'USA',
    region_name: 'United States of America',
    country_code: 'US',
    granularity_level: 'state',
    timezone: 'America/New_York',
    currency_code: 'USD',
    work_week_start: 1,
    work_week_end: 5,
    business_hours_start: '09:00:00',
    business_hours_end: '17:00:00',
    regulations: { data_protection: 'CCPA' },
    scoring_modifiers: { q_modifier: 1.00, t_modifier: 1.00, l_modifier: 1.00, e_modifier: 1.00 },
    sales_cycle_multiplier: 1.00,
    preferred_channels: ['email', 'linkedin'],
    active: true
  }
];

const mockTerritories = [
  {
    territory_id: 'b1000000-0000-0000-0000-000000000001',
    region_id: 'a1000000-0000-0000-0000-000000000001',
    territory_code: 'AE',
    territory_name: 'United Arab Emirates',
    territory_level: 1,
    parent_territory_id: null,
    latitude: 23.4241,
    longitude: 53.8478,
    population_estimate: 9890000,
    timezone_override: null,
    metadata: {},
    active: true
  },
  {
    territory_id: 'b1000000-0000-0000-0000-000000000002',
    region_id: 'a1000000-0000-0000-0000-000000000001',
    territory_code: 'AE-DU',
    territory_name: 'Dubai',
    territory_level: 2,
    parent_territory_id: 'b1000000-0000-0000-0000-000000000001',
    latitude: 25.2048,
    longitude: 55.2708,
    population_estimate: 3500000,
    timezone_override: null,
    metadata: {},
    active: true
  }
];

const mockScoreModifiers = [
  {
    modifier_id: 'c1000000-0000-0000-0000-000000000001',
    region_id: 'a1000000-0000-0000-0000-000000000001',
    vertical_id: 'banking_employee',
    q_modifier: 1.20,
    t_modifier: 1.15,
    l_modifier: 1.25,
    e_modifier: 1.10,
    stakeholder_depth_norm: 2,
    notes: 'UAE banking',
    active: true
  }
];

const mockTimingPacks = [
  {
    pack_id: 'd1000000-0000-0000-0000-000000000001',
    region_id: 'a1000000-0000-0000-0000-000000000001',
    pack_name: 'default',
    optimal_days: [0, 1, 2, 3, 4],
    optimal_hours_start: '10:00:00',
    optimal_hours_end: '16:00:00',
    contact_frequency_days: 5,
    follow_up_delay_days: 2,
    max_attempts: 4,
    metadata: {},
    active: true
  }
];

describe('Region Engine Types', () => {
  it('should have correct granularity levels', () => {
    expect(GRANULARITY_LEVELS.COUNTRY).toBe('country');
    expect(GRANULARITY_LEVELS.STATE).toBe('state');
    expect(GRANULARITY_LEVELS.CITY).toBe('city');
  });

  it('should have correct region codes', () => {
    expect(REGION_CODES.UAE).toBe('UAE');
    expect(REGION_CODES.INDIA).toBe('IND');
    expect(REGION_CODES.USA).toBe('USA');
  });

  it('should have valid default scoring modifiers', () => {
    expect(DEFAULT_SCORING_MODIFIERS.q_modifier).toBe(1.0);
    expect(DEFAULT_SCORING_MODIFIERS.t_modifier).toBe(1.0);
    expect(DEFAULT_SCORING_MODIFIERS.l_modifier).toBe(1.0);
    expect(DEFAULT_SCORING_MODIFIERS.e_modifier).toBe(1.0);
  });

  it('should have valid modifier bounds', () => {
    expect(SCORING_MODIFIER_BOUNDS.MIN).toBe(0.5);
    expect(SCORING_MODIFIER_BOUNDS.MAX).toBe(2.0);
    expect(SCORING_MODIFIER_BOUNDS.DEFAULT).toBe(1.0);
  });
});

describe('RegionRegistry', () => {
  beforeAll(() => {
    // Setup mock responses
    pool.query.mockImplementation((query) => {
      if (query.includes('region_profiles')) {
        return Promise.resolve({ rows: mockRegions });
      }
      if (query.includes('territory_definitions')) {
        return Promise.resolve({ rows: mockTerritories });
      }
      if (query.includes('region_score_modifiers')) {
        return Promise.resolve({ rows: mockScoreModifiers });
      }
      if (query.includes('region_timing_packs')) {
        return Promise.resolve({ rows: mockTimingPacks });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  it('should initialize and load regions', async () => {
    await regionRegistry.initialize();
    expect(regionRegistry.initialized).toBe(true);
    expect(regionRegistry.cache.size).toBeGreaterThan(0);
  });

  it('should get region by code', async () => {
    const uae = await regionRegistry.getRegionByCode('UAE');
    expect(uae).toBeDefined();
    expect(uae.region_code).toBe('UAE');
    expect(uae.granularity_level).toBe('country');
  });

  it('should handle case-insensitive region codes', async () => {
    const uae1 = await regionRegistry.getRegionByCode('uae');
    const uae2 = await regionRegistry.getRegionByCode('UAE');
    expect(uae1).toEqual(uae2);
  });

  it('should get region by ID', async () => {
    const region = await regionRegistry.getRegionById('a1000000-0000-0000-0000-000000000001');
    expect(region).toBeDefined();
    expect(region.region_code).toBe('UAE');
  });

  it('should return null for unknown region', async () => {
    const unknown = await regionRegistry.getRegionByCode('UNKNOWN');
    expect(unknown).toBeNull();
  });

  it('should get all regions', async () => {
    const regions = await regionRegistry.getAllRegions();
    expect(regions.length).toBe(3);
  });

  it('should get regions by country code', async () => {
    const aeRegions = await regionRegistry.getRegionsByCountry('AE');
    expect(aeRegions.length).toBe(1);
    expect(aeRegions[0].region_code).toBe('UAE');
  });

  it('should get default region', async () => {
    const defaultRegion = await regionRegistry.getDefaultRegion();
    expect(defaultRegion).toBeDefined();
    expect(defaultRegion.region_code).toBe('UAE');
  });

  it('should get territory by code', async () => {
    const dubai = await regionRegistry.getTerritoryByCode('AE-DU');
    expect(dubai).toBeDefined();
    expect(dubai.territory_name).toBe('Dubai');
    expect(dubai.territory_level).toBe(2);
  });

  it('should get territories by region', async () => {
    const territories = await regionRegistry.getTerritoriesByRegion('a1000000-0000-0000-0000-000000000001');
    expect(territories.length).toBe(2);
  });

  it('should get territory hierarchy', async () => {
    const hierarchy = await regionRegistry.getTerritoryHierarchy('AE-DU');
    expect(hierarchy.length).toBe(2);
    expect(hierarchy[0].territory_level).toBe(1);
    expect(hierarchy[1].territory_level).toBe(2);
  });

  it('should get score modifiers for region and vertical', async () => {
    const modifiers = await regionRegistry.getScoreModifiers(
      'a1000000-0000-0000-0000-000000000001',
      'banking_employee'
    );
    expect(modifiers).toBeDefined();
    expect(modifiers.q_modifier).toBe(1.20);
  });

  it('should fallback to default modifiers for unknown vertical', async () => {
    const modifiers = await regionRegistry.getScoreModifiers(
      'a1000000-0000-0000-0000-000000000001',
      'unknown_vertical'
    );
    expect(modifiers).toBeDefined();
    expect(modifiers.q_modifier).toBeDefined();
  });

  it('should get timing pack', async () => {
    const pack = await regionRegistry.getTimingPack(
      'a1000000-0000-0000-0000-000000000001',
      'default'
    );
    expect(pack).toBeDefined();
    expect(pack.optimal_days).toContain(0);
    expect(pack.max_attempts).toBe(4);
  });

  it('should return cache statistics', () => {
    const stats = regionRegistry.getStats();
    expect(stats.regions).toBeGreaterThan(0);
    expect(stats.lastRefresh).not.toBeNull();
    expect(stats.isStale).toBe(false);
  });
});

describe('TenantRegionService', () => {
  const testTenantId = '00000000-0000-0000-0000-000000000001';
  const testRegionId = 'a1000000-0000-0000-0000-000000000001';

  beforeAll(() => {
    pool.query.mockImplementation((query, params) => {
      if (query.includes('tenant_region_bindings') && query.includes('SELECT')) {
        return Promise.resolve({
          rows: [{
            binding_id: 'e1000000-0000-0000-0000-000000000001',
            tenant_id: testTenantId,
            region_id: testRegionId,
            is_default: true,
            coverage_territories: [],
            custom_scoring_modifiers: null,
            custom_sales_cycle_multiplier: null,
            custom_preferred_channels: null,
            region_code: 'UAE',
            region_name: 'United Arab Emirates',
            country_code: 'AE',
            granularity_level: 'country',
            timezone: 'Asia/Dubai',
            currency_code: 'AED',
            base_scoring_modifiers: { q_modifier: 1.15, t_modifier: 1.10, l_modifier: 1.20, e_modifier: 1.05 },
            base_sales_cycle_multiplier: 0.80,
            base_preferred_channels: ['whatsapp', 'linkedin', 'email']
          }]
        });
      }
      if (query.includes('INSERT') || query.includes('UPDATE')) {
        return Promise.resolve({
          rows: [{
            binding_id: 'e1000000-0000-0000-0000-000000000001',
            tenant_id: testTenantId,
            region_id: testRegionId,
            is_default: true
          }]
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  it('should get tenant regions', async () => {
    const regions = await tenantRegionService.getTenantRegions(testTenantId);
    expect(regions.length).toBeGreaterThan(0);
    expect(regions[0].tenant_id).toBe(testTenantId);
  });

  it('should get default region for tenant', async () => {
    const defaultRegion = await tenantRegionService.getDefaultRegion(testTenantId);
    expect(defaultRegion).toBeDefined();
    expect(defaultRegion.is_default).toBe(true);
  });

  it('should merge base and custom modifiers', async () => {
    const region = await tenantRegionService.getDefaultRegion(testTenantId);
    expect(region.scoring_modifiers).toBeDefined();
    expect(region.scoring_modifiers.q_modifier).toBe(1.15);
  });

  it('should check region access', async () => {
    pool.query.mockImplementationOnce(() => Promise.resolve({ rows: [{ 1: 1 }] }));
    const hasAccess = await tenantRegionService.hasRegionAccess(testTenantId, testRegionId);
    expect(hasAccess).toBe(true);
  });

  it('should bind tenant to region', async () => {
    const binding = await tenantRegionService.bindTenantToRegion(
      testTenantId,
      testRegionId,
      { isDefault: true }
    );
    expect(binding).toBeDefined();
    expect(binding.tenant_id).toBe(testTenantId);
  });
});

describe('Region Context Validation', () => {
  it('should validate UAE work week (Sun-Thu)', () => {
    const uae = mockRegions[0];
    expect(uae.work_week_start).toBe(0); // Sunday
    expect(uae.work_week_end).toBe(4);   // Thursday
  });

  it('should validate India work week (Mon-Fri)', () => {
    const india = mockRegions[1];
    expect(india.work_week_start).toBe(1); // Monday
    expect(india.work_week_end).toBe(5);   // Friday
  });

  it('should validate US work week (Mon-Fri)', () => {
    const usa = mockRegions[2];
    expect(usa.work_week_start).toBe(1); // Monday
    expect(usa.work_week_end).toBe(5);   // Friday
  });

  it('should validate sales cycle multipliers', () => {
    expect(mockRegions[0].sales_cycle_multiplier).toBe(0.80); // UAE faster
    expect(mockRegions[1].sales_cycle_multiplier).toBe(1.20); // India slower
    expect(mockRegions[2].sales_cycle_multiplier).toBe(1.00); // US baseline
  });

  it('should validate preferred channels per region', () => {
    expect(mockRegions[0].preferred_channels).toContain('whatsapp'); // UAE
    expect(mockRegions[1].preferred_channels).toContain('phone');    // India
    expect(mockRegions[2].preferred_channels).not.toContain('phone'); // US
  });
});

describe('Edge Cases', () => {
  it('should handle unknown territory gracefully', async () => {
    const territory = await regionRegistry.getTerritoryByCode('UNKNOWN-XX');
    expect(territory).toBeNull();
  });

  it('should handle empty hierarchy for root territory', async () => {
    pool.query.mockImplementationOnce(() => Promise.resolve({ rows: mockTerritories }));
    await regionRegistry.loadTerritories();
    const hierarchy = await regionRegistry.getTerritoryHierarchy('AE');
    expect(hierarchy.length).toBe(1);
  });

  it('should provide fallback for missing timing pack', async () => {
    const pack = await regionRegistry.getTimingPack('unknown-region-id', 'unknown-pack');
    expect(pack).toBeDefined();
    expect(pack.optimal_days).toBeDefined();
  });
});
