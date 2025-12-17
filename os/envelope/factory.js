/**
 * Sealed Context Envelope Factory (PRD v1.2 §2)
 *
 * Generates sealed, versioned context envelopes for SIVA invocations.
 * Envelopes are immutable once created and include SHA256 hash for integrity.
 */

import crypto from 'crypto';
import {
  ENVELOPE_VERSION,
  CANONICAL_PERSONAS,
  PERSONA_CAPABILITIES,
  DEFAULT_ESCALATION_RULES,
} from './types.js';

/**
 * Create a sealed context envelope for SIVA invocation
 *
 * @param {Object} params - Envelope parameters
 * @param {string} params.tenant_id - Tenant identifier
 * @param {string} params.user_id - User identifier
 * @param {string} params.persona_id - Canonical persona ID (1-7)
 * @param {string} params.vertical - Vertical (e.g., "banking")
 * @param {string} params.sub_vertical - Sub-vertical (e.g., "employee_banking")
 * @param {string} params.region - Region code (e.g., "UAE")
 * @param {Object} [params.overrides] - Optional overrides for persona capabilities
 * @returns {Object} Sealed context envelope with SHA256 hash
 */
export function createEnvelope(params) {
  const {
    tenant_id,
    user_id,
    persona_id,
    vertical,
    sub_vertical,
    region,
    overrides = {},
  } = params;

  // Validate canonical persona
  const validPersonaIds = Object.values(CANONICAL_PERSONAS);
  if (!validPersonaIds.includes(persona_id)) {
    throw new Error(`Invalid persona_id: ${persona_id}. Must be one of: ${validPersonaIds.join(', ')}`);
  }

  // Get persona capabilities
  const capabilities = PERSONA_CAPABILITIES[persona_id];
  if (!capabilities) {
    throw new Error(`No capabilities defined for persona_id: ${persona_id}`);
  }

  // Build envelope without hash
  const envelope = {
    envelope_version: ENVELOPE_VERSION,
    tenant_id,
    user_id,
    persona_id,
    vertical,
    sub_vertical,
    region,

    // Persona-bound capabilities
    allowed_intents: overrides.allowed_intents || capabilities.allowed_intents,
    forbidden_outputs: overrides.forbidden_outputs || capabilities.forbidden_outputs,
    allowed_tools: overrides.allowed_tools || getAllowedToolsForPersona(persona_id),

    // Scopes
    evidence_scope: {
      show_raw_evidence: persona_id !== '1', // Not for customer-facing
      show_provenance: ['2', '3', '5'].includes(persona_id), // Sales, Supervisor, Compliance
      max_evidence_age_days: capabilities.memory_days || 30,
      allowed_sources: getEvidenceSourcesForPersona(persona_id),
    },

    memory_scope: {
      max_days: capabilities.memory_days,
      stateless: capabilities.stateless,
      summarized_only: persona_id === '1', // Customer-facing gets summarized only
    },

    // Budgets
    cost_budget: {
      max_tokens: overrides.max_tokens || capabilities.max_tokens,
      max_cost_usd: overrides.max_cost_usd || capabilities.max_cost_usd,
      model_tier: overrides.model_tier || capabilities.model_tier,
    },

    latency_budget: {
      p95_ms: getLatencyBudgetForPersona(persona_id).p95_ms,
      timeout_ms: getLatencyBudgetForPersona(persona_id).timeout_ms,
    },

    // Rules
    escalation_rules: overrides.escalation_rules || DEFAULT_ESCALATION_RULES,

    disclaimer_rules: {
      required_topics: ['rates', 'approvals', 'guarantees', 'commitments'],
      disclaimer_template: 'This information is for reference only and does not constitute an offer or commitment.',
    },

    // Timestamp
    timestamp: new Date().toISOString(),
  };

  // Calculate SHA256 hash of envelope contents
  const hashContent = JSON.stringify(envelope);
  const sha256_hash = crypto.createHash('sha256').update(hashContent).digest('hex');

  // Return immutable sealed envelope
  return Object.freeze({
    ...envelope,
    sha256_hash,
  });
}

/**
 * Get allowed tools for a persona
 */
function getAllowedToolsForPersona(persona_id) {
  const baseTools = [
    'CompanyQualityTool',
    'TimingScoreTool',
    'EdgeCasesTool',
  ];

  const personaTools = {
    '1': baseTools, // Customer-facing - minimal
    '2': [ // Sales-Rep - full SIVA toolkit
      ...baseTools,
      'ContactTierTool',
      'BankingProductMatchTool',
      'OutreachChannelTool',
      'OpeningContextTool',
      'CompositeScoreTool',
      'OutreachMessageGeneratorTool',
      'FollowUpStrategyTool',
      'ObjectionHandlerTool',
      'RelationshipTrackerTool',
    ],
    '3': [ // Supervisor - scoring and review
      ...baseTools,
      'ContactTierTool',
      'CompositeScoreTool',
    ],
    '4': baseTools, // Admin - minimal
    '5': [ // Compliance - audit tools
      ...baseTools,
      'CompositeScoreTool',
    ],
    '6': [ // Integration - API tools
      ...baseTools,
      'CompositeScoreTool',
    ],
    '7': [ // Internal - same as Sales-Rep (tenant-level constraints apply)
      ...baseTools,
      'ContactTierTool',
      'BankingProductMatchTool',
      'OutreachChannelTool',
      'OpeningContextTool',
      'CompositeScoreTool',
      'OutreachMessageGeneratorTool',
      'FollowUpStrategyTool',
      'ObjectionHandlerTool',
      'RelationshipTrackerTool',
    ],
  };

  return personaTools[persona_id] || baseTools;
}

/**
 * Get evidence sources allowed for a persona
 */
function getEvidenceSourcesForPersona(persona_id) {
  const allSources = ['linkedin', 'apollo', 'clearbit', 'serp', 'news', 'crunchbase', 'manual'];

  if (persona_id === '1') {
    return []; // Customer-facing gets no raw evidence
  }

  // NOTE: Persona 7 (Internal) gets same sources as Sales-Rep.
  // Shadow Tenant data constraints are enforced at tenant level, not persona level.
  // See: docs/SHADOW_TENANT.md

  return allSources;
}

/**
 * Get latency budget for a persona per PRD §9.1
 */
function getLatencyBudgetForPersona(persona_id) {
  // PRD §9.1: SaaS: p95 < 200ms, WhatsApp: p99 < 2s
  if (persona_id === '1') {
    // WhatsApp / Customer-facing
    return { p95_ms: 2000, timeout_ms: 5000 };
  }

  // SaaS personas
  return { p95_ms: 200, timeout_ms: 30000 };
}

/**
 * Create envelope from HTTP request context
 * Used by middleware to auto-generate envelope from request
 */
export function createEnvelopeFromRequest(req) {
  const {
    tenant_id,
    user_id,
    persona_id = '2', // Default to Sales-Rep
  } = req.authContext || {};

  const {
    vertical = 'banking',
    sub_vertical = 'employee_banking',
    region = 'UAE',
  } = req.body?.sales_context || req.body || {};

  return createEnvelope({
    tenant_id: tenant_id || 'unknown',
    user_id: user_id || 'unknown',
    persona_id,
    vertical,
    sub_vertical,
    region,
  });
}

export default {
  createEnvelope,
  createEnvelopeFromRequest,
};
