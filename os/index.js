/**
 * UPR OS - Intelligence Engine (S143-S146, PRD v1.2)
 *
 * Main entry point for the OS module.
 *
 * S143: SIVA Tools v1
 * - Tool registry with typed inputs/outputs
 * - scoreTool, searchTool, prioritizeTool
 *
 * S144: Banking Intelligence
 * - Pack-driven QTLE scoring
 * - Employee Banking pack configuration
 *
 * S145: Signal Pipeline v2
 * - Signal → Evidence → Object Intelligence
 * - Deduplication by company_id + signal_type + time window
 * - Centralized freshness scoring
 *
 * S146: API Hardening
 * - Rate limiting per endpoint
 * - Typed error envelopes (OSResponse)
 * - Correlation IDs
 * - Structured error logging
 *
 * PRD v1.2 §2: Sealed Context Envelope
 * - Every SIVA invocation requires sealed envelope
 * - Envelope validation before SIVA calls
 * - Envelope hash stored in audit logs
 */

// Tools
export * from "./tools";
export { toolRegistry } from "./tools/registry";

// Packs
export * from "./packs/packLoader";
export { packLoader } from "./packs/packLoader";

// Pipeline
export * from "./pipeline";
export { signalPipeline } from "./pipeline/signalPipeline";

// Middleware
export * from "./middleware";
export { apiHardening } from "./middleware/apiHardening";

// Sealed Context Envelope (PRD v1.2 §2)
export * from "./envelope";
export {
  createEnvelope,
  createEnvelopeFromRequest,
  validateEnvelope,
  envelopeMiddleware,
  toolGateMiddleware,
  requireEnvelope,
  CANONICAL_PERSONAS,
  ENVELOPE_VERSION,
} from "./envelope";

// Evidence System (PRD v1.2 §5)
export * from "./evidence";
export {
  EVIDENCE_TYPES,
  TRANSFORM_OPS,
  FRESHNESS_TTL,
  QUALITY_LEVELS,
  createEvidence,
  createTransformedEvidence,
  createSIVAEvidence,
  validateEvidence,
  isUsableForSIVA,
} from "./evidence";

// Escalation Contract (PRD v1.2 §6)
export * from "./escalation";
export {
  RISK_THRESHOLDS,
  ESCALATION_ACTIONS,
  RISK_CATEGORIES,
  assessRisk,
  applyEscalation,
  escalationMiddleware,
  preflightCheck,
} from "./escalation";

// Version info
export const OS_VERSION = {
  version: "1.2.0",
  prd_version: "1.2 FINAL",
  sprints: ["S143", "S144", "S145", "S146"],
  updated: "2025-12-17",
};
