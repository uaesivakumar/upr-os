// services/autoExperimentDesigner.js
// AI-Powered Automatic Experiment Design
//
// Generates experiment variants based on:
// - Campaign objectives
// - Historical performance data
// - Best practices
// - Contextual features (industry, seniority, etc.)

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../utils/db.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Auto-generate experiment variants using AI
 *
 * @param {Object} params
 * @param {string} params.campaign_type - Type of campaign (e.g., 'digital_transformation')
 * @param {string} params.objective - Experiment objective (e.g., 'maximize_open_rate')
 * @param {string} params.target_audience - Who will receive these emails
 * @param {number} params.num_variants - How many variants to generate (default: 4)
 * @param {Object} params.context - Additional context (industry, company_size, etc.)
 *
 * @returns {Object} { experiment_name, variants: [...], reasoning }
 */
export async function designExperiment({
  campaign_type,
  objective = 'maximize_conversion',
  target_audience,
  num_variants = 4,
  context = {}
}) {

  console.log('[AutoDesigner] Generating experiment variants...');

  // Step 1: Fetch historical performance data
  const historicalData = await fetchHistoricalPerformance(campaign_type, context);

  // Step 2: Build AI prompt
  const prompt = buildDesignPrompt({
    campaign_type,
    objective,
    target_audience,
    num_variants,
    context,
    historicalData
  });

  // Step 3: Call LLM API
  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4000,
    temperature: 0.85, // Higher temperature for creative variant generation
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const responseText = message.content[0].text;

  // Step 4: Parse response (expecting JSON)
  let designResult;
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                      responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const jsonText = jsonMatch[1] || jsonMatch[0];
      designResult = JSON.parse(jsonText);
    } else {
      throw new Error('No JSON found in AI response');
    }
  } catch (parseError) {
    console.error('[AutoDesigner] Failed to parse AI response:', parseError);
    console.error('Response:', responseText);

    // Fallback: return template variants
    return generateFallbackVariants(campaign_type, num_variants);
  }

  console.log('[AutoDesigner] Generated experiment:', designResult.experiment_name);

  return designResult;
}

/**
 * Fetch historical performance data for similar campaigns
 */
async function fetchHistoricalPerformance(campaignType, context) {
  try {
    // Query: Get top-performing emails from similar campaigns
    const result = await pool.query(`
      SELECT
        eo.email_subject,
        eo.campaign_type,
        eo.opened,
        eo.replied,
        eo.converted,
        eo.sent_at,
        fs.features->>'industry' as industry,
        fs.features->>'seniority_level' as seniority
      FROM email_outcomes eo
      LEFT JOIN feature_store fs ON fs.entity_type = 'company' AND fs.entity_id = eo.company_id
      WHERE
        eo.campaign_type = $1
        AND eo.sent_at > NOW() - INTERVAL '90 days'
        AND eo.opened = TRUE
      ORDER BY
        CASE
          WHEN eo.converted THEN 3
          WHEN eo.replied THEN 2
          WHEN eo.opened THEN 1
          ELSE 0
        END DESC
      LIMIT 20
    `, [campaignType]);

    // Aggregate insights
    const insights = {
      total_emails: result.rows.length,
      best_subjects: result.rows.slice(0, 5).map(r => r.email_subject),
      avg_open_rate: result.rows.filter(r => r.opened).length / Math.max(result.rows.length, 1),
      industries: [...new Set(result.rows.map(r => r.industry).filter(Boolean))],
      seniorities: [...new Set(result.rows.map(r => r.seniority).filter(Boolean))]
    };

    return insights;

  } catch (error) {
    console.error('[AutoDesigner] Error fetching historical data:', error);
    return {
      total_emails: 0,
      best_subjects: [],
      avg_open_rate: 0,
      industries: [],
      seniorities: []
    };
  }
}

/**
 * Build AI prompt for experiment design
 */
function buildDesignPrompt({
  campaign_type,
  objective,
  target_audience,
  num_variants,
  context,
  historicalData
}) {

  const objectiveDescriptions = {
    maximize_open_rate: 'Maximize email open rate (subject line optimization)',
    maximize_reply_rate: 'Maximize reply rate (engagement optimization)',
    maximize_conversion: 'Maximize conversion rate (end-to-end optimization)',
    minimize_unsubscribe: 'Minimize unsubscribe rate (retention optimization)'
  };

  return `You are an expert email marketing scientist designing A/B test experiments.

**Your Task:**
Design ${num_variants} email variants for a ${campaign_type} campaign.

**Objective:**
${objectiveDescriptions[objective] || objective}

**Target Audience:**
${target_audience || 'UAE banking decision-makers (C-level, VPs, Directors)'}

**Context:**
- Industry: ${context.industry || 'banking/finance'}
- Company Size: ${context.company_size || '1000+ employees'}
- Seniority: ${context.seniority || 'C-level, VP, Director'}
- Previous Campaign Performance: ${historicalData.avg_open_rate ? `${(historicalData.avg_open_rate * 100).toFixed(1)}% open rate` : 'No data'}

**Historical Top Performers:**
${historicalData.best_subjects?.length > 0 ? historicalData.best_subjects.map((s, i) => `${i + 1}. "${s}"`).join('\n') : 'No historical data available'}

**Requirements:**
1. Create ${num_variants} distinct variants (A, B, C, D, ...)
2. Each variant should test a SPECIFIC hypothesis about what drives ${objective}
3. Variants should be meaningfully different (not just minor wording changes)
4. Include subject line, email structure, tone, and key messaging
5. Provide clear hypothesis for each variant

**Output Format (JSON):**
\`\`\`json
{
  "experiment_name": "descriptive_experiment_name_with_date",
  "description": "Brief description of what this experiment tests",
  "hypothesis": "Overall hypothesis about what will improve ${objective}",
  "variants": [
    {
      "name": "variant_A",
      "hypothesis": "Specific hypothesis this variant tests",
      "subject_template": "Subject line template (with {{placeholders}})",
      "email_structure": "value-first | problem-solution | story-driven | data-driven | etc.",
      "tone": "professional | friendly | urgent | consultative | aspirational",
      "key_message": "Main value proposition",
      "personalization_strategy": "How this variant personalizes",
      "cta": "Call-to-action text",
      "expected_performance": "high | medium | baseline",
      "reasoning": "Why we expect this to work"
    }
  ],
  "success_metrics": ["primary metric", "secondary metric"],
  "recommended_sample_size": 500,
  "estimated_runtime_days": 7
}
\`\`\`

**Design Principles:**
1. **Scientific Rigor**: Each variant should test ONE clear hypothesis
2. **Meaningful Differences**: Avoid superficial changes (e.g., "Hi" vs "Hello")
3. **Context-Aware**: Consider industry, seniority, company size
4. **Best Practices**: Apply proven email marketing principles
5. **Creative Exploration**: Don't just copy historical winners - try new approaches

Generate the experiment design now.`;
}

/**
 * Fallback: Generate template variants when AI fails
 */
function generateFallbackVariants(campaignType, numVariants) {
  const timestamp = new Date().toISOString().split('T')[0];

  const templates = [
    {
      name: 'variant_A',
      hypothesis: 'Generic value proposition performs baseline',
      subject_template: 'Improve your {{process_name}}',
      email_structure: 'value-first',
      tone: 'professional',
      key_message: 'Save time and increase efficiency',
      personalization_strategy: 'Basic placeholder substitution',
      cta: 'Learn more',
      expected_performance: 'baseline',
      reasoning: 'Standard approach for baseline measurement'
    },
    {
      name: 'variant_B',
      hypothesis: 'Data-driven subject lines increase open rates',
      subject_template: '{{metric}}% faster {{outcome}} - see how',
      email_structure: 'data-driven',
      tone: 'professional',
      key_message: 'Concrete results and numbers',
      personalization_strategy: 'Industry-specific metrics',
      cta: 'View case study',
      expected_performance: 'high',
      reasoning: 'Numbers create curiosity and credibility'
    },
    {
      name: 'variant_C',
      hypothesis: 'Personalized industry references increase relevance',
      subject_template: '{{industry}} hiring trends you should know',
      email_structure: 'consultative',
      tone: 'consultative',
      key_message: 'Industry-specific insights',
      personalization_strategy: 'Industry and role-specific content',
      cta: 'Get the report',
      expected_performance: 'high',
      reasoning: 'Industry personalization increases perceived relevance'
    },
    {
      name: 'variant_D',
      hypothesis: 'Urgency-driven messaging increases action',
      subject_template: 'Don\'t miss: {{event_name}} this week',
      email_structure: 'urgent',
      tone: 'urgent',
      key_message: 'Time-sensitive opportunity',
      personalization_strategy: 'Event-based triggers',
      cta: 'Register now',
      expected_performance: 'medium',
      reasoning: 'Urgency can drive action but may reduce quality'
    }
  ];

  return {
    experiment_name: `${campaignType}_auto_${timestamp}`,
    description: 'Auto-generated experiment (fallback templates)',
    hypothesis: 'Testing different messaging approaches for conversion optimization',
    variants: templates.slice(0, numVariants),
    success_metrics: ['conversion_rate', 'open_rate', 'reply_rate'],
    recommended_sample_size: 400,
    estimated_runtime_days: 7
  };
}

/**
 * Save experiment to database
 */
export async function saveExperiment(experimentDesign, userId = 'system') {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create experiment record
    const experimentResult = await client.query(`
      INSERT INTO experiments (
        experiment_name,
        description,
        algorithm,
        status,
        start_date,
        metadata
      ) VALUES ($1, $2, 'linucb', 'draft', NOW(), $3)
      RETURNING id
    `, [
      experimentDesign.experiment_name,
      experimentDesign.description,
      JSON.stringify({
        hypothesis: experimentDesign.hypothesis,
        success_metrics: experimentDesign.success_metrics,
        recommended_sample_size: experimentDesign.recommended_sample_size,
        estimated_runtime_days: experimentDesign.estimated_runtime_days,
        generated_by: 'auto_designer',
        generated_at: new Date().toISOString()
      })
    ]);

    const experimentId = experimentResult.rows[0].id;

    // Create variant records
    for (const variant of experimentDesign.variants) {
      await client.query(`
        INSERT INTO experiment_assignments (
          experiment_id,
          variant_name,
          config
        ) VALUES ($1, $2, $3)
      `, [
        experimentId,
        variant.name,
        JSON.stringify(variant)
      ]);
    }

    await client.query('COMMIT');

    console.log('[AutoDesigner] Saved experiment to database:', experimentId);

    return {
      experiment_id: experimentId,
      experiment_name: experimentDesign.experiment_name,
      variant_count: experimentDesign.variants.length
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[AutoDesigner] Error saving experiment:', error);
    throw error;

  } finally {
    client.release();
  }
}

export default {
  designExperiment,
  saveExperiment
};
