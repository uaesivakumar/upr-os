/**
 * Region Engine Type Definitions
 * Sprint 71: Region as First-Class Dimension
 */

/**
 * @typedef {Object} RegionProfile
 * @property {string} region_id - UUID
 * @property {string} region_code - e.g., 'UAE', 'IND', 'USA'
 * @property {string} region_name - Full name
 * @property {string} country_code - ISO 3166-1 alpha-2/3
 * @property {'country'|'state'|'city'} granularity_level
 * @property {string} timezone - IANA timezone
 * @property {string} currency_code - ISO 4217
 * @property {number} work_week_start - 0=Sunday, 6=Saturday
 * @property {number} work_week_end
 * @property {string} business_hours_start - HH:MM:SS
 * @property {string} business_hours_end
 * @property {Object} regulations - Region-specific regulations
 * @property {ScoringModifiers} scoring_modifiers - Q/T/L/E modifiers
 * @property {number} sales_cycle_multiplier - 1.0 = baseline
 * @property {string[]} preferred_channels
 * @property {boolean} active
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} ScoringModifiers
 * @property {number} q_modifier - Quality score modifier (0.5-2.0)
 * @property {number} t_modifier - Timing score modifier
 * @property {number} l_modifier - Location score modifier
 * @property {number} e_modifier - Engagement score modifier
 */

/**
 * @typedef {Object} TerritoryDefinition
 * @property {string} territory_id - UUID
 * @property {string} region_id - Parent region UUID
 * @property {string} territory_code - e.g., 'US-CA', 'IN-MH-MUM'
 * @property {string} territory_name
 * @property {1|2|3} territory_level - 1=country, 2=state, 3=city
 * @property {string|null} parent_territory_id
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} population_estimate
 * @property {string|null} timezone_override
 * @property {Object} metadata
 * @property {boolean} active
 */

/**
 * @typedef {Object} TenantRegionBinding
 * @property {string} binding_id - UUID
 * @property {string} tenant_id - UUID
 * @property {string} region_id - UUID
 * @property {boolean} is_default
 * @property {string[]} coverage_territories - Territory codes this tenant covers
 * @property {ScoringModifiers|null} custom_scoring_modifiers
 * @property {number|null} custom_sales_cycle_multiplier
 * @property {string[]|null} custom_preferred_channels
 * @property {boolean} active
 */

/**
 * @typedef {Object} RegionScoreModifier
 * @property {string} modifier_id - UUID
 * @property {string} region_id - UUID
 * @property {string|null} vertical_id - e.g., 'banking_employee', null for default
 * @property {number} q_modifier
 * @property {number} t_modifier
 * @property {number} l_modifier
 * @property {number} e_modifier
 * @property {number} stakeholder_depth_norm - Expected stakeholder count
 * @property {string} notes
 */

/**
 * @typedef {Object} RegionTimingPack
 * @property {string} pack_id - UUID
 * @property {string} region_id - UUID
 * @property {string} pack_name - e.g., 'default', 'west_coast'
 * @property {number[]} optimal_days - 0-6, day of week
 * @property {string} optimal_hours_start - HH:MM:SS
 * @property {string} optimal_hours_end
 * @property {number} contact_frequency_days
 * @property {number} follow_up_delay_days
 * @property {number} max_attempts
 * @property {Object} metadata
 */

/**
 * @typedef {Object} RegionContext
 * @property {RegionProfile} region - The active region profile
 * @property {TerritoryDefinition|null} territory - Resolved territory (if granular)
 * @property {TenantRegionBinding|null} binding - Tenant's region binding
 * @property {ScoringModifiers} effectiveModifiers - Combined modifiers
 * @property {RegionTimingPack} timingPack - Active timing pack
 * @property {string} source - How region was determined: 'header', 'query', 'tenant_default', 'system_default'
 */

/**
 * @typedef {Object} ReachabilityResult
 * @property {boolean} reachable - Whether lead is within reach
 * @property {string} reason - Explanation
 * @property {number} distance_score - 0-1, how close to ideal coverage
 * @property {string[]} matched_territories - Territories that matched
 * @property {Object} coverage_details
 */

/**
 * @typedef {Object} GeoResolution
 * @property {string} resolved_territory_code
 * @property {number} resolved_level - 1, 2, or 3
 * @property {string} display_name - Human-readable location
 * @property {TerritoryDefinition[]} hierarchy - Full path from country to resolved level
 * @property {number} confidence - 0-1
 */

// Export constants
export const GRANULARITY_LEVELS = {
  COUNTRY: 'country',
  STATE: 'state',
  CITY: 'city'
};

export const REGION_CODES = {
  UAE: 'UAE',
  INDIA: 'IND',
  USA: 'USA'
};

export const DEFAULT_REGION = 'UAE';

export const SCORING_MODIFIER_BOUNDS = {
  MIN: 0.5,
  MAX: 2.0,
  DEFAULT: 1.0
};

export const SALES_CYCLE_MULTIPLIER_BOUNDS = {
  MIN: 0.5,
  MAX: 2.0,
  DEFAULT: 1.0
};

export const CHANNEL_TYPES = [
  'email',
  'linkedin',
  'whatsapp',
  'phone',
  'sms'
];

export const WORK_DAYS = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6
};

// Default modifiers for fallback
export const DEFAULT_SCORING_MODIFIERS = {
  q_modifier: 1.0,
  t_modifier: 1.0,
  l_modifier: 1.0,
  e_modifier: 1.0
};

export const DEFAULT_TIMING_PACK = {
  optimal_days: [1, 2, 3, 4, 5], // Mon-Fri
  optimal_hours_start: '09:00:00',
  optimal_hours_end: '17:00:00',
  contact_frequency_days: 7,
  follow_up_delay_days: 3,
  max_attempts: 5
};
