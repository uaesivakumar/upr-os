/**
 * Voice Template Service
 * Sprint 31 - Task 2: Voice Template Database
 *
 * Provides CRUD operations for voice templates and generated messages
 */

const { Pool } = require('pg');

class VoiceTemplateService {
  constructor(pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  // ===================================================================
  // Voice Templates CRUD
  // ===================================================================

  /**
   * Create a new voice template
   * @param {object} template - Template data
   * @returns {object} Created template
   */
  async createTemplate(template) {
    const {
      template_type,
      category,
      tone,
      template_text,
      subject_template,
      variables,
      optional_variables,
      conditions,
      priority = 50,
      created_by = 'system'
    } = template;

    const query = `
      INSERT INTO voice_templates (
        template_type, category, tone, template_text, subject_template,
        variables, optional_variables, conditions, priority, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      template_type,
      category,
      tone,
      template_text,
      subject_template,
      JSON.stringify(variables || []),
      JSON.stringify(optional_variables || []),
      JSON.stringify(conditions || {}),
      priority,
      created_by
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get template by ID
   * @param {number} id - Template ID
   * @returns {object|null} Template or null
   */
  async getTemplate(id) {
    const query = 'SELECT * FROM voice_templates WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get templates by filters
   * @param {object} filters - Filter criteria
   * @returns {array} Matching templates
   */
  async getTemplates(filters = {}) {
    const {
      template_type,
      category,
      tone,
      active = true,
      min_priority = 0,
      limit = 100,
      offset = 0
    } = filters;

    let whereClause = ['active = $1'];
    let values = [active];
    let paramCount = 1;

    if (template_type) {
      paramCount++;
      whereClause.push(`template_type = $${paramCount}`);
      values.push(template_type);
    }

    if (category) {
      paramCount++;
      whereClause.push(`category = $${paramCount}`);
      values.push(category);
    }

    if (tone) {
      paramCount++;
      whereClause.push(`tone = $${paramCount}`);
      values.push(tone);
    }

    if (min_priority > 0) {
      paramCount++;
      whereClause.push(`priority >= $${paramCount}`);
      values.push(min_priority);
    }

    const query = `
      SELECT * FROM voice_templates
      WHERE ${whereClause.join(' AND ')}
      ORDER BY priority DESC, created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    values.push(limit, offset);

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Select best template based on context
   * @param {object} context - Context for template selection
   * @returns {object|null} Best matching template
   */
  async selectBestTemplate(context) {
    const {
      template_type,
      category = 'general',
      tone,
      quality_score,
      company_size,
      contact_tier
    } = context;

    // Get all matching templates
    const templates = await this.getTemplates({
      template_type,
      category,
      tone,
      active: true
    });

    if (templates.length === 0) {
      return null;
    }

    // Score each template based on conditions match
    const scoredTemplates = templates.map(template => {
      let score = template.priority || 0;

      if (template.conditions) {
        const conditions = template.conditions;

        // Check quality score condition
        if (conditions.min_quality_score && quality_score >= conditions.min_quality_score) {
          score += 20;
        }

        // Check company size condition
        if (conditions.company_size && conditions.company_size.includes(company_size)) {
          score += 15;
        }

        // Check contact tier condition
        if (conditions.contact_tier && conditions.contact_tier.includes(contact_tier)) {
          score += 15;
        }
      }

      return { ...template, match_score: score };
    });

    // Sort by match score and return best
    scoredTemplates.sort((a, b) => b.match_score - a.match_score);
    return scoredTemplates[0];
  }

  /**
   * Update template
   * @param {number} id - Template ID
   * @param {object} updates - Fields to update
   * @returns {object} Updated template
   */
  async updateTemplate(id, updates) {
    const allowedFields = [
      'template_text', 'subject_template', 'variables', 'optional_variables',
      'conditions', 'priority', 'active', 'success_rate'
    ];

    const setClause = [];
    const values = [];
    let paramCount = 0;

    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key)) {
        paramCount++;
        setClause.push(`${key} = $${paramCount}`);

        // Stringify JSON fields
        if (['variables', 'optional_variables', 'conditions'].includes(key)) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    });

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(id);
    const query = `
      UPDATE voice_templates
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete template (soft delete by setting active = false)
   * @param {number} id - Template ID
   * @returns {boolean} Success
   */
  async deleteTemplate(id) {
    const query = 'UPDATE voice_templates SET active = false WHERE id = $1';
    await this.pool.query(query, [id]);
    return true;
  }

  /**
   * Increment template usage count
   * @param {number} id - Template ID
   */
  async incrementUsage(id) {
    const query = 'UPDATE voice_templates SET usage_count = usage_count + 1 WHERE id = $1';
    await this.pool.query(query, [id]);
  }

  // ===================================================================
  // Generated Messages CRUD
  // ===================================================================

  /**
   * Create a generated message record
   * @param {object} message - Message data
   * @returns {object} Created message
   */
  async createGeneratedMessage(message) {
    const {
      message_id,
      message_type,
      company_id,
      company_name,
      contact_id,
      contact_name,
      subject,
      body,
      template_ids,
      variables_used,
      tone,
      quality_score,
      personalization_score,
      variable_coverage,
      context_data,
      created_by = 'system'
    } = message;

    const query = `
      INSERT INTO generated_messages (
        message_id, message_type, company_id, company_name,
        contact_id, contact_name, subject, body,
        template_ids, variables_used, tone,
        quality_score, personalization_score, variable_coverage,
        context_data, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const values = [
      message_id,
      message_type,
      company_id,
      company_name,
      contact_id,
      contact_name,
      subject,
      body,
      JSON.stringify(template_ids),
      JSON.stringify(variables_used),
      tone,
      quality_score,
      personalization_score,
      variable_coverage,
      JSON.stringify(context_data || {}),
      created_by
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get generated message by ID
   * @param {string} message_id - Message ID
   * @returns {object|null} Message or null
   */
  async getGeneratedMessage(message_id) {
    const query = 'SELECT * FROM generated_messages WHERE message_id = $1';
    const result = await this.pool.query(query, [message_id]);
    return result.rows[0] || null;
  }

  /**
   * Get messages by company or contact
   * @param {object} filters - Filter criteria
   * @returns {array} Matching messages
   */
  async getGeneratedMessages(filters = {}) {
    const {
      company_id,
      contact_id,
      message_type,
      sent,
      limit = 50,
      offset = 0
    } = filters;

    let whereClause = [];
    let values = [];
    let paramCount = 0;

    if (company_id) {
      paramCount++;
      whereClause.push(`company_id = $${paramCount}`);
      values.push(company_id);
    }

    if (contact_id) {
      paramCount++;
      whereClause.push(`contact_id = $${paramCount}`);
      values.push(contact_id);
    }

    if (message_type) {
      paramCount++;
      whereClause.push(`message_type = $${paramCount}`);
      values.push(message_type);
    }

    if (typeof sent === 'boolean') {
      paramCount++;
      whereClause.push(`sent = $${paramCount}`);
      values.push(sent);
    }

    const where = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    const query = `
      SELECT * FROM generated_messages
      ${where}
      ORDER BY created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    values.push(limit, offset);

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Mark message as sent
   * @param {string} message_id - Message ID
   * @param {Date} sent_at - Sent timestamp
   */
  async markMessageSent(message_id, sent_at = new Date()) {
    const query = `
      UPDATE generated_messages
      SET sent = true, sent_at = $1
      WHERE message_id = $2
    `;
    await this.pool.query(query, [sent_at, message_id]);
  }

  /**
   * Track message engagement
   * @param {string} message_id - Message ID
   * @param {string} event_type - opened, clicked, responded
   * @param {Date} event_at - Event timestamp
   */
  async trackEngagement(message_id, event_type, event_at = new Date()) {
    const validEvents = ['opened', 'clicked', 'responded'];
    if (!validEvents.includes(event_type)) {
      throw new Error(`Invalid event type: ${event_type}`);
    }

    const query = `
      UPDATE generated_messages
      SET ${event_type} = true, ${event_type}_at = $1
      WHERE message_id = $2
    `;
    await this.pool.query(query, [event_at, message_id]);
  }

  // ===================================================================
  // Analytics & Performance
  // ===================================================================

  /**
   * Get template performance metrics
   * @param {number} template_id - Template ID
   * @returns {object} Performance metrics
   */
  async getTemplatePerformance(template_id) {
    const query = `
      SELECT
        COUNT(*) as total_generated,
        COUNT(*) FILTER (WHERE sent = true) as total_sent,
        COUNT(*) FILTER (WHERE opened = true) as total_opened,
        COUNT(*) FILTER (WHERE clicked = true) as total_clicked,
        COUNT(*) FILTER (WHERE responded = true) as total_responded,
        AVG(quality_score) as avg_quality_score,
        AVG(personalization_score) as avg_personalization_score
      FROM generated_messages
      WHERE template_ids @> $1::jsonb
    `;

    const templateIdJson = JSON.stringify([{ id: template_id }]);
    const result = await this.pool.query(query, [templateIdJson]);

    const metrics = result.rows[0];

    // Calculate rates
    const sent = parseInt(metrics.total_sent) || 0;
    const opened = parseInt(metrics.total_opened) || 0;
    const clicked = parseInt(metrics.total_clicked) || 0;
    const responded = parseInt(metrics.total_responded) || 0;

    return {
      ...metrics,
      open_rate: sent > 0 ? ((opened / sent) * 100).toFixed(2) : 0,
      click_rate: sent > 0 ? ((clicked / sent) * 100).toFixed(2) : 0,
      response_rate: sent > 0 ? ((responded / sent) * 100).toFixed(2) : 0
    };
  }

  /**
   * Get overall system statistics
   * @returns {object} System stats
   */
  async getSystemStats() {
    const templatesQuery = `
      SELECT
        COUNT(*) as total_templates,
        COUNT(*) FILTER (WHERE active = true) as active_templates,
        COUNT(DISTINCT template_type) as template_types,
        COUNT(DISTINCT tone) as tone_variants
      FROM voice_templates
    `;

    const messagesQuery = `
      SELECT
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE sent = true) as sent_messages,
        AVG(quality_score) as avg_quality,
        AVG(personalization_score) as avg_personalization
      FROM generated_messages
      WHERE created_at > NOW() - INTERVAL '30 days'
    `;

    const [templatesResult, messagesResult] = await Promise.all([
      this.pool.query(templatesQuery),
      this.pool.query(messagesQuery)
    ]);

    return {
      templates: templatesResult.rows[0],
      messages: messagesResult.rows[0]
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = { VoiceTemplateService };
