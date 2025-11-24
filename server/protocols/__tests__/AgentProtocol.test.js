/**
 * AgentProtocol Tests
 *
 * Test suite for Phase 4 Agent Communication Protocol
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import AgentProtocol from '../AgentProtocol.js';

describe('AgentProtocol', () => {
  let TestAgent;

  beforeEach(() => {
    // Create a test agent class
    class MockAgent extends AgentProtocol {
      constructor(options = {}) {
        super({
          agentName: 'TestAgent',
          agentVersion: '1.0.0',
          inputSchema: {
            type: 'object',
            required: ['input'],
            properties: {
              input: { type: 'string' }
            }
          },
          outputSchema: {
            type: 'object',
            required: ['output'],
            properties: {
              output: { type: 'string' }
            }
          },
          options: {
            enableStateMachine: true,
            enableCostTracking: true,
            enableDeadLetter: false,
            ...options
          }
        });
      }

      async run(input, context) {
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 10));

        // Track fake cost
        this.trackCost(0.01, { provider: 'test', operation: 'test' });

        return { output: `Processed: ${input.input}` };
      }
    }

    TestAgent = MockAgent;
  });

  describe('Initialization', () => {
    it('should initialize with valid config', () => {
      const agent = new TestAgent();

      expect(agent.agentName).toBe('TestAgent');
      expect(agent.agentVersion).toBe('1.0.0');
      expect(agent.options.enableStateMachine).toBe(true);
      expect(agent.options.enableCostTracking).toBe(true);
    });

    it('should throw if agentName is missing', () => {
      expect(() => {
        new AgentProtocol({
          agentVersion: '1.0.0',
          inputSchema: {},
          outputSchema: {}
        });
      }).toThrow('agentName is required');
    });

    it('should use default options when not provided', () => {
      class MinimalAgent extends AgentProtocol {
        constructor() {
          super({
            agentName: 'MinimalAgent',
            inputSchema: {},
            outputSchema: {}
          });
        }
        async run() {
          return {};
        }
      }

      const agent = new MinimalAgent();
      expect(agent.options.maxRetries).toBe(3);
      expect(agent.options.budgetLimitUsd).toBe(5.00);
    });
  });

  describe('Input Validation', () => {
    it('should validate correct input', async () => {
      const agent = new TestAgent();
      const result = await agent.execute(
        { input: 'test' },
        { runId: '123', tenantId: '456' }
      );

      expect(result.success).toBe(true);
      expect(result.data.output).toBe('Processed: test');
    });

    it('should reject invalid input', async () => {
      const agent = new TestAgent();

      await expect(
        agent.execute(
          { invalid: 'field' },
          { runId: '123', tenantId: '456' }
        )
      ).rejects.toThrow('Input validation failed');
    });

    it('should reject missing required fields', async () => {
      const agent = new TestAgent();

      await expect(
        agent.execute(
          {},
          { runId: '123', tenantId: '456' }
        )
      ).rejects.toThrow('Input validation failed');
    });
  });

  describe('Output Validation', () => {
    it('should warn on invalid output', async () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      class InvalidOutputAgent extends TestAgent {
        async run() {
          return { wrongField: 'test' }; // Missing 'output' field
        }
      }

      const agent = new InvalidOutputAgent();
      const result = await agent.execute(
        { input: 'test' },
        { runId: '123', tenantId: '456' }
      );

      // Should still succeed but warn
      expect(result.success).toBe(true);
      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });
  });

  describe('Cost Tracking', () => {
    it('should track cost correctly', async () => {
      const agent = new TestAgent();
      const result = await agent.execute(
        { input: 'test' },
        { runId: '123', tenantId: '456' }
      );

      expect(result.metadata.costUsd).toBe(0.01);
    });

    it('should throw when budget limit exceeded', async () => {
      class ExpensiveAgent extends TestAgent {
        async run() {
          this.trackCost(10.00); // Exceeds budget
          return { output: 'expensive' };
        }
      }

      const agent = new ExpensiveAgent({ budgetLimitUsd: 5.00 });

      await expect(
        agent.execute(
          { input: 'test' },
          { runId: '123', tenantId: '456' }
        )
      ).rejects.toThrow('Budget limit exceeded');
    });

    it('should accumulate costs across multiple operations', async () => {
      class MultiOpAgent extends TestAgent {
        async run() {
          this.trackCost(0.50);
          this.trackCost(0.30);
          this.trackCost(0.20);
          return { output: 'multi' };
        }
      }

      const agent = new MultiOpAgent();
      const result = await agent.execute(
        { input: 'test' },
        { runId: '123', tenantId: '456' }
      );

      expect(result.metadata.costUsd).toBe(1.00);
    });
  });

  describe('State Machine Integration', () => {
    it('should transition states correctly', async () => {
      const agent = new TestAgent();

      expect(agent.getState()).toBe('IDLE');

      const executePromise = agent.execute(
        { input: 'test' },
        { runId: '123', tenantId: '456' }
      );

      // During execution, state should be RUNNING
      // (We can't reliably test this due to async timing)

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(agent.getState()).toBe('COMPLETED');
    });

    it('should transition to FAILED on error', async () => {
      class FailingAgent extends TestAgent {
        async run() {
          throw new Error('Test failure');
        }
      }

      const agent = new FailingAgent({ maxRetries: 1 });

      await expect(
        agent.execute(
          { input: 'test' },
          { runId: '123', tenantId: '456' }
        )
      ).rejects.toThrow('Test failure');

      expect(agent.getState()).toBe('FAILED');
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should call beforeRun hook', async () => {
      const beforeRunSpy = jest.fn();

      class HookAgent extends TestAgent {
        async beforeRun(input, context) {
          beforeRunSpy(input, context);
        }
      }

      const agent = new HookAgent();
      await agent.execute(
        { input: 'test' },
        { runId: '123', tenantId: '456' }
      );

      expect(beforeRunSpy).toHaveBeenCalledWith(
        { input: 'test' },
        expect.objectContaining({ runId: '123', tenantId: '456' })
      );
    });

    it('should call afterRun hook', async () => {
      const afterRunSpy = jest.fn();

      class HookAgent extends TestAgent {
        async afterRun(output, context) {
          afterRunSpy(output, context);
        }
      }

      const agent = new HookAgent();
      await agent.execute(
        { input: 'test' },
        { runId: '123', tenantId: '456' }
      );

      expect(afterRunSpy).toHaveBeenCalledWith(
        expect.objectContaining({ output: 'Processed: test' }),
        expect.objectContaining({ runId: '123', tenantId: '456' })
      );
    });

    it('should call onError hook', async () => {
      const onErrorSpy = jest.fn();

      class ErrorAgent extends TestAgent {
        async run() {
          throw new Error('Test error');
        }
        async onError(error, input, context) {
          onErrorSpy(error, input, context);
        }
      }

      const agent = new ErrorAgent({ maxRetries: 1 });

      await expect(
        agent.execute(
          { input: 'test' },
          { runId: '123', tenantId: '456' }
        )
      ).rejects.toThrow('Test error');

      expect(onErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Graceful Degradation', () => {
    it('should degrade gracefully when possible', async () => {
      class DegradableAgent extends TestAgent {
        async run() {
          throw new Error('Degradable error');
        }

        async canDegradeGracefully() {
          return { strategy: 'partial_results' };
        }

        async degradeGracefully() {
          return { output: 'degraded result' };
        }
      }

      const agent = new DegradableAgent();
      const result = await agent.execute(
        { input: 'test' },
        { runId: '123', tenantId: '456' }
      );

      expect(result.success).toBe(false);
      expect(result.degraded).toBe(true);
      expect(result.data.output).toBe('degraded result');
      expect(agent.getState()).toBe('DEGRADED');
    });

    it('should not degrade when canDegradeGracefully returns null', async () => {
      class NonDegradableAgent extends TestAgent {
        async run() {
          throw new Error('Fatal error');
        }

        async canDegradeGracefully() {
          return null; // Cannot degrade
        }
      }

      const agent = new NonDegradableAgent({ maxRetries: 1 });

      await expect(
        agent.execute(
          { input: 'test' },
          { runId: '123', tenantId: '456' }
        )
      ).rejects.toThrow('Fatal error');

      expect(agent.getState()).toBe('FAILED');
    });
  });

  describe('Metadata Tracking', () => {
    it('should track execution metadata', async () => {
      const agent = new TestAgent();
      const result = await agent.execute(
        { input: 'test' },
        { runId: '123', tenantId: '456' }
      );

      expect(result.metadata).toMatchObject({
        agentName: 'TestAgent',
        agentVersion: '1.0.0',
        costUsd: expect.any(Number),
        latencyMs: expect.any(Number),
        runId: '123',
        tenantId: '456'
      });

      expect(result.metadata.latencyMs).toBeGreaterThan(0);
    });

    it('should include error details in metadata', async () => {
      class FailingAgent extends TestAgent {
        async run() {
          throw new Error('Test error');
        }
      }

      const agent = new FailingAgent({ maxRetries: 1 });

      try {
        await agent.execute(
          { input: 'test' },
          { runId: '123', tenantId: '456' }
        );
      } catch (error) {
        const metadata = agent.getMetadata();
        expect(metadata.errors).toHaveLength(1);
        expect(metadata.errors[0].message).toBe('Test error');
      }
    });
  });

  describe('Sanitization', () => {
    it('should sanitize sensitive fields in logs', () => {
      const agent = new TestAgent();

      const sensitiveData = {
        input: 'test',
        apiKey: 'secret-key-123',
        password: 'my-password',
        token: 'auth-token'
      };

      const sanitized = agent._sanitizeForLogging(sensitiveData);

      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.input).toBe('test');
    });
  });
});
