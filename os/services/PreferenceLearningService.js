/**
 * PreferenceLearningService - OS_AUTHORITY
 *
 * User Preference Learning System
 *
 * OS decides:
 * - What preferences to store
 * - How to update the model
 * - What context to pass to SIVA
 *
 * SIVA reasons:
 * - Over preference context (stateless)
 * - For scoring adjustments
 *
 * SaaS:
 * - Emits feedback events only
 * - Never stores preferences
 *
 * Architecture: OS decides. SIVA reasons. SaaS renders.
 */

class PreferenceLearningService {
  constructor() {
    // In-memory preference store (production: PostgreSQL in OS schema)
    this.userPreferences = new Map();

    // Default config (overridden by pack config)
    this.config = {
      enabled: true,
      signals_to_track: ['LIKE', 'DISLIKE', 'SAVE', 'DISMISS', 'SHOW_MORE', 'FIND_SIMILAR'],
      learning_window_days: 90,
      min_signals_for_learning: 5,
      preference_factors: ['industry', 'company_size', 'location', 'signal_type', 'founding_year']
    };
  }

  /**
   * Load preference learning config from pack
   * @param {Object} packConfig - Pack configuration
   */
  loadPackConfig(packConfig) {
    if (packConfig && packConfig.preference_learning) {
      this.config = {
        ...this.config,
        ...packConfig.preference_learning
      };
    }
  }

  /**
   * Record a preference signal
   * OS_AUTHORITY: OS stores and interprets all signals
   *
   * @param {string} userId - User identifier (from session)
   * @param {Object} signal - The preference signal
   * @returns {Object} Updated preference summary
   */
  recordSignal(userId, signal) {
    if (!this.config.enabled) {
      return { recorded: false, reason: 'preference_learning_disabled' };
    }

    if (!this.config.signals_to_track.includes(signal.action)) {
      return { recorded: false, reason: 'signal_type_not_tracked' };
    }

    // Get or create user preference record
    let userPref = this.userPreferences.get(userId);
    if (!userPref) {
      userPref = this._createEmptyPreferenceRecord(userId);
      this.userPreferences.set(userId, userPref);
    }

    // Add signal to history
    userPref.signals.push({
      ...signal,
      timestamp: new Date().toISOString()
    });

    // Prune old signals
    this._pruneOldSignals(userPref);

    // Update learned preferences
    this._updateLearnedPreferences(userPref);

    return {
      recorded: true,
      signalCount: userPref.signals.length,
      hasEnoughData: userPref.signals.length >= this.config.min_signals_for_learning
    };
  }

  /**
   * Get preference context for SIVA
   * OS_AUTHORITY: OS decides what context to provide
   *
   * @param {string} userId - User identifier
   * @returns {Object} Preference context for SIVA reasoning
   */
  getPreferenceContext(userId) {
    const userPref = this.userPreferences.get(userId);

    if (!userPref || userPref.signals.length < this.config.min_signals_for_learning) {
      return {
        hasPreferences: false,
        message: 'Not enough data to learn preferences yet'
      };
    }

    return {
      hasPreferences: true,
      learned: userPref.learned,
      summary: this._generatePreferenceSummary(userPref),
      signalCount: userPref.signals.length,
      lastUpdated: userPref.updatedAt
    };
  }

  /**
   * Get scoring adjustments based on preferences
   * OS_AUTHORITY: OS decides how preferences affect scoring
   *
   * @param {string} userId - User identifier
   * @param {Object} lead - Lead to score
   * @returns {Object} Scoring adjustments
   */
  getScoringAdjustments(userId, lead) {
    const userPref = this.userPreferences.get(userId);

    if (!userPref || userPref.signals.length < this.config.min_signals_for_learning) {
      return { adjustment: 0, reason: 'insufficient_data' };
    }

    let adjustment = 0;
    const reasons = [];

    // Industry preference
    if (userPref.learned.industries) {
      const industryPref = userPref.learned.industries[lead.industry];
      if (industryPref) {
        adjustment += industryPref.score;
        if (industryPref.score > 0) {
          reasons.push(`User prefers ${lead.industry} industry`);
        } else {
          reasons.push(`User tends to dismiss ${lead.industry} companies`);
        }
      }
    }

    // Size preference
    if (userPref.learned.sizes) {
      const sizePref = userPref.learned.sizes[lead.size_bucket];
      if (sizePref) {
        adjustment += sizePref.score;
        if (sizePref.score > 0) {
          reasons.push(`User prefers ${lead.size_bucket} companies`);
        }
      }
    }

    // Location preference
    if (userPref.learned.locations) {
      const locationPref = userPref.learned.locations[lead.location];
      if (locationPref) {
        adjustment += locationPref.score;
        if (locationPref.score > 0) {
          reasons.push(`User prefers companies in ${lead.location}`);
        }
      }
    }

    return {
      adjustment: Math.max(-20, Math.min(20, adjustment)), // Cap at ±20
      reasons,
      confidence: Math.min(userPref.signals.length / 20, 1.0) // Max confidence at 20 signals
    };
  }

  /**
   * Get saved leads for a user
   * OS_AUTHORITY: OS stores saved leads
   *
   * @param {string} userId - User identifier
   * @returns {Array} Saved lead IDs
   */
  getSavedLeads(userId) {
    const userPref = this.userPreferences.get(userId);
    if (!userPref) return [];

    return userPref.signals
      .filter(s => s.action === 'SAVE')
      .map(s => ({
        companyId: s.companyId,
        savedAt: s.timestamp,
        metadata: s.metadata
      }));
  }

  /**
   * Remove a saved lead
   * @param {string} userId - User identifier
   * @param {string} companyId - Company to unsave
   */
  removeSavedLead(userId, companyId) {
    const userPref = this.userPreferences.get(userId);
    if (!userPref) return { success: false };

    // Add UNSAVE signal (keeps history)
    userPref.signals.push({
      action: 'UNSAVE',
      companyId,
      timestamp: new Date().toISOString()
    });

    return { success: true };
  }

  /**
   * Internal: Create empty preference record
   * @private
   */
  _createEmptyPreferenceRecord(userId) {
    return {
      userId,
      signals: [],
      learned: {
        industries: {},
        sizes: {},
        locations: {},
        signalTypes: {}
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Internal: Prune signals older than learning window
   * @private
   */
  _pruneOldSignals(userPref) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.learning_window_days);

    userPref.signals = userPref.signals.filter(s =>
      new Date(s.timestamp) > cutoff
    );
  }

  /**
   * Internal: Update learned preferences from signals
   * OS_AUTHORITY: OS runs the learning algorithm
   * @private
   */
  _updateLearnedPreferences(userPref) {
    // Reset learned preferences
    userPref.learned = {
      industries: {},
      sizes: {},
      locations: {},
      signalTypes: {}
    };

    // Process each signal
    for (const signal of userPref.signals) {
      const weight = this._getSignalWeight(signal.action);
      const metadata = signal.metadata || {};

      // Learn industry preference
      if (metadata.industry) {
        if (!userPref.learned.industries[metadata.industry]) {
          userPref.learned.industries[metadata.industry] = { score: 0, count: 0 };
        }
        userPref.learned.industries[metadata.industry].score += weight;
        userPref.learned.industries[metadata.industry].count++;
      }

      // Learn size preference
      if (metadata.size_bucket) {
        if (!userPref.learned.sizes[metadata.size_bucket]) {
          userPref.learned.sizes[metadata.size_bucket] = { score: 0, count: 0 };
        }
        userPref.learned.sizes[metadata.size_bucket].score += weight;
        userPref.learned.sizes[metadata.size_bucket].count++;
      }

      // Learn location preference
      if (metadata.location) {
        if (!userPref.learned.locations[metadata.location]) {
          userPref.learned.locations[metadata.location] = { score: 0, count: 0 };
        }
        userPref.learned.locations[metadata.location].score += weight;
        userPref.learned.locations[metadata.location].count++;
      }

      // Learn signal type preference
      if (metadata.signal_type) {
        if (!userPref.learned.signalTypes[metadata.signal_type]) {
          userPref.learned.signalTypes[metadata.signal_type] = { score: 0, count: 0 };
        }
        userPref.learned.signalTypes[metadata.signal_type].score += weight;
        userPref.learned.signalTypes[metadata.signal_type].count++;
      }
    }

    userPref.updatedAt = new Date().toISOString();
  }

  /**
   * Internal: Get weight for a signal action
   * @private
   */
  _getSignalWeight(action) {
    const weights = {
      'LIKE': 3,
      'SAVE': 5,
      'FIND_SIMILAR': 4,
      'SHOW_MORE': 1,
      'DISLIKE': -2,
      'DISMISS': -3,
      'UNSAVE': -1
    };
    return weights[action] || 0;
  }

  /**
   * Internal: Generate human-readable preference summary
   * For SIVA reasoning context
   * @private
   */
  _generatePreferenceSummary(userPref) {
    const summary = [];

    // Top preferred industries
    const topIndustries = Object.entries(userPref.learned.industries)
      .filter(([_, v]) => v.score > 0)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3);

    if (topIndustries.length > 0) {
      summary.push(`Prefers industries: ${topIndustries.map(([k]) => k).join(', ')}`);
    }

    // Avoided industries
    const avoidedIndustries = Object.entries(userPref.learned.industries)
      .filter(([_, v]) => v.score < -3)
      .map(([k]) => k);

    if (avoidedIndustries.length > 0) {
      summary.push(`Tends to avoid: ${avoidedIndustries.join(', ')}`);
    }

    // Size preference
    const topSizes = Object.entries(userPref.learned.sizes)
      .filter(([_, v]) => v.score > 0)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 2);

    if (topSizes.length > 0) {
      summary.push(`Prefers ${topSizes.map(([k]) => k).join(' and ')} companies`);
    }

    return summary.join('. ') || 'Learning user preferences...';
  }
}

module.exports = PreferenceLearningService;
