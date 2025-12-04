/**
 * Persona Loader - Helper for SIVA Tools
 * Sprint 71: Sub-Vertical Personas
 *
 * Provides a simple interface for SIVA tools to load persona configurations.
 * Handles caching, fallbacks, and default values.
 */

const personaService = require('../../services/personaService');

// Default persona for fallback (EB)
const DEFAULT_SUB_VERTICAL = 'employee-banking';

// Fallback persona if database is unavailable
const FALLBACK_PERSONA = {
  sub_vertical_slug: 'employee-banking',
  persona_name: 'EB Sales Officer (Fallback)',
  entity_type: 'company',

  contact_priority_rules: {
    tiers: [
      { size_min: 0, size_max: 50, titles: ['Founder', 'COO'], priority: 1 },
      { size_min: 50, size_max: 500, titles: ['HR Director', 'HR Manager'], priority: 1 },
      { size_min: 500, size_max: null, titles: ['Payroll Manager', 'Benefits Coordinator'], priority: 1 }
    ]
  },

  edge_cases: {
    blockers: [
      { type: 'company_name', values: ['Etihad', 'Emirates', 'ADNOC', 'Emaar', 'DP World'], multiplier: 0.1 },
      { type: 'sector', values: ['government'], multiplier: 0.05 }
    ],
    boosters: [
      { type: 'license_type', values: ['Free Zone'], multiplier: 1.3 },
      { type: 'signal_recency', condition: 'days_since_signal < 30', multiplier: 1.5 }
    ]
  },

  timing_rules: {
    calendar: [
      { period: 'Q1', months: [1, 2], multiplier: 1.3 },
      { period: 'Ramadan', dynamic: true, multiplier: 0.3 },
      { period: 'Summer', months: [7, 8], multiplier: 0.7 },
      { period: 'Q4', months: [12], multiplier: 0.6 }
    ],
    signal_freshness: [
      { days_max: 7, multiplier: 1.5, label: 'HOT' },
      { days_max: 14, multiplier: 1.2, label: 'WARM' },
      { days_max: 30, multiplier: 1.0, label: 'RECENT' }
    ]
  },

  outreach_doctrine: {
    always: ['Reference specific company signal', 'Position as Point of Contact'],
    never: ['Mention pricing', 'Use pressure language'],
    tone: 'professional',
    formality: 'formal',
    channels: ['email', 'linkedin']
  },

  quality_standards: {
    min_confidence: 70,
    contact_cooldown_days: 90
  },

  scoring_config: {
    weights: { q_score: 0.25, t_score: 0.35, l_score: 0.20, e_score: 0.20 },
    thresholds: { hot: 80, warm: 60, cold: 40 }
  }
};

/**
 * Load persona for a sub-vertical
 *
 * @param {string} subVerticalSlug - Sub-vertical identifier
 * @returns {Promise<Object>} Persona object
 */
async function loadPersona(subVerticalSlug) {
  try {
    // Use default if not provided
    const slug = subVerticalSlug || DEFAULT_SUB_VERTICAL;

    // Try to load from service
    const persona = await personaService.getPersona(slug);

    if (persona) {
      return persona;
    }

    // Fallback to default
    console.warn(`[PersonaLoader] No persona found for ${slug}, using fallback`);
    return FALLBACK_PERSONA;

  } catch (error) {
    console.error(`[PersonaLoader] Error loading persona:`, error);
    // Return fallback on error
    return FALLBACK_PERSONA;
  }
}

/**
 * Get edge case rules from persona
 *
 * @param {Object} persona - Loaded persona
 * @returns {Object} Edge case configuration
 */
function getEdgeCases(persona) {
  return persona?.edge_cases || FALLBACK_PERSONA.edge_cases;
}

/**
 * Get timing rules from persona
 *
 * @param {Object} persona - Loaded persona
 * @returns {Object} Timing rules configuration
 */
function getTimingRules(persona) {
  return persona?.timing_rules || FALLBACK_PERSONA.timing_rules;
}

/**
 * Get contact priority rules from persona
 *
 * @param {Object} persona - Loaded persona
 * @returns {Object} Contact priority configuration
 */
function getContactPriorityRules(persona) {
  return persona?.contact_priority_rules || FALLBACK_PERSONA.contact_priority_rules;
}

/**
 * Get outreach doctrine from persona
 *
 * @param {Object} persona - Loaded persona
 * @returns {Object} Outreach doctrine configuration
 */
function getOutreachDoctrine(persona) {
  return persona?.outreach_doctrine || FALLBACK_PERSONA.outreach_doctrine;
}

/**
 * Get quality standards from persona
 *
 * @param {Object} persona - Loaded persona
 * @returns {Object} Quality standards configuration
 */
function getQualityStandards(persona) {
  return persona?.quality_standards || FALLBACK_PERSONA.quality_standards;
}

/**
 * Get scoring config from persona
 *
 * @param {Object} persona - Loaded persona
 * @returns {Object} Scoring configuration
 */
function getScoringConfig(persona) {
  return persona?.scoring_config || FALLBACK_PERSONA.scoring_config;
}

/**
 * Check if a value matches a blocker rule
 *
 * @param {Array} blockers - Blocker rules from persona
 * @param {string} type - Type of check (company_name, sector, status)
 * @param {*} value - Value to check
 * @returns {Object|null} Matching blocker or null
 */
function findBlocker(blockers, type, value) {
  if (!blockers || !Array.isArray(blockers)) return null;

  for (const blocker of blockers) {
    if (blocker.type !== type) continue;

    // Check if value matches
    if (Array.isArray(blocker.values)) {
      // Case-insensitive match for strings
      const normalizedValue = typeof value === 'string' ? value.toLowerCase() : value;
      const matches = blocker.values.some(v =>
        typeof v === 'string'
          ? normalizedValue.includes(v.toLowerCase()) || v.toLowerCase().includes(normalizedValue)
          : v === value
      );

      if (matches) {
        return blocker;
      }
    } else if (blocker.condition) {
      // Evaluate condition (simple implementation)
      // In production, use a proper expression evaluator
      console.log(`[PersonaLoader] Condition evaluation not yet implemented: ${blocker.condition}`);
    }
  }

  return null;
}

/**
 * Check if a value matches a booster rule
 *
 * @param {Array} boosters - Booster rules from persona
 * @param {string} type - Type of check
 * @param {*} value - Value to check
 * @param {Object} context - Additional context for condition evaluation
 * @returns {Object|null} Matching booster or null
 */
function findBooster(boosters, type, value, context = {}) {
  if (!boosters || !Array.isArray(boosters)) return null;

  for (const booster of boosters) {
    if (booster.type !== type) continue;

    // Check if value matches
    if (Array.isArray(booster.values)) {
      const normalizedValue = typeof value === 'string' ? value.toLowerCase() : value;
      const matches = booster.values.some(v =>
        typeof v === 'string'
          ? normalizedValue.includes(v.toLowerCase())
          : v === value
      );

      if (matches) {
        return booster;
      }
    } else if (booster.condition) {
      // Evaluate simple conditions
      if (booster.condition.includes('days_since_signal')) {
        const daysSince = context.days_since_signal || 999;
        const match = booster.condition.match(/days_since_signal\s*<\s*(\d+)/);
        if (match && daysSince < parseInt(match[1])) {
          return booster;
        }
      }
    }
  }

  return null;
}

/**
 * Get timing multiplier for current date
 *
 * @param {Object} persona - Loaded persona
 * @param {Date} date - Date to check (default: now)
 * @returns {Object} { multiplier, reason, period }
 */
function getTimingMultiplier(persona, date = new Date()) {
  const rules = getTimingRules(persona);
  const month = date.getMonth() + 1; // 1-12

  let result = { multiplier: 1.0, reason: 'Normal period', period: null };

  // Check calendar rules
  if (rules.calendar && Array.isArray(rules.calendar)) {
    for (const rule of rules.calendar) {
      // Skip dynamic rules (Ramadan, Eid) - need separate implementation
      if (rule.dynamic) continue;

      if (rule.months && rule.months.includes(month)) {
        result = {
          multiplier: rule.multiplier,
          reason: rule.reason || rule.period,
          period: rule.period
        };
        break;
      }
    }
  }

  return result;
}

/**
 * Get signal freshness multiplier
 *
 * @param {Object} persona - Loaded persona
 * @param {number} daysSinceSignal - Days since the signal
 * @returns {Object} { multiplier, label }
 */
function getSignalFreshnessMultiplier(persona, daysSinceSignal) {
  const rules = getTimingRules(persona);

  if (!rules.signal_freshness || !Array.isArray(rules.signal_freshness)) {
    return { multiplier: 1.0, label: 'UNKNOWN' };
  }

  // Sort by days_max ascending
  const sorted = [...rules.signal_freshness].sort((a, b) => a.days_max - b.days_max);

  for (const rule of sorted) {
    if (daysSinceSignal <= rule.days_max) {
      return {
        multiplier: rule.multiplier,
        label: rule.label
      };
    }
  }

  // If beyond all thresholds, use last one with decayed multiplier
  const last = sorted[sorted.length - 1];
  return {
    multiplier: last.multiplier * 0.5,
    label: 'STALE'
  };
}

/**
 * Get target titles for a company size
 *
 * @param {Object} persona - Loaded persona
 * @param {number} companySize - Company employee count
 * @returns {Array<string>} Target titles
 */
function getTargetTitles(persona, companySize) {
  const rules = getContactPriorityRules(persona);

  if (!rules.tiers || !Array.isArray(rules.tiers)) {
    return ['HR Manager', 'HR Director']; // Default fallback
  }

  for (const tier of rules.tiers) {
    const minSize = tier.size_min || 0;
    const maxSize = tier.size_max || Infinity;

    if (companySize >= minSize && companySize <= maxSize) {
      return tier.titles || [];
    }
  }

  // Return fallback titles if no tier matches
  return rules.fallback_titles || ['HR Manager'];
}

module.exports = {
  loadPersona,
  getEdgeCases,
  getTimingRules,
  getContactPriorityRules,
  getOutreachDoctrine,
  getQualityStandards,
  getScoringConfig,
  findBlocker,
  findBooster,
  getTimingMultiplier,
  getSignalFreshnessMultiplier,
  getTargetTitles,
  FALLBACK_PERSONA,
  DEFAULT_SUB_VERTICAL
};
