/**
 * Agent Monitoring Service
 * Monitors agent health, performance, and collaboration quality
 */

import pg from 'pg';
const { Pool } = pg;

export class AgentMonitoringService {
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
   * Track agent health
   */
  async trackAgentHealth(agentId) {
    const query = `
      SELECT
        a.*,
        COUNT(at.id) FILTER (WHERE at.status = 'IN_PROGRESS') as active_tasks,
        COUNT(at.id) FILTER (WHERE at.status = 'FAILED' AND at.completed_at >= NOW() - INTERVAL '1 hour') as recent_failures,
        MAX(at.completed_at) as last_task_completed
      FROM agents a
      LEFT JOIN agent_tasks at ON a.id = at.assigned_to
      WHERE a.agent_id = $1
      GROUP BY a.id, a.agent_type, a.agent_id, a.capabilities, a.status, a.config, a.created_at, a.last_active_at, a.performance_metrics
    `;

    const result = await this.pool.query(query, [agentId]);

    if (result.rows.length === 0) {
      return { found: false, agentId };
    }

    const agent = result.rows[0];
    const health = this.calculateHealthScore(agent);

    return {
      found: true,
      agentId: agent.agent_id,
      status: agent.status,
      health,
      activeTasks: parseInt(agent.active_tasks),
      recentFailures: parseInt(agent.recent_failures),
      lastActiveAt: agent.last_active_at,
      lastTaskCompleted: agent.last_task_completed
    };
  }

  /**
   * Calculate health score
   */
  calculateHealthScore(agent) {
    let score = 1.0;

    // Status penalties
    if (agent.status === 'ERROR') score -= 0.4;
    else if (agent.status === 'OFFLINE') score -= 0.6;
    else if (agent.status === 'BUSY') score -= 0.1;

    // Recent failures penalty
    const recentFailures = parseInt(agent.recent_failures || 0);
    if (recentFailures > 0) {
      score -= Math.min(recentFailures * 0.1, 0.3);
    }

    // Inactivity penalty
    if (agent.last_active_at) {
      const hoursSinceActive = (Date.now() - new Date(agent.last_active_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceActive > 24) score -= 0.2;
      else if (hoursSinceActive > 72) score -= 0.4;
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      status: score >= 0.8 ? 'HEALTHY' : score >= 0.5 ? 'DEGRADED' : 'UNHEALTHY'
    };
  }

  /**
   * Measure agent performance
   */
  async measurePerformance(agentId, timeRange = 24) {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE at.status = 'COMPLETED') as completed_tasks,
        COUNT(*) FILTER (WHERE at.status = 'FAILED') as failed_tasks,
        AVG(at.duration_ms) FILTER (WHERE at.status = 'COMPLETED') as avg_duration,
        MAX(at.completed_at) as last_completed,
        MIN(at.started_at) as first_started
      FROM agent_tasks at
      JOIN agents a ON at.assigned_to = a.id
      WHERE a.agent_id = $1
        AND at.started_at >= NOW() - INTERVAL '${timeRange} hours'
    `;

    const result = await this.pool.query(query, [agentId]);
    const stats = result.rows[0];

    const completedTasks = parseInt(stats.completed_tasks || 0);
    const failedTasks = parseInt(stats.failed_tasks || 0);
    const totalTasks = completedTasks + failedTasks;

    return {
      agentId,
      timeRange: `${timeRange}h`,
      completedTasks,
      failedTasks,
      totalTasks,
      successRate: totalTasks > 0 ? completedTasks / totalTasks : 1.0,
      avgDurationMs: parseFloat(stats.avg_duration || 0),
      lastCompleted: stats.last_completed,
      firstStarted: stats.first_started
    };
  }

  /**
   * Calculate collaboration score between agents
   */
  async calculateCollaborationScore(agents) {
    if (!Array.isArray(agents) || agents.length < 2) {
      return { score: 0, message: 'Need at least 2 agents for collaboration score' };
    }

    const query = `
      SELECT
        COUNT(*) as message_count,
        COUNT(*) FILTER (WHERE acknowledged = true) as acknowledged_count,
        AVG(EXTRACT(EPOCH FROM (received_at - sent_at))) as avg_response_time
      FROM agent_communications ac
      JOIN agents a1 ON ac.from_agent = a1.id
      JOIN agents a2 ON ac.to_agent = a2.id
      WHERE a1.agent_id = ANY($1::text[])
        AND a2.agent_id = ANY($1::text[])
        AND ac.sent_at >= NOW() - INTERVAL '24 hours'
    `;

    const result = await this.pool.query(query, [agents]);
    const stats = result.rows[0];

    const messageCount = parseInt(stats.message_count || 0);
    const acknowledgedCount = parseInt(stats.acknowledged_count || 0);

    const ackRate = messageCount > 0 ? acknowledgedCount / messageCount : 1.0;
    const responseTime = parseFloat(stats.avg_response_time || 0);

    // Calculate collaboration score
    let score = 0.5; // Base score

    // Acknowledgment rate contribution (0-0.3)
    score += ackRate * 0.3;

    // Communication frequency contribution (0-0.2)
    const commFrequency = Math.min(messageCount / 10, 1.0);
    score += commFrequency * 0.2;

    return {
      agents,
      score,
      messageCount,
      acknowledgmentRate: ackRate,
      avgResponseTime: responseTime,
      quality: score >= 0.8 ? 'EXCELLENT' : score >= 0.6 ? 'GOOD' : score >= 0.4 ? 'FAIR' : 'POOR'
    };
  }

  /**
   * Detect anomalies in agent behavior
   */
  async detectAnomalies(agentId) {
    const performance = await this.measurePerformance(agentId, 24);
    const anomalies = [];

    // Check for high failure rate
    if (performance.successRate < 0.7 && performance.totalTasks >= 5) {
      anomalies.push({
        type: 'HIGH_FAILURE_RATE',
        severity: 'HIGH',
        description: `Success rate (${(performance.successRate * 100).toFixed(1)}%) is below 70%`,
        recommendation: 'Investigate recent task failures'
      });
    }

    // Check for slow response time
    if (performance.avgDurationMs > 10000) {
      anomalies.push({
        type: 'SLOW_RESPONSE',
        severity: 'MEDIUM',
        description: `Average duration (${performance.avgDurationMs}ms) exceeds 10s`,
        recommendation: 'Review agent processing logic for bottlenecks'
      });
    }

    // Check for inactivity
    const health = await this.trackAgentHealth(agentId);
    if (health.found && health.lastActiveAt) {
      const hoursSinceActive = (Date.now() - new Date(health.lastActiveAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceActive > 24) {
        anomalies.push({
          type: 'INACTIVITY',
          severity: 'LOW',
          description: `Agent inactive for ${hoursSinceActive.toFixed(1)} hours`,
          recommendation: 'Verify agent is online and receiving tasks'
        });
      }
    }

    return {
      agentId,
      anomaliesDetected: anomalies.length,
      anomalies,
      status: anomalies.length === 0 ? 'NORMAL' : anomalies.some(a => a.severity === 'HIGH') ? 'CRITICAL' : 'WARNING'
    };
  }

  /**
   * Generate alerts based on conditions
   */
  async generateAlerts(conditions = {}) {
    const { minSuccessRate = 0.8, maxResponseTime = 5000, agentIds = [] } = conditions;

    const alerts = [];

    // Query agents based on conditions
    const query = `
      SELECT * FROM agent_performance_view
      ${agentIds.length > 0 ? 'WHERE agent_id = ANY($1::text[])' : ''}
    `;

    const result = await this.pool.query(query, agentIds.length > 0 ? [agentIds] : []);

    for (const agent of result.rows) {
      const successRate = parseFloat(agent.completed_tasks || 0) /
        (parseFloat(agent.completed_tasks || 0) + parseFloat(agent.failed_tasks || 0) || 1);

      if (successRate < minSuccessRate) {
        alerts.push({
          agentId: agent.agent_id,
          type: 'LOW_SUCCESS_RATE',
          severity: 'HIGH',
          message: `Success rate ${(successRate * 100).toFixed(1)}% below threshold ${(minSuccessRate * 100)}%`
        });
      }

      const avgDuration = parseFloat(agent.avg_task_duration_ms || 0);
      if (avgDuration > maxResponseTime) {
        alerts.push({
          agentId: agent.agent_id,
          type: 'SLOW_PERFORMANCE',
          severity: 'MEDIUM',
          message: `Avg duration ${avgDuration}ms exceeds ${maxResponseTime}ms`
        });
      }
    }

    return {
      alertsGenerated: alerts.length,
      alerts,
      timestamp: new Date()
    };
  }

  /**
   * Get monitoring dashboard
   */
  async getDashboard(options = {}) {
    const { timeRange = 24 } = options;

    // Get overall statistics
    const statsQuery = `
      SELECT
        COUNT(DISTINCT a.id) as total_agents,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'IDLE') as idle_agents,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'BUSY') as busy_agents,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'ERROR') as error_agents,
        COUNT(at.id) FILTER (WHERE at.status = 'COMPLETED') as completed_tasks,
        COUNT(at.id) FILTER (WHERE at.status = 'FAILED') as failed_tasks,
        AVG((a.performance_metrics->>'success_rate')::DECIMAL) as avg_success_rate,
        AVG((a.performance_metrics->>'avg_response_time_ms')::DECIMAL) as avg_response_time
      FROM agents a
      LEFT JOIN agent_tasks at ON a.id = at.assigned_to
        AND at.started_at >= NOW() - INTERVAL '${timeRange} hours'
    `;

    const statsResult = await this.pool.query(statsQuery);
    const stats = statsResult.rows[0];

    // Get agent performance
    const perfQuery = 'SELECT * FROM agent_performance_view ORDER BY avg_task_duration_ms ASC LIMIT 10';
    const perfResult = await this.pool.query(perfQuery);

    // Get workflow summary
    const workflowQuery = 'SELECT * FROM workflow_summary_view LIMIT 10';
    const workflowResult = await this.pool.query(workflowQuery);

    return {
      overview: {
        totalAgents: parseInt(stats.total_agents),
        idleAgents: parseInt(stats.idle_agents || 0),
        busyAgents: parseInt(stats.busy_agents || 0),
        errorAgents: parseInt(stats.error_agents || 0),
        completedTasks: parseInt(stats.completed_tasks || 0),
        failedTasks: parseInt(stats.failed_tasks || 0),
        avgSuccessRate: parseFloat(stats.avg_success_rate || 0),
        avgResponseTime: parseFloat(stats.avg_response_time || 0)
      },
      topPerformers: perfResult.rows.slice(0, 5).map(a => ({
        agentId: a.agent_id,
        agentType: a.agent_type,
        completedTasks: parseInt(a.completed_tasks || 0),
        avgDuration: parseFloat(a.avg_task_duration_ms || 0)
      })),
      recentWorkflows: workflowResult.rows.map(w => ({
        workflowId: w.workflow_id,
        type: w.workflow_type,
        status: w.status,
        duration: w.duration_ms
      })),
      health: this.calculateSystemHealth(stats)
    };
  }

  /**
   * Calculate system health
   */
  calculateSystemHealth(stats) {
    const totalTasks = parseInt(stats.completed_tasks || 0) + parseInt(stats.failed_tasks || 0);
    const successRate = totalTasks > 0 ? parseInt(stats.completed_tasks || 0) / totalTasks : 1.0;

    const errorAgents = parseInt(stats.error_agents || 0);
    const totalAgents = parseInt(stats.total_agents || 1);

    let score = 1.0;

    // Success rate impact
    if (successRate < 0.9) score -= (0.9 - successRate);

    // Error agents impact
    if (errorAgents > 0) {
      score -= (errorAgents / totalAgents) * 0.3;
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      status: score >= 0.9 ? 'HEALTHY' : score >= 0.7 ? 'DEGRADED' : 'UNHEALTHY',
      successRate
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default AgentMonitoringService;
