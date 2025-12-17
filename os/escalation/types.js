/**
 * Escalation Contract Types (PRD v1.2 §6)
 *
 * Risk-based escalation thresholds:
 * - ≥0.3: Add disclaimer
 * - ≥0.7: Escalate to supervisor
 * - ≥0.9: Block action
 *
 * PRD §6.1: "Every SIVA output has risk score"
 * PRD §6.2: "Escalation rules are non-negotiable"
 */

/**
 * Risk Thresholds (PRD §6.2)
 * @readonly
 */
export const RISK_THRESHOLDS = Object.freeze({
  DISCLAIMER: 0.3,    // Add disclaimer to output
  ESCALATE: 0.7,      // Escalate to supervisor queue
  BLOCK: 0.9,         // Block the action entirely
});

/**
 * Escalation Actions
 * @enum {string}
 */
export const ESCALATION_ACTIONS = {
  ALLOW: 'allow',           // No escalation needed
  DISCLAIMER: 'disclaimer', // Add disclaimer but proceed
  ESCALATE: 'escalate',     // Queue for supervisor review
  BLOCK: 'block',           // Block the action
};

/**
 * Risk Categories
 * @enum {string}
 */
export const RISK_CATEGORIES = {
  // Compliance risks
  REGULATORY: 'regulatory',           // Regulatory compliance risk
  DATA_PRIVACY: 'data_privacy',       // PII/data privacy risk
  FINANCIAL: 'financial',             // Financial advice risk

  // Reputational risks
  BRAND: 'brand',                     // Brand reputation risk
  CUSTOMER_HARM: 'customer_harm',     // Risk of customer harm
  MISINFORMATION: 'misinformation',   // False/misleading info risk

  // Operational risks
  CONFIDENCE: 'confidence',           // Low confidence in decision
  STALE_DATA: 'stale_data',           // Using stale evidence
  INCOMPLETE: 'incomplete',           // Incomplete data

  // Technical risks
  HALLUCINATION: 'hallucination',     // LLM hallucination risk
  EDGE_CASE: 'edge_case',             // Edge case not covered
  SYSTEM_ERROR: 'system_error',       // System error risk
};

/**
 * Risk Factors for scoring
 * Each factor contributes to overall risk score
 */
export const RISK_FACTORS = {
  // High impact factors (0.3+ contribution)
  [RISK_CATEGORIES.REGULATORY]: {
    weight: 0.35,
    description: 'Potential regulatory violation',
    examples: ['Banking regulation violation', 'AML concern', 'KYC failure'],
  },
  [RISK_CATEGORIES.DATA_PRIVACY]: {
    weight: 0.30,
    description: 'PII or data privacy concern',
    examples: ['Sharing PII without consent', 'GDPR violation'],
  },
  [RISK_CATEGORIES.FINANCIAL]: {
    weight: 0.30,
    description: 'Financial advice or commitment risk',
    examples: ['Product recommendation without disclosure', 'Rate guarantee'],
  },

  // Medium impact factors (0.15-0.25 contribution)
  [RISK_CATEGORIES.BRAND]: {
    weight: 0.20,
    description: 'Brand reputation risk',
    examples: ['Inappropriate tone', 'Off-brand messaging'],
  },
  [RISK_CATEGORIES.CUSTOMER_HARM]: {
    weight: 0.25,
    description: 'Risk of customer harm',
    examples: ['Misleading product info', 'Pushy sales tactics'],
  },
  [RISK_CATEGORIES.MISINFORMATION]: {
    weight: 0.20,
    description: 'False or misleading information',
    examples: ['Incorrect product details', 'Wrong pricing'],
  },

  // Low impact factors (0.1-0.15 contribution)
  [RISK_CATEGORIES.CONFIDENCE]: {
    weight: 0.15,
    description: 'Low confidence in decision',
    examples: ['Confidence below 0.7', 'Multiple conflicting signals'],
  },
  [RISK_CATEGORIES.STALE_DATA]: {
    weight: 0.10,
    description: 'Using stale evidence',
    examples: ['Evidence past TTL', 'Outdated company info'],
  },
  [RISK_CATEGORIES.INCOMPLETE]: {
    weight: 0.10,
    description: 'Incomplete information',
    examples: ['Missing required fields', 'Partial enrichment'],
  },

  // Technical factors (0.1-0.2 contribution)
  [RISK_CATEGORIES.HALLUCINATION]: {
    weight: 0.20,
    description: 'LLM hallucination detected',
    examples: ['Fabricated facts', 'Non-existent products'],
  },
  [RISK_CATEGORIES.EDGE_CASE]: {
    weight: 0.15,
    description: 'Edge case not covered by policy',
    examples: ['Unusual company type', 'Rare signal combination'],
  },
  [RISK_CATEGORIES.SYSTEM_ERROR]: {
    weight: 0.15,
    description: 'System or technical error',
    examples: ['API timeout', 'Enrichment failure'],
  },
};

/**
 * Escalation Targets
 * @enum {string}
 */
export const ESCALATION_TARGETS = {
  SUPERVISOR_QUEUE: 'supervisor_queue',
  COMPLIANCE_QUEUE: 'compliance_queue',
  MANAGER_QUEUE: 'manager_queue',
  AUDIT_LOG: 'audit_log',
};

/**
 * Disclaimer Templates
 */
export const DISCLAIMER_TEMPLATES = {
  REGULATORY: 'This information is provided for general guidance only. Please consult with compliance for specific regulatory requirements.',
  FINANCIAL: 'This is not financial advice. Product terms and conditions apply. Please verify details before proceeding.',
  DATA_CONFIDENCE: 'This recommendation is based on limited data. Additional verification is recommended.',
  STALE_DATA: 'Some information may be outdated. Please verify current details before taking action.',
  DEFAULT: 'Please verify this information before taking any action.',
};

/**
 * Escalation Rule
 * @typedef {Object} EscalationRule
 * @property {string} id - Rule identifier
 * @property {string} name - Human-readable name
 * @property {string} category - RISK_CATEGORIES enum
 * @property {number} threshold - Risk score threshold
 * @property {string} action - ESCALATION_ACTIONS enum
 * @property {string} target - ESCALATION_TARGETS enum
 * @property {string} disclaimer - Disclaimer text
 * @property {boolean} enabled - Whether rule is active
 */

/**
 * Risk Assessment
 * @typedef {Object} RiskAssessment
 * @property {number} total_risk - Combined risk score (0-1)
 * @property {string} action - ESCALATION_ACTIONS enum
 * @property {Object[]} factors - Contributing risk factors
 * @property {string[]} disclaimers - Applicable disclaimers
 * @property {string} target - Escalation target if escalating
 * @property {string} reason - Human-readable reason
 */

export default {
  RISK_THRESHOLDS,
  ESCALATION_ACTIONS,
  RISK_CATEGORIES,
  RISK_FACTORS,
  ESCALATION_TARGETS,
  DISCLAIMER_TEMPLATES,
};
