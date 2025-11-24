// server/utils/promptManager.js
// Manages prompt versions with A/B testing support and caching
import pool from '../db.js';

class PromptManager {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get a prompt by name with optional A/B testing
   * @param {string} name - Prompt name (e.g., 'company_extraction')
   * @param {object} options - { abTestEnabled: boolean, variables: object }
   * @returns {Promise<string>} Rendered prompt
   */
  async getPrompt(name, options = {}) {
    const { abTestEnabled = false, variables = {} } = options;

    // Check cache first
    const cacheKey = `${name}:${abTestEnabled}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return this.renderTemplate(cached.prompt, variables);
    }

    // Query database - if A/B testing enabled, randomly select from active versions
    const query = abTestEnabled
      ? `
        SELECT template AS prompt_text, version
        FROM prompt_versions
        WHERE name = $1 AND active = true
        ORDER BY RANDOM()
        LIMIT 1
      `
      : `
        SELECT template AS prompt_text, version
        FROM prompt_versions
        WHERE name = $1 AND active = true
        ORDER BY created_at DESC
        LIMIT 1
      `;

    const result = await pool.query(query, [name]);

    if (result.rows.length === 0) {
      throw new Error(`Prompt not found: ${name}`);
    }

    const { prompt_text, version } = result.rows[0];

    // Cache the prompt
    this.cache.set(cacheKey, {
      prompt: prompt_text,
      version,
      timestamp: Date.now()
    });

    return this.renderTemplate(prompt_text, variables);
  }

  /**
   * Render template variables in prompt
   * Replaces {{variable}} placeholders with actual values
   * @param {string} template - Prompt template with {{variables}}
   * @param {object} variables - Key-value pairs to replace
   * @returns {string} Rendered prompt
   */
  renderTemplate(template, variables) {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(regex, String(value));
    }
    return rendered;
  }

  /**
   * Get all active prompt versions for a name
   * @param {string} name - Prompt name
   * @returns {Promise<Array>} Array of prompt versions
   */
  async getVersions(name) {
    const result = await pool.query(
      `SELECT version, template AS prompt_text,
              performance_metrics->>'precision' AS precision,
              performance_metrics->>'recall' AS recall,
              created_at
       FROM prompt_versions
       WHERE name = $1 AND active = true
       ORDER BY created_at DESC`,
      [name]
    );
    return result.rows;
  }

  /**
   * Deactivate a prompt version
   * @param {string} name - Prompt name
   * @param {string} version - Version to deactivate
   */
  async deactivateVersion(name, version) {
    await pool.query(
      `UPDATE prompt_versions
       SET active = false
       WHERE name = $1 AND version = $2`,
      [name, version]
    );

    // Clear cache to force reload
    this.cache.delete(`${name}:true`);
    this.cache.delete(`${name}:false`);
  }

  /**
   * Create a new prompt version
   * @param {object} params - { name, version, template, golden_set }
   */
  async createVersion(params) {
    const { name, version, template, golden_set = [] } = params;

    await pool.query(
      `INSERT INTO prompt_versions (name, version, template, golden_set, active)
       VALUES ($1, $2, $3, $4, true)`,
      [name, version, template, JSON.stringify(golden_set)]
    );

    // Clear cache to force reload
    this.cache.delete(`${name}:true`);
    this.cache.delete(`${name}:false`);
  }

  /**
   * Update prompt performance metrics (precision/recall)
   * Called after golden set testing
   * @param {string} name - Prompt name
   * @param {string} version - Version to update
   * @param {object} metrics - { precision, recall }
   */
  async updateMetrics(name, version, metrics) {
    const { precision, recall } = metrics;
    await pool.query(
      `UPDATE prompt_versions
       SET performance_metrics = jsonb_set(
         jsonb_set(performance_metrics, '{precision}', to_jsonb($1::numeric)),
         '{recall}', to_jsonb($2::numeric)
       )
       WHERE name = $3 AND version = $4`,
      [precision, recall, name, version]
    );
  }

  /**
   * Clear the prompt cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export singleton instance
export default new PromptManager();
