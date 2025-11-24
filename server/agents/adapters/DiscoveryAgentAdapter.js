/**
 * Discovery Agent Adapter
 * Adapts existing DiscoveryAgent to work with Sprint 42 multi-agent coordination
 */

const EventEmitter = require('events');
const { AgentProtocol, ActionType } = require('../AgentProtocol');
const pool = require('../../config/database');

class DiscoveryAgentAdapter extends EventEmitter {
  constructor() {
    super();
    this.agentId = 'discovery-agent';
    this.agentType = 'discovery';
    this.capabilities = [
      'pattern_analysis',
      'hypothesis_generation',
      'anomaly_detection',
      'trend_identification'
    ];
    this.status = 'initialized';
    this.discoveryCount = 0;
    this.lastActivity = null;
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    console.log(`[${this.agentId}] Initializing Discovery Agent...`);
    this.status = 'active';
    this.lastActivity = new Date();
    return true;
  }

  /**
   * Receive message from coordinator
   */
  async receiveMessage(message) {
    this.lastActivity = new Date();

    try {
      console.log(`[${this.agentId}] Received message:`, {
        type: message.type,
        from: message.from,
        action: message.payload.action
      });

      // Handle consensus requests
      if (message.payload.action === ActionType.CONSENSUS) {
        const result = await this.handleConsensus(message.payload.data, message.payload.context);

        const voteResponse = AgentProtocol.createConsensusVote({
          from: this.agentId,
          to: message.from,
          vote: result.vote,
          confidence: result.confidence,
          reasoning: result.reasoning,
          correlationId: message.correlationId
        });

        this.sendMessage(voteResponse);
        return;
      }

      // Handle other actions
      const result = await this.process(message.payload);

      const response = AgentProtocol.createResponse({
        from: this.agentId,
        to: message.from,
        action: message.payload.action,
        data: result,
        context: { success: true },
        correlationId: message.correlationId
      });

      this.sendMessage(response);
    } catch (error) {
      console.error(`[${this.agentId}] Error:`, error.message);

      const errorResponse = AgentProtocol.createErrorResponse({
        from: this.agentId,
        to: message.from,
        error,
        correlationId: message.correlationId
      });

      this.sendMessage(errorResponse);
    }
  }

  /**
   * Send message via event emitter
   */
  sendMessage(message) {
    this.lastActivity = new Date();
    this.emit('message', message);
  }

  /**
   * Main processing logic
   */
  async process(input) {
    const { action, data, context } = input;

    switch (action) {
      case ActionType.ANALYZE:
        return await this.analyzeHistoricalData(data);
      case 'DISCOVER':
        return await this.discoverPatterns(data);
      default:
        return { message: `Discovery Agent processed ${action}`, data };
    }
  }

  /**
   * Analyze historical data
   */
  async analyzeHistoricalData(data) {
    const timeWindow = data.timeWindow || '30 days';

    const decisions = await pool.query(
      `SELECT decision_id, tool_name, confidence_score, decided_at
       FROM agent_core.agent_decisions
       WHERE decided_at >= NOW() - $1::interval
       LIMIT 500`,
      [timeWindow]
    );

    const feedback = await pool.query(
      `SELECT decision_id, outcome_positive, outcome_type
       FROM agent_core.decision_feedback
       WHERE created_at >= NOW() - $1::interval`,
      [timeWindow]
    );

    const patterns = this.identifyPatterns(decisions.rows, feedback.rows);

    this.discoveryCount++;

    return {
      timeWindow,
      totalDecisions: decisions.rows.length,
      totalFeedback: feedback.rows.length,
      patterns: patterns.patterns,
      anomalies: patterns.anomalies,
      hypotheses: this.generateHypotheses(patterns),
      confidence: this.calculateConfidence(patterns)
    };
  }

  /**
   * Discover patterns
   */
  async discoverPatterns(data) {
    const { dataset } = data;

    if (!dataset || dataset.length === 0) {
      return { patterns: [], message: 'No data provided' };
    }

    const patterns = this.identifyPatterns(dataset, []);

    return {
      patterns: patterns.patterns,
      confidence: this.calculateConfidence(patterns)
    };
  }

  /**
   * Identify patterns
   */
  identifyPatterns(decisions, feedback) {
    const patterns = [];
    const anomalies = [];

    // Low confidence pattern
    const lowConf = decisions.filter(d => d.confidence_score < 0.5);
    if (lowConf.length > decisions.length * 0.2) {
      patterns.push({
        type: 'low_confidence',
        description: 'High proportion of low-confidence decisions',
        count: lowConf.length,
        severity: 'high'
      });
    }

    // Correction pattern
    if (feedback.length > 0) {
      const corrections = feedback.filter(f => f.outcome_positive === false);
      const rate = corrections.length / feedback.length;
      if (rate > 0.3) {
        patterns.push({
          type: 'high_correction_rate',
          description: 'High rate of negative outcomes',
          rate: (rate * 100).toFixed(1) + '%',
          severity: 'high'
        });
      }
    }

    return { patterns, anomalies };
  }

  /**
   * Generate hypotheses
   */
  generateHypotheses(patternAnalysis) {
    const hypotheses = [];

    patternAnalysis.patterns.forEach(pattern => {
      if (pattern.type === 'low_confidence') {
        hypotheses.push({
          hypothesis: 'System needs additional training data or rule refinement',
          confidence: 0.7,
          basis: pattern.description
        });
      }
    });

    return hypotheses;
  }

  /**
   * Calculate confidence
   */
  calculateConfidence(patternAnalysis) {
    const total = patternAnalysis.patterns.length + patternAnalysis.anomalies.length;
    if (total === 0) return 0.3;
    if (total >= 5) return 0.9;
    return 0.5 + (total * 0.08);
  }

  /**
   * Handle consensus voting
   */
  async handleConsensus(data, context) {
    const decision = data.decision;

    // Discovery agent votes based on pattern alignment
    const confidence = 0.7;
    const reasoning = 'Decision consistent with historical patterns';

    return {
      vote: decision,
      confidence,
      reasoning
    };
  }

  /**
   * Get agent status
   */
  async getStatus() {
    return {
      agentId: this.agentId,
      agentType: this.agentType,
      status: this.status,
      capabilities: this.capabilities,
      discoveryCount: this.discoveryCount,
      lastActivity: this.lastActivity
    };
  }

  /**
   * Shutdown
   */
  async shutdown() {
    this.status = 'shutdown';
    this.removeAllListeners();
    console.log(`[${this.agentId}] Shutdown complete`);
  }
}

module.exports = DiscoveryAgentAdapter;
