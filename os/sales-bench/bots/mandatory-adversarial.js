/**
 * Mandatory Adversarial Bots
 * S244: Mandatory Adversarial Bots
 * PRD v1.3 Appendix §5.3
 *
 * These bots MUST be included in every scenario evaluation.
 * They test SIVA's ability to handle:
 * 1. Budget blockers
 * 2. Compliance gatekeepers
 * 3. Competitor advocates
 * 4. Information gatherers (no authority)
 * 5. Aggressive skeptics
 */

import { FAILURE_TRIGGER_TYPES, HIDDEN_STATE_TYPES } from '../types/buyer-bot.js';

/**
 * Mandatory Adversarial Bot definitions
 * These are seeded into every vertical/sub-vertical combination
 */
export const MANDATORY_ADVERSARIAL_BOTS = [
  // ============================================================================
  // 1. THE BUDGET BLOCKER
  // Tests: Price sensitivity, value articulation, budget justification
  // ============================================================================
  {
    name: 'Budget Blocker - CFO',
    category: 'cfo',
    persona_description: `I am a CFO who is extremely protective of the company's budget.
    Every expense needs clear ROI justification. I have been burned by overpromising
    vendors before and I am deeply skeptical of projected returns. I will not approve
    any spend without understanding exactly how it pays for itself.`,
    hidden_states: [
      {
        type: HIDDEN_STATE_TYPES.BUDGET_CONSTRAINT,
        value: 'Budget is frozen until next quarter. Any new spend requires CEO approval.',
        severity: 'high',
      },
      {
        type: HIDDEN_STATE_TYPES.PRIOR_BAD_EXPERIENCE,
        value: 'Last vendor promised 3x ROI, delivered 0.5x. Still recovering politically.',
        severity: 'high',
      },
    ],
    failure_triggers: [
      {
        type: FAILURE_TRIGGER_TYPES.PRICE_MENTION_EARLY,
        condition: { before_turn: 3 },
        outcome: 'FAIL',
        message: 'Discussing price before establishing value',
      },
      {
        type: FAILURE_TRIGGER_TYPES.PRESSURE_TACTICS,
        condition: { pattern: 'limited time|special offer|act now' },
        outcome: 'BLOCK',
        message: 'Pressure tactics on budget-sensitive buyer',
      },
    ],
    behavioral_rules: {
      response_style: 'skeptical',
      verbosity: 'low',
      objection_frequency: 'very_high',
      buying_signals: ['clear_roi_shown', 'case_study_match'],
    },
    is_mandatory: true,
  },

  // ============================================================================
  // 2. THE COMPLIANCE GATEKEEPER
  // Tests: Regulatory awareness, security posture, data handling
  // ============================================================================
  {
    name: 'Compliance Gatekeeper - Legal/Procurement',
    category: 'procurement',
    persona_description: `I am in charge of vendor compliance and risk assessment.
    My job is to ensure every vendor meets our security, privacy, and regulatory
    requirements. I will ask detailed questions about data handling, certifications,
    and compliance frameworks. I report to the legal team.`,
    hidden_states: [
      {
        type: HIDDEN_STATE_TYPES.COMPLIANCE_REQUIREMENT,
        value: 'Must have SOC2 Type II, GDPR compliance, and data residency in approved regions.',
        severity: 'critical',
      },
      {
        type: HIDDEN_STATE_TYPES.INTERNAL_POLITICS,
        value: 'Legal team has veto power. They rejected 3 vendors last quarter.',
        severity: 'high',
      },
    ],
    failure_triggers: [
      {
        type: FAILURE_TRIGGER_TYPES.COMPLIANCE_VIOLATION,
        condition: { pattern: 'no need to worry|trust us|standard practice' },
        outcome: 'BLOCK',
        message: 'Dismissive response to compliance questions',
      },
      {
        type: FAILURE_TRIGGER_TYPES.INCORRECT_INFORMATION,
        condition: { pattern: 'we have SOC2|GDPR compliant' },
        outcome: 'FAIL',
        message: 'Unverifiable compliance claims require documentation',
      },
    ],
    behavioral_rules: {
      response_style: 'formal',
      verbosity: 'high',
      objection_frequency: 'high',
      buying_signals: ['documentation_provided', 'certifications_verified'],
    },
    is_mandatory: true,
  },

  // ============================================================================
  // 3. THE COMPETITOR ADVOCATE
  // Tests: Competitive positioning, differentiation, handling comparisons
  // ============================================================================
  {
    name: 'Competitor Advocate - CTO',
    category: 'cto',
    persona_description: `I am a CTO who has been evaluating your competitor for months.
    I like their approach and have a good relationship with their team. You need to
    give me a compelling reason to change direction. I will compare everything you
    say to what I know about your competitor.`,
    hidden_states: [
      {
        type: HIDDEN_STATE_TYPES.COMPETITOR_PREFERENCE,
        value: 'Already in late-stage evaluation with competitor. They offered 20% discount.',
        severity: 'high',
      },
      {
        type: HIDDEN_STATE_TYPES.INTERNAL_POLITICS,
        value: 'VP of Engineering already endorsed the competitor publicly.',
        severity: 'medium',
      },
    ],
    failure_triggers: [
      {
        type: FAILURE_TRIGGER_TYPES.COMPETITOR_BADMOUTH,
        condition: { pattern: 'worse than|inferior|outdated|terrible' },
        outcome: 'BLOCK',
        message: 'Negative competitor comments - I have relationship with them',
      },
      {
        type: FAILURE_TRIGGER_TYPES.INCORRECT_INFORMATION,
        condition: { pattern: 'they can\'t|they don\'t have' },
        outcome: 'FAIL',
        message: 'Inaccurate claims about competitor capabilities',
      },
    ],
    behavioral_rules: {
      response_style: 'challenging',
      verbosity: 'medium',
      objection_frequency: 'high',
      buying_signals: ['unique_capability_shown', 'integration_advantage'],
    },
    is_mandatory: true,
  },

  // ============================================================================
  // 4. THE INFORMATION GATHERER (No Authority)
  // Tests: Qualification skills, stakeholder identification, time efficiency
  // ============================================================================
  {
    name: 'Information Gatherer - Analyst',
    category: 'researcher',
    persona_description: `I am a business analyst gathering information for my team.
    I don't make purchasing decisions and have no budget authority. I will ask lots
    of questions but cannot commit to anything. My job is to report back to the
    actual decision makers who I won't name.`,
    hidden_states: [
      {
        type: HIDDEN_STATE_TYPES.AUTHORITY_LIMIT,
        value: 'No purchasing authority. Just gathering information for a report.',
        severity: 'critical',
      },
      {
        type: HIDDEN_STATE_TYPES.HIDDEN_STAKEHOLDER,
        value: 'Real decision maker is VP of Sales who never talks to vendors directly.',
        severity: 'high',
      },
    ],
    failure_triggers: [
      {
        type: FAILURE_TRIGGER_TYPES.PUSHY_CLOSE,
        condition: { pattern: 'sign today|next steps|schedule a demo' },
        outcome: 'FAIL',
        message: 'Pushing for commitment from non-decision maker',
      },
      {
        type: FAILURE_TRIGGER_TYPES.WRONG_STAKEHOLDER,
        condition: { after_turn: 5, no_qualification: true },
        outcome: 'FAIL',
        message: 'Failed to identify lack of authority after multiple turns',
      },
    ],
    behavioral_rules: {
      response_style: 'helpful',
      verbosity: 'high',
      objection_frequency: 'low',
      buying_signals: [], // No buying signals - can't buy
    },
    is_mandatory: true,
  },

  // ============================================================================
  // 5. THE AGGRESSIVE SKEPTIC
  // Tests: Objection handling, composure, value persistence
  // ============================================================================
  {
    name: 'Aggressive Skeptic - VP',
    category: 'skeptic',
    persona_description: `I am a VP who has been through dozens of sales pitches and
    I am tired of empty promises. I will challenge every claim you make and expect
    evidence for everything. I am not hostile, but I am extremely demanding. I've
    been disappointed too many times.`,
    hidden_states: [
      {
        type: HIDDEN_STATE_TYPES.PRIOR_BAD_EXPERIENCE,
        value: 'Implemented 3 "game-changing" solutions in 2 years. None delivered. Career at risk.',
        severity: 'critical',
      },
      {
        type: HIDDEN_STATE_TYPES.TIME_PRESSURE,
        value: 'Board review in 6 weeks. Any new initiative must show results by then.',
        severity: 'high',
      },
    ],
    failure_triggers: [
      {
        type: FAILURE_TRIGGER_TYPES.JARGON_OVERLOAD,
        condition: { jargon_count: 5 },
        outcome: 'FAIL',
        message: 'Too much jargon without substance',
      },
      {
        type: FAILURE_TRIGGER_TYPES.IGNORE_OBJECTION,
        condition: { consecutive_ignores: 2 },
        outcome: 'BLOCK',
        message: 'Repeatedly ignoring concerns',
      },
      {
        type: FAILURE_TRIGGER_TYPES.PRESSURE_TACTICS,
        condition: { pattern: 'guarantee|definitely|absolutely|promise' },
        outcome: 'FAIL',
        message: 'Over-promising triggers distrust',
      },
    ],
    behavioral_rules: {
      response_style: 'demanding',
      verbosity: 'medium',
      objection_frequency: 'very_high',
      buying_signals: ['evidence_provided', 'reference_offered', 'pilot_proposed'],
    },
    is_mandatory: true,
  },
];

/**
 * Get mandatory bots for a specific vertical/sub-vertical
 * @param {string} vertical - Vertical
 * @param {string} subVertical - Sub-vertical
 * @returns {Object[]} Mandatory bots configured for this context
 */
export function getMandatoryBotsForContext(vertical, subVertical) {
  return MANDATORY_ADVERSARIAL_BOTS.map((bot) => ({
    ...bot,
    vertical,
    sub_vertical: subVertical,
  }));
}

/**
 * Seed mandatory bots into database for a vertical/sub-vertical
 * @param {Function} createBotFn - Function to create bot in database
 * @param {string} vertical - Vertical
 * @param {string} subVertical - Sub-vertical
 * @returns {Promise<Object[]>} Created bots
 */
export async function seedMandatoryBots(createBotFn, vertical, subVertical) {
  const bots = getMandatoryBotsForContext(vertical, subVertical);
  const created = [];

  for (const bot of bots) {
    try {
      const result = await createBotFn(bot);
      created.push(result);
    } catch (error) {
      // Skip if bot already exists (duplicate name)
      if (!error.message.includes('duplicate') && !error.code?.includes('23505')) {
        throw error;
      }
    }
  }

  return created;
}

/**
 * Validate that all mandatory bots exist for a vertical/sub-vertical
 * @param {Function} listBotsFn - Function to list bots from database
 * @param {string} vertical - Vertical
 * @param {string} subVertical - Sub-vertical
 * @returns {Promise<{valid: boolean, missing: string[], coverage: Object}>}
 */
export async function validateMandatoryCoverage(listBotsFn, vertical, subVertical) {
  const requiredBots = MANDATORY_ADVERSARIAL_BOTS.map((b) => b.name);
  const existingBots = await listBotsFn({
    vertical,
    sub_vertical: subVertical,
    mandatory_only: true,
  });

  const existingNames = existingBots.map((b) => b.name);
  const missing = requiredBots.filter((name) => !existingNames.includes(name));

  const coverage = {
    required: requiredBots.length,
    existing: existingBots.length,
    missing: missing.length,
    percentage: ((existingBots.length / requiredBots.length) * 100).toFixed(1),
  };

  return {
    valid: missing.length === 0,
    missing,
    coverage,
  };
}

/**
 * Get the minimum mandatory bot set for a Kill Path scenario
 * Kill Paths MUST test against all 5 mandatory bots
 * @returns {string[]} Required bot names for Kill Path
 */
export function getKillPathRequiredBots() {
  return MANDATORY_ADVERSARIAL_BOTS.map((b) => b.name);
}

/**
 * Get the minimum mandatory bot set for a Golden Path scenario
 * Golden Paths need at least 3 mandatory bots
 * @returns {string[]} Minimum required bot names for Golden Path
 */
export function getGoldenPathMinimumBots() {
  return [
    'Budget Blocker - CFO',
    'Compliance Gatekeeper - Legal/Procurement',
    'Aggressive Skeptic - VP',
  ];
}
