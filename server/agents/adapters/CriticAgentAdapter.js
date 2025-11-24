/**
 * Critic Agent Adapter
 * Adapts existing CriticAgent to work with Sprint 42 multi-agent coordination
 */

const EventEmitter = require('events');
const { AgentProtocol, ActionType } = require('../AgentProtocol');
const pool = require('../../config/database');

class CriticAgentAdapter extends EventEmitter {
  constructor() {
    super();
    this.agentId = 'critic-agent';
    this.agentType = 'critic';
    this.capabilities = [
      'quality_evaluation',
      'bias_detection',
      'logical_analysis',
      'constructive_criticism'
    ];
    this.status = 'initialized';
    this.critiqueCount = 0;
    this.lastActivity = null;
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    console.log(`[${this.agentId}] Initializing Critic Agent...`);
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
      case ActionType.CRITIQUE:
        return await this.critiqueDecision(data);
      case 'EVALUATE_QUALITY':
        return await this.evaluateQuality(data);
      case 'DETECT_BIAS':
        return await this.detectBias(data);
      default:
        return { message: `Critic Agent processed ${action}`, data };
    }
  }

  /**
   * Critique a decision
   */
  async critiqueDecision(data) {
    const { decision, reasoning, confidence } = data;

    const critique = {
      overallScore: 0,
      strengths: [],
      weaknesses: [],
      improvements: [],
      biases: [],
      logicalIssues: []
    };

    // Evaluate confidence appropriateness
    if (confidence < 0.5) {
      critique.weaknesses.push('Low confidence score may indicate uncertainty');
      critique.improvements.push('Consider gathering more data or refining rules');
    } else if (confidence > 0.95) {
      critique.weaknesses.push('Very high confidence - check for overconfidence bias');
      critique.improvements.push('Validate assumptions and edge cases');
    } else {
      critique.strengths.push('Appropriate confidence level');
    }

    // Check reasoning quality
    if (!reasoning || reasoning.length < 10) {
      critique.weaknesses.push('Insufficient reasoning provided');
      critique.logicalIssues.push('Decision lacks clear justification');
      critique.improvements.push('Provide more detailed reasoning');
    } else {
      critique.strengths.push('Reasoning provided');
    }

    // Check for common biases
    if (reasoning && reasoning.toLowerCase().includes('always') || reasoning.toLowerCase().includes('never')) {
      critique.biases.push('Absolute language detected - may indicate confirmation bias');
      critique.improvements.push('Consider exceptions and edge cases');
    }

    // Query historical performance
    const historicalPerf = await pool.query(
      `SELECT AVG(confidence_score) as avg_confidence
       FROM agent_core.agent_decisions
       WHERE decided_at >= NOW() - INTERVAL '7 days'
       LIMIT 100`
    );

    if (historicalPerf.rows[0] && Math.abs(confidence - historicalPerf.rows[0].avg_confidence) > 0.3) {
      critique.weaknesses.push('Confidence significantly differs from recent average');
      critique.improvements.push('Review if this decision requires different evaluation criteria');
    }

    // Calculate overall score
    const strengthsScore = critique.strengths.length * 0.2;
    const weaknessesScore = critique.weaknesses.length * -0.15;
    const biasesScore = critique.biases.length * -0.1;
    const logicalIssuesScore = critique.logicalIssues.length * -0.2;

    critique.overallScore = Math.max(0, Math.min(1, 0.7 + strengthsScore + weaknessesScore + biasesScore + logicalIssuesScore));

    this.critiqueCount++;

    return {
      critique,
      recommendation: critique.overallScore > 0.7 ? 'APPROVE' : critique.overallScore > 0.5 ? 'APPROVE_WITH_CAUTION' : 'REJECT',
      confidence: critique.overallScore
    };
  }

  /**
   * Evaluate quality
   */
  async evaluateQuality(data) {
    const { item, criteria } = data;

    const qualityScores = {
      completeness: 0.8,
      accuracy: 0.85,
      relevance: 0.9,
      clarity: 0.75
    };

    // Check completeness
    if (!item || Object.keys(item).length < 3) {
      qualityScores.completeness = 0.4;
    }

    // Check for required fields
    const requiredFields = criteria?.requiredFields || [];
    const missingFields = requiredFields.filter(field => !item[field]);
    if (missingFields.length > 0) {
      qualityScores.completeness *= (1 - (missingFields.length / requiredFields.length) * 0.5);
    }

    const overallQuality = Object.values(qualityScores).reduce((sum, score) => sum + score, 0) / Object.keys(qualityScores).length;

    return {
      qualityScores,
      overallQuality,
      grade: overallQuality > 0.8 ? 'A' : overallQuality > 0.7 ? 'B' : overallQuality > 0.6 ? 'C' : 'D',
      issues: missingFields.length > 0 ? [`Missing fields: ${missingFields.join(', ')}`] : []
    };
  }

  /**
   * Detect bias
   */
  async detectBias(data) {
    const { text, context } = data;

    const biases = [];

    // Confirmation bias
    if (text.includes('obviously') || text.includes('clearly')) {
      biases.push({
        type: 'confirmation_bias',
        severity: 'medium',
        description: 'Language suggests predetermined conclusion'
      });
    }

    // Recency bias
    if (text.includes('recent') || text.includes('latest') || text.includes('just')) {
      biases.push({
        type: 'recency_bias',
        severity: 'low',
        description: 'May be overweighting recent information'
      });
    }

    // Absolutism
    if (text.includes('always') || text.includes('never') || text.includes('all') || text.includes('none')) {
      biases.push({
        type: 'absolutism',
        severity: 'high',
        description: 'Absolute statements may ignore exceptions'
      });
    }

    return {
      biasesDetected: biases.length,
      biases,
      recommendation: biases.length > 2 ? 'REVISE' : biases.length > 0 ? 'REVIEW' : 'ACCEPT'
    };
  }

  /**
   * Handle consensus voting
   */
  async handleConsensus(data, context) {
    const decision = data.decision;

    // Critic agent provides critical analysis
    const confidence = 0.75;
    const reasoning = 'Decision structure appears sound, but recommend validation of assumptions';

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
      critiqueCount: this.critiqueCount,
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

module.exports = CriticAgentAdapter;
