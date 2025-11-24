/**
 * Agent Persistence Service - Sprint 20 Task 2
 *
 * Handles database persistence for all SIVA tool executions
 *
 * Features:
 * - Log all tool decisions to agent_decisions table
 * - Track human overrides in agent_overrides table
 * - Query decision history
 * - Analytics and reporting
 */

const db = require('../../utils/db');
const Sentry = require('@sentry/node');

class AgentPersistenceService {
  /**
   * Log a SIVA tool decision to database
   *
   * @param {Object} params - Decision parameters
   * @param {string} params.toolName - Name of the tool (e.g., 'CompanyQualityTool')
   * @param {string} params.toolLayer - Layer (foundation/strict/delegated)
   * @param {string} params.primitiveName - SIVA primitive (e.g., 'EVALUATE_COMPANY_QUALITY')
   * @param {Object} params.input - Tool input parameters
   * @param {Object} params.output - Tool output result
   * @param {number} params.executionTimeMs - Execution time in milliseconds
   * @param {string} [params.companyId] - Company UUID (if applicable)
   * @param {string} [params.contactId] - Contact UUID (if applicable)
   * @param {string} [params.signalId] - Signal UUID (if applicable)
   * @param {string} [params.sessionId] - Session ID for grouping
   * @param {string} [params.moduleCaller] - Calling module (discovery/enrichment/outreach)
   * @param {string} [params.tenantId] - Tenant ID for multi-tenancy
   * @param {string} [params.policyVersion] - Persona policy version (default: 'v2.0')
   * @returns {Promise<string>} - Decision ID (UUID)
   */
  async logDecision(params) {
    const {
      toolName,
      toolLayer,
      primitiveName,
      input,
      output,
      executionTimeMs,
      companyId = null,
      contactId = null,
      signalId = null,
      sessionId = null,
      moduleCaller = null,
      tenantId = null,
      policyVersion = 'v2.0'
    } = params;

    try {
      // Extract common output fields
      const score = output.score || output.qualityScore || output.timingScore || output.qScore || null;
      const confidence = output.confidence || output.confidenceScore || null;
      const qualityTier = output.tier || output.qualityTier || output.leadTier || null;
      const reasoning = output.reasoning || output.keyFactors || output.explanation || null;

      const query = `
        INSERT INTO agent_decisions (
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
          company_id,
          contact_id,
          signal_id,
          session_id,
          module_caller,
          tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id
      `;

      const values = [
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
        companyId,
        contactId,
        signalId,
        sessionId,
        moduleCaller,
        tenantId
      ];

      const result = await db.query(query, values);
      return result.rows[0].id;

    } catch (error) {
      // Log error but don't fail the request
      Sentry.captureException(error, {
        tags: {
          service: 'AgentPersistence',
          operation: 'logDecision',
          tool: toolName
        },
        extra: {
          input,
          executionTimeMs
        }
      });

      console.error('Failed to log agent decision:', error.message);
      return null;  // Return null on error, don't throw
    }
  }

  /**
   * Log a human override of an AI decision
   *
   * @param {Object} params - Override parameters
   * @param {string} params.decisionId - Original decision UUID
   * @param {Object} params.aiResult - AI's original result
   * @param {Object} params.humanResult - Human's corrected result
   * @param {string} params.overrideReason - Reason code
   * @param {string} [params.notes] - Additional notes
   * @param {string} [params.userId] - User UUID
   * @param {string} [params.userEmail] - User email
   * @param {string} [params.tenantId] - Tenant ID
   * @returns {Promise<string>} - Override ID (UUID)
   */
  async logOverride(params) {
    const {
      decisionId,
      aiResult,
      humanResult,
      overrideReason,
      notes = null,
      userId = null,
      userEmail = null,
      tenantId = null
    } = params;

    try {
      // Extract scores for comparison
      const aiScore = aiResult.score || aiResult.qualityScore || aiResult.qScore || null;
      const humanScore = humanResult.score || humanResult.qualityScore || humanResult.qScore || null;
      const scoreDelta = (humanScore && aiScore) ? humanScore - aiScore : null;

      const aiConfidence = aiResult.confidence || aiResult.confidenceScore || null;
      const humanConfidence = humanResult.confidence || humanResult.confidenceScore || null;

      const aiQualityTier = aiResult.tier || aiResult.qualityTier || aiResult.leadTier || null;
      const humanQualityTier = humanResult.tier || humanResult.qualityTier || humanResult.leadTier || null;

      // Did human agree with AI?
      const agreement = (aiQualityTier === humanQualityTier) && (Math.abs(scoreDelta || 0) < 5);

      const query = `
        INSERT INTO agent_overrides (
          decision_id,
          ai_result,
          human_result,
          ai_score,
          ai_confidence,
          ai_quality_tier,
          human_score,
          human_confidence,
          human_quality_tier,
          override_reason,
          notes,
          score_delta,
          agreement,
          user_id,
          user_email,
          tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id
      `;

      const values = [
        decisionId,
        JSON.stringify(aiResult),
        JSON.stringify(humanResult),
        aiScore,
        aiConfidence,
        aiQualityTier,
        humanScore,
        humanConfidence,
        humanQualityTier,
        overrideReason,
        notes,
        scoreDelta,
        agreement,
        userId,
        userEmail,
        tenantId
      ];

      const result = await db.query(query, values);
      return result.rows[0].id;

    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'AgentPersistence',
          operation: 'logOverride'
        },
        extra: {
          decisionId,
          overrideReason
        }
      });

      console.error('Failed to log agent override:', error.message);
      throw error;  // Throw on override errors (more critical)
    }
  }

  /**
   * Get decision history for a company
   *
   * @param {string} companyId - Company UUID
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=50] - Max results
   * @param {number} [options.offset=0] - Pagination offset
   * @returns {Promise<Array>} - Decision history
   */
  async getCompanyDecisions(companyId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      const query = `
        SELECT
          ad.*,
          ao.id as override_id,
          ao.human_result,
          ao.override_reason,
          ao.agreement
        FROM agent_decisions ad
        LEFT JOIN agent_overrides ao ON ao.decision_id = ad.id
        WHERE ad.company_id = $1
        ORDER BY ad.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await db.query(query, [companyId, limit, offset]);
      return result.rows;

    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'AgentPersistence',
          operation: 'getCompanyDecisions'
        },
        extra: { companyId }
      });

      throw error;
    }
  }

  /**
   * Get decision history for a specific tool
   *
   * @param {string} toolName - Tool name
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=100] - Max results
   * @param {number} [options.offset=0] - Pagination offset
   * @param {number} [options.minConfidence] - Filter by min confidence
   * @returns {Promise<Array>} - Decision history
   */
  async getToolDecisions(toolName, options = {}) {
    const { limit = 100, offset = 0, minConfidence = null } = options;

    try {
      let query = `
        SELECT *
        FROM agent_decisions
        WHERE tool_name = $1
      `;

      const values = [toolName];

      if (minConfidence !== null) {
        query += ` AND confidence >= $${values.length + 1}`;
        values.push(minConfidence);
      }

      query += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, offset);

      const result = await db.query(query, values);
      return result.rows;

    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'AgentPersistence',
          operation: 'getToolDecisions'
        },
        extra: { toolName }
      });

      throw error;
    }
  }

  /**
   * Get tool performance metrics
   *
   * @returns {Promise<Array>} - Performance metrics per tool
   */
  async getToolPerformance() {
    try {
      const query = `SELECT * FROM agent_tool_performance ORDER BY total_executions DESC`;
      const result = await db.query(query);
      return result.rows;

    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'AgentPersistence',
          operation: 'getToolPerformance'
        }
      });

      throw error;
    }
  }

  /**
   * Get override analytics
   *
   * @returns {Promise<Array>} - Override analytics per tool
   */
  async getOverrideAnalytics() {
    try {
      const query = `SELECT * FROM agent_override_analytics ORDER BY total_overrides DESC`;
      const result = await db.query(query);
      return result.rows;

    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'AgentPersistence',
          operation: 'getOverrideAnalytics'
        }
      });

      throw error;
    }
  }

  /**
   * Get daily decision volume
   *
   * @param {number} [days=30] - Number of days to look back
   * @returns {Promise<Array>} - Daily volume metrics
   */
  async getDailyVolume(days = 30) {
    try {
      const query = `
        SELECT *
        FROM agent_daily_volume
        WHERE decision_date >= CURRENT_DATE - $1
        ORDER BY decision_date DESC, decisions DESC
      `;

      const result = await db.query(query, [days]);
      return result.rows;

    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'AgentPersistence',
          operation: 'getDailyVolume'
        }
      });

      throw error;
    }
  }

  /**
   * Get low-confidence decisions needing review
   *
   * @param {number} [threshold=0.60] - Confidence threshold
   * @param {number} [limit=50] - Max results
   * @returns {Promise<Array>} - Low-confidence decisions
   */
  async getLowConfidenceDecisions(threshold = 0.60, limit = 50) {
    try {
      const query = `
        SELECT
          ad.*
        FROM agent_decisions ad
        WHERE ad.confidence < $1
          AND ad.confidence IS NOT NULL
        ORDER BY ad.confidence ASC, ad.created_at DESC
        LIMIT $2
      `;

      const result = await db.query(query, [threshold, limit]);
      return result.rows;

    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'AgentPersistence',
          operation: 'getLowConfidenceDecisions'
        }
      });

      throw error;
    }
  }
}

module.exports = new AgentPersistenceService();
