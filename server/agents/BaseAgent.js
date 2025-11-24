/**
 * Base Agent Class
 * Foundation for all specialized agents in the multi-agent system
 */

import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

export class BaseAgent {
  constructor(agentType, capabilities = [], config = {}, connectionConfig = null) {
    this.agentId = `${agentType.toLowerCase()}-${crypto.randomUUID().substring(0, 8)}`;
    this.agentType = agentType;
    this.capabilities = Array.isArray(capabilities) ? capabilities : [capabilities];
    this.config = config;
    this.status = 'IDLE';
    this.conversationHistory = [];
    this.reflectionLog = [];
    this.performanceMetrics = {
      tasks_completed: 0,
      success_rate: 1.0,
      avg_response_time_ms: 0,
      total_reflections: 0
    };

    // Database connection
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }

    this.dbId = null; // Database UUID, set after registration
  }

  /**
   * Initialize and register the agent
   */
  async initialize() {
    try {
      const query = `
        INSERT INTO agents (agent_type, agent_id, capabilities, status, config, performance_metrics)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (agent_id) DO UPDATE
        SET status = 'IDLE', last_active_at = NOW()
        RETURNING id
      `;

      const result = await this.pool.query(query, [
        this.agentType,
        this.agentId,
        JSON.stringify(this.capabilities),
        this.status,
        JSON.stringify(this.config),
        JSON.stringify(this.performanceMetrics)
      ]);

      this.dbId = result.rows[0].id;
      this.status = 'IDLE';

      return {
        success: true,
        agentId: this.agentId,
        dbId: this.dbId,
        message: `${this.agentType} agent initialized`
      };
    } catch (error) {
      throw new Error(`Agent initialization failed: ${error.message}`);
    }
  }

  /**
   * Process a task (to be overridden by subclasses)
   */
  async process(task, context = {}) {
    throw new Error('process() must be implemented by subclass');
  }

  /**
   * Validate input before processing
   */
  async validateInput(input) {
    if (!input || typeof input !== 'object') {
      return { valid: false, error: 'Input must be a non-null object' };
    }
    return { valid: true };
  }

  /**
   * Validate output after processing
   */
  async validateOutput(output) {
    if (!output || typeof output !== 'object') {
      return { valid: false, error: 'Output must be a non-null object' };
    }
    return { valid: true };
  }

  /**
   * Reflect on a decision and outcome
   */
  async reflect(decision, outcome = null) {
    const reflectionId = `reflection-${crypto.randomUUID()}`;

    const reflection = {
      reflectionId,
      agentId: this.agentId,
      decision,
      outcome,
      timestamp: new Date(),
      analysis: await this.analyzeOutcome(decision, outcome)
    };

    // Store reflection
    const query = `
      INSERT INTO agent_reflections (reflection_id, agent_id, decision_id, decision, outcome, reflection, learnings)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    await this.pool.query(query, [
      reflectionId,
      this.dbId,
      decision.id || crypto.randomUUID(),
      JSON.stringify(decision),
      outcome ? JSON.stringify(outcome) : null,
      reflection.analysis.reflection,
      JSON.stringify(reflection.analysis.learnings)
    ]);

    this.reflectionLog.push(reflection);
    this.performanceMetrics.total_reflections++;

    return reflection;
  }

  /**
   * Analyze outcome for reflection
   */
  async analyzeOutcome(decision, outcome) {
    const learnings = [];

    if (outcome && outcome.success) {
      learnings.push('Decision led to successful outcome');
    } else if (outcome && !outcome.success) {
      learnings.push('Decision did not achieve desired outcome');
      if (outcome.error) {
        learnings.push(`Error: ${outcome.error}`);
      }
    }

    return {
      reflection: `Decision: ${JSON.stringify(decision)} → Outcome: ${JSON.stringify(outcome)}`,
      learnings,
      wouldDoAgain: outcome?.success || false
    };
  }

  /**
   * Communicate with another agent
   */
  async communicate(targetAgentId, message, messageType = 'GENERAL') {
    const messageId = `msg-${crypto.randomUUID()}`;

    // Find target agent
    const targetQuery = 'SELECT id FROM agents WHERE agent_id = $1';
    const targetResult = await this.pool.query(targetQuery, [targetAgentId]);

    if (targetResult.rows.length === 0) {
      throw new Error(`Target agent ${targetAgentId} not found`);
    }

    const targetDbId = targetResult.rows[0].id;

    // Store communication
    const query = `
      INSERT INTO agent_communications (message_id, from_agent, to_agent, message_type, message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    await this.pool.query(query, [
      messageId,
      this.dbId,
      targetDbId,
      messageType,
      JSON.stringify(message)
    ]);

    this.conversationHistory.push({
      messageId,
      to: targetAgentId,
      type: messageType,
      message,
      sentAt: new Date()
    });

    return { messageId, sent: true };
  }

  /**
   * Receive messages from other agents
   */
  async receiveMessages(acknowledged = false) {
    const query = `
      SELECT ac.*, fa.agent_id as from_agent_name
      FROM agent_communications ac
      JOIN agents fa ON ac.from_agent = fa.id
      WHERE ac.to_agent = $1 AND ac.acknowledged = $2
      ORDER BY ac.sent_at DESC
      LIMIT 50
    `;

    const result = await this.pool.query(query, [this.dbId, acknowledged]);

    return result.rows.map(row => ({
      messageId: row.message_id,
      from: row.from_agent_name,
      type: row.message_type,
      message: row.message,
      sentAt: row.sent_at,
      acknowledged: row.acknowledged
    }));
  }

  /**
   * Acknowledge a received message
   */
  async acknowledgeMessage(messageId) {
    const query = `
      UPDATE agent_communications
      SET acknowledged = true, received_at = NOW()
      WHERE message_id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [messageId]);
    return result.rows[0];
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      agentId: this.agentId,
      agentType: this.agentType,
      status: this.status,
      capabilities: this.capabilities,
      performanceMetrics: this.performanceMetrics,
      activeConversations: this.conversationHistory.length,
      reflections: this.reflectionLog.length
    };
  }

  /**
   * Update agent status
   */
  async updateStatus(newStatus) {
    this.status = newStatus;

    const query = `
      UPDATE agents
      SET status = $1, last_active_at = NOW()
      WHERE id = $2
    `;

    await this.pool.query(query, [newStatus, this.dbId]);
  }

  /**
   * Update performance metrics after task completion
   */
  async updateMetrics(taskSuccess, durationMs) {
    if (taskSuccess) {
      this.performanceMetrics.tasks_completed++;
    }

    // Recalculate success rate
    const totalTasks = await this.pool.query(
      'SELECT COUNT(*) as count FROM agent_tasks WHERE assigned_to = $1 AND status IN ($2, $3)',
      [this.dbId, 'COMPLETED', 'FAILED']
    );

    const total = parseInt(totalTasks.rows[0].count);
    if (total > 0) {
      this.performanceMetrics.success_rate = this.performanceMetrics.tasks_completed / total;
    }

    // Update avg response time
    if (durationMs) {
      const currentAvg = this.performanceMetrics.avg_response_time_ms;
      const completed = this.performanceMetrics.tasks_completed;
      this.performanceMetrics.avg_response_time_ms =
        ((currentAvg * (completed - 1)) + durationMs) / completed;
    }

    // Update in database
    const query = `
      UPDATE agents
      SET performance_metrics = $1, last_active_at = NOW()
      WHERE id = $2
    `;

    await this.pool.query(query, [JSON.stringify(this.performanceMetrics), this.dbId]);
  }

  /**
   * Shutdown the agent
   */
  async shutdown() {
    await this.updateStatus('OFFLINE');
    await this.pool.end();

    return { success: true, message: `${this.agentId} shut down successfully` };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default BaseAgent;
