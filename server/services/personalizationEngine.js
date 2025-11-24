/**
 * Personalization Engine
 * Sprint 32 - Task 6
 *
 * Provides industry-specific, company-specific, and contact-specific
 * personalization for outreach messages
 */

class PersonalizationEngine {
  constructor() {
    // Industry-specific pain points and solutions
    this.industryProfiles = {
      'Technology': {
        pain_points: [
          'cash flow management during rapid growth',
          'payroll processing for distributed teams',
          'multi-currency payments for global vendors'
        ],
        solutions: [
          'automated payroll with same-day processing',
          'real-time FX hedging for vendor payments',
          'integrated cash flow forecasting'
        ],
        tone: 'professional',
        typical_products: ['Payroll Services', 'Treasury Management', 'FX Solutions']
      },
      'Retail': {
        pain_points: [
          'inventory financing constraints',
          'payment processing fees',
          'seasonal cash flow gaps'
        ],
        solutions: [
          'inventory credit lines with flexible terms',
          'low-cost payment gateway integration',
          'working capital financing for peak seasons'
        ],
        tone: 'professional',
        typical_products: ['Working Capital Loans', 'Merchant Services', 'Trade Finance']
      },
      'Healthcare': {
        pain_points: [
          'equipment financing for upgrades',
          'insurance claim payment delays',
          'compliance and regulatory costs'
        ],
        solutions: [
          'equipment lease financing with flexible terms',
          'receivables financing against insurance claims',
          'dedicated healthcare banking team'
        ],
        tone: 'formal',
        typical_products: ['Equipment Finance', 'Receivables Finance', 'Business Accounts']
      },
      'Manufacturing': {
        pain_points: [
          'supply chain financing gaps',
          'raw material cost volatility',
          'working capital for production cycles'
        ],
        solutions: [
          'supply chain finance programs',
          'commodity hedging solutions',
          'revolving credit for inventory'
        ],
        tone: 'professional',
        typical_products: ['Supply Chain Finance', 'Working Capital', 'Trade Finance']
      },
      'Real Estate': {
        pain_points: [
          'project financing constraints',
          'property development funding gaps',
          'tenant deposit management'
        ],
        solutions: [
          'construction finance with stage disbursement',
          'bridging loans for development',
          'escrow account management'
        ],
        tone: 'formal',
        typical_products: ['Project Finance', 'Bridging Loans', 'Corporate Banking']
      },
      'default': {
        pain_points: [
          'cash flow management',
          'payment processing efficiency',
          'banking relationship complexity'
        ],
        solutions: [
          'streamlined banking operations',
          'integrated financial services',
          'dedicated relationship manager'
        ],
        tone: 'professional',
        typical_products: ['Business Banking', 'Payment Solutions', 'Corporate Services']
      }
    };

    // Contact tier personalization
    this.tierStrategies = {
      'STRATEGIC': {
        approach: 'high-touch',
        focus: 'strategic partnership and growth enablement',
        cta_type: 'executive briefing',
        value_prop_style: 'ROI and strategic impact',
        follow_up_cadence: 'weekly'
      },
      'PRIORITY': {
        approach: 'solution-focused',
        focus: 'operational efficiency and cost savings',
        cta_type: 'solution demo',
        value_prop_style: 'efficiency gains and time savings',
        follow_up_cadence: 'bi-weekly'
      },
      'STANDARD': {
        approach: 'educational',
        focus: 'product features and benefits',
        cta_type: 'resource sharing',
        value_prop_style: 'feature benefits and ease of use',
        follow_up_cadence: 'monthly'
      }
    };

    // Company size personalization
    this.sizeProfiles = {
      'enterprise': {
        decision_cycle: '3-6 months',
        stakeholders: 'CFO, Treasury, Procurement',
        complexity: 'high',
        customization_needed: true
      },
      'midsize': {
        decision_cycle: '1-3 months',
        stakeholders: 'Finance Manager, Operations',
        complexity: 'medium',
        customization_needed: false
      },
      'startup': {
        decision_cycle: '2-4 weeks',
        stakeholders: 'Founder, CFO',
        complexity: 'low',
        customization_needed: false
      }
    };
  }

  // ═══════════════════════════════════════════════════════════
  // INDUSTRY PERSONALIZATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Get industry-specific personalization
   */
  getIndustryPersonalization(industry) {
    const profile = this.industryProfiles[industry] || this.industryProfiles['default'];

    return {
      industry,
      pain_points: profile.pain_points,
      solutions: profile.solutions,
      recommended_tone: profile.tone,
      typical_products: profile.typical_products
    };
  }

  /**
   * Select best pain point based on company signals
   */
  selectPainPoint(industry, companySignals = {}) {
    const profile = this.industryProfiles[industry] || this.industryProfiles['default'];

    // Default to first pain point
    let selectedPainPoint = profile.pain_points[0];

    // Customize based on signals
    if (companySignals.hiring_signals && companySignals.hiring_signals.includes('hiring')) {
      // Growth phase - focus on scaling pain points
      selectedPainPoint = profile.pain_points[0];
    } else if (companySignals.financial_signals && companySignals.financial_signals.includes('funding')) {
      // Recently funded - focus on deployment pain points
      selectedPainPoint = profile.pain_points[1] || profile.pain_points[0];
    }

    return selectedPainPoint;
  }

  // ═══════════════════════════════════════════════════════════
  // COMPANY PERSONALIZATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate company-specific personalization
   */
  generateCompanyPersonalization(company) {
    const {
      company_name,
      industry,
      size,
      license_type,
      growth_signals = [],
      hiring_signals = [],
      recent_news = []
    } = company;

    const industryProfile = this.getIndustryPersonalization(industry);
    const sizeProfile = this.sizeProfiles[size] || this.sizeProfiles['midsize'];

    // Build personalization hooks
    const hooks = [];

    // Growth signals
    if (growth_signals.length > 0) {
      hooks.push(`noticed your recent ${growth_signals[0]}`);
    }

    // Hiring signals
    if (hiring_signals.length > 0) {
      hooks.push(`saw you're expanding your team with ${hiring_signals[0]}`);
    }

    // Recent news
    if (recent_news.length > 0) {
      hooks.push(`read about ${recent_news[0]}`);
    }

    // Free zone specifics
    if (license_type === 'Free Zone') {
      hooks.push('as a Free Zone company, you likely need multi-currency support');
    }

    return {
      company_name,
      industry_pain_point: this.selectPainPoint(industry, { hiring_signals, growth_signals }),
      recommended_solution: industryProfile.solutions[0],
      personalization_hooks: hooks,
      decision_cycle: sizeProfile.decision_cycle,
      stakeholders: sizeProfile.stakeholders,
      recommended_tone: industryProfile.recommended_tone
    };
  }

  // ═══════════════════════════════════════════════════════════
  // CONTACT PERSONALIZATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate contact-specific personalization
   */
  generateContactPersonalization(contact, companyTier) {
    const {
      contact_name,
      title,
      contact_tier,
      linkedin_headline,
      linkedin_about,
      recent_activity
    } = contact;

    const tierStrategy = this.tierStrategies[contact_tier] || this.tierStrategies['STANDARD'];

    // Extract personalization from LinkedIn data
    const hooks = [];

    if (linkedin_headline) {
      hooks.push(`noticed your focus on ${this.extractKeyPhrase(linkedin_headline)}`);
    }

    if (recent_activity) {
      hooks.push(`saw your recent post about ${this.extractKeyPhrase(recent_activity)}`);
    }

    // Role-specific hooks
    const roleHooks = this.getRoleSpecificHooks(title);
    hooks.push(...roleHooks);

    return {
      contact_name,
      title,
      approach: tierStrategy.approach,
      focus_area: tierStrategy.focus,
      cta_type: tierStrategy.cta_type,
      value_prop_style: tierStrategy.value_prop_style,
      follow_up_cadence: tierStrategy.follow_up_cadence,
      personalization_hooks: hooks,
      opening_style: contact_tier === 'STRATEGIC' ? 'executive_insight' : 'value_focused'
    };
  }

  /**
   * Get role-specific hooks
   */
  getRoleSpecificHooks(title) {
    const titleLower = (title || '').toLowerCase();

    if (titleLower.includes('cfo') || titleLower.includes('finance director')) {
      return ['financial efficiency and cost optimization'];
    }

    if (titleLower.includes('ceo') || titleLower.includes('founder')) {
      return ['strategic growth and scaling operations'];
    }

    if (titleLower.includes('operations') || titleLower.includes('ops')) {
      return ['operational efficiency and process automation'];
    }

    if (titleLower.includes('hr') || titleLower.includes('people')) {
      return ['employee onboarding and payroll efficiency'];
    }

    return ['banking services that save time and reduce complexity'];
  }

  /**
   * Extract key phrase from text (simple implementation)
   */
  extractKeyPhrase(text) {
    if (!text) return 'business growth';

    // Remove common words and extract meaningful phrase
    const words = text.split(' ').filter(w =>
      !['the', 'a', 'an', 'is', 'are', 'at', 'in', 'on'].includes(w.toLowerCase())
    );

    // Return first 3-4 meaningful words
    return words.slice(0, 4).join(' ').toLowerCase();
  }

  // ═══════════════════════════════════════════════════════════
  // COMPLETE PERSONALIZATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate complete personalization profile
   * Combines industry, company, and contact personalization
   */
  generatePersonalizationProfile(input) {
    const { company, contact } = input;

    const industryPersonalization = this.getIndustryPersonalization(company.industry);
    const companyPersonalization = this.generateCompanyPersonalization(company);
    const contactPersonalization = this.generateContactPersonalization(contact, company.tier || 'QUALIFIED');

    return {
      // Industry layer
      industry: industryPersonalization,

      // Company layer
      company: companyPersonalization,

      // Contact layer
      contact: contactPersonalization,

      // Combined recommendations
      recommendations: {
        tone: companyPersonalization.recommended_tone,
        opening_hook: contactPersonalization.personalization_hooks[0] || companyPersonalization.personalization_hooks[0],
        pain_point: companyPersonalization.industry_pain_point,
        solution: companyPersonalization.recommended_solution,
        cta: contactPersonalization.cta_type,
        follow_up_strategy: contactPersonalization.follow_up_cadence
      },

      // Metadata
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Apply personalization to message template
   */
  personalizeMessage(template, personalization) {
    const { company, contact, recommendations } = personalization;

    let personalized = template;

    // Replace placeholders
    const replacements = {
      company_name: company.company_name,
      contact_name: contact.contact_name,
      opening_hook: recommendations.opening_hook,
      pain_point: recommendations.pain_point,
      solution: recommendations.recommended_solution,
      cta: this.getCTAText(recommendations.cta)
    };

    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      personalized = personalized.replace(regex, value);
    }

    return personalized;
  }

  /**
   * Get CTA text based on type
   */
  getCTAText(ctaType) {
    const ctas = {
      'executive_briefing': 'Would you be open to a brief 15-minute conversation to explore how we can support your strategic objectives?',
      'solution_demo': 'I would love to show you a quick demo of how this works. Would next week work for a 20-minute call?',
      'resource_sharing': 'I have a resource that might be helpful. Can I share it with you?'
    };

    return ctas[ctaType] || ctas['solution_demo'];
  }
}

module.exports = { PersonalizationEngine };
