/**
 * Agent Coordination Service
 * Orchestrates multi-agent workflows and builds consensus
 */

import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

export class AgentCoordinationService {
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
   * Create a new workflow
   */
  async createWorkflow(workflowType, definition, workflowName = null) {
    const workflowId = `workflow-${crypto.randomUUID()}`;

    const query = `
      INSERT INTO agent_workflows (workflow_id, workflow_type, workflow_name, definition, status)
      VALUES ($1, $2, $3, $4, 'PENDING')
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      workflowId,
      workflowType,
      workflowName,
      JSON.stringify(definition)
    ]);

    return result.rows[0];
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId, input = {}) {
    // Get workflow definition
    const getQuery = 'SELECT * FROM agent_workflows WHERE workflow_id = $1';
    const workflowResult = await this.pool.query(getQuery, [workflowId]);

    if (workflowResult.rows.length === 0) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const workflow = workflowResult.rows[0];
    const definition = workflow.definition;

    // Update status to in progress
    await this.pool.query(
      'UPDATE agent_workflows SET status = $1, started_at = NOW(), input = $2 WHERE workflow_id = $3',
      ['IN_PROGRESS', JSON.stringify(input), workflowId]
    );

    const startTime = Date.now();
    let results;

    try {
      // Execute based on workflow type
      switch (workflow.workflow_type) {
        case 'SEQUENTIAL':
          results = await this.executeSequential(definition.steps, input);
          break;
        case 'PARALLEL':
          results = await this.executeParallel(definition.agents, input);
          break;
        case 'CONDITIONAL':
          results = await this.executeConditional(definition.conditions, input);
          break;
        case 'REVIEW':
          results = await this.executeReview(definition.proposal, definition.reviewers, input);
          break;
        default:
          throw new Error(`Unknown workflow type: ${workflow.workflow_type}`);
      }

      const duration = Date.now() - startTime;

      // Update workflow as completed
      await this.pool.query(
        `UPDATE agent_workflows
         SET status = 'COMPLETED', completed_at = NOW(), duration_ms = $1, results = $2
         WHERE workflow_id = $3`,
        [duration, JSON.stringify(results), workflowId]
      );

      return {
        workflowId,
        status: 'COMPLETED',
        results,
        duration
      };
    } catch (error) {
      // Update workflow as failed
      await this.pool.query(
        `UPDATE agent_workflows
         SET status = 'FAILED', completed_at = NOW(), error = $1
         WHERE workflow_id = $2`,
        [JSON.stringify({ message: error.message }), workflowId]
      );

      throw error;
    }
  }

  /**
   * Execute sequential workflow
   */
  async executeSequential(steps, input) {
    const results = [];
    let currentInput = input;

    for (const step of steps) {
      const stepResult = await this.executeStep(step, currentInput);
      results.push(stepResult);

      // Use output of this step as input for next step
      if (stepResult.success && stepResult.output) {
        currentInput = stepResult.output;
      }
    }

    return {
      type: 'SEQUENTIAL',
      steps: results,
      finalOutput: results[results.length - 1]?.output
    };
  }

  /**
   * Execute parallel workflow
   */
  async executeParallel(agents, task) {
    const promises = agents.map(agentConfig =>
      this.executeAgentTask(agentConfig, task)
    );

    const results = await Promise.all(promises);

    return {
      type: 'PARALLEL',
      results,
      aggregated: await this.aggregateResults(results, 'AVERAGE')
    };
  }

  /**
   * Execute conditional workflow
   */
  async executeConditional(conditions, input) {
    for (const condition of conditions) {
      const conditionMet = await this.evaluateCondition(condition.condition, input);

      if (conditionMet) {
        const result = await this.executeStep(condition.action, input);
        return {
          type: 'CONDITIONAL',
          conditionMatched: condition.name,
          result
        };
      }
    }

    // No condition met - execute default
    if (conditions.find(c => c.name === 'default')) {
      const defaultAction = conditions.find(c => c.name === 'default');
      const result = await this.executeStep(defaultAction.action, input);
      return {
        type: 'CONDITIONAL',
        conditionMatched: 'default',
        result
      };
    }

    return {
      type: 'CONDITIONAL',
      conditionMatched: 'none',
      message: 'No condition matched and no default action'
    };
  }

  /**
   * Execute review workflow
   */
  async executeReview(proposal, reviewers, input) {
    // First agent makes proposal
    const proposalResult = await this.executeAgentTask(proposal, input);

    // Reviewers critique the proposal
    const reviews = [];
    for (const reviewer of reviewers) {
      const review = await this.executeAgentTask(reviewer, {
        proposal: proposalResult,
        originalInput: input
      });
      reviews.push(review);
    }

    // Build consensus
    const consensus = await this.buildConsensus(
      [proposalResult, ...reviews],
      'MAJORITY_VOTE'
    );

    return {
      type: 'REVIEW',
      proposal: proposalResult,
      reviews,
      consensus
    };
  }

  /**
   * Execute a single step
   */
  async executeStep(step, input) {
    // Create agent task
    const taskId = `task-${crypto.randomUUID()}`;

    const insertQuery = `
      INSERT INTO agent_tasks (task_id, task_type, status, input, started_at)
      VALUES ($1, $2, 'IN_PROGRESS', $3, NOW())
      RETURNING *
    `;

    await this.pool.query(insertQuery, [
      taskId,
      step.type || 'generic',
      JSON.stringify(input)
    ]);

    // Simulate step execution
    const output = {
      step: step.name,
      processed: true,
      input,
      timestamp: new Date()
    };

    // Update task as completed
    await this.pool.query(
      `UPDATE agent_tasks
       SET status = 'COMPLETED', output = $1, completed_at = NOW()
       WHERE task_id = $2`,
      [JSON.stringify(output), taskId]
    );

    return {
      success: true,
      step: step.name,
      output
    };
  }

  /**
   * Execute agent task
   */
  async executeAgentTask(agentConfig, task) {
    const taskId = `task-${crypto.randomUUID()}`;

    return {
      agent: agentConfig.agentType || agentConfig.name,
      taskId,
      success: true,
      output: {
        processed: true,
        task,
        timestamp: new Date()
      }
    };
  }

  /**
   * Aggregate results from multiple agents
   */
  async aggregateResults(results, strategy = 'AVERAGE') {
    if (results.length === 0) {
      return { aggregated: null, strategy };
    }

    const successful = results.filter(r => r.success);

    if (strategy === 'AVERAGE') {
      // For numeric results, calculate average
      return {
        strategy: 'AVERAGE',
        successCount: successful.length,
        totalCount: results.length,
        results: successful.map(r => r.output)
      };
    } else if (strategy === 'MAJORITY_VOTE') {
      return await this.buildConsensus(results, 'MAJORITY_VOTE');
    } else if (strategy === 'FIRST_VALID') {
      return {
        strategy: 'FIRST_VALID',
        result: successful[0]?.output
      };
    }

    return { strategy, results };
  }

  /**
   * Build consensus from multiple opinions
   */
  async buildConsensus(opinions, method = 'MAJORITY_VOTE') {
    const consensusId = `consensus-${crypto.randomUUID()}`;

    // Calculate agreement score
    const agreementScore = await this.calculateAgreementScore(opinions);

    // Record consensus
    const query = `
      INSERT INTO agent_consensus (consensus_id, task_id, participating_agents, individual_opinions, consensus_method, agreement_score)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      consensusId,
      'workflow-consensus',
      JSON.stringify(opinions.map((_, i) => `agent-${i}`)),
      JSON.stringify(opinions),
      method,
      agreementScore
    ]);

    return {
      consensusId,
      method,
      agreementScore,
      consensus: opinions[0], // Simplified - take first opinion
      participatingAgents: opinions.length
    };
  }

  /**
   * Calculate agreement score
   */
  async calculateAgreementScore(opinions) {
    if (opinions.length <= 1) return 1.0;

    // Use PostgreSQL function
    const query = 'SELECT calculate_consensus_score($1::jsonb) as score';
    const result = await this.pool.query(query, [JSON.stringify(opinions)]);

    return parseFloat(result.rows[0].score);
  }

  /**
   * Evaluate condition
   */
  async evaluateCondition(condition, data) {
    const { field, operator, value } = condition;

    if (!data[field]) return operator === 'not_exists';

    switch (operator) {
      case 'equals':
        return data[field] === value;
      case 'greater_than':
        return data[field] > value;
      case 'less_than':
        return data[field] < value;
      case 'contains':
        return String(data[field]).includes(value);
      case 'exists':
        return data[field] !== undefined && data[field] !== null;
      case 'not_exists':
        return data[field] === undefined || data[field] === null;
      default:
        return false;
    }
  }

  /**
   * Monitor workflow execution
   */
  async monitorWorkflow(workflowId) {
    const query = 'SELECT * FROM agent_workflows WHERE workflow_id = $1';
    const result = await this.pool.query(query, [workflowId]);

    if (result.rows.length === 0) {
      return { found: false };
    }

    const workflow = result.rows[0];

    return {
      found: true,
      workflowId: workflow.workflow_id,
      type: workflow.workflow_type,
      status: workflow.status,
      startedAt: workflow.started_at,
      completedAt: workflow.completed_at,
      duration: workflow.duration_ms,
      results: workflow.results
    };
  }

  /**
   * Get workflow summary
   */
  async getWorkflowSummary(filters = {}) {
    const query = 'SELECT * FROM workflow_summary_view ORDER BY created_at DESC LIMIT 50';
    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default AgentCoordinationService;
