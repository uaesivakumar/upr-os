/**
 * LeadQueueService - OS_AUTHORITY
 *
 * Progressive Lead Delivery System
 *
 * OS decides:
 * - What leads to show
 * - How many per batch
 * - Priority ordering
 * - Session state
 *
 * SIVA reasons:
 * - Ranking within queue (via scoring)
 *
 * SaaS:
 * - Emits "SHOW_MORE" intent
 * - Renders what OS returns
 *
 * Architecture: OS decides. SIVA reasons. SaaS renders.
 */

class LeadQueueService {
  constructor() {
    // In-memory session queues (production: Redis)
    this.sessionQueues = new Map();

    // Default config (overridden by pack config)
    this.config = {
      initial_batch: 5,
      subsequent_batch: 3,
      require_feedback_before_next: true,
      max_leads_per_session: 50
    };
  }

  /**
   * Load progressive delivery config from pack
   * @param {Object} packConfig - Pack configuration
   */
  loadPackConfig(packConfig) {
    if (packConfig && packConfig.progressive_delivery) {
      this.config = {
        ...this.config,
        ...packConfig.progressive_delivery
      };
    }
  }

  /**
   * Initialize a new session queue with leads
   * OS_AUTHORITY: OS decides initial queue state
   *
   * @param {string} sessionId - Unique session identifier
   * @param {Array} leads - All discovered leads (pre-scored)
   * @returns {Object} Initial batch to show
   */
  initializeQueue(sessionId, leads) {
    // Sort leads by score (descending)
    const sortedLeads = [...leads].sort((a, b) =>
      (b.score || b.qtle_score || 0) - (a.score || a.qtle_score || 0)
    );

    // Create session state
    const session = {
      sessionId,
      queue: sortedLeads,
      shown: [],
      feedback: [],
      currentIndex: 0,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString()
    };

    this.sessionQueues.set(sessionId, session);

    // Return initial batch
    return this._getNextBatch(sessionId, this.config.initial_batch);
  }

  /**
   * Get next batch of leads for a session
   * OS_AUTHORITY: OS decides what to show next
   *
   * @param {string} sessionId - Session identifier
   * @param {Object} context - Optional context (feedback from last batch)
   * @returns {Object} Next batch of leads
   */
  getNextBatch(sessionId, context = {}) {
    const session = this.sessionQueues.get(sessionId);
    if (!session) {
      return { error: 'SESSION_NOT_FOUND', leads: [] };
    }

    // Check if feedback required
    if (this.config.require_feedback_before_next) {
      const lastBatchSize = session.shown.length - session.feedback.length;
      if (lastBatchSize > 0 && session.feedback.length === 0) {
        return {
          error: 'FEEDBACK_REQUIRED',
          message: 'Please provide feedback on current leads before showing more',
          leads: []
        };
      }
    }

    // Apply any preference adjustments from context
    if (context.preferences) {
      this._applyPreferenceBoost(session, context.preferences);
    }

    return this._getNextBatch(sessionId, this.config.subsequent_batch);
  }

  /**
   * Record feedback for a lead
   * OS_AUTHORITY: OS stores and interprets feedback
   *
   * @param {string} sessionId - Session identifier
   * @param {string} companyId - Company that received feedback
   * @param {string} action - LIKE, DISLIKE, SAVE, DISMISS
   * @param {Object} metadata - Additional context (reason, etc.)
   */
  recordFeedback(sessionId, companyId, action, metadata = {}) {
    const session = this.sessionQueues.get(sessionId);
    if (!session) return { error: 'SESSION_NOT_FOUND' };

    const feedback = {
      companyId,
      action,
      metadata,
      timestamp: new Date().toISOString()
    };

    session.feedback.push(feedback);
    session.lastActivityAt = new Date().toISOString();

    // Adjust queue priority based on feedback
    this._adjustQueuePriority(session, feedback);

    return { success: true, feedbackCount: session.feedback.length };
  }

  /**
   * Get queue statistics for a session
   * @param {string} sessionId - Session identifier
   */
  getQueueStats(sessionId) {
    const session = this.sessionQueues.get(sessionId);
    if (!session) return null;

    return {
      sessionId,
      totalLeads: session.queue.length,
      shown: session.shown.length,
      remaining: session.queue.length - session.currentIndex,
      feedbackCount: session.feedback.length,
      likeCount: session.feedback.filter(f => f.action === 'LIKE').length,
      dislikeCount: session.feedback.filter(f => f.action === 'DISLIKE').length,
      saveCount: session.feedback.filter(f => f.action === 'SAVE').length
    };
  }

  /**
   * Internal: Get next batch from queue
   * @private
   */
  _getNextBatch(sessionId, batchSize) {
    const session = this.sessionQueues.get(sessionId);
    if (!session) return { leads: [], hasMore: false };

    const start = session.currentIndex;
    const end = Math.min(start + batchSize, session.queue.length, this.config.max_leads_per_session);

    const batch = session.queue.slice(start, end);
    session.currentIndex = end;
    session.shown.push(...batch.map(l => l.company_id || l.id));
    session.lastActivityAt = new Date().toISOString();

    return {
      leads: batch,
      batchNumber: Math.ceil(end / batchSize),
      hasMore: end < session.queue.length && end < this.config.max_leads_per_session,
      remaining: Math.min(session.queue.length, this.config.max_leads_per_session) - end,
      stats: this.getQueueStats(sessionId)
    };
  }

  /**
   * Internal: Adjust queue priority based on feedback
   * OS_AUTHORITY: OS decides how feedback affects ranking
   * @private
   */
  _adjustQueuePriority(session, feedback) {
    const { companyId, action } = feedback;

    // Find the lead that received feedback
    const feedbackLead = session.queue.find(l =>
      (l.company_id || l.id) === companyId
    );
    if (!feedbackLead) return;

    // Extract characteristics for similar lead matching
    const characteristics = {
      industry: feedbackLead.industry,
      size_bucket: feedbackLead.size_bucket,
      location: feedbackLead.location
    };

    // Adjust remaining leads based on similarity
    const adjustment = action === 'LIKE' || action === 'SAVE' ? 0.1 : -0.1;

    session.queue.forEach((lead, index) => {
      if (index <= session.currentIndex) return; // Skip already shown

      let similarity = 0;
      if (lead.industry === characteristics.industry) similarity += 0.4;
      if (lead.size_bucket === characteristics.size_bucket) similarity += 0.3;
      if (lead.location === characteristics.location) similarity += 0.3;

      // Apply adjustment weighted by similarity
      lead.score = (lead.score || lead.qtle_score || 50) + (adjustment * similarity * 10);
    });

    // Re-sort remaining leads
    const shown = session.queue.slice(0, session.currentIndex);
    const remaining = session.queue.slice(session.currentIndex);
    remaining.sort((a, b) => (b.score || 0) - (a.score || 0));
    session.queue = [...shown, ...remaining];
  }

  /**
   * Internal: Apply preference boost from learned preferences
   * @private
   */
  _applyPreferenceBoost(session, preferences) {
    session.queue.forEach((lead, index) => {
      if (index <= session.currentIndex) return;

      let boost = 0;

      // Industry preference
      if (preferences.preferred_industries?.includes(lead.industry)) {
        boost += 5;
      }

      // Size preference
      if (preferences.preferred_size_bucket === lead.size_bucket) {
        boost += 3;
      }

      lead.score = (lead.score || lead.qtle_score || 50) + boost;
    });

    // Re-sort
    const shown = session.queue.slice(0, session.currentIndex);
    const remaining = session.queue.slice(session.currentIndex);
    remaining.sort((a, b) => (b.score || 0) - (a.score || 0));
    session.queue = [...shown, ...remaining];
  }

  /**
   * Clean up expired sessions (call periodically)
   * @param {number} maxAgeMs - Max session age in milliseconds
   */
  cleanupExpiredSessions(maxAgeMs = 3600000) { // 1 hour default
    const now = Date.now();
    for (const [sessionId, session] of this.sessionQueues) {
      const lastActivity = new Date(session.lastActivityAt).getTime();
      if (now - lastActivity > maxAgeMs) {
        this.sessionQueues.delete(sessionId);
      }
    }
  }
}

module.exports = LeadQueueService;
