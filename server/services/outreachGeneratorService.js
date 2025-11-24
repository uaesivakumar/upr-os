/**
 * Outreach Generator Service
 * Sprint 31 - Tasks 4-8: Complete Engine Implementation
 *
 * Combines:
 * - Task 4: Variable Substitution System
 * - Task 5: Tone Adjustment Logic
 * - Task 6: Context-Aware Generation
 * - Task 7: Message Variants (Email, LinkedIn, Follow-up)
 * - Task 8: Core generation logic (API in routes/outreach.js)
 */

const { VoiceTemplateService } = require('./voiceTemplateService');
const { v4: uuidv4 } = require('uuid');

class OutreachGeneratorService {
  constructor(pool) {
    this.templateService = new VoiceTemplateService(pool);
  }

  // =================================================================
  // Task 4: Variable Substitution System
  // =================================================================

  /**
   * Substitute variables in template text
   * Supports: {variable}, {?optional_variable}, {variable|default}
   */
  substituteVariables(templateText, variables) {
    let result = templateText;

    // Handle conditional variables {?variable_name}
    result = result.replace(/\{\?(\w+)\}/g, (match, varName) => {
      return variables[varName] || '';
    });

    // Handle variables with defaults {variable|default}
    result = result.replace(/\{(\w+)\|([^}]+)\}/g, (match, varName, defaultValue) => {
      return variables[varName] || defaultValue;
    });

    // Handle standard variables {variable}
    result = result.replace(/\{(\w+)\}/g, (match, varName) => {
      if (variables[varName] === undefined) {
        console.warn(`Missing variable: ${varName}`);
        return match; // Keep placeholder if variable missing
      }
      return variables[varName];
    });

    return result;
  }

  /**
   * Validate that all required variables are present
   */
  validateVariables(requiredVars, providedVars) {
    const missing = requiredVars.filter(v => !providedVars[v]);
    const coverage = requiredVars.length === 0
      ? 100
      : ((requiredVars.length - missing.length) / requiredVars.length) * 100;
    return {
      valid: missing.length === 0,
      missing,
      coverage
    };
  }

  // =================================================================
  // Task 5: Tone Adjustment Logic
  // =================================================================

  /**
   * Auto-detect appropriate tone based on context
   */
  detectTone(context) {
    const { quality_score, company_size, contact_tier, license_type } = context;

    // Formal: High quality, strategic contacts, large companies
    if (quality_score >= 80 && contact_tier === 'STRATEGIC' && company_size === 'enterprise') {
      return 'formal';
    }

    // Casual: Startups, free zone, lower contact tiers
    if (company_size === 'startup' || license_type === 'Free Zone') {
      return 'casual';
    }

    // Professional: Everything else (default)
    return 'professional';
  }

  /**
   * Apply tone adjustments to generated text
   */
  adjustTone(text, targetTone) {
    let adjusted = text;

    if (targetTone === 'formal') {
      // Remove contractions
      adjusted = adjusted.replace(/I'm/g, 'I am');
      adjusted = adjusted.replace(/you're/g, 'you are');
      adjusted = adjusted.replace(/we're/g, 'we are');
      adjusted = adjusted.replace(/won't/g, 'will not');
      adjusted = adjusted.replace(/can't/g, 'cannot');
      adjusted = adjusted.replace(/don't/g, 'do not');
      adjusted = adjusted.replace(/I'd/g, 'I would');
      adjusted = adjusted.replace(/you'd/g, 'you would');

      // Replace casual phrases
      adjusted = adjusted.replace(/Let's/g, 'Let us');
      adjusted = adjusted.replace(/Hey/g, 'Dear');
      adjusted = adjusted.replace(/Congrats/g, 'Congratulations');
    }

    if (targetTone === 'casual') {
      // Add contractions if formal
      adjusted = adjusted.replace(/I am/g, 'I\'m');
      adjusted = adjusted.replace(/you are/g, 'you\'re');
      adjusted = adjusted.replace(/we are/g, 'we\'re');
      adjusted = adjusted.replace(/will not/g, 'won\'t');
      adjusted = adjusted.replace(/cannot/g, 'can\'t');

      // Replace formal phrases
      adjusted = adjusted.replace(/Dear\s+(\w+)/g, 'Hey $1');
    }

    return adjusted;
  }

  // =================================================================
  // Task 6: Context-Aware Generation
  // =================================================================

  /**
   * Enrich context with intelligent defaults and inferences
   */
  enrichContext(context) {
    const enriched = { ...context };

    // Auto-detect tone if not provided
    if (!enriched.tone) {
      enriched.tone = this.detectTone(context);
    }

    // Infer pain points based on industry
    if (!enriched.pain_point && enriched.industry) {
      const painPoints = {
        'Technology': 'cash flow management and scaling operations',
        'Retail': 'inventory financing and payment processing',
        'Healthcare': 'equipment financing and payroll management',
        'Manufacturing': 'supply chain financing and working capital',
        'Real Estate': 'project financing and property development funding'
      };
      enriched.pain_point = painPoints[enriched.industry] || 'financial operations';
    }

    // Infer benefits based on quality score
    if (!enriched.benefit) {
      if (enriched.quality_score >= 80) {
        enriched.benefit = 'enhanced financial efficiency and strategic growth';
      } else if (enriched.quality_score >= 50) {
        enriched.benefit = 'streamlined operations and improved cash flow';
      } else {
        enriched.benefit = 'better banking experience and cost savings';
      }
    }

    // Infer ROI timeframe
    if (!enriched.timeframe) {
      enriched.timeframe = enriched.company_size === 'enterprise' ? '6 months' : '90 days';
    }

    return enriched;
  }

  /**
   * Select best template based on context
   */
  async selectTemplate(templateType, category, context) {
    const enrichedContext = this.enrichContext(context);

    return await this.templateService.selectBestTemplate({
      template_type: templateType,
      category,
      tone: enrichedContext.tone,
      quality_score: enrichedContext.quality_score,
      company_size: enrichedContext.company_size,
      contact_tier: enrichedContext.contact_tier
    });
  }

  // =================================================================
  // Task 7: Message Variants - Formatters
  // =================================================================

  /**
   * Format email message
   */
  formatEmail(subject, body, context) {
    return {
      format: 'email',
      subject,
      body,
      metadata: {
        sender: context.sender_name || 'Emirates NBD',
        reply_to: context.sender_email || 'business@emiratesnbd.ae'
      }
    };
  }

  /**
   * Format LinkedIn message (300 char limit)
   */
  formatLinkedIn(body) {
    let trimmed = body;

    if (body.length > 300) {
      trimmed = body.substring(0, 297) + '...';
    }

    return {
      format: 'linkedin',
      body: trimmed,
      char_count: trimmed.length,
      metadata: {
        max_length: 300
      }
    };
  }

  /**
   * Format follow-up message
   */
  formatFollowUp(body, context, followUpNumber = 1) {
    return {
      format: `followup_${followUpNumber}`,
      body,
      metadata: {
        previous_message_id: context.previous_message_id,
        follow_up_number: followUpNumber,
        days_since_last: context.days_since_last || 7
      }
    };
  }

  // =================================================================
  // Core Generation Engine
  // =================================================================

  /**
   * Generate complete outreach message
   * @param {object} request - Generation request
   * @returns {object} Generated message
   */
  async generateOutreach(request) {
    const {
      message_type = 'email',
      company,
      contact,
      context = {},
      tone
    } = request;

    // Build variables object
    const variables = {
      // Company variables
      company_name: company.company_name,
      industry: company.industry,
      company_size: company.size_bucket,
      domain: company.domain,

      // Contact variables
      first_name: contact.first_name,
      last_name: contact.last_name,
      title: contact.title,

      // Context variables
      product_name: context.recommended_products?.[0] || 'Business Banking Solutions',
      benefit: context.benefit,
      pain_point: context.pain_point,
      solution: context.solution || 'Emirates NBD Business Banking',
      roi: context.roi || '30% cost reduction',
      timeframe: context.timeframe || '90 days',
      meeting_day: context.meeting_day || 'next week',
      meeting_time: context.meeting_time || '10:00 AM',
      quarter: context.quarter || 'Q1 2025',
      sender_name: context.sender_name || 'Emirates NBD Team',
      new_insight: context.new_insight || 'recent market trends in the UAE'
    };

    // Enrich context
    const enrichedContext = this.enrichContext({
      ...context,
      quality_score: company.quality_score || 50,
      company_size: company.size_bucket,
      contact_tier: contact.tier,
      industry: company.industry,
      tone: tone || this.detectTone({
        quality_score: company.quality_score,
        company_size: company.size_bucket,
        contact_tier: contact.tier
      })
    });

    // Update variables with enriched context values
    if (!variables.benefit && enrichedContext.benefit) {
      variables.benefit = enrichedContext.benefit;
    }
    if (!variables.pain_point && enrichedContext.pain_point) {
      variables.pain_point = enrichedContext.pain_point;
    }
    if (!variables.timeframe && enrichedContext.timeframe) {
      variables.timeframe = enrichedContext.timeframe;
    }

    // Determine category
    const category = message_type.includes('followup') ? message_type : message_type;

    // Check for full message template first
    let template = await this.selectTemplate('full_message', category, enrichedContext);

    let subject = '';
    let body = '';

    if (template) {
      // Use full message template
      if (template.subject_template) {
        subject = this.substituteVariables(template.subject_template, variables);
      }
      body = this.substituteVariables(template.template_text, variables);
    } else {
      // Build from components
      const intro = await this.selectTemplate('introduction', category, enrichedContext);
      const valueProp = await this.selectTemplate('value_prop', category, enrichedContext);
      const painPoint = await this.selectTemplate('pain_point', category, enrichedContext);
      const cta = await this.selectTemplate('cta', category, enrichedContext);

      if (!intro || !cta) {
        throw new Error(`Could not find required templates for ${category}`);
      }

      // Build body
      const parts = [
        intro ? this.substituteVariables(intro.template_text, variables) : '',
        valueProp ? '\\n\\n' + this.substituteVariables(valueProp.template_text, variables) : '',
        painPoint ? '\\n\\n' + this.substituteVariables(painPoint.template_text, variables) : '',
        cta ? '\\n\\n' + this.substituteVariables(cta.template_text, variables) : ''
      ].filter(p => p);

      body = parts.join('');

      // Generate subject for email
      if (message_type === 'email') {
        const subjectBenefit = variables.benefit || 'Enhanced business solutions';
        subject = `${subjectBenefit} for ${variables.company_name}`;
      }

      // Track templates used
      template = {
        id: 'composite',
        template_ids: [intro, valueProp, painPoint, cta].filter(t => t).map(t => ({ type: t.template_type, id: t.id }))
      };
    }

    // Apply tone adjustment
    body = this.adjustTone(body, enrichedContext.tone);
    if (subject) {
      subject = this.adjustTone(subject, enrichedContext.tone);
    }

    // Calculate quality score
    const variableValidation = this.validateVariables(
      template.variables || [],
      variables
    );

    const qualityScore = this.calculateQualityScore({
      variable_coverage: variableValidation.coverage,
      context_relevance: company.quality_score || 50,
      tone_consistency: 85, // Simplified
      personalization_level: variableValidation.coverage
    });

    // Format according to message type
    let formatted;
    if (message_type === 'email') {
      formatted = this.formatEmail(subject, body, enrichedContext);
    } else if (message_type === 'linkedin') {
      formatted = this.formatLinkedIn(body);
    } else if (message_type.startsWith('followup')) {
      const followUpNum = parseInt(message_type.replace('followup_', '') || '1');
      formatted = this.formatFollowUp(body, enrichedContext, followUpNum);
    } else {
      formatted = { format: message_type, body };
    }

    // Save generated message
    const message_id = uuidv4();

    await this.templateService.createGeneratedMessage({
      message_id,
      message_type,
      company_id: company.company_id || company.company_name,
      company_name: company.company_name,
      contact_id: contact.contact_id || contact.first_name,
      contact_name: `${contact.first_name} ${contact.last_name}`,
      subject: formatted.subject || subject,
      body: formatted.body || body,
      template_ids: template.template_ids || [{ type: template.template_type, id: template.id }],
      variables_used: variables,
      tone: enrichedContext.tone,
      quality_score: qualityScore,
      personalization_score: variableValidation.coverage,
      variable_coverage: variableValidation.coverage,
      context_data: enrichedContext
    });

    // Increment template usage
    if (template.id !== 'composite') {
      await this.templateService.incrementUsage(template.id);
    }

    return {
      success: true,
      message: {
        message_id,
        ...formatted,
        tone: enrichedContext.tone,
        message_type,
        templates_used: template.template_ids || [{ type: template.template_type, id: template.id }],
        quality_score: qualityScore
      },
      metadata: {
        generated_at: new Date().toISOString(),
        variables_substituted: Object.keys(variables).length,
        variable_coverage: variableValidation.coverage,
        context_applied: true
      }
    };
  }

  /**
   * Calculate message quality score (0-100)
   */
  calculateQualityScore(metrics) {
    const {
      variable_coverage = 0,
      context_relevance = 0,
      tone_consistency = 0,
      personalization_level = 0
    } = metrics;

    return Math.round(
      variable_coverage * 0.25 +
      context_relevance * 0.30 +
      tone_consistency * 0.20 +
      personalization_level * 0.25
    );
  }

  /**
   * Close database connection
   */
  async close() {
    await this.templateService.close();
  }
}

module.exports = { OutreachGeneratorService };
