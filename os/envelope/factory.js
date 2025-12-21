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

  // Validate canonical persona OR accept UUID persona with overrides
  const validPersonaIds = Object.values(CANONICAL_PERSONAS);
  const isCanonicalPersona = validPersonaIds.includes(persona_id);
  const isUuidPersona = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(persona_id);

  if (!isCanonicalPersona && !isUuidPersona) {
    throw new Error(`Invalid persona_id: ${persona_id}. Must be canonical (1-7) or valid UUID.`);
  }

  // Get persona capabilities - use overrides for UUID personas
  let capabilities;
  if (isCanonicalPersona) {
    capabilities = PERSONA_CAPABILITIES[persona_id];
    if (!capabilities) {
      throw new Error(`No capabilities defined for persona_id: ${persona_id}`);
    }
  } else {
    // UUID persona - must have allowed_tools in overrides
    if (!overrides.allowed_tools || overrides.allowed_tools.length === 0) {
      throw new Error(`UUID persona ${persona_id} requires overrides.allowed_tools`);
    }
    // Use default capabilities for UUID personas
    capabilities = {
      allowed_intents: ['discovery', 'scoring', 'ranking', 'qualification'],
      forbidden_outputs: ['pii', 'competitors_internal'],
      max_tokens: 4000,
      max_cost_usd: 0.50,
      model_tier: 'standard',
      memory_days: 30,
      stateless: false,
    };
  }

  // For UUID personas, use defaults for helper functions
  const effectivePersonaId = isCanonicalPersona ? persona_id : '2'; // Default to RM persona for UUID

  // Build envelope without hash
  const envelope = {
    envelope_version: ENVELOPE_VERSION,
    tenant_id,
    user_id,
    persona_id,  // Keep original UUID or canonical ID
    vertical,
    sub_vertical,
    region,

    // Persona-bound capabilities
    allowed_intents: overrides.allowed_intents || capabilities.allowed_intents,
    forbidden_outputs: overrides.forbidden_outputs || capabilities.forbidden_outputs,
    allowed_tools: overrides.allowed_tools || getAllowedToolsForPersona(effectivePersonaId),

    // Scopes
    evidence_scope: {
      show_raw_evidence: !isCanonicalPersona || persona_id !== '1',
      show_provenance: !isCanonicalPersona || ['2', '3', '5'].includes(persona_id),
      max_evidence_age_days: capabilities.memory_days || 30,
      allowed_sources: getEvidenceSourcesForPersona(effectivePersonaId),
    },

    memory_scope: {
      max_days: capabilities.memory_days,
      stateless: capabilities.stateless,
      summarized_only: isCanonicalPersona && persona_id === '1',
    },

    // Budgets
    cost_budget: {
      max_tokens: overrides.max_tokens || capabilities.max_tokens,
      max_cost_usd: overrides.max_cost_usd || capabilities.max_cost_usd,
      model_tier: overrides.model_tier || capabilities.model_tier,
    },

    latency_budget: {
      p95_ms: getLatencyBudgetForPersona(effectivePersonaId).p95_ms,
      timeout_ms: getLatencyBudgetForPersona(effectivePersonaId).timeout_ms,
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

  // Use valid UUID fallbacks (required for DB audit log)
  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

  return createEnvelope({
    tenant_id: tenant_id || DEFAULT_TENANT_ID,
    user_id: user_id || DEFAULT_USER_ID,
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
