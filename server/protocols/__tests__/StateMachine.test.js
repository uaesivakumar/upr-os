/**
 * StateMachine Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import StateMachine from '../StateMachine.js';

describe('StateMachine', () => {
  let stateMachine;

  beforeEach(() => {
    stateMachine = new StateMachine({
      agentName: 'TestAgent',
      enablePersistence: false
    });
  });

  describe('Initialization', () => {
    it('should initialize in IDLE state', () => {
      expect(stateMachine.getState()).toBe('IDLE');
      expect(stateMachine.isIdle()).toBe(true);
    });

    it('should require agentName', () => {
      expect(() => {
        new StateMachine({});
      }).toThrow('agentName is required');
    });

    it('should record initial state in history', () => {
      const history = stateMachine.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        state: 'IDLE',
        metadata: { reason: 'initialized' }
      });
    });
  });

  describe('State Transitions', () => {
    it('should transition from IDLE to RUNNING', async () => {
      await stateMachine.transition('RUNNING');
      expect(stateMachine.getState()).toBe('RUNNING');
      expect(stateMachine.isRunning()).toBe(true);
    });

    it('should transition from RUNNING to COMPLETED', async () => {
      await stateMachine.transition('RUNNING');
      await stateMachine.transition('COMPLETED');
      expect(stateMachine.getState()).toBe('COMPLETED');
      expect(stateMachine.isCompleted()).toBe(true);
    });

    it('should transition from RUNNING to FAILED', async () => {
      await stateMachine.transition('RUNNING');
      await stateMachine.transition('FAILED');
      expect(stateMachine.getState()).toBe('FAILED');
      expect(stateMachine.isFailed()).toBe(true);
    });

    it('should transition from RUNNING to DEGRADED', async () => {
      await stateMachine.transition('RUNNING');
      await stateMachine.transition('DEGRADED');
      expect(stateMachine.getState()).toBe('DEGRADED');
      expect(stateMachine.isDegraded()).toBe(true);
    });

    it('should reject invalid transitions', async () => {
      // Cannot go directly from IDLE to COMPLETED
      await expect(
        stateMachine.transition('COMPLETED')
      ).rejects.toThrow('Invalid transition from "IDLE" to "COMPLETED"');
    });

    it('should reject unknown states', async () => {
      await expect(
        stateMachine.transition('UNKNOWN')
      ).rejects.toThrow('Invalid state "UNKNOWN"');
    });
  });

  describe('Reset Functionality', () => {
    it('should reset from COMPLETED to IDLE', async () => {
      await stateMachine.transition('RUNNING');
      await stateMachine.transition('COMPLETED');
      await stateMachine.reset();

      expect(stateMachine.getState()).toBe('IDLE');
    });

    it('should reset from FAILED to IDLE', async () => {
      await stateMachine.transition('RUNNING');
      await stateMachine.transition('FAILED');
      await stateMachine.reset();

      expect(stateMachine.getState()).toBe('IDLE');
    });

    it('should reset from DEGRADED to IDLE', async () => {
      await stateMachine.transition('RUNNING');
      await stateMachine.transition('DEGRADED');
      await stateMachine.reset();

      expect(stateMachine.getState()).toBe('IDLE');
    });

    it('should reject reset from RUNNING', async () => {
      await stateMachine.transition('RUNNING');

      await expect(
        stateMachine.reset()
      ).rejects.toThrow('Cannot reset from "RUNNING"');
    });
  });

  describe('State History', () => {
    it('should record all transitions in history', async () => {
      await stateMachine.transition('RUNNING');
      await stateMachine.transition('COMPLETED');

      const history = stateMachine.getHistory();
      expect(history).toHaveLength(3); // IDLE init + 2 transitions

      expect(history[1]).toMatchObject({
        from: 'IDLE',
        to: 'RUNNING'
      });

      expect(history[2]).toMatchObject({
        from: 'RUNNING',
        to: 'COMPLETED'
      });
    });

    it('should include metadata in transitions', async () => {
      await stateMachine.transition('RUNNING', {
        runId: '123',
        startTime: Date.now()
      });

      const history = stateMachine.getHistory();
      expect(history[1].metadata).toMatchObject({
        runId: '123',
        startTime: expect.any(Number)
      });
    });

    it('should track last transition', async () => {
      await stateMachine.transition('RUNNING');
      await stateMachine.transition('COMPLETED');

      const lastTransition = stateMachine.getLastTransition();
      expect(lastTransition).toMatchObject({
        from: 'RUNNING',
        to: 'COMPLETED'
      });
    });
  });

  describe('State Duration', () => {
    it('should calculate state duration', async () => {
      await stateMachine.transition('RUNNING');
      await new Promise(resolve => setTimeout(resolve, 50));

      const duration = stateMachine.getStateDuration();
      expect(duration).toBeGreaterThan(40);
    });
  });

  describe('Event Listeners', () => {
    it('should emit transition events', async () => {
      const events = [];
      stateMachine.on('transition', (data) => {
        events.push(data);
      });

      await stateMachine.transition('RUNNING');
      await stateMachine.transition('COMPLETED');

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ from: 'IDLE', to: 'RUNNING' });
      expect(events[1]).toMatchObject({ from: 'RUNNING', to: 'COMPLETED' });
    });

    it('should emit state-specific events', async () => {
      const completedEvents = [];
      stateMachine.on('transition:COMPLETED', (data) => {
        completedEvents.push(data);
      });

      await stateMachine.transition('RUNNING');
      await stateMachine.transition('COMPLETED');

      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0]).toMatchObject({
        from: 'RUNNING',
        to: 'COMPLETED'
      });
    });

    it('should remove event listeners', async () => {
      const events = [];
      const handler = (data) => events.push(data);

      stateMachine.on('transition', handler);
      await stateMachine.transition('RUNNING');

      stateMachine.off('transition', handler);
      await stateMachine.transition('FAILED');

      // Only first transition should be recorded
      expect(events).toHaveLength(1);
    });
  });

  describe('State Summary', () => {
    it('should generate state summary', async () => {
      await stateMachine.transition('RUNNING', { runId: '123' });

      const summary = stateMachine.getSummary();

      expect(summary).toMatchObject({
        agentName: 'TestAgent',
        currentState: 'RUNNING',
        stateDurationMs: expect.any(Number),
        transitionCount: 2,
        lastTransition: {
          from: 'IDLE',
          to: 'RUNNING',
          metadata: { runId: '123' }
        }
      });

      expect(summary.history).toHaveLength(2);
    });
  });

  describe('State Exports', () => {
    it('should export STATES constant', () => {
      expect(StateMachine.STATES).toEqual({
        IDLE: 'IDLE',
        RUNNING: 'RUNNING',
        COMPLETED: 'COMPLETED',
        DEGRADED: 'DEGRADED',
        FAILED: 'FAILED'
      });
    });
  });
});
