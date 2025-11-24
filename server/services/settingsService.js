/**
 * Settings Service
 * Sprint 67: OS Settings Unification Layer
 *
 * Centralized service for all OS configuration management
 */

import { pool } from '../../utils/db.js';
import * as Sentry from '@sentry/node';

// In-memory cache for settings
const settingsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Settings Service Class
 */
export class SettingsService {
  constructor(tenantId) {
    this.tenantId = tenantId || '00000000-0000-0000-0000-000000000001';
  }

  // ==========================================
  // OS Settings
  // ==========================================

  /**
   * Get a single OS setting
   */
  async getSetting(category, key) {
    const cacheKey = `${this.tenantId}:${category}:${key}`;
    const cached = this.getFromCache(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const result = await pool.query(
        `SELECT value, value_type FROM os_settings
         WHERE tenant_id = $1 AND category = $2 AND key = $3`,
        [this.tenantId, category, key]
      );

      if (result.rows.length === 0) return null;

      const { value, value_type } = result.rows[0];
      const parsedValue = this.parseValue(value, value_type);

      this.setCache(cacheKey, parsedValue);
      return parsedValue;

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error getting setting:', error);
      return null;
    }
  }

  /**
   * Set a single OS setting
   */
  async setSetting(category, key, value, options = {}) {
    const { valueType = 'string', description, updatedBy } = options;

    try {
      await pool.query(
        `INSERT INTO os_settings (tenant_id, category, key, value, value_type, description, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (tenant_id, category, key)
         DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
         WHERE NOT os_settings.is_readonly`,
        [this.tenantId, category, key, JSON.stringify(value), valueType, description, updatedBy]
      );

      // Clear cache
      this.clearCache(`${this.tenantId}:${category}:${key}`);
      return true;

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error setting value:', error);
      return false;
    }
  }

  /**
   * Get all settings for a category
   */
  async getCategory(category) {
    try {
      const result = await pool.query(
        `SELECT key, value, value_type, description, is_readonly
         FROM os_settings
         WHERE tenant_id = $1 AND category = $2
         ORDER BY key`,
        [this.tenantId, category]
      );

      const settings = {};
      for (const row of result.rows) {
        settings[row.key] = {
          value: this.parseValue(row.value, row.value_type),
          description: row.description,
          readonly: row.is_readonly
        };
      }

      return settings;

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error getting category:', error);
      return {};
    }
  }

  /**
   * Get all settings
   */
  async getAllSettings() {
    try {
      const result = await pool.query(
        `SELECT category, key, value, value_type, description, is_readonly, is_system
         FROM os_settings
         WHERE tenant_id = $1
         ORDER BY category, key`,
        [this.tenantId]
      );

      const settings = {};
      for (const row of result.rows) {
        if (!settings[row.category]) {
          settings[row.category] = {};
        }
        settings[row.category][row.key] = {
          value: this.parseValue(row.value, row.value_type),
          description: row.description,
          readonly: row.is_readonly,
          system: row.is_system
        };
      }

      return settings;

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error getting all settings:', error);
      return {};
    }
  }

  // ==========================================
  // Scoring Settings
  // ==========================================

  /**
   * Get scoring settings for a profile
   */
  async getScoringProfile(profileName = 'default') {
    const cacheKey = `${this.tenantId}:scoring:${profileName}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const result = await pool.query(
        `SELECT * FROM scoring_settings
         WHERE tenant_id = $1 AND profile_name = $2 AND is_active = true`,
        [this.tenantId, profileName]
      );

      if (result.rows.length === 0) {
        // Return default profile if not found
        return this.getDefaultScoringProfile(profileName);
      }

      const row = result.rows[0];
      const profile = {
        name: row.profile_name,
        weights: {
          q_score: {
            domain: parseFloat(row.q_score_domain_weight),
            linkedin: parseFloat(row.q_score_linkedin_weight),
            signals: parseFloat(row.q_score_signals_weight),
            uae: parseFloat(row.q_score_uae_weight),
            recency: parseFloat(row.q_score_recency_weight)
          },
          composite: {
            q_score: parseFloat(row.composite_q_weight),
            t_score: parseFloat(row.composite_t_weight),
            l_score: parseFloat(row.composite_l_weight),
            e_score: parseFloat(row.composite_e_weight)
          }
        },
        thresholds: {
          hot: row.tier_hot_threshold,
          warm: row.tier_warm_threshold,
          cold: row.tier_cold_threshold
        }
      };

      this.setCache(cacheKey, profile);
      return profile;

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error getting scoring profile:', error);
      return this.getDefaultScoringProfile(profileName);
    }
  }

  /**
   * Update scoring profile
   */
  async updateScoringProfile(profileName, updates) {
    try {
      const setClauses = [];
      const params = [this.tenantId, profileName];
      let paramIndex = 3;

      for (const [key, value] of Object.entries(updates)) {
        setClauses.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }

      if (setClauses.length === 0) return false;

      await pool.query(
        `UPDATE scoring_settings
         SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE tenant_id = $1 AND profile_name = $2`,
        params
      );

      this.clearCache(`${this.tenantId}:scoring:${profileName}`);
      return true;

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error updating scoring profile:', error);
      return false;
    }
  }

  // ==========================================
  // Discovery Settings
  // ==========================================

  /**
   * Get discovery settings
   */
  async getDiscoverySettings() {
    const cacheKey = `${this.tenantId}:discovery`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const result = await pool.query(
        `SELECT * FROM discovery_settings WHERE tenant_id = $1 AND is_active = true`,
        [this.tenantId]
      );

      if (result.rows.length === 0) {
        return this.getDefaultDiscoverySettings();
      }

      const row = result.rows[0];
      const settings = {
        sources: {
          news: { priority: row.source_news_priority, enabled: row.source_news_enabled },
          linkedin: { priority: row.source_linkedin_priority, enabled: row.source_linkedin_enabled },
          glassdoor: { priority: row.source_glassdoor_priority, enabled: row.source_glassdoor_enabled },
          g2: { priority: row.source_g2_priority, enabled: row.source_g2_enabled },
          sec: { priority: row.source_sec_priority, enabled: row.source_sec_enabled }
        },
        quality: {
          minQualityScore: parseFloat(row.min_quality_score),
          minConfidenceScore: parseFloat(row.min_confidence_score)
        },
        signals: {
          recencyDays: row.signal_recency_days,
          maxPerSource: row.signal_max_per_source,
          dedupThreshold: parseFloat(row.signal_dedup_threshold)
        },
        cache: {
          ttlMinutes: row.cache_ttl_minutes
        }
      };

      this.setCache(cacheKey, settings);
      return settings;

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error getting discovery settings:', error);
      return this.getDefaultDiscoverySettings();
    }
  }

  // ==========================================
  // Outreach Settings
  // ==========================================

  /**
   * Get outreach settings
   */
  async getOutreachSettings() {
    const cacheKey = `${this.tenantId}:outreach`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const result = await pool.query(
        `SELECT * FROM outreach_settings WHERE tenant_id = $1 AND is_active = true`,
        [this.tenantId]
      );

      if (result.rows.length === 0) {
        return this.getDefaultOutreachSettings();
      }

      const row = result.rows[0];
      const settings = {
        defaults: {
          channel: row.default_channel,
          tone: row.default_tone,
          personalizationLevel: row.personalization_level
        },
        email: {
          fromName: row.email_from_name,
          signature: row.email_signature,
          maxLength: row.email_max_length
        },
        linkedin: {
          connectionMessageMax: row.linkedin_connection_message_max,
          inmailMax: row.linkedin_inmail_max
        },
        limits: {
          dailyLimit: row.daily_outreach_limit,
          hourlyLimit: row.hourly_outreach_limit
        },
        features: {
          includeCompanyResearch: row.include_company_research,
          includeSignalContext: row.include_signal_context
        }
      };

      this.setCache(cacheKey, settings);
      return settings;

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error getting outreach settings:', error);
      return this.getDefaultOutreachSettings();
    }
  }

  // ==========================================
  // Vertical Settings
  // ==========================================

  /**
   * Get all vertical settings
   */
  async getVerticals() {
    try {
      const result = await pool.query(
        `SELECT * FROM vertical_settings
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY sort_order, display_name`,
        [this.tenantId]
      );

      return result.rows.map(row => ({
        id: row.vertical_id,
        name: row.display_name,
        description: row.description,
        icon: row.icon,
        colors: {
          primary: row.color_primary,
          secondary: row.color_secondary
        },
        scoring: {
          profile: row.scoring_profile
        },
        discovery: {
          preferredSources: row.preferred_sources,
          industryKeywords: row.industry_keywords
        },
        outreach: {
          profile: row.outreach_profile,
          tone: row.outreach_tone
        },
        features: {
          autoDiscovery: row.enable_auto_discovery,
          autoEnrichment: row.enable_auto_enrichment,
          autoScoring: row.enable_auto_scoring
        }
      }));

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error getting verticals:', error);
      return [];
    }
  }

  /**
   * Get single vertical settings
   */
  async getVertical(verticalId) {
    const verticals = await this.getVerticals();
    return verticals.find(v => v.id === verticalId) || null;
  }

  // ==========================================
  // Persona Settings
  // ==========================================

  /**
   * Get all persona settings
   */
  async getPersonas() {
    try {
      const result = await pool.query(
        `SELECT * FROM persona_settings
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY sort_order, display_name`,
        [this.tenantId]
      );

      return result.rows.map(row => ({
        id: row.persona_id,
        name: row.display_name,
        description: row.description,
        targeting: {
          titles: row.target_titles,
          departments: row.target_departments
        },
        outreach: {
          tone: row.tone,
          formalityLevel: row.formality_level,
          painPoints: row.key_pain_points,
          valueProps: row.value_propositions
        },
        templates: {
          subjects: row.email_subject_templates,
          openings: row.email_opening_templates,
          ctas: row.email_cta_templates
        },
        scoreBoost: row.score_boost
      }));

    } catch (error) {
      Sentry.captureException(error);
      console.error('[SettingsService] Error getting personas:', error);
      return [];
    }
  }

  // ==========================================
  // Cache Helpers
  // ==========================================

  getFromCache(key) {
    const cached = settingsCache.get(key);
    if (!cached) return undefined;

    if (Date.now() > cached.expiresAt) {
      settingsCache.delete(key);
      return undefined;
    }

    return cached.value;
  }

  setCache(key, value) {
    settingsCache.set(key, {
      value,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
  }

  clearCache(key) {
    if (key) {
      settingsCache.delete(key);
    } else {
      // Clear all cache for this tenant
      for (const k of settingsCache.keys()) {
        if (k.startsWith(this.tenantId)) {
          settingsCache.delete(k);
        }
      }
    }
  }

  // ==========================================
  // Default Values
  // ==========================================

  getDefaultScoringProfile(profileName) {
    const defaults = {
      default: { q: 0.30, t: 0.25, l: 0.25, e: 0.20 },
      banking_employee: { q: 0.25, t: 0.35, l: 0.20, e: 0.20 },
      banking_corporate: { q: 0.35, t: 0.20, l: 0.25, e: 0.20 },
      insurance_individual: { q: 0.20, t: 0.35, l: 0.30, e: 0.15 },
      recruitment_hiring: { q: 0.20, t: 0.40, l: 0.20, e: 0.20 },
      saas_b2b: { q: 0.30, t: 0.25, l: 0.30, e: 0.15 }
    };

    const weights = defaults[profileName] || defaults.default;

    return {
      name: profileName,
      weights: {
        q_score: { domain: 0.25, linkedin: 0.20, signals: 0.20, uae: 0.25, recency: 0.10 },
        composite: { q_score: weights.q, t_score: weights.t, l_score: weights.l, e_score: weights.e }
      },
      thresholds: { hot: 80, warm: 60, cold: 40 }
    };
  }

  getDefaultDiscoverySettings() {
    return {
      sources: {
        news: { priority: 1, enabled: true },
        linkedin: { priority: 2, enabled: true },
        glassdoor: { priority: 3, enabled: true },
        g2: { priority: 4, enabled: false },
        sec: { priority: 5, enabled: false }
      },
      quality: { minQualityScore: 0.60, minConfidenceScore: 0.50 },
      signals: { recencyDays: 30, maxPerSource: 50, dedupThreshold: 0.80 },
      cache: { ttlMinutes: 15 }
    };
  }

  getDefaultOutreachSettings() {
    return {
      defaults: { channel: 'email', tone: 'friendly', personalizationLevel: 'medium' },
      email: { fromName: null, signature: null, maxLength: 500 },
      linkedin: { connectionMessageMax: 300, inmailMax: 1900 },
      limits: { dailyLimit: 100, hourlyLimit: 20 },
      features: { includeCompanyResearch: true, includeSignalContext: true }
    };
  }

  // ==========================================
  // Value Parsing
  // ==========================================

  parseValue(value, valueType) {
    if (value === null || value === undefined) return null;

    const parsed = typeof value === 'string' ? JSON.parse(value) : value;

    switch (valueType) {
      case 'number':
        return Number(parsed);
      case 'boolean':
        return Boolean(parsed);
      case 'json':
        return parsed;
      case 'string':
      default:
        return String(parsed);
    }
  }
}

/**
 * Create settings service for a tenant
 */
export function createSettingsService(tenantId) {
  return new SettingsService(tenantId);
}

/**
 * Express middleware to attach settings service to request
 */
export function attachSettingsService(req, res, next) {
  const tenantId = req.tenantId || req.user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  req.settings = new SettingsService(tenantId);
  next();
}

export default SettingsService;
