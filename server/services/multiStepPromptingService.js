/**
 * Multi-Step Prompting Service
 * Sprint 32 - Task 5: Chain-of-thought reasoning
 *
 * Implements: Research → Analyze → Generate flow with self-critique
 */

const OpenAI = require('openai');
const { PromptABTestingService } = require('./promptABTestingService');

class MultiStepPromptingService {
  constructor(pool) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.abTestService = new PromptABTestingService(pool);
    this.pool = pool;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 1: RESEARCH (Gather & Analyze Information)
  // ═══════════════════════════════════════════════════════════

  /**
   * Execute research step using company_research prompt
   * Analyzes company data and generates insights
   */
  async research(companyData) {
    const startTime = Date.now();

    try {
      // Get prompt from database
      const prompt = await this.pool.query(
        `SELECT system_prompt, user_prompt_template, model, temperature, max_tokens, schema
         FROM prompt_versions
         WHERE name = 'company_research' AND active = true
         ORDER BY created_at DESC
         LIMIT 1`
      );

      if (prompt.rows.length === 0) {
        throw new Error('company_research prompt not found');
      }

      const { system_prompt, user_prompt_template, model, temperature, max_tokens, schema } = prompt.rows[0];

      // Render user prompt with variables
      const userPrompt = this.renderTemplate(user_prompt_template, companyData);

      // Call LLM with chain-of-thought
      const response = await this.openai.chat.completions.create({
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: system_prompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: temperature || 0.3,
        max_tokens: max_tokens || 1000,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      const executionTime = Date.now() - startTime;

      // Log execution
      await this.abTestService.logExecution({
        prompt_name: 'company_research',
        prompt_version: 'v1.0-doctrine',
        execution_time_ms: executionTime,
        success: true,
        input_variables: companyData,
        output_data: result,
        output_quality_score: result.quality_score,
        company_id: companyData.company_id
      });

      return {
        step: 'research',
        data: result,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.abTestService.logExecution({
        prompt_name: 'company_research',
        prompt_version: 'v1.0-doctrine',
        execution_time_ms: executionTime,
        success: false,
        error_message: error.message,
        input_variables: companyData
      });
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: QUALIFICATION (Analyze Contact)
  // ═══════════════════════════════════════════════════════════

  /**
   * Execute qualification step using contact_qualification prompt
   * Analyzes contact and determines outreach priority
   */
  async qualify(contactData, companyResearch) {
    const startTime = Date.now();

    try {
      const prompt = await this.pool.query(
        `SELECT system_prompt, user_prompt_template, model, temperature, max_tokens
         FROM prompt_versions
         WHERE name = 'contact_qualification' AND active = true
         ORDER BY created_at DESC
         LIMIT 1`
      );

      if (prompt.rows.length === 0) {
        throw new Error('contact_qualification prompt not found');
      }

      const { system_prompt, user_prompt_template, model, temperature, max_tokens } = prompt.rows[0];

      // Enrich contact data with company research
      const enrichedData = {
        ...contactData,
        company_quality_score: companyResearch.data.quality_score
      };

      const userPrompt = this.renderTemplate(user_prompt_template, enrichedData);

      const response = await this.openai.chat.completions.create({
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: system_prompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: temperature || 0.3,
        max_tokens: max_tokens || 800,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      const executionTime = Date.now() - startTime;

      await this.abTestService.logExecution({
        prompt_name: 'contact_qualification',
        prompt_version: 'v1.0-doctrine',
        execution_time_ms: executionTime,
        success: true,
        input_variables: enrichedData,
        output_data: result,
        output_quality_score: result.outreach_priority,
        contact_id: contactData.contact_id
      });

      return {
        step: 'qualification',
        data: result,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.abTestService.logExecution({
        prompt_name: 'contact_qualification',
        prompt_version: 'v1.0-doctrine',
        execution_time_ms: executionTime,
        success: false,
        error_message: error.message,
        input_variables: contactData
      });
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3: STRATEGY (Determine Outreach Approach)
  // ═══════════════════════════════════════════════════════════

  /**
   * Execute strategy step using outreach_strategy prompt
   * Determines optimal outreach approach based on research & qualification
   */
  async strategize(context, companyResearch, contactQualification) {
    const startTime = Date.now();

    try {
      const prompt = await this.pool.query(
        `SELECT system_prompt, user_prompt_template, model, temperature, max_tokens
         FROM prompt_versions
         WHERE name = 'outreach_strategy' AND active = true
         ORDER BY created_at DESC
         LIMIT 1`
      );

      if (prompt.rows.length === 0) {
        throw new Error('outreach_strategy prompt not found');
      }

      const { system_prompt, user_prompt_template, model, temperature, max_tokens } = prompt.rows[0];

      // Combine all previous steps into strategy context
      const strategyContext = {
        company_name: context.company_name,
        company_quality_score: companyResearch.data.quality_score,
        company_tier: companyResearch.data.tier,
        company_insights: JSON.stringify(companyResearch.data.key_insights),
        recommended_products: JSON.stringify(companyResearch.data.recommended_products),
        contact_name: context.contact_name,
        contact_title: context.contact_title,
        contact_tier: contactQualification.data.contact_tier,
        contact_priority: contactQualification.data.outreach_priority,
        personalization_hooks: JSON.stringify(contactQualification.data.personalization_hooks),
        recent_signals: context.recent_signals || 'None',
        previous_outreach: context.previous_outreach || 'None',
        timing_context: context.timing_context || 'Current'
      };

      const userPrompt = this.renderTemplate(user_prompt_template, strategyContext);

      const response = await this.openai.chat.completions.create({
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: system_prompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: temperature || 0.4,
        max_tokens: max_tokens || 1000,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      const executionTime = Date.now() - startTime;

      await this.abTestService.logExecution({
        prompt_name: 'outreach_strategy',
        prompt_version: 'v1.0-doctrine',
        execution_time_ms: executionTime,
        success: true,
        input_variables: strategyContext,
        output_data: result,
        company_id: context.company_id,
        contact_id: context.contact_id
      });

      return {
        step: 'strategy',
        data: result,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.abTestService.logExecution({
        prompt_name: 'outreach_strategy',
        prompt_version: 'v1.0-doctrine',
        execution_time_ms: executionTime,
        success: false,
        error_message: error.message,
        input_variables: context
      });
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ORCHESTRATION: Full Chain-of-Thought Pipeline
  // ═══════════════════════════════════════════════════════════

  /**
   * Execute complete multi-step prompting pipeline
   * Research → Qualify → Strategize with self-critique
   */
  async executeChainOfThought(input) {
    const { companyData, contactData, context = {} } = input;

    const pipelineStart = Date.now();
    const steps = [];

    try {
      // Step 1: Research company
      console.log('🔍 Step 1/3: Researching company...');
      const research = await this.research(companyData);
      steps.push(research);

      // Self-critique: Check if company meets minimum quality
      if (research.data.quality_score < 30) {
        return {
          success: false,
          reason: 'Company quality score too low for outreach',
          research: research.data,
          totalTime: Date.now() - pipelineStart
        };
      }

      // Step 2: Qualify contact
      console.log('👤 Step 2/3: Qualifying contact...');
      const qualification = await this.qualify(contactData, research);
      steps.push(qualification);

      // Self-critique: Check if contact priority is sufficient
      if (qualification.data.outreach_priority < 40) {
        return {
          success: false,
          reason: 'Contact priority too low for immediate outreach',
          research: research.data,
          qualification: qualification.data,
          totalTime: Date.now() - pipelineStart
        };
      }

      // Step 3: Determine strategy
      console.log('📋 Step 3/3: Determining outreach strategy...');
      const fullContext = {
        ...context,
        company_name: companyData.company_name,
        contact_name: contactData.contact_name,
        contact_title: contactData.title
      };

      const strategy = await this.strategize(fullContext, research, qualification);
      steps.push(strategy);

      // Self-critique: Check compliance
      if (strategy.data.compliance_check && !strategy.data.compliance_check.passed) {
        return {
          success: false,
          reason: 'Strategy failed compliance check',
          research: research.data,
          qualification: qualification.data,
          strategy: strategy.data,
          compliance_flags: strategy.data.compliance_check.flags,
          totalTime: Date.now() - pipelineStart
        };
      }

      // Success: Return complete chain-of-thought result
      return {
        success: true,
        research: research.data,
        qualification: qualification.data,
        strategy: strategy.data,
        steps: steps.map(s => ({ step: s.step, executionTime: s.executionTime })),
        totalTime: Date.now() - pipelineStart
      };

    } catch (error) {
      return {
        success: false,
        reason: 'Pipeline execution failed',
        error: error.message,
        completedSteps: steps.map(s => s.step),
        totalTime: Date.now() - pipelineStart
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════

  /**
   * Render template with variable substitution
   */
  renderTemplate(template, variables) {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(regex, String(value || ''));
    }
    return rendered;
  }
}

module.exports = { MultiStepPromptingService };
