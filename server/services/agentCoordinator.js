/**
 * Agent Coordination Service
 * Routes messages between agents, manages lifecycles, and orchestrates workflows
 */

const EventEmitter = require('events');
const { AgentProtocol, MessageType } = require('../agents/AgentProtocol');
const pool = require('../config/database');
const AgentDecisionLogger = require('./agentDecisionLogger');

class AgentCoordinator extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map(); // agentId -> agent instance
    this.messageQueue = [];
    this.messageHistory = new Map(); // correlationId -> messages[]
    this.activeWorkflows = new Map(); // workflowId -> workflow state
    this.isProcessing = false;
  }

  /**
   * Register an agent with the coordinator
   */
  registerAgent(agentId, agentInstance) {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already registered`);
    }

    this.agents.set(agentId, agentInstance);
    console.log(`[AgentCoordinator] Registered agent: ${agentId}`);

    // Set up agent message handling
    agentInstance.on('message', (message) => this.handleAgentMessage(message));

    return agentId;
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId) {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is not registered`);
    }

    const agent = this.agents.get(agentId);
    agent.removeAllListeners('message');
    this.agents.delete(agentId);

    console.log(`[AgentCoordinator] Unregistered agent: ${agentId}`);
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * Get all registered agents
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent count
   */
  getAgentCount() {
    return this.agents.size;
  }

  /**
   * Handle message from an agent
   */
  async handleAgentMessage(message) {
    // Validate message
    const validation = AgentProtocol.validate(message);
    if (!validation.valid) {
      console.error('[AgentCoordinator] Invalid message:', validation.errors);
      return;
    }

    // Store message in history
    if (!this.messageHistory.has(message.correlationId)) {
      this.messageHistory.set(message.correlationId, []);
    }
    this.messageHistory.get(message.correlationId).push(message);

    // Persist to database
    await this.persistMessage(message);

    // Route message
    await this.routeMessage(message);

    // Emit event
    this.emit('message', message);
  }

  /**
   * Route message to destination agent(s)
   */
  async routeMessage(message) {
    if (AgentProtocol.isBroadcast(message)) {
      // Broadcast to all agents except sender
      for (const [agentId, agent] of this.agents.entries()) {
        if (agentId !== message.from) {
          try {
            await agent.receiveMessage(message);
          } catch (error) {
            console.error(`[AgentCoordinator] Error delivering to ${agentId}:`, error.message);
          }
        }
      }
    } else {
      // Send to specific agent
      const targetAgent = this.agents.get(message.to);
      if (!targetAgent) {
        // If target is coordinator itself, just emit the message (used for testing)
        if (message.to === 'coordinator') {
          // Message is already emitted above via handleAgentMessage
          return;
        }

        console.error(`[AgentCoordinator] Target agent not found: ${message.to}`);

        // Send error response
        const errorResponse = AgentProtocol.createErrorResponse({
          from: 'coordinator',
          to: message.from,
          error: new Error(`Agent ${message.to} not found`),
          correlationId: message.correlationId
        });

        const senderAgent = this.agents.get(message.from);
        if (senderAgent) {
          await senderAgent.receiveMessage(errorResponse);
        }
        return;
      }

      try {
        await targetAgent.receiveMessage(message);
      } catch (error) {
        console.error(`[AgentCoordinator] Error delivering to ${message.to}:`, error.message);
      }
    }
  }

  /**
   * Send message on behalf of an agent
   */
  async sendMessage(message) {
    await this.handleAgentMessage(message);
  }

  /**
   * Get message history for a correlation ID
   */
  getMessageHistory(correlationId) {
    return this.messageHistory.get(correlationId) || [];
  }

  /**
   * Orchestrate multi-agent workflow
   */
  async orchestrateWorkflow({ workflowId, agents, input, workflow }) {
    const workflowState = {
      id: workflowId,
      agents,
      input,
      workflow,
      status: 'running',
      results: {},
      startedAt: new Date(),
      completedAt: null
    };

    this.activeWorkflows.set(workflowId, workflowState);

    try {
      // Execute workflow steps
      for (const step of workflow.steps) {
        const result = await this.executeWorkflowStep(workflowId, step);
        workflowState.results[step.name] = result;
      }

      workflowState.status = 'completed';
      workflowState.completedAt = new Date();

      return workflowState.results;
    } catch (error) {
      workflowState.status = 'failed';
      workflowState.error = error.message;
      workflowState.completedAt = new Date();
      throw error;
    }
  }

  /**
   * Execute a single workflow step
   */
  async executeWorkflowStep(workflowId, step) {
    const { agentId, action, data, timeout = 30000 } = step;

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Create request message
    const request = AgentProtocol.createRequest({
      from: 'coordinator',
      to: agentId,
      action,
      data,
      context: { workflowId }
    });

    // Send request
    await this.sendMessage(request);

    // Wait for response
    const response = await this.waitForResponse(request.messageId, timeout);

    return response.payload.data;
  }

  /**
   * Wait for response to a message
   */
  async waitForResponse(messageId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeListener('message', messageHandler);
        reject(new Error(`Response timeout for message ${messageId}`));
      }, timeout);

      const messageHandler = (message) => {
        if (message.type === MessageType.RESPONSE &&
            message.correlationId === messageId) {
          clearTimeout(timeoutId);
          this.removeListener('message', messageHandler);
          resolve(message);
        }
      };

      this.on('message', messageHandler);
    });
  }

  /**
   * Request consensus from all agents
   */
  async requestConsensus({ decision, context = {}, timeout = 60000 }) {
    const consensusRequest = AgentProtocol.createConsensusRequest({
      from: 'coordinator',
      decision,
      context
    });

    const votes = [];
    const correlationId = consensusRequest.correlationId;

    // Send consensus request
    await this.sendMessage(consensusRequest);

    // Collect votes
    const votePromises = Array.from(this.agents.keys())
      .filter(agentId => agentId !== 'coordinator')
      .map(agentId => {
        return this.waitForVote(correlationId, agentId, timeout)
          .catch(error => {
            console.error(`[AgentCoordinator] Vote timeout from ${agentId}`);
            return null;
          });
      });

    const results = await Promise.all(votePromises);
    votes.push(...results.filter(v => v !== null));

    // Calculate consensus
    const consensus = this.calculateConsensus(votes);

    // Persist consensus results
    await this.persistConsensus(consensusRequest.messageId, votes, consensus);

    return consensus;
  }

  /**
   * Wait for vote from a specific agent
   */
  async waitForVote(correlationId, agentId, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeListener('message', voteHandler);
        reject(new Error(`Vote timeout from ${agentId}`));
      }, timeout);

      const voteHandler = (message) => {
        if (message.correlationId === correlationId &&
            message.from === agentId &&
            message.payload.action === 'VOTE') {
          clearTimeout(timeoutId);
          this.removeListener('message', voteHandler);
          resolve(message.payload.data);
        }
      };

      this.on('message', voteHandler);
    });
  }

  /**
   * Calculate consensus from votes
   */
  calculateConsensus(votes) {
    if (votes.length === 0) {
      return {
        decision: null,
        consensusScore: 0,
        level: 'none',
        votes: []
      };
    }

    // Weighted voting
    let totalWeight = 0;
    const voteMap = new Map();

    votes.forEach(vote => {
      const key = JSON.stringify(vote.vote);
      const weight = vote.confidence || 1.0;

      if (!voteMap.has(key)) {
        voteMap.set(key, { vote: vote.vote, weight: 0, count: 0, reasoning: [] });
      }

      const entry = voteMap.get(key);
      entry.weight += weight;
      entry.count += 1;
      entry.reasoning.push(vote.reasoning);
      totalWeight += weight;
    });

    // Find winning decision
    let maxWeight = 0;
    let winningVote = null;

    for (const [, entry] of voteMap) {
      if (entry.weight > maxWeight) {
        maxWeight = entry.weight;
        winningVote = entry;
      }
    }

    const consensusScore = totalWeight > 0 ? (maxWeight / totalWeight) * 100 : 0;

    let level;
    if (consensusScore >= 90) level = 'strong';
    else if (consensusScore >= 70) level = 'moderate';
    else level = 'weak';

    return {
      decision: winningVote.vote,
      consensusScore: Math.round(consensusScore * 100) / 100,
      level,
      votes: votes,
      distribution: Array.from(voteMap.values())
    };
  }

  /**
   * Persist message to database
   */
  async persistMessage(message) {
    try {
      await pool.query(
        `INSERT INTO agent_core.agent_messages
         (message_id, correlation_id, from_agent, to_agent, message_type, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          message.messageId,
          message.correlationId,
          message.from,
          message.to,
          message.type,
          JSON.stringify(message.payload)
        ]
      );
    } catch (error) {
      console.error('[AgentCoordinator] Error persisting message:', error.message);
    }
  }

  /**
   * Persist consensus results
   */
  async persistConsensus(decisionId, votes, consensus) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Store each vote
      for (const vote of votes) {
        await client.query(
          `INSERT INTO agent_core.consensus_votes
           (decision_id, agent_id, vote, confidence, reasoning, voted_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            decisionId,
            vote.agentId || 'unknown',
            JSON.stringify(vote.vote),
            vote.confidence,
            vote.reasoning
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[AgentCoordinator] Error persisting consensus:', error.message);
    } finally {
      client.release();
    }
  }

  /**
   * Get agent health status
   */
  async getAgentHealth() {
    const health = [];

    for (const [agentId, agent] of this.agents.entries()) {
      try {
        const agentStatus = await agent.getStatus();
        health.push({
          agentId,
          status: 'healthy',
          agentState: agentStatus
        });
      } catch (error) {
        health.push({
          agentId,
          status: 'unhealthy',
          error: error.message
        });
      }
    }

    return health;
  }

  /**
   * Reset coordinator state
   */
  reset() {
    this.messageQueue = [];
    this.messageHistory.clear();
    this.activeWorkflows.clear();
    this.removeAllListeners();
    console.log('[AgentCoordinator] State reset');
  }

  /**
   * Shutdown coordinator and all agents
   */
  async shutdown() {
    console.log('[AgentCoordinator] Shutting down...');

    // Shutdown all agents
    for (const [agentId, agent] of this.agents.entries()) {
      try {
        if (typeof agent.shutdown === 'function') {
          await agent.shutdown();
        }
        this.unregisterAgent(agentId);
      } catch (error) {
        console.error(`[AgentCoordinator] Error shutting down ${agentId}:`, error.message);
      }
    }

    this.reset();
    console.log('[AgentCoordinator] Shutdown complete');
  }
}

// Singleton instance
const coordinator = new AgentCoordinator();

module.exports = coordinator;
