/**
 * Reflection Service
 * Enables agents to reflect on decisions, learn from outcomes, and share insights
 */

import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

export class ReflectionService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  /**
   * Record a decision made by an agent
   */
  async recordDecision(agentId, decision, context = {}) {
    const decisionId = decision.id || `decision-${crypto.randomUUID()}`;

    // Store decision metadata in agent_tasks for tracking
    const query = `
      INSERT INTO agent_tasks (task_id, task_type, assigned_to, status, input, metadata)
      SELECT $1, 'decision', id, 'COMPLETED', $2, $3
      FROM agents WHERE agent_id = $4
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      decisionId,
      JSON.stringify(decision),
      JSON.stringify({ context, recorded_at: new Date() }),
      agentId
    ]);

    return {
      decisionId,
      agentId,
      recorded: true,
      recordedAt: new Date()
    };
  }

  /**
   * Record outcome of a decision
   */
  async recordOutcome(decisionId, outcome) {
    const updateQuery = `
      UPDATE agent_tasks
      SET output = $1, completed_at = NOW()
      WHERE task_id = $2
      RETURNING *
    `;

    const result = await this.pool.query(updateQuery, [
      JSON.stringify(outcome),
      decisionId
    ]);

    return {
      decisionId,
      outcomeRecorded: result.rows.length > 0,
      outcome
    };
  }

  /**
   * Trigger reflection on a decision
   */
  async triggerReflection(decisionId) {
    // Get decision and outcome
    const query = `
      SELECT at.*, a.agent_id
      FROM agent_tasks at
      JOIN agents a ON at.assigned_to = a.id
      WHERE at.task_id = $1
    `;

    const result = await this.pool.query(query, [decisionId]);

    if (result.rows.length === 0) {
      return { error: 'Decision not found', decisionId };
    }

    const task = result.rows[0];
    const decision = task.input;
    const outcome = task.output;

    // Generate reflection
    const reflection = await this.generateReflection(decision, outcome);

    // Store reflection
    const reflectionId = `reflection-${crypto.randomUUID()}`;

    const insertQuery = `
      INSERT INTO agent_reflections (reflection_id, agent_id, decision_id, decision, outcome, reflection, learnings)
      SELECT $1, id, $2, $3, $4, $5, $6
      FROM agents WHERE agent_id = $7
      RETURNING *
    `;

    await this.pool.query(insertQuery, [
      reflectionId,
      decisionId,
      JSON.stringify(decision),
      JSON.stringify(outcome),
      reflection.text,
      JSON.stringify(reflection.learnings),
      task.agent_id
    ]);

    return {
      reflectionId,
      decisionId,
      reflection,
      triggered: true
    };
  }

  /**
   * Generate reflection from decision and outcome
   */
  async generateReflection(decision, outcome) {
    const learnings = [];
    let text = '';

    if (outcome && outcome.success) {
      text = `Decision led to successful outcome. `;
      learnings.push({
        type: 'SUCCESS_PATTERN',
        lesson: 'Approach was effective',
        confidence: 0.8
      });

      if (decision.factors) {
        learnings.push({
          type: 'FACTOR_VALIDATION',
          lesson: `Factors ${JSON.stringify(decision.factors)} were relevant`,
          confidence: 0.7
        });
      }
    } else if (outcome && !outcome.success) {
      text = `Decision did not achieve desired outcome. `;
      learnings.push({
        type: 'FAILURE_PATTERN',
        lesson: 'Approach needs improvement',
        confidence: 0.8
      });

      if (outcome.error) {
        learnings.push({
          type: 'ERROR_ANALYSIS',
          lesson: `Error encountered: ${outcome.error}`,
          confidence: 0.9
        });
      }
    }

    return {
      text,
      learnings,
      wouldRepeat: outcome?.success || false,
      confidence: learnings.reduce((sum, l) => sum + l.confidence, 0) / learnings.length
    };
  }

  /**
   * Extract learnings from a reflection
   */
  async extractLearnings(reflectionId) {
    const query = 'SELECT * FROM agent_reflections WHERE reflection_id = $1';
    const result = await this.pool.query(query, [reflectionId]);

    if (result.rows.length === 0) {
      return { found: false, reflectionId };
    }

    const reflection = result.rows[0];

    return {
      found: true,
      reflectionId,
      learnings: reflection.learnings,
      decision: reflection.decision,
      outcome: reflection.outcome
    };
  }

  /**
   * Share insights with other agents
   */
  async shareInsights(insights, targetAgents = []) {
    const shared = [];

    for (const targetAgentId of targetAgents) {
      // Create communication record
      const messageId = `msg-${crypto.randomUUID()}`;

      const query = `
        INSERT INTO agent_communications (message_id, from_agent, to_agent, message_type, message)
        SELECT $1, source.id, target.id, 'INSIGHT_SHARING', $2
        FROM agents source, agents target
        WHERE source.agent_id = $3 AND target.agent_id = $4
        RETURNING *
      `;

      await this.pool.query(query, [
        messageId,
        JSON.stringify(insights),
        insights.fromAgent || 'system',
        targetAgentId
      ]);

      shared.push({
        messageId,
        targetAgent: targetAgentId,
        shared: true
      });
    }

    return {
      insightsShared: shared.length,
      recipients: shared
    };
  }

  /**
   * Get reflection history for an agent
   */
  async getReflectionHistory(agentId, timeRange = 30) {
    const query = `
      SELECT ar.*
      FROM agent_reflections ar
      JOIN agents a ON ar.agent_id = a.id
      WHERE a.agent_id = $1
        AND ar.created_at >= NOW() - INTERVAL '${timeRange} days'
      ORDER BY ar.created_at DESC
      LIMIT 50
    `;

    const result = await this.pool.query(query, [agentId]);

    return {
      agentId,
      reflections: result.rows.map(r => ({
        reflectionId: r.reflection_id,
        decisionId: r.decision_id,
        reflection: r.reflection,
        learnings: r.learnings,
        createdAt: r.created_at
      })),
      count: result.rows.length
    };
  }

  /**
   * Analyze reflection patterns
   */
  async analyzeReflectionPatterns(agentId) {
    const query = `
      SELECT
        COUNT(*) as total_reflections,
        COUNT(*) FILTER (WHERE learnings::text LIKE '%SUCCESS_PATTERN%') as successful_patterns,
        COUNT(*) FILTER (WHERE learnings::text LIKE '%FAILURE_PATTERN%') as failure_patterns,
        AVG(impact_score) as avg_impact
      FROM agent_reflections ar
      JOIN agents a ON ar.agent_id = a.id
      WHERE a.agent_id = $1
        AND ar.created_at >= NOW() - INTERVAL '90 days'
    `;

    const result = await this.pool.query(query, [agentId]);

    const stats = result.rows[0];

    return {
      agentId,
      totalReflections: parseInt(stats.total_reflections),
      successfulPatterns: parseInt(stats.successful_patterns || 0),
      failurePatterns: parseInt(stats.failure_patterns || 0),
      avgImpact: parseFloat(stats.avg_impact || 0),
      learningRate: stats.total_reflections > 0
        ? stats.successful_patterns / stats.total_reflections
        : 0
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default ReflectionService;
