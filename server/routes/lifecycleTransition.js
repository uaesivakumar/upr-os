/**
 * Lifecycle Transition API Routes
 * REST API for opportunity lifecycle state management
 */

import express from 'express';
import { LifecycleStateEngine } from '../services/lifecycleStateEngine.js';
import { LifecycleStatePersistence } from '../services/lifecycleStatePersistence.js';
import { LifecycleTransitionTriggers } from '../services/lifecycleTransitionTriggers.js';
import { LifecycleAutoTransition } from '../services/lifecycleAutoTransition.js';

const router = express.Router();

// Initialize services
const persistence = new LifecycleStatePersistence();
const engine = new LifecycleStateEngine(persistence);
const triggers = new LifecycleTransitionTriggers(persistence);
const autoTransition = new LifecycleAutoTransition(engine, triggers);

/**
 * POST /api/opportunities/:id/transition
 * Manually transition an opportunity to a new state
 */
router.post('/opportunities/:id/transition', async (req, res) => {
  try {
    const { id: opportunityId } = req.params;
    const { target_state, sub_state, reason, metadata } = req.body;

    // Validate required fields
    if (!target_state) {
      return res.status(400).json({
        success: false,
        error: 'target_state is required'
      });
    }

    // Get current state
    const currentState = await persistence.getCurrentState(opportunityId);

    if (!currentState) {
      return res.status(404).json({
        success: false,
        error: 'Opportunity not found or has no lifecycle state'
      });
    }

    // Execute transition
    const result = await engine.transition(opportunityId, target_state, {
      triggerType: 'manual',
      triggerReason: reason || 'Manual transition via API',
      subState: sub_state || null,
      metadata: metadata || {}
    });

    res.json({
      success: true,
      opportunity_id: opportunityId,
      transition: {
        from_state: currentState.state,
        to_state: target_state,
        sub_state: sub_state || null,
        transitioned_at: new Date().toISOString(),
        duration_in_previous_state: currentState.seconds_in_state
      },
      state_id: result.stateId
    });

  } catch (error) {
    console.error('Transition error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/opportunities/:id/lifecycle
 * Get complete lifecycle history for an opportunity
 */
router.get('/opportunities/:id/lifecycle', async (req, res) => {
  try {
    const { id: opportunityId } = req.params;

    // Get current state
    const currentState = await persistence.getCurrentState(opportunityId);

    if (!currentState) {
      return res.status(404).json({
        success: false,
        error: 'Opportunity not found or has no lifecycle state'
      });
    }

    // Get full history
    const history = await persistence.getLifecycleHistory(opportunityId);

    // Calculate total lifecycle duration
    const totalDuration = history.reduce((sum, entry) => {
      return sum + (entry.duration_seconds || 0);
    }, 0) + currentState.seconds_in_state;

    res.json({
      success: true,
      opportunity_id: opportunityId,
      current_state: currentState.state,
      current_sub_state: currentState.sub_state,
      time_in_current_state: currentState.seconds_in_state,
      total_lifecycle_duration: totalDuration,
      history: history.map(entry => ({
        state: entry.state,
        sub_state: entry.sub_state,
        entered_at: entry.entered_at,
        exited_at: entry.exited_at,
        duration_seconds: entry.duration_seconds,
        trigger_type: entry.trigger_type,
        trigger_reason: entry.trigger_reason,
        previous_state: entry.previous_state
      }))
    });

  } catch (error) {
    console.error('Get lifecycle error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/opportunities/:id/current-state
 * Get current state for an opportunity
 */
router.get('/opportunities/:id/current-state', async (req, res) => {
  try {
    const { id: opportunityId } = req.params;

    const currentState = await persistence.getCurrentState(opportunityId);

    if (!currentState) {
      return res.status(404).json({
        success: false,
        error: 'Opportunity not found or has no lifecycle state'
      });
    }

    res.json({
      success: true,
      opportunity_id: opportunityId,
      state: currentState.state,
      sub_state: currentState.sub_state,
      entered_at: currentState.entered_at,
      seconds_in_state: currentState.seconds_in_state,
      trigger_type: currentState.trigger_type,
      trigger_reason: currentState.trigger_reason,
      previous_state: currentState.previous_state,
      metadata: currentState.metadata
    });

  } catch (error) {
    console.error('Get current state error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/lifecycle/states
 * Get all valid lifecycle states and their configuration
 */
router.get('/lifecycle/states', (req, res) => {
  try {
    const states = engine.getStates();
    const stateConfigs = states.map(state => ({
      state,
      ...engine.getStateConfig(state),
      valid_next_states: engine.getValidNextStates(state)
    }));

    res.json({
      success: true,
      states: stateConfigs
    });

  } catch (error) {
    console.error('Get states error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/lifecycle/state-machine
 * Get state machine graph (for visualization)
 */
router.get('/lifecycle/state-machine', (req, res) => {
  try {
    const graph = engine.getStateMachineGraph();

    res.json({
      success: true,
      graph
    });

  } catch (error) {
    console.error('Get state machine error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/lifecycle/analytics
 * Get lifecycle analytics
 */
router.get('/lifecycle/analytics', async (req, res) => {
  try {
    const analytics = await persistence.getStateAnalytics();
    const stateCounts = await persistence.getStateCounts();
    const commonPaths = await persistence.getCommonPaths(10);
    const journeyDuration = await persistence.getAverageJourneyDuration();

    res.json({
      success: true,
      analytics: {
        state_durations: analytics,
        current_state_counts: stateCounts,
        common_transition_paths: commonPaths,
        average_journey: journeyDuration
      }
    });

  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/lifecycle/auto-transition/run
 * Trigger auto-transitions manually
 */
router.post('/lifecycle/auto-transition/run', async (req, res) => {
  try {
    const { dry_run = false, transition_type = null } = req.body;

    autoTransition.setDryRun(dry_run);

    let result;

    if (transition_type) {
      // Run specific transition
      result = await autoTransition.runSpecific(transition_type);
    } else {
      // Run all transitions
      result = await autoTransition.runAll();
    }

    res.json({
      success: true,
      dry_run,
      result
    });

  } catch (error) {
    console.error('Auto-transition error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/lifecycle/auto-transition/summary
 * Get summary of pending auto-transitions
 */
router.get('/lifecycle/auto-transition/summary', async (req, res) => {
  try {
    const summary = await autoTransition.getSummary();

    res.json({
      success: true,
      summary
    });

  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/lifecycle/auto-transition/stats
 * Get auto-transition statistics
 */
router.get('/lifecycle/auto-transition/stats', (req, res) => {
  try {
    const stats = autoTransition.getStats();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/lifecycle/transition-rules
 * Get all active transition rules
 */
router.get('/lifecycle/transition-rules', async (req, res) => {
  try {
    const { from_state } = req.query;

    const rules = await persistence.getTransitionRules(from_state || null);

    res.json({
      success: true,
      rules
    });

  } catch (error) {
    console.error('Get transition rules error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/lifecycle/validate-transition
 * Validate if a transition is allowed
 */
router.post('/lifecycle/validate-transition', async (req, res) => {
  try {
    const { opportunity_id, target_state } = req.body;

    if (!opportunity_id || !target_state) {
      return res.status(400).json({
        success: false,
        error: 'opportunity_id and target_state are required'
      });
    }

    const validation = await triggers.validateTransitionCriteria(opportunity_id, target_state);

    res.json({
      success: true,
      validation
    });

  } catch (error) {
    console.error('Validate transition error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/lifecycle/opportunities/by-state/:state
 * Get all opportunities in a specific state
 */
router.get('/lifecycle/opportunities/by-state/:state', async (req, res) => {
  try {
    const { state } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const opportunities = await persistence.getOpportunitiesInState(state, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      state,
      count: opportunities.length,
      opportunities
    });

  } catch (error) {
    console.error('Get opportunities by state error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
