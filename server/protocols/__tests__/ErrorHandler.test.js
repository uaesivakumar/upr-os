/**
 * ErrorHandler Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import ErrorHandler from '../ErrorHandler.js';

describe('ErrorHandler', () => {
  let errorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler({
      agentName: 'TestAgent',
      maxRetries: 3,
      enableDeadLetter: false
    });
  });

  describe('Initialization', () => {
    it('should initialize with valid config', () => {
      expect(errorHandler.agentName).toBe('TestAgent');
      expect(errorHandler.maxRetries).toBe(3);
      expect(errorHandler.enableDeadLetter).toBe(false);
    });

    it('should require agentName', () => {
      expect(() => {
        new ErrorHandler({});
      }).toThrow('agentName is required');
    });

    it('should use default values', () => {
      const handler = new ErrorHandler({ agentName: 'Test' });
      expect(handler.maxRetries).toBe(3);
      expect(handler.enableDeadLetter).toBe(true);
    });
  });

  describe('Error Classification', () => {
    it('should classify validation errors as FATAL', () => {
      const error = new Error('Input validation failed');
      const type = errorHandler._classifyError(error);
      expect(type).toBe('FATAL');
    });

    it('should classify timeout errors as TRANSIENT', () => {
      const error = new Error('Request timeout');
      const type = errorHandler._classifyError(error);
      expect(type).toBe('TRANSIENT');
    });

    it('should classify rate limit errors as TRANSIENT', () => {
      const error = new Error('Too many requests');
      const type = errorHandler._classifyError(error);
      expect(type).toBe('TRANSIENT');
    });

    it('should classify network errors as TRANSIENT', () => {
      const error = new Error('ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      const type = errorHandler._classifyError(error);
      expect(type).toBe('TRANSIENT');
    });

    it('should classify partial result errors as DEGRADABLE', () => {
      const error = new Error('Partial results available');
      const type = errorHandler._classifyError(error);
      expect(type).toBe('DEGRADABLE');
    });

    it('should use custom classifier when provided', () => {
      const customClassifier = (error) => {
        if (error.message.includes('custom')) return 'FATAL';
        return null;
      };

      const handler = new ErrorHandler({
        agentName: 'Test',
        classifyError: customClassifier
      });

      const error = new Error('custom error');
      const type = handler._classifyError(error);
      expect(type).toBe('FATAL');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient errors', async () => {
      let attempts = 0;

      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('timeout');
        }
        return 'success';
      };

      const result = await errorHandler.executeWithRetry(fn);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should not retry on fatal errors', async () => {
      let attempts = 0;

      const fn = async () => {
        attempts++;
        throw new Error('Input validation failed');
      };

      await expect(
        errorHandler.executeWithRetry(fn)
      ).rejects.toThrow('Input validation failed');

      expect(attempts).toBe(1); // No retries
    });

    it('should throw after max retries exceeded', async () => {
      const fn = async () => {
        throw new Error('timeout');
      };

      await expect(
        errorHandler.executeWithRetry(fn)
      ).rejects.toThrow('timeout');
    });

    it('should apply exponential backoff', async () => {
      const backoff1 = errorHandler._calculateBackoff(1);
      const backoff2 = errorHandler._calculateBackoff(2);
      const backoff3 = errorHandler._calculateBackoff(3);

      // Backoff should increase (allowing for jitter)
      expect(backoff2).toBeGreaterThan(backoff1 * 0.8);
      expect(backoff3).toBeGreaterThan(backoff2 * 0.8);

      // Should not exceed max
      const backoff10 = errorHandler._calculateBackoff(10);
      expect(backoff10).toBeLessThanOrEqual(40000);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after 5 failures', async () => {
      errorHandler.maxRetries = 1;
      jest.spyOn(errorHandler, '_sleep').mockResolvedValue();

      const fn = async () => {
        throw new Error('timeout');
      };

      // Trigger 5 failures
      for (let i = 0; i < 5; i++) {
        try {
          await errorHandler.executeWithRetry(fn);
        } catch (e) {
          // Expected
        }
      }

      const status = errorHandler.getCircuitBreakerStatus();
      expect(status.state).toBe('OPEN');
      expect(status.failures).toBe(5);
    });

    it('should reject requests when circuit is open', async () => {
      // Force circuit open
      errorHandler.circuitBreaker.state = 'OPEN';
      errorHandler.circuitBreaker.lastFailureTime = Date.now();

      const fn = async () => 'success';

      await expect(
        errorHandler.executeWithRetry(fn)
      ).rejects.toThrow('Circuit breaker OPEN');
    });

    it('should close circuit after successful execution in HALF_OPEN state', async () => {
      errorHandler.circuitBreaker.state = 'HALF_OPEN';
      errorHandler.circuitBreaker.failures = 3;

      const fn = async () => 'success';

      const result = await errorHandler.executeWithRetry(fn);

      expect(result).toBe('success');
      expect(errorHandler.circuitBreaker.state).toBe('CLOSED');
      expect(errorHandler.circuitBreaker.failures).toBe(0);
    });

    it('should reset circuit breaker manually', () => {
      errorHandler.circuitBreaker.state = 'OPEN';
      errorHandler.circuitBreaker.failures = 5;

      errorHandler.resetCircuitBreaker();

      expect(errorHandler.circuitBreaker.state).toBe('CLOSED');
      expect(errorHandler.circuitBreaker.failures).toBe(0);
    });
  });

  describe('Error Helpers', () => {
    it('should identify retryable errors', () => {
      const transientError = new Error('timeout');
      const fatalError = new Error('validation failed');

      expect(errorHandler.isRetryable(transientError)).toBe(true);
      expect(errorHandler.isRetryable(fatalError)).toBe(false);
    });

    it('should identify degradable errors', () => {
      const degradableError = new Error('partial results');
      const fatalError = new Error('validation failed');

      expect(errorHandler.isDegradable(degradableError)).toBe(true);
      expect(errorHandler.isDegradable(fatalError)).toBe(false);
    });
  });

  describe('Summary', () => {
    it('should generate error handler summary', () => {
      const summary = errorHandler.getSummary();

      expect(summary).toMatchObject({
        agentName: 'TestAgent',
        maxRetries: 3,
        enableDeadLetter: false,
        circuitBreaker: {
          failures: 0,
          state: 'CLOSED',
          lastFailureTime: null,
          timeSinceLastFailure: null
        }
      });
    });
  });

  describe('Error Types Export', () => {
    it('should export ERROR_TYPES constant', () => {
      expect(ErrorHandler.ERROR_TYPES).toEqual({
        TRANSIENT: 'TRANSIENT',
        FATAL: 'FATAL',
        DEGRADABLE: 'DEGRADABLE'
      });
    });
  });
});
