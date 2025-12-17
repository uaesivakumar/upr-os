/**
 * Agent Decision Logger (PRD v1.2 §1 Law 3)
 *
 * OS-level persistence for SIVA tool decisions.
 * PRD Law 3: "SIVA never mutates the world"
 *
 * All database writes for SIVA decisions happen here, NOT in SIVA tools.
 * SIVA tools return pure data objects, OS persists them.
 */

import db from '../../utils/db.js';
import crypto from 'crypto';

const { pool } = db;

/**
 * Log a SIVA tool decision to the database
 * Called by OS layer AFTER SIVA tool returns
 *
 * @param {Object} params - Decision parameters
 * @param {string} params.decisionId - Unique decision ID (UUID)
 * @param {string} params.toolName - Name of the SIVA tool
 * @param {string} params.toolLayer - Tool layer (foundation, strict, delegated)
 * @param {string} [params.primitiveName] - Primitive name (e.g., EVALUATE_COMPANY_QUALITY)
 * @param {Object} params.input - Tool input parameters
 * @param {Object} params.output - Tool output result
 * @param {Object} [params.reasoning] - Natural language reasoning
 * @param {number} [params.score] - Score (0-100)
 * @param {number} [params.confidence] - Confidence (0-1)
 * @param {string} [params.qualityTier] - Quality tier (HOT, WARM, COLD)
 * @param {number} params.executionTimeMs - Execution time in milliseconds
 * @param {string} [params.policyVersion] - Policy version
 * @param {string} [params.sessionId] - Session ID
 * @param {string} [params.moduleCaller] - Module that called the tool
 * @param {string} [params.tenantId] - Tenant ID
 * @param {string} [params.companyId] - Company ID
 * @param {string} [params.contactId] - Contact ID
 * @param {string} [params.signalId] - Signal ID
 * @param {Object} [params.envelope] - Sealed context envelope
 * @returns {Promise<string>} - Decision ID
 */
export async function logDecision(params) {
  const {
    decisionId,
    toolName,
    toolLayer = 'foundation',
    primitiveName,
    input,
    output,
    reasoning,
    score,
    confidence,
    qualityTier,
    executionTimeMs,
    policyVersion = 'v2.0',
    sessionId,
    moduleCaller,
    tenantId,
    companyId,
    contactId,
    signalId,
    envelope,
  } = params;

  try {
    const query = `
      INSERT INTO agent_core.agent_decisions (
        decision_id,
        tool_name,
        tool_layer,
        primitive_name,
        input_params,
        output_result,
        reasoning,
        score,
        confidence,
        quality_tier,
        execution_time_ms,
        policy_version,
        session_id,
        module_caller,
        tenant_id,
        company_id,
        contact_id,
        signal_id,
        envelope_hash,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
      )
      RETURNING id
    `;

    const values = [
      decisionId,
      toolName,
      toolLayer,
      primitiveName,
      JSON.stringify(input),
      JSON.stringify(output),
      reasoning ? JSON.stringify(reasoning) : null,
      score,
      confidence,
      qualityTier,
      executionTimeMs,
      policyVersion,
      sessionId,
      moduleCaller,
      tenantId,
      companyId,
      contactId,
      signalId,
      envelope?.sha256_hash || null,
    ];

    const result = await pool.query(query, values);
    console.log(`[AgentDecisionLogger] Logged decision ${decisionId} for ${toolName}`);

    return decisionId;
  } catch (error) {
    // Log error but don't throw - persistence is best-effort
    console.error(`[AgentDecisionLogger] Failed to log decision for ${toolName}:`, error.message);
    // Still return the decision ID even if persistence failed
    return decisionId;
  }
}

/**
 * Log multiple decisions in a batch
 *
 * @param {Object[]} decisions - Array of decision parameters
 * @returns {Promise<string[]>} - Array of decision IDs
 */
export async function logDecisionBatch(decisions) {
  const results = await Promise.all(
    decisions.map(decision => logDecision(decision))
  );
  return results;
}

/**
 * Create a decision record object from SIVA tool output
 * Use this to prepare decision data for logging
 *
 * @param {string} toolName - Name of the tool
 * @param {Object} input - Tool input
 * @param {Object} output - Tool output
 * @param {number} executionTimeMs - Execution time
 * @param {Object} [envelope] - Sealed context envelope
 * @returns {Object} - Decision record ready for logging
 */
export function createDecisionRecord(toolName, input, output, executionTimeMs, envelope = null) {
  const decisionId = crypto.randomUUID();

  // Extract common fields from output
  const score = output.score ?? output.qualityScore ?? output.compositeScore ?? null;
  const confidence = output.confidence ?? output.confidenceScore ??
    (output.confidenceLevel === 'HIGH' ? 0.9 :
      output.confidenceLevel === 'MEDIUM' ? 0.7 :
        output.confidenceLevel === 'LOW' ? 0.5 : null);
  const qualityTier = output.quality_tier ?? output.qualityTier ?? output.tier ?? null;
  const reasoning = output.reasoning ?? output.keyFactors ?? output.explanation ?? null;

  // Map tool names to layers
  const toolLayers = {
    CompanyQualityTool: 'foundation',
    ContactTierTool: 'foundation',
    TimingScoreTool: 'foundation',
    EdgeCasesTool: 'foundation',
    BankingProductMatchTool: 'strict',
    OutreachChannelTool: 'strict',
    OpeningContextTool: 'strict',
    CompositeScoreTool: 'strict',
    OutreachMessageGeneratorTool: 'delegated',
    FollowUpStrategyTool: 'delegated',
    ObjectionHandlerTool: 'delegated',
    RelationshipTrackerTool: 'delegated',
  };

  return {
    decisionId,
    toolName,
    toolLayer: toolLayers[toolName] || 'foundation',
    input,
    output,
    reasoning,
    score,
    confidence,
    qualityTier,
    executionTimeMs,
    policyVersion: output.policyVersion || 'v2.0',
    tenantId: envelope?.tenant_id || input.tenant_id,
    companyId: input.company_id || input.companyId,
    contactId: input.contact_id || input.contactId,
    envelope,
  };
}

/**
 * Wrapper to execute a SIVA tool and log its decision
 * Use this in OS routes to ensure all SIVA calls are logged
 *
 * @param {Object} tool - The SIVA tool instance
 * @param {Object} input - Tool input
 * @param {Object} envelope - Sealed context envelope
 * @returns {Promise<Object>} - Tool output with decisionId
 */
export async function executeAndLog(tool, input, envelope) {
  const startTime = Date.now();

  try {
    // Execute the tool
    const output = await tool.execute(input);
    const executionTimeMs = Date.now() - startTime;

    // Create decision record
    const decision = createDecisionRecord(
      tool.agentName || tool.constructor.name,
      input,
      output,
      executionTimeMs,
      envelope
    );

    // Log to database (async, don't wait)
    logDecision(decision).catch(err =>
      console.error('[AgentDecisionLogger] Background log failed:', err.message)
    );

    // Return output with decision ID for traceability
    return {
      ...output,
      _meta: {
        decisionId: decision.decisionId,
        executionTimeMs,
        envelopeHash: envelope?.sha256_hash,
      },
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    // Log failed execution
    const decision = createDecisionRecord(
      tool.agentName || tool.constructor.name,
      input,
      { error: error.message, success: false },
      executionTimeMs,
      envelope
    );

    logDecision(decision).catch(err =>
      console.error('[AgentDecisionLogger] Background log failed:', err.message)
    );

    throw error;
  }
}

export default {
  logDecision,
  logDecisionBatch,
  createDecisionRecord,
  executeAndLog,
};
