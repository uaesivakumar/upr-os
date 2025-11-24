/**
 * SignalDeduplicationTool - SIVA Tool 15 (Standalone) - v1.0
 *
 * Implements: CHECK_SIGNAL_DUPLICATION (STRICT - Fuzzy Matching)
 *
 * Purpose: Detect duplicate hiring signals using fuzzy matching + domain comparison
 * Type: STRICT (Fuzzy matching + database lookup)
 * SLA: ≤200ms P50, ≤500ms P95
 *
 * v1.0 Features:
 * - Fuzzy company name matching (string similarity)
 * - Exact domain matching (highest confidence)
 * - Configurable lookback window (default: 30 days)
 * - Company name normalization (remove legal entities)
 * - Sentry error tracking
 *
 * Replaces: SQL ON CONFLICT logic
 *
 * Phase 2 Reference: Tool 15 - CHECK_SIGNAL_DUPLICATION
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const stringSimilarity = require('string-similarity');
const { signalDeduplicationInputSchema, signalDeduplicationOutputSchema } = require('./schemas/signalDeduplicationSchemas');

class SignalDeduplicationToolStandalone {
  constructor() {
    this.agentName = 'SignalDeduplicationTool';
    this.POLICY_VERSION = 'v1.0';

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(signalDeduplicationInputSchema);
    this.validateOutput = ajv.compile(signalDeduplicationOutputSchema);

    // Fuzzy matching thresholds
    this.NAME_SIMILARITY_THRESHOLD = 0.85; // 85% similarity = duplicate
    this.DOMAIN_MATCH_CONFIDENCE = 0.95;    // Exact domain match confidence
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Company name, domain, signal type, tenant ID
   * @param {Object} db - Database pool (injected dependency)
   * @returns {Promise<Object>} Duplicate detection result
   */
  async execute(input, db) {
    try {
      return await this._executeInternal(input, db);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'SignalDeduplicationTool',
          primitive: 'CHECK_SIGNAL_DUPLICATION',
          phase: 'Phase_2',
          layer: 'STRICT'
        },
        extra: {
          input_company: input.company_name,
          tenant_id: input.tenant_id,
          timestamp: new Date().toISOString()
        },
        level: 'error'
      });

      // Fail open - don't block on deduplication errors
      console.warn('[Tool15] Deduplication error, failing open:', error.message);
      return {
        is_duplicate: false,
        duplicate_confidence: 0.0,
        existing_signal_id: null,
        match_details: null,
        metadata: {
          signals_checked: 0,
          lookback_days: input.lookback_days || 30
        },
        timestamp: new Date().toISOString(),
        _meta: {
          latency_ms: 0,
          tool_name: 'check_signal_duplication',
          tool_type: 'STRICT',
          policy_version: this.POLICY_VERSION
        }
      };
    }
  }

  /**
   * Internal execution logic
   * @private
   */
  async _executeInternal(input, db) {
    // Validate input
    if (!this.validateInput(input)) {
      const errors = this.validateInput.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      throw new Error(`Input validation failed: ${errors}`);
    }

    const startTime = Date.now();

    // Extract inputs
    const {
      company_name,
      company_domain,
      signal_type,
      tenant_id,
      lookback_days = 30
    } = input;

    // If no database provided, fail open
    if (!db) {
      console.warn('[Tool15] No database connection, failing open');
      return this._buildNoDuplicateResponse(lookback_days, Date.now() - startTime);
    }

    // Calculate lookback date
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookback_days);

    // Query existing signals in timeframe
    let existingSignals;
    try {
      const result = await db.query(`
        SELECT
          id,
          company,
          domain,
          trigger_type,
          created_at
        FROM hiring_signals
        WHERE tenant_id = $1
          AND created_at >= $2
        ORDER BY created_at DESC
      `, [tenant_id, lookbackDate.toISOString()]);

      existingSignals = result.rows;
    } catch (dbError) {
      console.error('[Tool15] Database query failed:', dbError.message);
      // Fail open
      return this._buildNoDuplicateResponse(lookback_days, Date.now() - startTime);
    }

    // Check for duplicates
    for (const existing of existingSignals) {
      // Method 1: Exact domain match (highest confidence)
      if (company_domain && existing.domain) {
        const normalizedInputDomain = this._normalizeDomain(company_domain);
        const normalizedExistingDomain = this._normalizeDomain(existing.domain);

        if (normalizedInputDomain === normalizedExistingDomain) {
          const daysSinceLast = Math.floor(
            (Date.now() - new Date(existing.created_at)) / (1000 * 60 * 60 * 24)
          );

          const latencyMs = Date.now() - startTime;

          const output = {
            is_duplicate: true,
            duplicate_confidence: this.DOMAIN_MATCH_CONFIDENCE,
            existing_signal_id: existing.id,
            match_details: {
              name_similarity: 1.0,
              domain_match: true,
              days_since_last: daysSinceLast
            },
            metadata: {
              signals_checked: existingSignals.length,
              lookback_days: lookback_days
            },
            timestamp: new Date().toISOString(),
            _meta: {
              latency_ms: latencyMs,
              tool_name: 'check_signal_duplication',
              tool_type: 'STRICT',
              policy_version: this.POLICY_VERSION
            }
          };

          // Validate output
          if (!this.validateOutput(output)) {
            const errors = this.validateOutput.errors.map(err =>
              `${err.instancePath} ${err.message}`
            ).join(', ');
            console.warn(`Output validation failed: ${errors}`);
          }

          return output;
        }
      }

      // Method 2: Fuzzy name match
      const normalizedInputName = this._normalizeCompanyName(company_name);
      const normalizedExistingName = this._normalizeCompanyName(existing.company);

      const nameSimilarity = stringSimilarity.compareTwoStrings(
        normalizedInputName,
        normalizedExistingName
      );

      if (nameSimilarity >= this.NAME_SIMILARITY_THRESHOLD) {
        const daysSinceLast = Math.floor(
          (Date.now() - new Date(existing.created_at)) / (1000 * 60 * 60 * 24)
        );

        const latencyMs = Date.now() - startTime;

        const output = {
          is_duplicate: true,
          duplicate_confidence: nameSimilarity,
          existing_signal_id: existing.id,
          match_details: {
            name_similarity: parseFloat(nameSimilarity.toFixed(3)),
            domain_match: false,
            days_since_last: daysSinceLast
          },
          metadata: {
            signals_checked: existingSignals.length,
            lookback_days: lookback_days
          },
          timestamp: new Date().toISOString(),
          _meta: {
            latency_ms: latencyMs,
            tool_name: 'check_signal_duplication',
            tool_type: 'STRICT',
            policy_version: this.POLICY_VERSION
          }
        };

        // Validate output
        if (!this.validateOutput(output)) {
          const errors = this.validateOutput.errors.map(err =>
            `${err.instancePath} ${err.message}`
          ).join(', ');
          console.warn(`Output validation failed: ${errors}`);
        }

        return output;
      }
    }

    // No duplicate found
    const latencyMs = Date.now() - startTime;

    const output = {
      is_duplicate: false,
      duplicate_confidence: 0.0,
      existing_signal_id: null,
      match_details: null,
      metadata: {
        signals_checked: existingSignals.length,
        lookback_days: lookback_days
      },
      timestamp: new Date().toISOString(),
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'check_signal_duplication',
        tool_type: 'STRICT',
        policy_version: this.POLICY_VERSION
      }
    };

    // Validate output
    if (!this.validateOutput(output)) {
      const errors = this.validateOutput.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      console.warn(`Output validation failed: ${errors}`);
    }

    return output;
  }

  /**
   * Normalize company name for comparison
   * @private
   */
  _normalizeCompanyName(name) {
    return name
      .toLowerCase()
      .replace(/\b(llc|ltd|inc|dmcc|fz|fze|llc-fz|pjsc|psc|l\.l\.c|limited)\b/gi, '') // Remove legal entities
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Normalize domain for comparison
   * @private
   */
  _normalizeDomain(domain) {
    return domain
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .trim();
  }

  /**
   * Build no-duplicate response (fail open)
   * @private
   */
  _buildNoDuplicateResponse(lookbackDays, latencyMs) {
    return {
      is_duplicate: false,
      duplicate_confidence: 0.0,
      existing_signal_id: null,
      match_details: null,
      metadata: {
        signals_checked: 0,
        lookback_days: lookbackDays
      },
      timestamp: new Date().toISOString(),
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'check_signal_duplication',
        tool_type: 'STRICT',
        policy_version: this.POLICY_VERSION
      }
    };
  }
}

module.exports = SignalDeduplicationToolStandalone;
