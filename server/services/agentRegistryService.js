/**
 * Agent Registry Service
 * Manages agent registration, discovery, and lifecycle
 */

import pg from 'pg';
const { Pool } = pg;

export class AgentRegistryService {
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
   * Register a new agent
   */
  async registerAgent(agentId, agentType, capabilities, config = {}) {
    const query = `
      INSERT INTO agents (agent_id, agent_type, capabilities, status, config)
      VALUES ($1, $2, $3, 'IDLE', $4)
      ON CONFLICT (agent_id) DO UPDATE
      SET
        agent_type = $2,
        capabilities = $3,
        status = 'IDLE',
        config = $4,
        last_active_at = NOW()
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      agentId,
      agentType,
      JSON.stringify(capabilities),
      JSON.stringify(config)
    ]);

    return result.rows[0];
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId) {
    // First, set status to offline
    const updateQuery = `
      UPDATE agents
      SET status = 'OFFLINE', last_active_at = NOW()
      WHERE agent_id = $1
      RETURNING *
    `;

    const result = await this.pool.query(updateQuery, [agentId]);

    return {
      success: result.rows.length > 0,
      agent: result.rows[0]
    };
  }

  /**
   * Discover agents by capabilities
   */
  async discoverAgents(requiredCapabilities = [], availability = 'ANY') {
    let query = `
      SELECT *
      FROM agents
      WHERE 1=1
    `;

    const params = [];

    // Filter by capabilities if provided
    if (requiredCapabilities.length > 0) {
      params.push(JSON.stringify(requiredCapabilities));
      query += ` AND capabilities ?| ARRAY(SELECT jsonb_array_elements_text($${params.length}::jsonb))`;
    }

    // Filter by availability
    if (availability === 'IDLE') {
      query += ` AND status = 'IDLE'`;
    } else if (availability === 'AVAILABLE') {
      query += ` AND status IN ('IDLE', 'BUSY')`;
    } else if (availability === 'ONLINE') {
      query += ` AND status != 'OFFLINE'`;
    }

    query += ` ORDER BY (performance_metrics->>'success_rate')::DECIMAL DESC`;

    const result = await this.pool.query(query, params);

    return result.rows.map(agent => ({
      id: agent.id,
      agentId: agent.agent_id,
      agentType: agent.agent_type,
      capabilities: agent.capabilities,
      status: agent.status,
      performanceMetrics: agent.performance_metrics,
      lastActiveAt: agent.last_active_at
    }));
  }

  /**
   * Get agent status
   */
  async getAgentStatus(agentId) {
    const query = `
      SELECT a.*, COUNT(at.id) FILTER (WHERE at.status = 'IN_PROGRESS') as active_tasks
      FROM agents a
      LEFT JOIN agent_tasks at ON a.id = at.assigned_to
      WHERE a.agent_id = $1
      GROUP BY a.id, a.agent_type, a.agent_id, a.capabilities, a.status, a.config, a.created_at, a.last_active_at, a.performance_metrics
    `;

    const result = await this.pool.query(query, [agentId]);

    if (result.rows.length === 0) {
      return { found: false, message: 'Agent not found' };
    }

    const agent = result.rows[0];

    return {
      found: true,
      agentId: agent.agent_id,
      agentType: agent.agent_type,
      status: agent.status,
      capabilities: agent.capabilities,
      activeTasks: parseInt(agent.active_tasks),
      performanceMetrics: agent.performance_metrics,
      lastActiveAt: agent.last_active_at,
      createdAt: agent.created_at
    };
  }

  /**
   * Update agent metrics
   */
  async updateAgentMetrics(agentId, metrics) {
    const query = `
      UPDATE agents
      SET performance_metrics = $2, last_active_at = NOW()
      WHERE agent_id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [agentId, JSON.stringify(metrics)]);

    return result.rows[0];
  }

  /**
   * Get all agents
   */
  async getAllAgents(filters = {}) {
    let query = 'SELECT * FROM agents WHERE 1=1';
    const params = [];

    if (filters.agentType) {
      params.push(filters.agentType);
      query += ` AND agent_type = $${params.length}`;
    }

    if (filters.status) {
      params.push(filters.status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);

    return result.rows;
  }

  /**
   * Get agent performance view
   */
  async getAgentPerformance() {
    const query = 'SELECT * FROM agent_performance_view ORDER BY avg_task_duration_ms ASC';
    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Find best available agent for capabilities
   */
  async findBestAgent(requiredCapabilities = []) {
    // Use PostgreSQL function to find best match
    const query = `
      SELECT * FROM find_available_agents($1::jsonb)
      LIMIT 1
    `;

    const result = await this.pool.query(query, [JSON.stringify(requiredCapabilities)]);

    if (result.rows.length === 0) {
      return { found: false, message: 'No agents available with required capabilities' };
    }

    return {
      found: true,
      agent: {
        id: result.rows[0].agent_id,
        name: result.rows[0].agent_name,
        type: result.rows[0].agent_type,
        capabilities: result.rows[0].matching_capabilities
      }
    };
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agentId, status) {
    const query = `
      UPDATE agents
      SET status = $2, last_active_at = NOW()
      WHERE agent_id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [agentId, status]);

    return {
      success: result.rows.length > 0,
      agent: result.rows[0]
    };
  }

  /**
   * Get agent statistics
   */
  async getAgentStatistics() {
    const query = `
      SELECT
        COUNT(*) as total_agents,
        COUNT(*) FILTER (WHERE status = 'IDLE') as idle_agents,
        COUNT(*) FILTER (WHERE status = 'BUSY') as busy_agents,
        COUNT(*) FILTER (WHERE status = 'ERROR') as error_agents,
        COUNT(*) FILTER (WHERE status = 'OFFLINE') as offline_agents,
        AVG((performance_metrics->>'success_rate')::DECIMAL) as avg_success_rate,
        AVG((performance_metrics->>'avg_response_time_ms')::DECIMAL) as avg_response_time
      FROM agents
    `;

    const result = await this.pool.query(query);

    return {
      totalAgents: parseInt(result.rows[0].total_agents),
      idleAgents: parseInt(result.rows[0].idle_agents),
      busyAgents: parseInt(result.rows[0].busy_agents),
      errorAgents: parseInt(result.rows[0].error_agents),
      offlineAgents: parseInt(result.rows[0].offline_agents),
      avgSuccessRate: parseFloat(result.rows[0].avg_success_rate || 0),
      avgResponseTime: parseFloat(result.rows[0].avg_response_time || 0)
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default AgentRegistryService;
