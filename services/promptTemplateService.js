// services/promptTemplateService.js
/**
 * Prompt Template Service
 * S74: Loads prompt templates from database with caching
 *
 * Replaces hardcoded prompts in:
 * - companyPreview.js (company extraction)
 * - intelligenceSummarizer.js (intelligence summary, insight extraction)
 * - learningAgent.js (email pattern insight)
 */

const { pool } = require('../utils/db');

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================
const promptCache = {
  templates: new Map(),
  loadedAt: null,
  ttlMs: 5 * 60 * 1000 // 5 minutes
};

// ============================================================================
// DEFAULT TEMPLATES (fallback if DB unavailable)
// ============================================================================
const DEFAULT_TEMPLATES = {
  'company-extraction-serp': {
    slug: 'company-extraction-serp',
    system_prompt: 'You are a data extraction system. Extract structured company information from search results with 100% accuracy. Return ONLY valid JSON with no additional text or formatting.',
    user_prompt_template: `Extract company information from these search results for: {{company_name}}

Search Results:
{{serp_results}}

Return JSON with these fields:
- name: Official company name
- domain: Primary website domain (without www or protocol)
- website_url: Full website URL
- industry: Primary industry
- sector: Business sector
- employee_range: Approximate employee count range (e.g., "51-200")
- employee_count: Specific employee count if found
- hq_location: Headquarters location
- description: Brief company description

Ensure ALL URLs are complete and valid. Do NOT include LinkedIn-related content in description.`,
    preferred_model: 'gpt-4o-mini',
    temperature: 0.1,
    output_format: 'json'
  },

  'intelligence-summary': {
    slug: 'intelligence-summary',
    user_prompt_template: `You are an expert business intelligence analyst. Analyze this company intelligence and create a comprehensive summary.

COMPANY: {{company_name}}
Industry: {{industry}}
Size: {{size}}
Location: {{location}}

RECENT INTELLIGENCE (Last 90 days):

News & Updates:
{{news_items}}

Other Knowledge:
{{other_knowledge}}

Signals:
{{signals}}

Key People:
{{key_people}}

Create a structured summary with these sections:

1. COMPANY OVERVIEW (2-3 sentences)
2. RECENT DEVELOPMENTS (3-5 bullet points of key events)
3. HIRING & GROWTH SIGNALS (what their hiring patterns indicate)
4. FINANCIAL HEALTH (if any funding/financial signals present)
5. MARKET POSITIONING (their competitive stance)
6. TECHNOLOGY STACK (technologies mentioned, if any)

Be specific, cite dates when available, and focus on actionable intelligence for B2B sales.
If information is limited, acknowledge gaps and provide what's available.`,
    preferred_model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    max_tokens: 3000,
    output_format: 'markdown'
  },

  'insight-extraction': {
    slug: 'insight-extraction',
    user_prompt_template: `From this company intelligence summary, extract 5 key insights that would be valuable for B2B outreach.

Summary:
{{summary}}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "insights": [
    {
      "type": "growth",
      "insight": "The insight statement",
      "relevance": "Why this matters for sales/outreach",
      "confidence": 0.8
    }
  ]
}

Valid types: "growth", "hiring", "funding", "technology", "market"
Confidence should be between 0.0 and 1.0`,
    preferred_model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    max_tokens: 2000,
    output_format: 'json'
  },

  'email-pattern-insight': {
    slug: 'email-pattern-insight',
    system_prompt: 'You are an expert sales communication analyst. You will be given a set of successful emails that received replies. Your task is to identify a common, non-obvious pattern or principle that contributes to their success. Avoid generic advice. Focus on a specific, actionable insight.',
    user_prompt_template: `Analyze these successful emails and identify what makes them effective:

{{email_examples}}

Output a single minified JSON object with one key: "insight_summary".`,
    preferred_model: 'gpt-4o-mini',
    temperature: 0.7,
    output_format: 'json'
  }
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get a prompt template by slug
 * @param {string} slug - Template slug (e.g., 'company-extraction-serp')
 * @param {Object} options - Optional overrides for vertical/sub_vertical
 * @returns {Promise<Object>} Template object with system_prompt, user_prompt_template, etc.
 */
async function getPromptTemplate(slug, options = {}) {
  const { vertical = null, subVertical = null, forceRefresh = false } = options;

  // Check cache
  const cacheKey = `${slug}:${vertical || '_'}:${subVertical || '_'}`;
  if (
    !forceRefresh &&
    promptCache.templates.has(cacheKey) &&
    promptCache.loadedAt &&
    (Date.now() - promptCache.loadedAt) < promptCache.ttlMs
  ) {
    return promptCache.templates.get(cacheKey);
  }

  try {
    // Try to load from database with specificity order:
    // 1. Exact match (vertical + sub_vertical)
    // 2. Vertical match (no sub_vertical)
    // 3. Default (no vertical)
    const result = await pool.query(`
      SELECT *
      FROM prompt_templates
      WHERE slug = $1
        AND is_active = true
        AND (
          (vertical = $2 AND sub_vertical = $3)
          OR (vertical = $2 AND sub_vertical IS NULL)
          OR (vertical IS NULL)
        )
      ORDER BY
        CASE
          WHEN vertical = $2 AND sub_vertical = $3 THEN 1
          WHEN vertical = $2 AND sub_vertical IS NULL THEN 2
          ELSE 3
        END
      LIMIT 1
    `, [slug, vertical, subVertical]);

    if (result.rows.length > 0) {
      const template = result.rows[0];
      promptCache.templates.set(cacheKey, template);
      promptCache.loadedAt = Date.now();
      console.log(`[PromptTemplate] Loaded from DB: ${slug}`);
      return template;
    }
  } catch (error) {
    console.log(`[PromptTemplate] DB unavailable, using default: ${slug}`, error.message);
  }

  // Fall back to default
  const defaultTemplate = DEFAULT_TEMPLATES[slug];
  if (defaultTemplate) {
    promptCache.templates.set(cacheKey, defaultTemplate);
    promptCache.loadedAt = Date.now();
    return defaultTemplate;
  }

  throw new Error(`Prompt template not found: ${slug}`);
}

/**
 * Render a prompt template with variables
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {Object} variables - Key-value pairs to replace
 * @returns {string} Rendered template
 */
function renderTemplate(template, variables = {}) {
  if (!template) return '';

  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, value ?? '');
  }

  return rendered;
}

/**
 * Get and render a prompt in one call
 * @param {string} slug - Template slug
 * @param {Object} variables - Variables to render
 * @param {Object} options - Options for template lookup
 * @returns {Promise<Object>} { systemPrompt, userPrompt, model, temperature, maxTokens }
 */
async function getRenderedPrompt(slug, variables = {}, options = {}) {
  const template = await getPromptTemplate(slug, options);

  return {
    systemPrompt: template.system_prompt
      ? renderTemplate(template.system_prompt, variables)
      : null,
    userPrompt: renderTemplate(template.user_prompt_template, variables),
    model: template.preferred_model,
    temperature: parseFloat(template.temperature) || 0.7,
    maxTokens: parseInt(template.max_tokens) || 4096,
    outputFormat: template.output_format || 'text',
    outputSchema: template.output_schema
  };
}

/**
 * Invalidate prompt cache (called when Super Admin updates prompts)
 */
function invalidatePromptCache() {
  promptCache.templates.clear();
  promptCache.loadedAt = null;
  console.log('[PromptTemplate] Cache invalidated');
}

/**
 * List all available templates (for Super Admin UI)
 * @returns {Promise<Array>} List of templates with metadata
 */
async function listTemplates() {
  try {
    const result = await pool.query(`
      SELECT slug, name, task_type, vertical, sub_vertical,
             preferred_model, is_active, is_default, version,
             created_at, updated_at
      FROM prompt_templates
      ORDER BY task_type, slug
    `);
    return result.rows;
  } catch (error) {
    console.error('[PromptTemplate] Error listing templates:', error);
    return Object.values(DEFAULT_TEMPLATES).map(t => ({
      slug: t.slug,
      name: t.slug,
      task_type: 'unknown',
      is_active: true,
      is_default: true
    }));
  }
}

/**
 * Update usage statistics for a template
 * @param {string} slug - Template slug
 * @param {number} latencyMs - Request latency in milliseconds
 * @param {boolean} success - Whether the request succeeded
 */
async function recordUsage(slug, latencyMs, success) {
  try {
    await pool.query(`
      UPDATE prompt_templates
      SET usage_count = usage_count + 1,
          avg_latency_ms = COALESCE(
            (avg_latency_ms * usage_count + $2) / (usage_count + 1),
            $2
          ),
          success_rate = COALESCE(
            (success_rate * usage_count + $3) / (usage_count + 1),
            $3
          ),
          updated_at = NOW()
      WHERE slug = $1
    `, [slug, latencyMs, success ? 100 : 0]);
  } catch (error) {
    // Non-critical, just log
    console.log('[PromptTemplate] Failed to record usage:', error.message);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  getPromptTemplate,
  renderTemplate,
  getRenderedPrompt,
  invalidatePromptCache,
  listTemplates,
  recordUsage,
  DEFAULT_TEMPLATES
};
