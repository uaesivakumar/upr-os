/**
 * Workflow Engine
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Orchestrate multi-tool execution with dependency resolution
 * Features: Sequential/parallel execution, retry logic, error handling
 *
 * Reference: Agent Hub Architecture §8 - Multi-Tool Workflows
 */

const jsonpath = require('jsonpath');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');
const { workflowStepCount } = require('./metrics');

class WorkflowEngine {
  constructor(toolRegistry, responseAggregator) {
    this.toolRegistry = toolRegistry;
    this.responseAggregator = responseAggregator;
    this.workflows = new Map();

    logger.info('WorkflowEngine initialized');
  }

  /**
   * Register workflow definition
   * @param {object} workflowDef - Workflow definition
   */
  registerWorkflow(workflowDef) {
    // Validate workflow definition
    this._validateWorkflowDefinition(workflowDef);

    this.workflows.set(workflowDef.name, workflowDef);

    logger.info(`Workflow registered: ${workflowDef.name} v${workflowDef.version}`, {
      workflow_name: workflowDef.name,
      version: workflowDef.version,
      steps: workflowDef.steps.length,
      execution_mode: workflowDef.config.execution_mode
    });
  }

  /**
   * Execute workflow
   * @param {string} workflowName - Workflow name
   * @param {object} input - Workflow input
   * @returns {Promise<object>} Aggregated results
   */
  async execute(workflowName, input) {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      const available = Array.from(this.workflows.keys()).join(', ');
      throw new Error(
        `Workflow not found: ${workflowName}. ` +
        `Available workflows: ${available || 'none'}`
      );
    }

    const workflowId = uuidv4();
    const startTime = Date.now();

    logger.info(`Workflow execution started: ${workflowName}`, {
      workflow_id: workflowId,
      workflow_name: workflowName,
      steps_total: workflow.steps.length,
      execution_mode: workflow.config.execution_mode
    });

    try {
      // Build execution plan based on dependencies
      const executionPlan = this._buildExecutionPlan(workflow.steps);

      logger.info(`Execution plan built for ${workflowName}`, {
        workflow_id: workflowId,
        steps_ordered: executionPlan.map(s => s.id)
      });

      // Execute steps according to plan
      const stepResults = await this._executeSteps(
        executionPlan,
        workflow,
        input,
        workflowId
      );

      // Aggregate results
      const aggregated = this.responseAggregator.aggregate(stepResults, {
        name: workflowName,
        id: workflowId,
        version: workflow.version,
        execution_mode: workflow.config.execution_mode
      });

      // Add workflow execution metadata
      aggregated._workflow = {
        id: workflowId,
        name: workflowName,
        version: workflow.version,
        execution_mode: workflow.config.execution_mode,
        total_duration_ms: Date.now() - startTime,
        steps_executed: Object.keys(stepResults).length,
        steps_total: workflow.steps.length,
        steps_successful: Object.values(stepResults).filter(r => !r.error).length,
        steps_failed: Object.values(stepResults).filter(r => r.error).length
      };

      logger.info(`Workflow execution completed: ${workflowName}`, {
        workflow_id: workflowId,
        duration_ms: aggregated._workflow.total_duration_ms,
        steps_successful: aggregated._workflow.steps_successful,
        steps_failed: aggregated._workflow.steps_failed
      });

      return aggregated;

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(`Workflow execution failed: ${workflowName}`, {
        workflow_id: workflowId,
        error: error.message,
        stack: error.stack,
        duration_ms: duration
      });

      throw error;
    }
  }

  /**
   * Build execution plan from dependencies using topological sort
   * @private
   */
  _buildExecutionPlan(steps) {
    const plan = [];
    const visited = new Set();
    const temp = new Set();

    const visit = (step) => {
      if (temp.has(step.id)) {
        throw new Error(`Circular dependency detected: ${step.id}`);
      }
      if (visited.has(step.id)) {
        return;
      }

      temp.add(step.id);

      // Visit dependencies first (depth-first)
      for (const depId of step.dependencies || []) {
        const depStep = steps.find(s => s.id === depId);
        if (depStep) {
          visit(depStep);
        } else {
          throw new Error(
            `Dependency not found: ${step.id} depends on ${depId}, ` +
            `but ${depId} is not defined in workflow steps`
          );
        }
      }

      temp.delete(step.id);
      visited.add(step.id);
      plan.push(step);
    };

    // Visit all steps
    for (const step of steps) {
      visit(step);
    }

    return plan;
  }

  /**
   * Execute steps according to execution plan
   * @private
   */
  async _executeSteps(executionPlan, workflow, workflowInput, workflowId) {
    const stepResults = {};
    const context = {
      input: workflowInput,
      results: {}
    };

    for (const step of executionPlan) {
      const stepStartTime = Date.now();

      try {
        logger.info(`Executing workflow step: ${step.id}`, {
          workflow_id: workflowId,
          step_id: step.id,
          tool_name: step.tool_name
        });

        // Map input using JSONPath
        const toolInput = this._mapInput(step.input_mapping, context);

        logger.info(`Input mapped for step: ${step.id}`, {
          workflow_id: workflowId,
          step_id: step.id,
          mapped_fields: Object.keys(toolInput)
        });

        // Get tool from registry
        const { instance, circuitBreaker } = this.toolRegistry.getTool(step.tool_name);

        // Calculate timeout (workflow timeout or tool SLA * 2)
        const timeout = workflow.config.timeout_ms;

        // Execute with retry and circuit breaker
        const result = await this._executeWithRetry(
          async () => {
            return await circuitBreaker.execute(async () => {
              return await this._executeWithTimeout(
                () => instance.execute(toolInput),
                timeout,
                step.tool_name
              );
            });
          },
          workflow.config.retry_policy,
          step.id
        );

        const stepDuration = Date.now() - stepStartTime;

        // Store result
        stepResults[step.tool_name] = result;
        context.results[step.id] = result;

        // Update metrics
        workflowStepCount.inc({
          workflow_name: workflow.name,
          step_id: step.id,
          status: 'success'
        });

        logger.info(`Step completed: ${step.id}`, {
          workflow_id: workflowId,
          step_id: step.id,
          tool_name: step.tool_name,
          duration_ms: stepDuration
        });

      } catch (error) {
        const stepDuration = Date.now() - stepStartTime;

        // Update metrics
        workflowStepCount.inc({
          workflow_name: workflow.name,
          step_id: step.id,
          status: 'error'
        });

        if (step.optional) {
          // Optional step failed - log and continue
          logger.warn(`Optional step failed: ${step.id}`, {
            workflow_id: workflowId,
            step_id: step.id,
            tool_name: step.tool_name,
            error: error.message,
            duration_ms: stepDuration
          });

          stepResults[step.tool_name] = {
            error: error.message,
            skipped: true,
            optional: true
          };
          context.results[step.id] = { error: error.message };

        } else {
          // Required step failed - abort workflow
          logger.error(`Required step failed: ${step.id}`, {
            workflow_id: workflowId,
            step_id: step.id,
            tool_name: step.tool_name,
            error: error.message,
            stack: error.stack,
            duration_ms: stepDuration
          });

          throw new Error(
            `Workflow failed at required step: ${step.id} (${step.tool_name}). ` +
            `Error: ${error.message}`
          );
        }
      }
    }

    return stepResults;
  }

  /**
   * Map workflow input to tool input using JSONPath
   * @private
   */
  _mapInput(mapping, context) {
    const toolInput = {};

    for (const [key, path] of Object.entries(mapping)) {
      try {
        // JSONPath query
        const values = jsonpath.query(context, path);

        if (values.length > 0) {
          toolInput[key] = values[0];
        } else {
          logger.warn(`JSONPath query returned no results: ${path}`, {
            key: key,
            path: path
          });
        }
      } catch (error) {
        logger.warn(`Input mapping failed for ${key}`, {
          key: key,
          path: path,
          error: error.message
        });
      }
    }

    return toolInput;
  }

  /**
   * Execute with retry policy
   * @private
   */
  async _executeWithRetry(fn, retryPolicy, stepId) {
    let lastError;

    for (let attempt = 0; attempt <= retryPolicy.max_retries; attempt++) {
      try {
        const result = await fn();
        return result;

      } catch (error) {
        lastError = error;

        if (attempt < retryPolicy.max_retries) {
          logger.warn(`Step ${stepId} failed (attempt ${attempt + 1}), retrying...`, {
            step_id: stepId,
            attempt: attempt + 1,
            max_retries: retryPolicy.max_retries,
            backoff_ms: retryPolicy.backoff_ms
          });

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryPolicy.backoff_ms));
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute with timeout
   * @private
   */
  async _executeWithTimeout(fn, timeoutMs, toolName) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(
            `Tool ${toolName} timed out after ${timeoutMs}ms in workflow execution`
          )),
          timeoutMs
        )
      )
    ]);
  }

  /**
   * Validate workflow definition
   * @private
   */
  _validateWorkflowDefinition(workflowDef) {
    // Required fields
    if (!workflowDef.name) {
      throw new Error('Workflow definition missing required field: name');
    }
    if (!workflowDef.version) {
      throw new Error('Workflow definition missing required field: version');
    }
    if (!workflowDef.steps || !Array.isArray(workflowDef.steps)) {
      throw new Error('Workflow definition missing required field: steps (array)');
    }
    if (!workflowDef.config) {
      throw new Error('Workflow definition missing required field: config');
    }

    // Validate steps
    for (const step of workflowDef.steps) {
      if (!step.id) {
        throw new Error('Workflow step missing required field: id');
      }
      if (!step.tool_name) {
        throw new Error(`Workflow step ${step.id} missing required field: tool_name`);
      }
      if (!step.input_mapping) {
        throw new Error(`Workflow step ${step.id} missing required field: input_mapping`);
      }
    }

    // Validate config
    if (!workflowDef.config.execution_mode) {
      throw new Error('Workflow config missing required field: execution_mode');
    }
    if (!workflowDef.config.retry_policy) {
      throw new Error('Workflow config missing required field: retry_policy');
    }
  }

  /**
   * List registered workflows
   * @returns {array} Array of workflow metadata
   */
  listWorkflows() {
    return Array.from(this.workflows.values()).map(w => ({
      name: w.name,
      version: w.version,
      description: w.description,
      steps: w.steps.length,
      execution_mode: w.config.execution_mode
    }));
  }

  /**
   * Get workflow statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      total_workflows: this.workflows.size,
      workflows: this.listWorkflows()
    };
  }
}

module.exports = { WorkflowEngine };
