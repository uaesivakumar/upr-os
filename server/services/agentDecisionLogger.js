/**
 * Agent Decision Logger
 * Logs all agent decisions, messages, and consensus votes to database
 */

const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class AgentDecisionLogger {
  /**
   * Log an agent decision
   */
  static async logDecision({ agentId, agentType, toolName, decision, confidence, reasoning, context = {} }) {
    const decisionId = uuidv4();

    try {
      const result = await pool.query(
        `INSERT INTO agent_core.agent_decisions (
          decision_id, agent_id, agent_type, tool_name,
          decision_data, confidence_score, reasoning, context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING decision_id, decided_at`,
        [
          decisionId,
          agentId,
          agentType,
          toolName,
          JSON.stringify(decision),
          confidence,
          reasoning,
          JSON.stringify(context)
        ]
      );

      console.log(`[AgentDecisionLogger] Logged decision ${decisionId} from ${agentId}`);
      return result.rows[0];
    } catch (error) {
      console.error('[AgentDecisionLogger] Error logging decision:', error.message);
      throw error;
    }
  }

  /**
   * Log an inter-agent message
   */
  static async logMessage(message) {
    try {
      await pool.query(
        `INSERT INTO agent_core.agent_messages (
          message_id, correlation_id, from_agent, to_agent,
          message_type, payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (message_id) DO NOTHING`,
        [
          message.messageId,
          message.correlationId,
          message.from,
          message.to,
          message.type,
          JSON.stringify(message.payload),
          message.timestamp
        ]
      );

      console.log(`[AgentDecisionLogger] Logged message ${message.messageId} (${message.from} -> ${message.to})`);
    } catch (error) {
      console.error('[AgentDecisionLogger] Error logging message:', error.message);
    }
  }

  /**
   * Mark message as processed
   */
  static async markMessageProcessed(messageId) {
    try {
      await pool.query(
        `UPDATE agent_core.agent_messages
         SET processed_at = NOW()
         WHERE message_id = $1`,
        [messageId]
      );
    } catch (error) {
      console.error('[AgentDecisionLogger] Error marking message processed:', error.message);
    }
  }

  /**
   * Log a consensus vote
   */
  static async logConsensusVote({ decisionId, agentId, vote, confidence, reasoning }) {
    try {
      await pool.query(
        `INSERT INTO agent_core.consensus_votes (
          decision_id, agent_id, vote, confidence, reasoning
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          decisionId,
          agentId,
          JSON.stringify(vote),
          confidence,
          reasoning
        ]
      );

      console.log(`[AgentDecisionLogger] Logged vote from ${agentId} for decision ${decisionId}`);
    } catch (error) {
      console.error('[AgentDecisionLogger] Error logging vote:', error.message);
    }
  }

  /**
   * Get decision history for an agent
   */
  static async getAgentDecisionHistory(agentId, limit = 100) {
    try {
      const result = await pool.query(
        `SELECT decision_id, tool_name, decision_data, confidence_score, reasoning, decided_at
         FROM agent_core.agent_decisions
         WHERE agent_id = $1
         ORDER BY decided_at DESC
         LIMIT $2`,
        [agentId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[AgentDecisionLogger] Error getting decision history:', error.message);
      return [];
    }
  }

  /**
   * Get message history for a correlation ID
   */
  static async getMessageChain(correlationId) {
    try {
      const result = await pool.query(
        `SELECT message_id, from_agent, to_agent, message_type, payload, created_at, processed_at
         FROM agent_core.agent_messages
         WHERE correlation_id = $1
         ORDER BY created_at ASC`,
        [correlationId]
      );

      return result.rows;
    } catch (error) {
      console.error('[AgentDecisionLogger] Error getting message chain:', error.message);
      return [];
    }
  }

  /**
   * Get consensus votes for a decision
   */
  static async getConsensusVotes(decisionId) {
    try {
      const result = await pool.query(
        `SELECT agent_id, vote, confidence, reasoning, voted_at
         FROM agent_core.consensus_votes
         WHERE decision_id = $1
         ORDER BY voted_at ASC`,
        [decisionId]
      );

      return result.rows;
    } catch (error) {
      console.error('[AgentDecisionLogger] Error getting consensus votes:', error.message);
      return [];
    }
  }

  /**
   * Get agent communication stats
   */
  static async getAgentStats(agentId, timeWindow = '7 days') {
    try {
      const [messageStats, decisionStats] = await Promise.all([
        // Message stats
        pool.query(
          `SELECT
            COUNT(*) as total_messages,
            COUNT(*) FILTER (WHERE from_agent = $1) as messages_sent,
            COUNT(*) FILTER (WHERE to_agent = $1) as messages_received,
            COUNT(*) FILTER (WHERE message_type = 'REQUEST') as requests,
            COUNT(*) FILTER (WHERE message_type = 'RESPONSE') as responses
           FROM agent_core.agent_messages
           WHERE (from_agent = $1 OR to_agent = $1)
             AND created_at >= NOW() - $2::interval`,
          [agentId, timeWindow]
        ),
        // Decision stats
        pool.query(
          `SELECT
            COUNT(*) as total_decisions,
            AVG(confidence_score) as avg_confidence,
            MIN(confidence_score) as min_confidence,
            MAX(confidence_score) as max_confidence
           FROM agent_core.agent_decisions
           WHERE agent_id = $1
             AND decided_at >= NOW() - $2::interval`,
          [agentId, timeWindow]
        )
      ]);

      return {
        agentId,
        timeWindow,
        messages: messageStats.rows[0],
        decisions: decisionStats.rows[0]
      };
    } catch (error) {
      console.error('[AgentDecisionLogger] Error getting agent stats:', error.message);
      return null;
    }
  }

  /**
   * Get overall system stats
   */
  static async getSystemStats(timeWindow = '24 hours') {
    try {
      const [messageStats, decisionStats, agentActivity] = await Promise.all([
        // Message stats
        pool.query(
          `SELECT
            COUNT(*) as total_messages,
            COUNT(DISTINCT from_agent) as active_senders,
            COUNT(DISTINCT to_agent) as active_receivers,
            COUNT(*) FILTER (WHERE message_type = 'REQUEST') as total_requests,
            COUNT(*) FILTER (WHERE message_type = 'RESPONSE') as total_responses,
            COUNT(*) FILTER (WHERE message_type = 'NOTIFICATION') as total_notifications
           FROM agent_core.agent_messages
           WHERE created_at >= NOW() - $1::interval`,
          [timeWindow]
        ),
        // Decision stats
        pool.query(
          `SELECT
            COUNT(*) as total_decisions,
            COUNT(DISTINCT agent_id) as active_agents,
            AVG(confidence_score) as avg_confidence
           FROM agent_core.agent_decisions
           WHERE decided_at >= NOW() - $1::interval`,
          [timeWindow]
        ),
        // Agent activity
        pool.query(
          `SELECT agent_id, COUNT(*) as decision_count
           FROM agent_core.agent_decisions
           WHERE decided_at >= NOW() - $1::interval
           GROUP BY agent_id
           ORDER BY decision_count DESC`,
          [timeWindow]
        )
      ]);

      return {
        timeWindow,
        messages: messageStats.rows[0],
        decisions: decisionStats.rows[0],
        agentActivity: agentActivity.rows
      };
    } catch (error) {
      console.error('[AgentDecisionLogger] Error getting system stats:', error.message);
      return null;
    }
  }

  /**
   * Clean up old logs
   */
  static async cleanupOldLogs(retentionDays = 90) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const cutoffDate = `${retentionDays} days`;

      // Delete old messages
      const messages = await client.query(
        `DELETE FROM agent_core.agent_messages
         WHERE created_at < NOW() - $1::interval`,
        [cutoffDate]
      );

      // Delete old decisions (keep consensus votes via cascade)
      const decisions = await client.query(
        `DELETE FROM agent_core.agent_decisions
         WHERE decided_at < NOW() - $1::interval`,
        [cutoffDate]
      );

      await client.query('COMMIT');

      console.log(`[AgentDecisionLogger] Cleanup complete: ${messages.rowCount} messages, ${decisions.rowCount} decisions deleted`);

      return {
        messagesDeleted: messages.rowCount,
        decisionsDeleted: decisions.rowCount
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[AgentDecisionLogger] Error during cleanup:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = AgentDecisionLogger;
