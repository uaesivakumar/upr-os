/**
 * UPR OS - Intelligence Engine (S143-S146)
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

// Version info
export const OS_VERSION = {
  version: "1.0.0",
  sprints: ["S143", "S144", "S145", "S146"],
  updated: "2025-12-09",
};
