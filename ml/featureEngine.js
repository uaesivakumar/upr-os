// ml/featureEngine.js
// Feature Engineering Pipeline - Automatically extracts and computes features for ML models

import { pool } from '../utils/db.js';

/**
 * Feature Engineering Pipeline
 *
 * Automatically extracts and computes features for ML models
 */
class FeatureEngine {

  /**
   * Compute features for a company
   */
  async computeCompanyFeatures(companyId) {
    const features = {};

    // Basic features
    const company = await pool.query(
      'SELECT * FROM companies WHERE id = $1',
      [companyId]
    );

    if (company.rows.length === 0) {
      throw new Error(`Company ${companyId} not found`);
    }

    const c = company.rows[0];

    // Categorical features
    features.industry = c.industry || 'unknown';
    features.size_bucket = c.size_bucket || 'unknown';
    features.country = c.country || 'unknown';
    features.uae_presence = c.uae_presence ? 1 : 0;

    // Temporal features
    const accountAge = c.created_at ?
      (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24) : 0;
    features.account_age_days = accountAge;
    features.account_age_bucket = this.bucketAge(accountAge);

    // Activity features (last 90 days)
    const activity = await pool.query(`
      SELECT
        COUNT(DISTINCT DATE(created_at)) as active_days,
        COUNT(*) as total_interactions
      FROM signals
      WHERE company_id = $1 AND created_at > NOW() - INTERVAL '90 days'
    `, [companyId]);

    features.active_days_90d = parseInt(activity.rows[0]?.active_days) || 0;
    features.total_interactions_90d = parseInt(activity.rows[0]?.total_interactions) || 0;

    // Signal features
    const signals = await pool.query(`
      SELECT
        signal_type,
        COUNT(*) as count
      FROM signals
      WHERE company_id = $1 AND published_at > NOW() - INTERVAL '90 days'
      GROUP BY signal_type
    `, [companyId]);

    features.hiring_signals_90d = 0;
    features.funding_signals_90d = 0;
    features.news_signals_90d = 0;

    signals.rows.forEach(s => {
      if (s.signal_type === 'hiring') features.hiring_signals_90d = parseInt(s.count);
      if (s.signal_type === 'funding') features.funding_signals_90d = parseInt(s.count);
      if (s.signal_type === 'news') features.news_signals_90d = parseInt(s.count);
    });

    // Engagement features (email history)
    const emailHistory = await pool.query(`
      SELECT
        COUNT(*) as emails_sent,
        AVG(CASE WHEN opened THEN 1 ELSE 0 END) as open_rate,
        AVG(CASE WHEN replied THEN 1 ELSE 0 END) as reply_rate,
        AVG(CASE WHEN converted THEN 1 ELSE 0 END) as conversion_rate,
        MAX(sent_at) as last_contact_at
      FROM email_outcomes
      WHERE company_id = $1
    `, [companyId]);

    const eh = emailHistory.rows[0];
    features.emails_sent_total = parseInt(eh?.emails_sent) || 0;
    features.open_rate = parseFloat(eh?.open_rate) || 0;
    features.reply_rate = parseFloat(eh?.reply_rate) || 0;
    features.conversion_rate = parseFloat(eh?.conversion_rate) || 0;

    const daysSinceContact = eh?.last_contact_at ?
      (Date.now() - new Date(eh.last_contact_at).getTime()) / (1000 * 60 * 60 * 24) : 999;
    features.days_since_last_contact = daysSinceContact;
    features.contact_recency_bucket = this.bucketRecency(daysSinceContact);

    // Knowledge base features
    const kbStats = await pool.query(`
      SELECT
        COUNT(*) as chunks_count,
        COUNT(DISTINCT content_type) as content_types_count,
        MAX(captured_at) as latest_capture
      FROM kb_chunks
      WHERE company_id = $1
    `, [companyId]);

    features.kb_chunks = parseInt(kbStats.rows[0]?.chunks_count) || 0;
    features.kb_content_diversity = parseInt(kbStats.rows[0]?.content_types_count) || 0;

    // Time-based features (current time)
    const now = new Date();
    features.day_of_week = now.getDay(); // 0-6
    features.hour_of_day = now.getHours(); // 0-23
    features.is_weekend = now.getDay() === 0 || now.getDay() === 6 ? 1 : 0;
    features.is_business_hours = (now.getHours() >= 9 && now.getHours() < 17) ? 1 : 0;

    return features;
  }

  /**
   * Compute features for a person
   */
  async computePersonFeatures(personId) {
    const features = {};

    const person = await pool.query(
      'SELECT * FROM people WHERE id = $1',
      [personId]
    );

    if (person.rows.length === 0) {
      throw new Error(`Person ${personId} not found`);
    }

    const p = person.rows[0];

    // Basic features
    features.title = p.title || 'unknown';
    features.function = p.function || 'unknown'; // HR, Finance, Admin, Leadership
    features.has_linkedin = p.linkedin_url ? 1 : 0;
    features.location = p.location || 'unknown';

    // Seniority detection
    features.seniority_level = this.detectSeniority(p.title);

    // Email engagement history for this person
    const personHistory = await pool.query(`
      SELECT
        COUNT(*) as emails_received,
        AVG(CASE WHEN opened THEN 1 ELSE 0 END) as open_rate,
        AVG(CASE WHEN replied THEN 1 ELSE 0 END) as reply_rate,
        MAX(sent_at) as last_email_at
      FROM email_outcomes
      WHERE person_id = $1
    `, [personId]);

    const ph = personHistory.rows[0];
    features.person_emails_received = parseInt(ph?.emails_received) || 0;
    features.person_open_rate = parseFloat(ph?.open_rate) || 0;
    features.person_reply_rate = parseFloat(ph?.reply_rate) || 0;

    return features;
  }

  /**
   * Compute features for an email draft (before sending)
   */
  async computeEmailFeatures(emailContent) {
    const features = {};

    const { subject, body } = emailContent;

    if (!subject || !body) {
      return features;
    }

    // Text statistics
    features.subject_length = subject.length;
    features.subject_word_count = subject.split(/\s+/).length;
    features.body_length = body.length;
    features.body_word_count = body.split(/\s+/).length;
    features.body_paragraph_count = body.split(/\n\n/).length;

    // Subject line features
    features.subject_has_question = subject.includes('?') ? 1 : 0;
    features.subject_has_number = /\d/.test(subject) ? 1 : 0;
    features.subject_has_company_name = /{company_name}/.test(subject) ? 1 : 0;
    features.subject_personalization_level = this.countPersonalizationTokens(subject);

    // Body features
    features.has_bullet_points = /[•\-\*]\s/.test(body) ? 1 : 0;
    features.bullet_point_count = (body.match(/[•\-\*]\s/g) || []).length;
    features.has_bold_text = /\*\*/.test(body) ? 1 : 0;
    features.paragraph_avg_length = this.avgParagraphLength(body);
    features.personalization_level = this.countPersonalizationTokens(body);

    // Linguistic features
    features.readability_score = this.computeReadability(body);
    features.sentiment_score = this.computeSentiment(body);

    // Spam indicators
    features.spam_words_count = this.countSpamWords(subject + ' ' + body);
    features.exclamation_count = (subject + body).split('!').length - 1;
    features.caps_ratio = this.capsRatio(subject + ' ' + body);

    // Call-to-action features
    features.has_cta = this.detectCTA(body) ? 1 : 0;
    features.cta_friction_level = this.assessCTAFriction(body);

    // URL features
    const urls = (subject + ' ' + body).match(/https?:\/\/[^\s]+/g) || [];
    features.url_count = urls.length;
    features.has_tracking_url = urls.some(url => url.includes('track') || url.includes('utm')) ? 1 : 0;

    return features;
  }

  /**
   * Save features to feature store
   */
  async saveFeatures(entityType, entityId, features, version = 'v1') {
    await pool.query(`
      INSERT INTO feature_store (entity_type, entity_id, features, feature_version)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (entity_type, entity_id, feature_version)
      DO UPDATE SET
        features = EXCLUDED.features,
        computed_at = NOW()
    `, [entityType, entityId, JSON.stringify(features), version]);
  }

  /**
   * Get features from store
   */
  async getFeatures(entityType, entityId, version = 'v1') {
    const result = await pool.query(`
      SELECT features, computed_at
      FROM feature_store
      WHERE entity_type = $1 AND entity_id = $2 AND feature_version = $3
    `, [entityType, entityId, version]);

    if (result.rows.length === 0) {
      // Compute on-demand
      let features;
      if (entityType === 'company') {
        features = await this.computeCompanyFeatures(entityId);
        await this.saveFeatures(entityType, entityId, features, version);
      } else if (entityType === 'person') {
        features = await this.computePersonFeatures(entityId);
        await this.saveFeatures(entityType, entityId, features, version);
      } else {
        return {};
      }
      return features;
    }

    return result.rows[0].features;
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  bucketAge(days) {
    if (days < 30) return 'new';
    if (days < 90) return 'recent';
    if (days < 365) return 'established';
    return 'mature';
  }

  bucketRecency(days) {
    if (days < 7) return 'very_recent';
    if (days < 30) return 'recent';
    if (days < 90) return 'moderate';
    return 'old';
  }

  detectSeniority(title) {
    if (!title) return 'unknown';
    const lower = title.toLowerCase();

    if (lower.includes('ceo') || lower.includes('president') || lower.includes('founder')) {
      return 'c_level';
    }
    if (lower.includes('cfo') || lower.includes('cto') || lower.includes('coo') || lower.includes('cmo')) {
      return 'c_level';
    }
    if (lower.includes('vp') || lower.includes('vice president') || lower.includes('head of')) {
      return 'vp';
    }
    if (lower.includes('director')) {
      return 'director';
    }
    if (lower.includes('manager') || lower.includes('lead')) {
      return 'manager';
    }
    if (lower.includes('senior')) {
      return 'senior';
    }
    if (lower.includes('junior') || lower.includes('associate')) {
      return 'junior';
    }

    return 'mid';
  }

  countPersonalizationTokens(text) {
    const tokens = text.match(/{[^}]+}/g) || [];
    return tokens.length;
  }

  avgParagraphLength(text) {
    const paragraphs = text.split(/\n\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length === 0) return 0;
    const totalLength = paragraphs.reduce((sum, p) => sum + p.length, 0);
    return Math.round(totalLength / paragraphs.length);
  }

  computeReadability(text) {
    // Simplified Flesch Reading Ease
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    const syllables = this.countSyllables(text);

    if (sentences === 0 || words === 0) return 0;

    const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  countSyllables(text) {
    // Rough estimate
    return text.split(/\s+/).reduce((count, word) => {
      return count + (word.match(/[aeiou]{1,2}/gi)?.length || 1);
    }, 0);
  }

  computeSentiment(text) {
    // Simple heuristic-based sentiment
    const positiveWords = ['great', 'excellent', 'opportunity', 'benefit', 'success', 'growth', 'innovative', 'excited', 'amazing', 'fantastic'];
    const negativeWords = ['problem', 'issue', 'difficult', 'challenge', 'concern', 'worry', 'fail', 'poor'];

    const lower = text.toLowerCase();
    let score = 0;

    positiveWords.forEach(w => {
      if (lower.includes(w)) score += 1;
    });

    negativeWords.forEach(w => {
      if (lower.includes(w)) score -= 1;
    });

    const wordCount = text.split(/\s+/).length;
    return wordCount > 0 ? score / (wordCount / 100) : 0; // Normalize by length
  }

  countSpamWords(text) {
    const spamWords = ['free', 'act now', 'limited time', 'guarantee', 'urgent', 'click here', 'buy now', 'call now'];
    const lower = text.toLowerCase();

    return spamWords.reduce((count, word) => {
      return count + (lower.includes(word) ? 1 : 0);
    }, 0);
  }

  capsRatio(text) {
    const caps = (text.match(/[A-Z]/g) || []).length;
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    return letters > 0 ? caps / letters : 0;
  }

  detectCTA(text) {
    const ctaPatterns = [
      /apply now/i,
      /get started/i,
      /schedule/i,
      /book/i,
      /register/i,
      /sign up/i,
      /learn more/i,
      /contact us/i,
      /reply/i,
      /call/i
    ];

    return ctaPatterns.some(pattern => pattern.test(text));
  }

  assessCTAFriction(text) {
    const lower = text.toLowerCase();

    // High friction
    if (lower.includes('schedule') || lower.includes('meeting') || lower.includes('demo')) {
      return 'high';
    }

    // Medium friction
    if (lower.includes('apply') || lower.includes('register') || lower.includes('sign up')) {
      return 'medium';
    }

    // Low friction
    if (lower.includes('learn more') || lower.includes('check') || lower.includes('view') || lower.includes('reply')) {
      return 'low';
    }

    return 'none';
  }
}

export default new FeatureEngine();
