/**
 * SIVA Sales Context Enforcement Service
 * VS4: SalesContext Enforcement
 *
 * Ensures SIVA always operates within the correct sales context:
 * - Validates vertical/sub-vertical/region
 * - Blocks operations without valid context
 * - Enforces context boundaries
 * - Logs context violations
 *
 * Authorization Code: VS1-VS9-APPROVED-20251213
 */

import db from '../../utils/db.js';
import * as Sentry from '@sentry/node';

const { pool } = db;

// ============================================================================
// VALID CONTEXT DEFINITIONS
// ============================================================================

// Currently active verticals (Banking only for now)
const ACTIVE_VERTICALS = new Set(['banking']);

// Valid sub-verticals per vertical
const VALID_SUB_VERTICALS = {
  banking: new Set(['employee_banking', 'corporate_banking', 'sme_banking']),
  insurance: new Set(['individual', 'corporate', 'health']),
  recruitment: new Set(['tech_talent', 'executive_search']),
  saas: new Set(['b2b']),
};

// Valid regions (currently UAE only)
const ACTIVE_REGIONS = new Set(['UAE', 'uae']);

// Context cache (TTL: 5 minutes)
let verticalCache = null;
let verticalCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

// ============================================================================
// SALES CONTEXT TYPE
// ============================================================================

/**
 * @typedef {Object} SalesContext
 * @property {string} vertical - The vertical (e.g., 'banking')
 * @property {string} sub_vertical - The sub-vertical (e.g., 'employee_banking')
 * @property {string} region - The region (e.g., 'UAE')
 * @property {string} [tenant_id] - The tenant ID
 * @property {string} [user_id] - The user ID
 */

// ============================================================================
// CONTEXT VALIDATION
// ============================================================================

/**
 * Validate sales context
 *
 * @param {SalesContext} context - Sales context to validate
 * @returns {Object} Validation result
 */
export function validateSalesContext(context) {
  const errors = [];
  const warnings = [];

  if (!context) {
    return {
      valid: false,
      errors: [{ code: 'CONTEXT_MISSING', message: 'Sales context is required' }],
      warnings: [],
    };
  }

  // Validate vertical
  if (!context.vertical) {
    errors.push({
      code: 'VERTICAL_MISSING',
      message: 'Vertical is required',
    });
  } else if (!ACTIVE_VERTICALS.has(context.vertical.toLowerCase())) {
    // Check if it's a known but inactive vertical
    if (VALID_SUB_VERTICALS[context.vertical.toLowerCase()]) {
      errors.push({
        code: 'VERTICAL_NOT_ACTIVE',
        message: `Vertical '${context.vertical}' is not yet active. Only Banking is currently supported.`,
      });
    } else {
      errors.push({
        code: 'VERTICAL_INVALID',
        message: `Invalid vertical '${context.vertical}'`,
      });
    }
  }

  // Validate sub-vertical
  if (!context.sub_vertical) {
    errors.push({
      code: 'SUB_VERTICAL_MISSING',
      message: 'Sub-vertical is required',
    });
  } else if (context.vertical) {
    const validSubs = VALID_SUB_VERTICALS[context.vertical.toLowerCase()];
    if (validSubs && !validSubs.has(context.sub_vertical.toLowerCase())) {
      errors.push({
        code: 'SUB_VERTICAL_INVALID',
        message: `Invalid sub-vertical '${context.sub_vertical}' for vertical '${context.vertical}'`,
        validOptions: Array.from(validSubs),
      });
    }
  }

  // Validate region
  if (!context.region) {
    warnings.push({
      code: 'REGION_MISSING',
      message: 'Region not specified, defaulting to UAE',
    });
  } else if (!ACTIVE_REGIONS.has(context.region)) {
    warnings.push({
      code: 'REGION_NOT_ACTIVE',
      message: `Region '${context.region}' may not have full support yet`,
    });
  }

  // Tenant ID warning
  if (!context.tenant_id) {
    warnings.push({
      code: 'TENANT_MISSING',
      message: 'Tenant ID not provided - RLS may not be enforced',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedContext: normalizeContext(context),
  };
}

/**
 * Normalize sales context to canonical form
 *
 * @param {SalesContext} context - Sales context to normalize
 * @returns {SalesContext} Normalized context
 */
export function normalizeContext(context) {
  if (!context) return null;

  return {
    vertical: context.vertical?.toLowerCase() || null,
    sub_vertical: context.sub_vertical?.toLowerCase()?.replace(/-/g, '_') || null,
    region: context.region?.toUpperCase() || 'UAE',
    tenant_id: context.tenant_id || null,
    user_id: context.user_id || null,
  };
}

// ============================================================================
// CONTEXT ENFORCEMENT
// ============================================================================

/**
 * Enforce sales context - throws if invalid
 *
 * @param {SalesContext} context - Sales context to enforce
 * @param {Object} options - Enforcement options
 * @returns {SalesContext} Validated and normalized context
 * @throws {SalesContextError} If context is invalid
 */
export function enforceSalesContext(context, options = {}) {
  const { allowWarnings = true, requireTenant = false } = options;

  const validation = validateSalesContext(context);

  if (!validation.valid) {
    throw new SalesContextError(
      'Invalid sales context',
      validation.errors,
      validation.warnings
    );
  }

  if (requireTenant && !context.tenant_id) {
    throw new SalesContextError(
      'Tenant ID is required for this operation',
      [{ code: 'TENANT_REQUIRED', message: 'Tenant ID must be provided' }],
      validation.warnings
    );
  }

  if (!allowWarnings && validation.warnings.length > 0) {
    console.warn('[VS4:SalesContext] Warnings present:', validation.warnings);
  }

  return validation.normalizedContext;
}

/**
 * Create a context-bound wrapper for async functions
 *
 * @param {Function} fn - Function to wrap
 * @param {SalesContext} context - Context to enforce
 * @returns {Function} Context-bound function
 */
export function withSalesContext(fn, context) {
  const normalizedContext = enforceSalesContext(context);

  return async (...args) => {
    // Add context to the arguments if it's an options object
    if (args.length > 0 && typeof args[args.length - 1] === 'object') {
      args[args.length - 1] = {
        ...args[args.length - 1],
        salesContext: normalizedContext,
      };
    }

    try {
      return await fn(...args);
    } catch (error) {
      // Log context-related errors
      console.error(`[VS4:SalesContext] Error in context-bound function:`, {
        context: normalizedContext,
        error: error.message,
      });
      throw error;
    }
  };
}

// ============================================================================
// CONTEXT LOADING FROM DATABASE
// ============================================================================

/**
 * Load active verticals from database
 * @returns {Promise<Map>} Map of vertical slug to config
 */
async function loadActiveVerticals() {
  const now = Date.now();

  if (verticalCache && (now - verticalCacheTime) < CACHE_TTL) {
    return verticalCache;
  }

  try {
    const result = await pool.query(`
      SELECT vp.slug, vp.name, vp.is_active, vp.is_sub_vertical,
             vp.parent_vertical_id, parent.slug as parent_slug,
             vp.config
      FROM vertical_packs vp
      LEFT JOIN vertical_packs parent ON vp.parent_vertical_id = parent.id
      WHERE vp.is_active = true
      ORDER BY vp.is_sub_vertical, vp.name
    `);

    const verticals = new Map();
    for (const row of result.rows) {
      verticals.set(row.slug, {
        name: row.name,
        isActive: row.is_active,
        isSubVertical: row.is_sub_vertical,
        parentSlug: row.parent_slug,
        config: row.config,
      });
    }

    verticalCache = verticals;
    verticalCacheTime = now;

    return verticals;
  } catch (error) {
    console.error('[VS4:SalesContext] Failed to load verticals:', error.message);
    // Return empty map - fall back to hardcoded values
    return new Map();
  }
}

/**
 * Check if vertical is active in database
 *
 * @param {string} vertical - Vertical slug
 * @param {string} [subVertical] - Sub-vertical slug
 * @returns {Promise<boolean>} True if vertical is active
 */
export async function isVerticalActive(vertical, subVertical = null) {
  const verticals = await loadActiveVerticals();

  // Check main vertical
  if (!ACTIVE_VERTICALS.has(vertical.toLowerCase())) {
    return false;
  }

  // If sub-vertical specified, check it too
  if (subVertical) {
    const subSlug = `${vertical}-${subVertical}`.toLowerCase().replace(/_/g, '-');
    const verticalData = verticals.get(subSlug);

    if (verticalData && verticalData.isActive) {
      return true;
    }

    // Fall back to hardcoded check
    const validSubs = VALID_SUB_VERTICALS[vertical.toLowerCase()];
    return validSubs?.has(subVertical.toLowerCase()) || false;
  }

  return true;
}

// ============================================================================
// CONTEXT AUDIT LOGGING
// ============================================================================

/**
 * Log context enforcement event
 *
 * @param {string} event - Event type
 * @param {SalesContext} context - Context involved
 * @param {Object} details - Additional details
 */
export async function logContextEvent(event, context, details = {}) {
  const logEntry = {
    event,
    context: normalizeContext(context),
    details,
    timestamp: new Date().toISOString(),
  };

  console.log(`[VS4:SalesContext] ${event}:`, logEntry);

  // Log to Sentry if it's a violation
  if (event.includes('VIOLATION') || event.includes('BLOCKED')) {
    Sentry.captureMessage(`SalesContext ${event}`, {
      level: 'warning',
      tags: {
        service: 'SalesContextEnforcement',
        event,
        vertical: context?.vertical,
        sub_vertical: context?.sub_vertical,
      },
      extra: logEntry,
    });
  }
}

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Express middleware to enforce sales context on requests
 *
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
export function salesContextMiddleware(options = {}) {
  const {
    requireContext = true,
    allowedVerticals = Array.from(ACTIVE_VERTICALS),
    extractFrom = 'body', // 'body', 'query', 'headers'
  } = options;

  return async (req, res, next) => {
    // Extract context from request
    let context = {};

    if (extractFrom === 'body' || extractFrom === 'all') {
      context = {
        ...context,
        vertical: req.body?.vertical,
        sub_vertical: req.body?.sub_vertical,
        region: req.body?.region || req.body?.region_code,
      };
    }

    if (extractFrom === 'query' || extractFrom === 'all') {
      context = {
        ...context,
        vertical: context.vertical || req.query?.vertical,
        sub_vertical: context.sub_vertical || req.query?.sub_vertical,
        region: context.region || req.query?.region,
      };
    }

    if (extractFrom === 'headers' || extractFrom === 'all') {
      context = {
        ...context,
        vertical: context.vertical || req.headers['x-vertical'],
        sub_vertical: context.sub_vertical || req.headers['x-sub-vertical'],
        region: context.region || req.headers['x-region'],
      };
    }

    // Add tenant context from auth
    context.tenant_id = req.tenantId || req.headers['x-tenant-id'];
    context.user_id = req.userId || req.headers['x-user-id'];

    // Validate context
    const validation = validateSalesContext(context);

    // Log warnings
    if (validation.warnings.length > 0) {
      console.warn(`[VS4:SalesContext] Warnings for ${req.path}:`, validation.warnings);
    }

    if (!validation.valid && requireContext) {
      await logContextEvent('CONTEXT_BLOCKED', context, {
        path: req.path,
        method: req.method,
        errors: validation.errors,
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid sales context',
        code: 'INVALID_SALES_CONTEXT',
        details: validation.errors,
        message: validation.errors[0]?.message || 'Sales context validation failed',
      });
    }

    // Check if vertical is allowed
    if (context.vertical && !allowedVerticals.includes(context.vertical.toLowerCase())) {
      await logContextEvent('VERTICAL_NOT_ALLOWED', context, {
        path: req.path,
        requestedVertical: context.vertical,
        allowedVerticals,
      });

      return res.status(400).json({
        success: false,
        error: 'Vertical not available',
        code: 'VERTICAL_NOT_AVAILABLE',
        message: `The vertical '${context.vertical}' is not yet available. Currently supported: ${allowedVerticals.join(', ')}`,
      });
    }

    // Attach validated context to request
    req.salesContext = validation.normalizedContext;

    next();
  };
}

// ============================================================================
// ERROR CLASS
// ============================================================================

/**
 * Custom error for sales context violations
 */
export class SalesContextError extends Error {
  constructor(message, errors = [], warnings = []) {
    super(message);
    this.name = 'SalesContextError';
    this.code = 'SALES_CONTEXT_ERROR';
    this.errors = errors;
    this.warnings = warnings;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Named exports for ES module imports
export {
  validateSalesContext,
  normalizeContext,
  enforceSalesContext,
  withSalesContext,
  isVerticalActive,
  logContextEvent,
  salesContextMiddleware,
  SalesContextError,
  ACTIVE_VERTICALS,
  VALID_SUB_VERTICALS,
  ACTIVE_REGIONS,
};

// Default export for CommonJS compatibility
export default {
  validateSalesContext,
  normalizeContext,
  enforceSalesContext,
  withSalesContext,
  isVerticalActive,
  logContextEvent,
  salesContextMiddleware,
  SalesContextError,
  ACTIVE_VERTICALS,
  VALID_SUB_VERTICALS,
  ACTIVE_REGIONS,
};
