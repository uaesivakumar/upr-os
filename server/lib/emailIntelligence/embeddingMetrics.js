/**
 * Embedding Observability Metrics
 *
 * Tracks:
 * - Dimension validation errors
 * - Failure learning hits/misses
 * - Vector query latency
 * - Cost savings from pattern reuse
 */

class EmbeddingMetrics {
  constructor() {
    this.metrics = {
      // Dimension validation
      dimensionValidationErrors: 0,
      dimensionValidationSuccess: 0,
      lastDimensionError: null,

      // Failure learning
      failureLearningHits: 0,
      failureLearningMisses: 0,
      failureLearningErrors: 0,
      totalCostSavings: 0, // in dollars

      // Vector queries
      vectorQueryCount: 0,
      vectorQueryLatencySum: 0, // in milliseconds
      vectorQueryErrors: 0,
      vectorQueryHits: 0,
      vectorQueryMisses: 0,

      // Embedding generation
      embeddingGenerationCount: 0,
      embeddingGenerationErrors: 0,
      embeddingGenerationLatencySum: 0,
      embeddingGenerationCost: 0, // in dollars

      // Pattern reuse
      patternReuseCount: 0,
      patternReuseCostSavings: 0, // in dollars

      // Timestamps
      startTime: Date.now(),
      lastResetTime: Date.now()
    };
  }

  /**
   * Record dimension validation success
   */
  recordDimensionValidationSuccess() {
    this.metrics.dimensionValidationSuccess++;
  }

  /**
   * Record dimension validation error
   * @param {Object} error - Error object with dimension details
   */
  recordDimensionValidationError(error) {
    this.metrics.dimensionValidationErrors++;
    this.metrics.lastDimensionError = {
      message: error.message,
      expected: error.expected,
      actual: error.actual,
      timestamp: Date.now()
    };
    console.error('[EmbeddingMetrics] CRITICAL: Dimension validation error', {
      expected: error.expected,
      actual: error.actual,
      errorCount: this.metrics.dimensionValidationErrors
    });
  }

  /**
   * Record failure learning hit (found similar failure, saved cost)
   * @param {number} savedCost - Cost saved in dollars (e.g., 0.024 for NeverBounce)
   */
  recordFailureLearningHit(savedCost = 0.024) {
    this.metrics.failureLearningHits++;
    this.metrics.totalCostSavings += savedCost;
    console.log(`[EmbeddingMetrics] Failure learning HIT - saved $${savedCost.toFixed(3)} (total: $${this.metrics.totalCostSavings.toFixed(2)})`);
  }

  /**
   * Record failure learning miss (no similar failure found)
   */
  recordFailureLearningMiss() {
    this.metrics.failureLearningMisses++;
  }

  /**
   * Record failure learning error
   * @param {Error} error - Error object
   */
  recordFailureLearningError(error) {
    this.metrics.failureLearningErrors++;
    console.error('[EmbeddingMetrics] Failure learning error:', error.message);
  }

  /**
   * Record vector query
   * @param {Object} result - Query result
   * @param {number} latency - Query latency in milliseconds
   * @param {boolean} hit - Whether query found results
   */
  recordVectorQuery(result, latency, hit = false) {
    this.metrics.vectorQueryCount++;
    this.metrics.vectorQueryLatencySum += latency;

    if (hit) {
      this.metrics.vectorQueryHits++;
    } else {
      this.metrics.vectorQueryMisses++;
    }

    // Log slow queries (>50ms)
    if (latency > 50) {
      console.warn(`[EmbeddingMetrics] Slow vector query: ${latency.toFixed(2)}ms`);
    }
  }

  /**
   * Record vector query error
   * @param {Error} error - Error object
   */
  recordVectorQueryError(error) {
    this.metrics.vectorQueryErrors++;
    console.error('[EmbeddingMetrics] Vector query error:', error.message);
  }

  /**
   * Record embedding generation
   * @param {number} latency - Generation latency in milliseconds
   * @param {number} tokenCount - Number of tokens (approx)
   */
  recordEmbeddingGeneration(latency, tokenCount = 50) {
    this.metrics.embeddingGenerationCount++;
    this.metrics.embeddingGenerationLatencySum += latency;

    // Cost: $0.02 per 1M tokens for text-embedding-3-small
    const cost = (tokenCount / 1000000) * 0.02;
    this.metrics.embeddingGenerationCost += cost;
  }

  /**
   * Record embedding generation error
   * @param {Error} error - Error object
   */
  recordEmbeddingGenerationError(error) {
    this.metrics.embeddingGenerationErrors++;
    console.error('[EmbeddingMetrics] Embedding generation error:', error.message);
  }

  /**
   * Record pattern reuse (found in RAG, no LLM needed)
   * @param {number} savedCost - Estimated cost saved (LLM call + validation)
   */
  recordPatternReuse(savedCost = 0.05) {
    this.metrics.patternReuseCount++;
    this.metrics.patternReuseCostSavings += savedCost;
    console.log(`[EmbeddingMetrics] Pattern reuse - saved $${savedCost.toFixed(3)} (total: $${this.metrics.patternReuseCostSavings.toFixed(2)})`);
  }

  /**
   * Get current metrics snapshot
   * @returns {Object} - Metrics snapshot
   */
  getMetrics() {
    const uptimeSeconds = (Date.now() - this.metrics.startTime) / 1000;
    const avgVectorQueryLatency = this.metrics.vectorQueryCount > 0
      ? this.metrics.vectorQueryLatencySum / this.metrics.vectorQueryCount
      : 0;
    const avgEmbeddingLatency = this.metrics.embeddingGenerationCount > 0
      ? this.metrics.embeddingGenerationLatencySum / this.metrics.embeddingGenerationCount
      : 0;

    const failureLearningTotal = this.metrics.failureLearningHits + this.metrics.failureLearningMisses;
    const failureLearningHitRate = failureLearningTotal > 0
      ? (this.metrics.failureLearningHits / failureLearningTotal * 100).toFixed(1)
      : 0;

    const vectorQueryHitRate = this.metrics.vectorQueryCount > 0
      ? (this.metrics.vectorQueryHits / this.metrics.vectorQueryCount * 100).toFixed(1)
      : 0;

    return {
      uptime: {
        seconds: Math.floor(uptimeSeconds),
        formatted: this.formatUptime(uptimeSeconds)
      },

      dimensionValidation: {
        success: this.metrics.dimensionValidationSuccess,
        errors: this.metrics.dimensionValidationErrors,
        lastError: this.metrics.lastDimensionError,
        errorRate: this.calculateErrorRate(
          this.metrics.dimensionValidationErrors,
          this.metrics.dimensionValidationSuccess + this.metrics.dimensionValidationErrors
        )
      },

      failureLearning: {
        hits: this.metrics.failureLearningHits,
        misses: this.metrics.failureLearningMisses,
        errors: this.metrics.failureLearningErrors,
        hitRate: `${failureLearningHitRate}%`,
        totalCostSavings: `$${this.metrics.totalCostSavings.toFixed(2)}`
      },

      vectorQueries: {
        count: this.metrics.vectorQueryCount,
        hits: this.metrics.vectorQueryHits,
        misses: this.metrics.vectorQueryMisses,
        errors: this.metrics.vectorQueryErrors,
        hitRate: `${vectorQueryHitRate}%`,
        avgLatency: `${avgVectorQueryLatency.toFixed(2)}ms`,
        totalLatency: `${this.metrics.vectorQueryLatencySum.toFixed(2)}ms`
      },

      embeddingGeneration: {
        count: this.metrics.embeddingGenerationCount,
        errors: this.metrics.embeddingGenerationErrors,
        avgLatency: `${avgEmbeddingLatency.toFixed(2)}ms`,
        totalCost: `$${this.metrics.embeddingGenerationCost.toFixed(4)}`
      },

      patternReuse: {
        count: this.metrics.patternReuseCount,
        costSavings: `$${this.metrics.patternReuseCostSavings.toFixed(2)}`
      },

      totalCostSavings: `$${(
        this.metrics.totalCostSavings +
        this.metrics.patternReuseCostSavings
      ).toFixed(2)}`,

      totalCostSpent: `$${this.metrics.embeddingGenerationCost.toFixed(4)}`
    };
  }

  /**
   * Calculate error rate
   * @param {number} errors - Number of errors
   * @param {number} total - Total attempts
   * @returns {string} - Error rate percentage
   */
  calculateErrorRate(errors, total) {
    if (total === 0) return '0.0%';
    return `${(errors / total * 100).toFixed(1)}%`;
  }

  /**
   * Format uptime in human-readable format
   * @param {number} seconds - Uptime in seconds
   * @returns {string} - Formatted uptime
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Log metrics summary to console
   */
  logSummary() {
    const metrics = this.getMetrics();
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('EMBEDDING METRICS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Uptime: ${metrics.uptime.formatted}`);
    console.log('');
    console.log('Dimension Validation:');
    console.log(`  Success: ${metrics.dimensionValidation.success}`);
    console.log(`  Errors: ${metrics.dimensionValidation.errors}`);
    console.log(`  Error Rate: ${metrics.dimensionValidation.errorRate}`);
    console.log('');
    console.log('Failure Learning:');
    console.log(`  Hits: ${metrics.failureLearning.hits}`);
    console.log(`  Misses: ${metrics.failureLearning.misses}`);
    console.log(`  Hit Rate: ${metrics.failureLearning.hitRate}`);
    console.log(`  Cost Savings: ${metrics.failureLearning.totalCostSavings}`);
    console.log('');
    console.log('Vector Queries:');
    console.log(`  Count: ${metrics.vectorQueries.count}`);
    console.log(`  Hits: ${metrics.vectorQueries.hits}`);
    console.log(`  Misses: ${metrics.vectorQueries.misses}`);
    console.log(`  Hit Rate: ${metrics.vectorQueries.hitRate}`);
    console.log(`  Avg Latency: ${metrics.vectorQueries.avgLatency}`);
    console.log('');
    console.log('Embedding Generation:');
    console.log(`  Count: ${metrics.embeddingGeneration.count}`);
    console.log(`  Errors: ${metrics.embeddingGeneration.errors}`);
    console.log(`  Avg Latency: ${metrics.embeddingGeneration.avgLatency}`);
    console.log(`  Total Cost: ${metrics.embeddingGeneration.totalCost}`);
    console.log('');
    console.log('Pattern Reuse:');
    console.log(`  Count: ${metrics.patternReuse.count}`);
    console.log(`  Cost Savings: ${metrics.patternReuse.costSavings}`);
    console.log('');
    console.log(`Total Cost Savings: ${metrics.totalCostSavings}`);
    console.log(`Total Cost Spent: ${metrics.totalCostSpent}`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
  }

  /**
   * Reset all metrics
   */
  reset() {
    const oldMetrics = this.metrics;
    this.metrics = {
      dimensionValidationErrors: 0,
      dimensionValidationSuccess: 0,
      lastDimensionError: null,
      failureLearningHits: 0,
      failureLearningMisses: 0,
      failureLearningErrors: 0,
      totalCostSavings: 0,
      vectorQueryCount: 0,
      vectorQueryLatencySum: 0,
      vectorQueryErrors: 0,
      vectorQueryHits: 0,
      vectorQueryMisses: 0,
      embeddingGenerationCount: 0,
      embeddingGenerationErrors: 0,
      embeddingGenerationLatencySum: 0,
      embeddingGenerationCost: 0,
      patternReuseCount: 0,
      patternReuseCostSavings: 0,
      startTime: Date.now(),
      lastResetTime: Date.now()
    };
    console.log('[EmbeddingMetrics] Metrics reset');
    return oldMetrics;
  }
}

// Singleton instance
const embeddingMetrics = new EmbeddingMetrics();

// Auto-log metrics every 5 minutes (optional, can be disabled)
const AUTO_LOG_INTERVAL = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  if (embeddingMetrics.metrics.vectorQueryCount > 0 ||
      embeddingMetrics.metrics.embeddingGenerationCount > 0) {
    embeddingMetrics.logSummary();
  }
}, AUTO_LOG_INTERVAL);

export default embeddingMetrics;
