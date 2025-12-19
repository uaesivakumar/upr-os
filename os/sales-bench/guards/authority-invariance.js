/**
 * Authority Invariance Guards
 * PRD v1.3 Appendix §1.2
 *
 * Sales-Bench CANNOT:
 * - Create or modify envelopes
 * - Change persona permissions
 * - Bypass policy enforcement
 * - Affect SIVA outputs in production
 *
 * If Sales-Bench is unavailable, SIVA continues to operate normally.
 */

/**
 * Isolated execution context for Sales-Bench
 * All Sales-Bench operations must use this context
 */
export const SALES_BENCH_CONTEXT = Object.freeze({
  mode: 'SALES_BENCH',
  tenant_id: 'SALES_BENCH_ISOLATED',
  read_only_control_plane: true,
});

/**
 * Operations that Sales-Bench is forbidden from performing
 */
const FORBIDDEN_OPERATIONS = Object.freeze([
  // Envelope operations
  'envelope.create',
  'envelope.update',
  'envelope.delete',
  'envelope.modify',

  // Persona operations
  'persona.create',
  'persona.update',
  'persona.delete',
  'persona.permissions.modify',
  'persona.policy.change',

  // Policy operations
  'policy.create',
  'policy.update',
  'policy.delete',
  'policy.bypass',

  // Control plane writes
  'control_plane.write',
  'control_plane.modify',
  'control_plane.delete',

  // Production impact
  'production.write',
  'production.modify',
  'siva.runtime.alter',
  'siva.behavior.modify',
]);

/**
 * Tables that Sales-Bench cannot write to
 */
const PROTECTED_TABLES = Object.freeze([
  'os_personas',
  'os_persona_policies',
  'os_verticals',
  'os_sub_verticals',
  'os_model_capabilities',
  'os_model_capability_mappings',
  'os_routing_decisions',
  'sealed_envelopes',
  'evidence_store',
  'llm_models',
]);

/**
 * Assert that an operation is allowed for Sales-Bench
 * @param {string} operation - Operation being attempted
 * @throws {Error} If operation is forbidden
 */
export function assertOperationAllowed(operation) {
  if (FORBIDDEN_OPERATIONS.includes(operation)) {
    throw new AuthorityInvarianceError(
      `FORBIDDEN: Sales-Bench cannot perform '${operation}' (PRD v1.3 §1.2)`
    );
  }
}

/**
 * Assert that a table is not protected
 * @param {string} tableName - Table being accessed
 * @param {'read'|'write'} accessType - Type of access
 * @throws {Error} If write to protected table
 */
export function assertTableAccess(tableName, accessType) {
  if (accessType === 'write' && PROTECTED_TABLES.includes(tableName)) {
    throw new AuthorityInvarianceError(
      `FORBIDDEN: Sales-Bench cannot write to '${tableName}' (PRD v1.3 §1.2)`
    );
  }
}

/**
 * Assert that context is Sales-Bench isolated context
 * @param {Object} context - Execution context
 * @throws {Error} If not in isolated context
 */
export function assertIsolatedContext(context) {
  if (context?.mode !== 'SALES_BENCH') {
    throw new AuthorityInvarianceError(
      'Sales-Bench operations must use SALES_BENCH_CONTEXT'
    );
  }

  if (context?.tenant_id !== 'SALES_BENCH_ISOLATED') {
    throw new AuthorityInvarianceError(
      'Sales-Bench must use isolated tenant: SALES_BENCH_ISOLATED'
    );
  }
}

/**
 * Assert no envelope modification
 * @param {string} operation - Operation name
 * @throws {Error} If envelope modification attempted
 */
export function assertNoEnvelopeModification(operation) {
  const envelopeOps = ['envelope.create', 'envelope.update', 'envelope.delete'];
  if (envelopeOps.some((op) => operation.includes(op) || operation.includes('envelope'))) {
    if (operation !== 'envelope.read') {
      throw new AuthorityInvarianceError(
        `AUTHORITY_VIOLATION: Sales-Bench cannot modify envelopes (PRD v1.3 §1.2). Operation: ${operation}`
      );
    }
  }
}

/**
 * Assert no persona modification
 * @param {string} operation - Operation name
 * @throws {Error} If persona modification attempted
 */
export function assertNoPersonaModification(operation) {
  const personaOps = ['persona.create', 'persona.update', 'persona.delete', 'persona.permissions'];
  if (personaOps.some((op) => operation.includes(op))) {
    throw new AuthorityInvarianceError(
      `AUTHORITY_VIOLATION: Sales-Bench cannot modify personas (PRD v1.3 §1.2). Operation: ${operation}`
    );
  }
}

/**
 * Assert no policy bypass
 * @param {Object} run - Scenario run
 * @throws {Error} If policy bypass detected
 */
export function assertNoPolicyBypass(run) {
  if (run?.policy_bypassed || run?.gates_bypassed?.length > 0) {
    throw new AuthorityInvarianceError(
      'AUTHORITY_VIOLATION: Sales-Bench cannot bypass policy (PRD v1.3 §1.2)'
    );
  }
}

/**
 * Assert no production impact
 * @param {Object} context - Execution context
 * @throws {Error} If production impact detected
 */
export function assertNoProductionImpact(context) {
  if (context?.environment === 'production' && context?.mode !== 'SALES_BENCH') {
    throw new AuthorityInvarianceError(
      'AUTHORITY_VIOLATION: Sales-Bench cannot affect production SIVA (PRD v1.3 §1.2)'
    );
  }
}

/**
 * Assert CRS is advisory only (never alters SIVA runtime)
 * @param {Object} crsScore - CRS score object
 * @throws {Error} If CRS attempts to alter runtime
 */
export function assertCRSAdvisoryOnly(crsScore) {
  if (crsScore?.runtime_modification || crsScore?.siva_behavior_change) {
    throw new AuthorityInvarianceError(
      'AUTHORITY_VIOLATION: CRS is advisory only - cannot alter SIVA runtime (PRD v1.3 §8.1)'
    );
  }
}

/**
 * Master guard - run before every Sales-Bench operation
 * @param {Object} context - Execution context
 * @param {string} operation - Operation being performed
 * @param {Object} [options] - Additional options
 * @returns {void}
 * @throws {AuthorityInvarianceError} If any guard fails
 */
export function enforceAuthorityInvariance(context, operation, options = {}) {
  // 1. Verify isolated context
  assertIsolatedContext(context);

  // 2. Check operation is allowed
  assertOperationAllowed(operation);

  // 3. Check envelope protection
  assertNoEnvelopeModification(operation);

  // 4. Check persona protection
  assertNoPersonaModification(operation);

  // 5. Check production protection
  assertNoProductionImpact(context);

  // 6. Log for audit
  logAuthorityCheck({
    operation,
    context: {
      mode: context.mode,
      tenant_id: context.tenant_id,
    },
    result: 'ALLOWED',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log authority check for audit trail
 * @param {Object} check - Check details
 */
function logAuthorityCheck(check) {
  // In production, this would write to audit log
  // For now, just console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[SALES_BENCH_AUTHORITY]', JSON.stringify(check));
  }
}

/**
 * Custom error for authority invariance violations
 */
export class AuthorityInvarianceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorityInvarianceError';
    this.code = 'AUTHORITY_INVARIANCE_VIOLATION';
    this.prdReference = 'PRD v1.3 §1.2';
  }
}

/**
 * Wrap a function to enforce authority invariance
 * @param {Function} fn - Function to wrap
 * @param {string} operationName - Name of the operation
 * @returns {Function} Wrapped function
 */
export function withAuthorityGuard(fn, operationName) {
  return function guarded(context, ...args) {
    enforceAuthorityInvariance(context, operationName);
    return fn(context, ...args);
  };
}
