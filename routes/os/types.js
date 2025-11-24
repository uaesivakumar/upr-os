/**
 * UPR OS Type Definitions and Schemas
 * Sprint 64: Unified OS API Layer
 *
 * Defines the shared OS response schema and type constants
 */

/**
 * Standard OS Response Schema
 * All OS endpoints return this consistent format
 *
 * @typedef {Object} OSResponse
 * @property {boolean} success - Whether the operation succeeded
 * @property {*} data - The response payload (type varies by endpoint)
 * @property {string|null} reason - Human-readable explanation of result
 * @property {number} confidence - Confidence score 0-100
 * @property {string} profile - The OS profile used (e.g., 'default', 'banking', 'insurance')
 * @property {Object} meta - Metadata about the operation
 * @property {string} meta.os_version - OS version
 * @property {string} meta.endpoint - The endpoint called
 * @property {number} meta.execution_time_ms - Time taken in milliseconds
 * @property {string} meta.request_id - Unique request identifier
 * @property {string} meta.timestamp - ISO timestamp
 */

export const OS_VERSION = '1.0.0';

export const OS_PROFILES = {
  DEFAULT: 'default',
  BANKING_EMPLOYEE: 'banking_employee',
  BANKING_CORPORATE: 'banking_corporate',
  INSURANCE_INDIVIDUAL: 'insurance_individual',
  RECRUITMENT_HIRING: 'recruitment_hiring',
  SAAS_B2B: 'saas_b2b'
};

export const PIPELINE_MODES = {
  DISCOVERY_ONLY: 'discovery_only',
  DISCOVERY_TO_ENRICH: 'discovery_to_enrich',
  DISCOVERY_TO_SCORE: 'discovery_to_score',
  DISCOVERY_TO_RANK: 'discovery_to_rank',
  DISCOVERY_TO_OUTREACH: 'discovery_to_outreach',
  FULL_PIPELINE: 'full_pipeline'
};

export const ENTITY_TYPES = {
  COMPANY: 'company',
  INDIVIDUAL: 'individual',
  HYBRID: 'hybrid'
};

export const SCORE_TYPES = {
  Q_SCORE: 'q_score',      // Quality Score
  T_SCORE: 't_score',      // Timing Score
  L_SCORE: 'l_score',      // Lead Score
  E_SCORE: 'e_score',      // Evidence/Composite Score
  COMPOSITE: 'composite'   // All scores combined
};

/**
 * Create a standard OS response
 * @param {Object} params Response parameters
 * @returns {OSResponse} Standardized OS response
 */
export function createOSResponse({
  success,
  data,
  reason = null,
  confidence = 100,
  profile = OS_PROFILES.DEFAULT,
  endpoint,
  executionTimeMs,
  requestId
}) {
  return {
    success,
    data,
    reason,
    confidence,
    profile,
    meta: {
      os_version: OS_VERSION,
      endpoint,
      execution_time_ms: executionTimeMs,
      request_id: requestId,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Create an OS error response
 * @param {Object} params Error parameters
 * @returns {OSResponse} Standardized error response
 */
export function createOSError({
  error,
  code = 'OS_ERROR',
  endpoint,
  executionTimeMs,
  requestId
}) {
  return {
    success: false,
    data: null,
    reason: error,
    confidence: 0,
    profile: null,
    error_code: code,
    meta: {
      os_version: OS_VERSION,
      endpoint,
      execution_time_ms: executionTimeMs,
      request_id: requestId,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Validate tenant context
 * @param {Object} req Express request
 * @returns {string} Tenant ID
 */
export function getTenantId(req) {
  return req.user?.tenant_id ||
         req.body?.tenant_id ||
         req.query?.tenant_id ||
         '00000000-0000-0000-0000-000000000001';
}

/**
 * Generate unique request ID
 * @returns {string} UUID v4
 */
export function generateRequestId() {
  return 'os-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Simple response wrapper for backward compatibility
 */
export function osResponse(data) {
  return {
    success: true,
    ...data,
    meta: {
      os_version: OS_VERSION,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Simple error wrapper for backward compatibility
 */
export function osError(message, code = 'OS_ERROR') {
  return {
    success: false,
    error: message,
    error_code: code,
    meta: {
      os_version: OS_VERSION,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Operation types constant for backward compatibility
 */
export const OS_OPERATION_TYPES = {
  DISCOVERY: 'discovery',
  ENRICH: 'enrich',
  SCORE: 'score',
  RANK: 'rank',
  OUTREACH: 'outreach',
  PIPELINE: 'pipeline',
  SETTINGS: 'settings'
};
