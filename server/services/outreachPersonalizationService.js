/**
 * Outreach Personalization Service
 * Sprint 45 - Advanced AI-powered personalization engine
 *
 * Capabilities:
 * - Deep context enrichment
 * - AI-powered insights generation
 * - Industry-specific personalization
 * - Multi-dimensional scoring
 * - Dynamic variable expansion
 */

import pg from 'pg';
const { Pool } = pg;

export class OutreachPersonalizationService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  /**
   * Generate advanced personalization for outreach
   * @param {object} params - Personalization parameters
   * @returns {object} Enriched personalization data
   */
  async personalizeOutreach(params) {
    const {
      company,
      contact,
      context = {},
      personalizationLevel = 'deep' // shallow, medium, deep
    } = params;

    // Build base personalization
    const basePersonalization = {
      company_name: company.company_name,
      industry: company.industry,
      company_size: company.size_bucket,
      first_name: contact.first_name,
      last_name: contact.last_name,
      title: contact.title
    };

    // Enrich with industry intelligence
    const industryInsights = await this.getIndustryInsights(company.industry);

    // Generate pain points
    const painPoints = this.generatePainPoints(company, contact, context);

    // Generate benefits
    const benefits = this.generateBenefits(company, contact, context);

    // Generate social proof
    const socialProof = this.generateSocialProof(company, context);

    // Generate urgency triggers
    const urgencyTriggers = this.generateUrgencyTriggers(company, context);

    // Calculate personalization depth score
    const depthScore = this.calculateDepthScore({
      company,
      contact,
      context,
      industryInsights,
      painPoints,
      benefits
    });

    // Generate AI-powered custom insights
    const customInsights = await this.generateCustomInsights({
      company,
      contact,
      context,
      industryInsights
    });

    // Build complete personalization package
    const personalization = {
      ...basePersonalization,
      ...industryInsights,
      ...painPoints,
      ...benefits,
      ...socialProof,
      ...urgencyTriggers,
      ...customInsights,
      personalization_depth: depthScore,
      personalization_level: personalizationLevel,
      generated_at: new Date().toISOString()
    };

    return personalization;
  }

  /**
   * Get industry-specific insights
   */
  async getIndustryInsights(industry) {
    // Industry-specific insights database
    const insights = {
      'Technology': {
        primary_pain_point: 'cash flow management during rapid scaling',
        secondary_pain_point: 'managing international payments and multi-currency operations',
        key_benefit: 'streamlined financial operations that scale with your growth',
        typical_challenge: 'balancing innovation speed with financial controls',
        industry_stat: '78% of UAE tech companies cite cash flow as their #1 challenge',
        relevant_solution: 'automated payment processing and real-time financial dashboards'
      },
      'Retail': {
        primary_pain_point: 'inventory financing and seasonal cash flow gaps',
        secondary_pain_point: 'managing multiple payment channels and reconciliation',
        key_benefit: 'working capital solutions that match your inventory cycles',
        typical_challenge: 'maintaining healthy inventory levels without tying up cash',
        industry_stat: 'Retail businesses in UAE spend 15 hours/week on financial admin',
        relevant_solution: 'inventory-backed financing and automated reconciliation'
      },
      'Healthcare': {
        primary_pain_point: 'equipment financing and regulatory compliance costs',
        secondary_pain_point: 'managing insurance claim cycles and cash flow timing',
        key_benefit: 'specialized healthcare financing with flexible repayment terms',
        typical_challenge: 'high capital requirements for medical equipment',
        industry_stat: '65% of UAE healthcare providers need equipment financing',
        relevant_solution: 'medical equipment leasing and receivables financing'
      },
      'Manufacturing': {
        primary_pain_point: 'supply chain financing and working capital management',
        secondary_pain_point: 'managing import/export payments and currency risk',
        key_benefit: 'supply chain financing that accelerates your production cycles',
        typical_challenge: 'long payment cycles from suppliers and customers',
        industry_stat: 'UAE manufacturers cite 45-day average payment cycles',
        relevant_solution: 'supply chain finance and trade credit insurance'
      },
      'Real Estate': {
        primary_pain_point: 'project financing and development capital',
        secondary_pain_point: 'managing construction timelines and payment schedules',
        key_benefit: 'structured financing aligned with project milestones',
        typical_challenge: 'matching funding to construction stages',
        industry_stat: 'Real estate projects in UAE require 30-40% pre-financing',
        relevant_solution: 'project-based financing with milestone-linked disbursement'
      }
    };

    return insights[industry] || {
      primary_pain_point: 'optimizing financial operations and cash flow',
      key_benefit: 'enhanced financial efficiency and operational flexibility',
      relevant_solution: 'comprehensive business banking solutions'
    };
  }

  /**
   * Generate contextual pain points
   */
  generatePainPoints(company, contact, context) {
    const painPoints = [];

    // Company size-based pain points
    if (company.size_bucket === 'enterprise') {
      painPoints.push('managing complex multi-entity financial operations');
      painPoints.push('ensuring compliance across multiple jurisdictions');
    } else if (company.size_bucket === 'midsize') {
      painPoints.push('scaling operations while maintaining financial control');
      painPoints.push('competing with larger players for market share');
    } else if (company.size_bucket === 'startup') {
      painPoints.push('maximizing runway and managing burn rate');
      painPoints.push('establishing credibility with enterprise clients');
    }

    // Quality score-based pain points
    if (context.quality_score >= 80) {
      painPoints.push('optimizing for strategic growth, not just survival');
    } else if (context.quality_score < 50) {
      painPoints.push('establishing sustainable financial foundations');
    }

    // License type-based
    if (company.license_type === 'Free Zone') {
      painPoints.push('leveraging free zone benefits for international expansion');
    }

    return {
      pain_point_primary: painPoints[0] || 'financial operational efficiency',
      pain_point_secondary: painPoints[1],
      pain_points_list: painPoints
    };
  }

  /**
   * Generate contextual benefits
   */
  generateBenefits(company, contact, context) {
    const benefits = [];

    // ROI-focused benefits
    if (company.size_bucket === 'enterprise') {
      benefits.push('reduce financial operations costs by 25-35%');
      benefits.push('accelerate month-end close by 40%');
      benefits.push('improve cash visibility across all entities');
    } else if (company.size_bucket === 'midsize') {
      benefits.push('save 15-20 hours per week on financial admin');
      benefits.push('improve cash flow predictability by 30%');
      benefits.push('scale without adding finance headcount');
    } else {
      benefits.push('reduce banking costs by up to 40%');
      benefits.push('access working capital in 24-48 hours');
      benefits.push('focus on growth, not financial paperwork');
    }

    // Industry-specific benefits
    if (company.industry === 'Technology') {
      benefits.push('integrate seamlessly with your tech stack');
    }

    return {
      benefit_primary: benefits[0] || 'enhanced financial efficiency',
      benefit_secondary: benefits[1],
      benefits_list: benefits,
      roi_timeframe: company.size_bucket === 'enterprise' ? '6 months' : '90 days'
    };
  }

  /**
   * Generate social proof
   */
  generateSocialProof(company, context) {
    const proof = {};

    // Industry-specific social proof
    if (company.industry) {
      proof.similar_customers = `${this.getIndustryCount(company.industry)}+ ${company.industry} companies`;
      proof.case_study = `How a leading ${company.industry} company improved cash flow by 35%`;
    }

    // Size-specific social proof
    if (company.size_bucket === 'enterprise') {
      proof.enterprise_clients = '200+ enterprise clients across UAE';
      proof.transaction_volume = 'AED 50B+ in annual transaction volume';
    } else if (company.size_bucket === 'midsize') {
      proof.midsize_focus = '500+ midsize businesses trust our solutions';
    } else {
      proof.startup_support = '1,000+ startups launched with our support';
    }

    return proof;
  }

  /**
   * Generate urgency triggers
   */
  generateUrgencyTriggers(company, context) {
    const triggers = {};

    // Fiscal calendar urgency
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    triggers.quarter = `Q${quarter} ${now.getFullYear()}`;

    // Create seasonal urgency
    if (quarter === 4) {
      triggers.urgency_message = 'Year-end planning opportunity';
      triggers.timing_reason = 'Optimize tax planning before year-end';
    } else if (quarter === 1) {
      triggers.urgency_message = 'Fresh start for annual growth';
      triggers.timing_reason = 'Set up financial infrastructure for the year';
    }

    // Market-based urgency
    if (context.timing_score && context.timing_score >= 75) {
      triggers.timing_optimal = true;
      triggers.timing_message = 'Optimal timing based on your company activity';
    }

    // Limited offer framework
    triggers.meeting_day = this.suggestMeetingDay();
    triggers.meeting_time = '10:00 AM or 2:00 PM';

    return triggers;
  }

  /**
   * Calculate personalization depth score
   */
  calculateDepthScore(params) {
    let score = 0;

    // Base data (20 points)
    if (params.company && params.contact) score += 20;

    // Industry insights (20 points)
    if (params.industryInsights) score += 20;

    // Pain points (20 points)
    if (params.painPoints && params.painPoints.pain_points_list?.length > 0) {
      score += params.painPoints.pain_points_list.length * 5;
    }

    // Benefits (20 points)
    if (params.benefits && params.benefits.benefits_list?.length > 0) {
      score += params.benefits.benefits_list.length * 5;
    }

    // Context richness (20 points)
    const contextKeys = Object.keys(params.context || {});
    score += Math.min(20, contextKeys.length * 2);

    return Math.min(100, score);
  }

  /**
   * Generate AI-powered custom insights
   */
  async generateCustomInsights(params) {
    const { company, contact, context, industryInsights } = params;

    const insights = {};

    // Competitive positioning insight
    insights.competitive_angle = this.generateCompetitiveAngle(company);

    // Growth stage insight
    insights.growth_stage_message = this.generateGrowthStageMessage(company, context);

    // Timing insight
    insights.timing_insight = this.generateTimingInsight(company, context);

    // Personalized hook
    insights.opening_hook = this.generateOpeningHook(company, contact, industryInsights);

    // Custom value proposition
    insights.custom_value_prop = this.generateCustomValueProp(company, context);

    return insights;
  }

  /**
   * Generate competitive angle
   */
  generateCompetitiveAngle(company) {
    if (company.size_bucket === 'startup') {
      return 'Unlike traditional banks, we understand startup dynamics and move at startup speed';
    } else if (company.size_bucket === 'enterprise') {
      return 'Enterprise-grade banking with the agility of a fintech';
    } else {
      return 'The perfect balance of banking strength and digital innovation';
    }
  }

  /**
   * Generate growth stage message
   */
  generateGrowthStageMessage(company, context) {
    if (context.quality_score >= 80) {
      return `Your company's strong market position deserves a banking partner that matches your ambition`;
    } else if (context.quality_score >= 50) {
      return `We help growing companies like ${company.company_name} reach the next level`;
    } else {
      return `Building a strong financial foundation is key to sustainable growth`;
    }
  }

  /**
   * Generate timing insight
   */
  generateTimingInsight(company, context) {
    if (context.recent_hiring) {
      return 'I noticed your team is expanding - perfect time to optimize payroll and banking';
    } else if (context.funding_event) {
      return 'Congratulations on your recent funding - let\'s make that capital work harder';
    } else {
      return `${this.getSeasonalInsight()} is an ideal time to review banking relationships`;
    }
  }

  /**
   * Generate opening hook
   */
  generateOpeningHook(company, contact, industryInsights) {
    const hooks = [
      `${contact.first_name}, I've been following ${company.company_name}'s growth in the ${company.industry} sector`,
      `Quick question for you, ${contact.first_name}: ${industryInsights.typical_challenge}?`,
      `${company.company_name} caught my attention as one of the innovative ${company.industry} companies in UAE`
    ];

    return hooks[Math.floor(Math.random() * hooks.length)];
  }

  /**
   * Generate custom value proposition
   */
  generateCustomValueProp(company, context) {
    const size = company.size_bucket;
    const industry = company.industry;

    return `We help ${size === 'enterprise' ? 'leading' : 'growing'} ${industry} companies ${
      size === 'enterprise' ? 'optimize complex operations' : 'scale efficiently'
    } through intelligent banking solutions`;
  }

  /**
   * Helper: Get industry customer count
   */
  getIndustryCount(industry) {
    const counts = {
      'Technology': 300,
      'Retail': 450,
      'Healthcare': 200,
      'Manufacturing': 250,
      'Real Estate': 180
    };
    return counts[industry] || 150;
  }

  /**
   * Helper: Suggest meeting day
   */
  suggestMeetingDay() {
    const daysAhead = 3;
    const future = new Date();
    future.setDate(future.getDate() + daysAhead);

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[future.getDay()];
  }

  /**
   * Helper: Get seasonal insight
   */
  getSeasonalInsight() {
    const month = new Date().getMonth();

    if (month === 0 || month === 11) return 'The new year';
    if (month >= 3 && month <= 5) return 'Q2';
    if (month >= 6 && month <= 8) return 'Mid-year';
    return 'Q4';
  }

  /**
   * Get personalization templates
   */
  async getPersonalizationTemplates(industry, companySize) {
    const query = `
      SELECT
        template_type,
        template_text,
        variables,
        usage_count,
        avg_performance_score
      FROM voice_templates
      WHERE
        category = $1
        AND (target_company_size = $2 OR target_company_size IS NULL)
        AND is_active = TRUE
      ORDER BY avg_performance_score DESC NULLS LAST
      LIMIT 10
    `;

    const result = await this.pool.query(query, [industry, companySize]);
    return result.rows;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default OutreachPersonalizationService;
