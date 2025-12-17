/**
 * OS Metrics Service (Stabilization Phase)
 *
 * Tracks key metrics for PRD v1.2 compliance monitoring:
 * - Envelope validation (accept/reject rates)
 * - Escalation events (by action type)
 * - Replay success/failure rates
 * - Latency percentiles (p50/p95/p99)
 */

/**
 * In-memory metrics store
 * In production, this would be Prometheus/StatsD/etc.
 */
const metrics = {
  // Envelope metrics
  envelope: {
    validations: 0,
    accepts: 0,
    rejects: 0,
    reject_reasons: {},
  },

  // Escalation metrics
  escalation: {
    assessments: 0,
    by_action: {
      allow: 0,
      disclaimer: 0,
      escalate: 0,
      block: 0,
    },
    high_risk_events: [], // risk >= 0.7
  },

  // Replay metrics
  replay: {
    attempts: 0,
    successes: 0,
    failures: 0,
    deterministic: 0,
    non_deterministic: 0,
  },

  // Latency metrics (in ms)
  latency: {
    envelope_validation: [],
    escalation_assessment: [],
    replay_execution: [],
    score_endpoint: [],
  },

  // Start time for uptime calculation
  start_time: Date.now(),
};

/**
 * Record envelope validation result
 */
export function recordEnvelopeValidation(valid, rejectReason = null) {
  metrics.envelope.validations++;
  if (valid) {
    metrics.envelope.accepts++;
  } else {
    metrics.envelope.rejects++;
    if (rejectReason) {
      metrics.envelope.reject_reasons[rejectReason] =
        (metrics.envelope.reject_reasons[rejectReason] || 0) + 1;
    }
  }
}

/**
 * Record escalation assessment
 */
export function recordEscalation(action, riskScore, factors = []) {
  metrics.escalation.assessments++;
  metrics.escalation.by_action[action] =
    (metrics.escalation.by_action[action] || 0) + 1;

  // Track high-risk events
  if (riskScore >= 0.7) {
    metrics.escalation.high_risk_events.push({
      timestamp: new Date().toISOString(),
      action,
      risk_score: riskScore,
      factors: factors.map(f => f.category),
    });
    // Keep only last 100 high-risk events
    if (metrics.escalation.high_risk_events.length > 100) {
      metrics.escalation.high_risk_events.shift();
    }
  }
}

/**
 * Record replay attempt
 */
export function recordReplay(success, deterministic = true) {
  metrics.replay.attempts++;
  if (success) {
    metrics.replay.successes++;
  } else {
    metrics.replay.failures++;
  }
  if (deterministic) {
    metrics.replay.deterministic++;
  } else {
    metrics.replay.non_deterministic++;
  }
}

/**
 * Record latency measurement
 */
export function recordLatency(category, durationMs) {
  if (!metrics.latency[category]) {
    metrics.latency[category] = [];
  }
  metrics.latency[category].push(durationMs);
  // Keep only last 1000 measurements per category
  if (metrics.latency[category].length > 1000) {
    metrics.latency[category].shift();
  }
}

/**
 * Calculate percentile from array of values
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Get latency percentiles for a category
 */
export function getLatencyPercentiles(category) {
  const data = metrics.latency[category] || [];
  if (data.length === 0) {
    return { p50: 0, p95: 0, p99: 0, count: 0, avg: 0 };
  }
  return {
    p50: percentile(data, 50),
    p95: percentile(data, 95),
    p99: percentile(data, 99),
    count: data.length,
    avg: data.reduce((a, b) => a + b, 0) / data.length,
  };
}

/**
 * Get all metrics summary
 */
export function getMetricsSummary() {
  const uptime_seconds = Math.floor((Date.now() - metrics.start_time) / 1000);

  return {
    uptime_seconds,
    envelope: {
      total_validations: metrics.envelope.validations,
      accepts: metrics.envelope.accepts,
      rejects: metrics.envelope.rejects,
      accept_rate: metrics.envelope.validations > 0
        ? ((metrics.envelope.accepts / metrics.envelope.validations) * 100).toFixed(2) + '%'
        : '100%',
      reject_reasons: metrics.envelope.reject_reasons,
    },
    escalation: {
      total_assessments: metrics.escalation.assessments,
      by_action: metrics.escalation.by_action,
      high_risk_count: metrics.escalation.high_risk_events.length,
      recent_high_risk: metrics.escalation.high_risk_events.slice(-5),
    },
    replay: {
      total_attempts: metrics.replay.attempts,
      successes: metrics.replay.successes,
      failures: metrics.replay.failures,
      success_rate: metrics.replay.attempts > 0
        ? ((metrics.replay.successes / metrics.replay.attempts) * 100).toFixed(2) + '%'
        : '100%',
      determinism_rate: metrics.replay.attempts > 0
        ? ((metrics.replay.deterministic / metrics.replay.attempts) * 100).toFixed(2) + '%'
        : '100%',
    },
    latency: {
      envelope_validation: getLatencyPercentiles('envelope_validation'),
      escalation_assessment: getLatencyPercentiles('escalation_assessment'),
      replay_execution: getLatencyPercentiles('replay_execution'),
      score_endpoint: getLatencyPercentiles('score_endpoint'),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics() {
  metrics.envelope = { validations: 0, accepts: 0, rejects: 0, reject_reasons: {} };
  metrics.escalation = { assessments: 0, by_action: { allow: 0, disclaimer: 0, escalate: 0, block: 0 }, high_risk_events: [] };
  metrics.replay = { attempts: 0, successes: 0, failures: 0, deterministic: 0, non_deterministic: 0 };
  metrics.latency = { envelope_validation: [], escalation_assessment: [], replay_execution: [], score_endpoint: [] };
  metrics.start_time = Date.now();
}

/**
 * Check if metrics meet stabilization exit criteria
 */
export function checkExitCriteria() {
  const summary = getMetricsSummary();

  const replayRate = summary.replay.total_attempts === 0 ? 100 :
    (summary.replay.successes / summary.replay.total_attempts) * 100;

  const criteria = {
    replay_success_rate_100: replayRate === 100,
    no_unexplained_escalations: summary.escalation.high_risk_count === 0 ||
      summary.escalation.recent_high_risk.every(e => e.factors && e.factors.length > 0),
    stable_latency: summary.latency.envelope_validation.p99 < 100, // p99 < 100ms
  };

  criteria.all_green = criteria.replay_success_rate_100 &&
    criteria.no_unexplained_escalations &&
    criteria.stable_latency;

  return criteria;
}

export default {
  recordEnvelopeValidation,
  recordEscalation,
  recordReplay,
  recordLatency,
  getLatencyPercentiles,
  getMetricsSummary,
  resetMetrics,
  checkExitCriteria,
};
