/**
 * Vertical Engine
 * Sprint 70: Vertical Engine Shell
 *
 * Industry-specific configuration engine for:
 * - Banking (Employee/Corporate)
 * - Insurance (Individual/Corporate)
 * - Recruitment (Hiring Manager/Candidate)
 * - SaaS (B2B/B2C)
 * - Real Estate (Commercial/Residential)
 * - Healthcare (Provider/Payer)
 */

import { pool } from '../../utils/db.js';
import * as Sentry from '@sentry/node';

// ==========================================
// Vertical Definitions
// ==========================================

export const VERTICALS = {
  BANKING_EMPLOYEE: 'banking_employee',
  BANKING_CORPORATE: 'banking_corporate',
  INSURANCE_INDIVIDUAL: 'insurance_individual',
  INSURANCE_CORPORATE: 'insurance_corporate',
  RECRUITMENT_HIRING: 'recruitment_hiring',
  RECRUITMENT_CANDIDATE: 'recruitment_candidate',
  SAAS_B2B: 'saas_b2b',
  SAAS_B2C: 'saas_b2c',
  REAL_ESTATE_COMMERCIAL: 'real_estate_commercial',
  REAL_ESTATE_RESIDENTIAL: 'real_estate_residential',
  HEALTHCARE_PROVIDER: 'healthcare_provider',
  HEALTHCARE_PAYER: 'healthcare_payer'
};

// ==========================================
// Vertical Configurations
// ==========================================

const VERTICAL_CONFIGS = {
  [VERTICALS.BANKING_EMPLOYEE]: {
    name: 'Banking - Employee Banking',
    description: 'B2B2C: Target companies to offer employee banking packages',
    category: 'banking',
    subcategory: 'employee',
    entityType: 'company',

    // Scoring profile
    scoring: {
      profile: 'banking_employee',
      weights: { q_score: 0.25, t_score: 0.35, l_score: 0.20, e_score: 0.20 },
      thresholds: { hot: 80, warm: 60, cold: 40 }
    },

    // Discovery configuration
    discovery: {
      preferredSources: ['news', 'linkedin', 'glassdoor'],
      signalTypes: ['hiring', 'expansion', 'funding', 'leadership_change'],
      keywords: ['employee benefits', 'workforce', 'HR', 'payroll', 'compensation'],
      minEmployees: 50,
      targetIndustries: ['technology', 'finance', 'healthcare', 'manufacturing', 'retail']
    },

    // Enrichment priority
    enrichment: {
      priorityFields: ['employee_count', 'locations', 'industry', 'hr_contact'],
      sources: ['clearbit', 'zoominfo', 'linkedin']
    },

    // Outreach configuration
    outreach: {
      tone: 'professional',
      formality: 'formal',
      channels: ['email', 'linkedin'],
      keyMessages: [
        'Employee financial wellness',
        'Competitive banking benefits',
        'Simplified payroll integration'
      ],
      painPoints: [
        'Employee retention challenges',
        'Benefits administration complexity',
        'Financial wellness programs'
      ]
    },

    // UAE-specific
    uaeConfig: {
      enabled: true,
      boost: 15,
      targetEmirates: ['Dubai', 'Abu Dhabi', 'Sharjah'],
      freeZones: ['DIFC', 'ADGM', 'JAFZA', 'DAFZA']
    }
  },

  [VERTICALS.BANKING_CORPORATE]: {
    name: 'Banking - Corporate Banking',
    description: 'B2B: Target companies for corporate banking services',
    category: 'banking',
    subcategory: 'corporate',
    entityType: 'company',

    scoring: {
      profile: 'banking_corporate',
      weights: { q_score: 0.35, t_score: 0.20, l_score: 0.25, e_score: 0.20 },
      thresholds: { hot: 85, warm: 65, cold: 45 }
    },

    discovery: {
      preferredSources: ['sec', 'news', 'linkedin'],
      signalTypes: ['funding', 'acquisition', 'expansion', 'ipo'],
      keywords: ['treasury', 'cash management', 'trade finance', 'forex'],
      minRevenue: 10000000,
      targetIndustries: ['manufacturing', 'trading', 'logistics', 'technology']
    },

    enrichment: {
      priorityFields: ['revenue', 'funding', 'financial_data', 'executive_contacts'],
      sources: ['clearbit', 'crunchbase', 'sec']
    },

    outreach: {
      tone: 'executive',
      formality: 'formal',
      channels: ['email', 'phone'],
      keyMessages: [
        'Sophisticated treasury solutions',
        'Global trade finance expertise',
        'Dedicated relationship management'
      ],
      painPoints: [
        'Cash flow optimization',
        'International expansion banking needs',
        'Risk management'
      ]
    },

    uaeConfig: {
      enabled: true,
      boost: 20,
      targetEmirates: ['Dubai', 'Abu Dhabi'],
      freeZones: ['DIFC', 'ADGM']
    }
  },

  [VERTICALS.INSURANCE_INDIVIDUAL]: {
    name: 'Insurance - Individual Coverage',
    description: 'B2C: Target individuals for personal insurance products',
    category: 'insurance',
    subcategory: 'individual',
    entityType: 'individual',

    scoring: {
      profile: 'insurance_individual',
      weights: { q_score: 0.20, t_score: 0.35, l_score: 0.30, e_score: 0.15 },
      thresholds: { hot: 75, warm: 55, cold: 35 }
    },

    discovery: {
      preferredSources: ['linkedin', 'news'],
      signalTypes: ['job_change', 'life_event', 'relocation'],
      keywords: ['insurance', 'health coverage', 'life insurance', 'family'],
      minSeniority: 'manager',
      targetTitles: ['manager', 'director', 'vp', 'c-level']
    },

    enrichment: {
      priorityFields: ['title', 'company', 'seniority', 'location', 'income_estimate'],
      sources: ['linkedin', 'clearbit']
    },

    outreach: {
      tone: 'friendly',
      formality: 'casual',
      channels: ['email', 'sms'],
      keyMessages: [
        'Peace of mind for your family',
        'Comprehensive coverage options',
        'Competitive rates'
      ],
      painPoints: [
        'Coverage gaps',
        'Rising healthcare costs',
        'Family protection'
      ]
    },

    uaeConfig: {
      enabled: true,
      boost: 10,
      targetEmirates: ['Dubai', 'Abu Dhabi', 'Sharjah'],
      freeZones: []
    }
  },

  [VERTICALS.RECRUITMENT_HIRING]: {
    name: 'Recruitment - Hiring Companies',
    description: 'B2B: Target companies with active hiring needs',
    category: 'recruitment',
    subcategory: 'hiring',
    entityType: 'company',

    scoring: {
      profile: 'recruitment_hiring',
      weights: { q_score: 0.20, t_score: 0.40, l_score: 0.20, e_score: 0.20 },
      thresholds: { hot: 80, warm: 55, cold: 30 }
    },

    discovery: {
      preferredSources: ['linkedin', 'glassdoor', 'news'],
      signalTypes: ['hiring', 'job_posting', 'expansion', 'funding'],
      keywords: ['hiring', 'recruiting', 'talent', 'team growth', 'open positions'],
      minOpenPositions: 3,
      targetIndustries: ['technology', 'finance', 'healthcare', 'consulting']
    },

    enrichment: {
      priorityFields: ['open_positions', 'hiring_velocity', 'hr_contacts', 'growth_rate'],
      sources: ['linkedin', 'glassdoor', 'indeed']
    },

    outreach: {
      tone: 'consultative',
      formality: 'professional',
      channels: ['email', 'linkedin', 'phone'],
      keyMessages: [
        'Access to qualified talent pool',
        'Reduce time-to-hire',
        'Industry-specific expertise'
      ],
      painPoints: [
        'Talent shortage',
        'Long hiring cycles',
        'High turnover'
      ]
    },

    uaeConfig: {
      enabled: true,
      boost: 15,
      targetEmirates: ['Dubai', 'Abu Dhabi'],
      freeZones: ['DIFC', 'DAFZA', 'DMCC']
    }
  },

  [VERTICALS.SAAS_B2B]: {
    name: 'SaaS - B2B Sales',
    description: 'B2B: Target companies for SaaS solutions',
    category: 'saas',
    subcategory: 'b2b',
    entityType: 'company',

    scoring: {
      profile: 'saas_b2b',
      weights: { q_score: 0.30, t_score: 0.25, l_score: 0.30, e_score: 0.15 },
      thresholds: { hot: 80, warm: 60, cold: 40 }
    },

    discovery: {
      preferredSources: ['g2', 'news', 'linkedin'],
      signalTypes: ['tech_adoption', 'funding', 'expansion', 'leadership_change'],
      keywords: ['digital transformation', 'automation', 'efficiency', 'software'],
      minEmployees: 20,
      targetIndustries: ['technology', 'finance', 'healthcare', 'retail', 'manufacturing']
    },

    enrichment: {
      priorityFields: ['technologies', 'tech_stack', 'it_budget', 'decision_makers'],
      sources: ['clearbit', 'builtwith', 'linkedin']
    },

    outreach: {
      tone: 'value-driven',
      formality: 'professional',
      channels: ['email', 'linkedin'],
      keyMessages: [
        'Increase operational efficiency',
        'ROI within 6 months',
        'Seamless integration'
      ],
      painPoints: [
        'Manual processes',
        'Siloed data',
        'Scalability challenges'
      ]
    },

    uaeConfig: {
      enabled: true,
      boost: 10,
      targetEmirates: ['Dubai', 'Abu Dhabi'],
      freeZones: ['DIFC', 'Dubai Internet City', 'Dubai Silicon Oasis']
    }
  }
};

// Default configuration for unknown verticals
const DEFAULT_VERTICAL_CONFIG = {
  name: 'Default',
  description: 'Default vertical configuration',
  category: 'general',
  subcategory: 'default',
  entityType: 'company',

  scoring: {
    profile: 'default',
    weights: { q_score: 0.30, t_score: 0.25, l_score: 0.25, e_score: 0.20 },
    thresholds: { hot: 80, warm: 60, cold: 40 }
  },

  discovery: {
    preferredSources: ['news', 'linkedin'],
    signalTypes: ['hiring', 'expansion', 'funding'],
    keywords: [],
    minEmployees: 10,
    targetIndustries: []
  },

  enrichment: {
    priorityFields: ['domain', 'industry', 'employee_count'],
    sources: ['clearbit', 'linkedin']
  },

  outreach: {
    tone: 'professional',
    formality: 'professional',
    channels: ['email'],
    keyMessages: [],
    painPoints: []
  },

  uaeConfig: {
    enabled: false,
    boost: 0,
    targetEmirates: [],
    freeZones: []
  }
};

// ==========================================
// Vertical Engine Class
// ==========================================

export class VerticalEngine {
  constructor(tenantId) {
    this.tenantId = tenantId || '00000000-0000-0000-0000-000000000001';
    this.customConfigs = new Map();
  }

  /**
   * Get vertical configuration
   */
  getConfig(verticalId) {
    // Check for custom tenant config first
    if (this.customConfigs.has(verticalId)) {
      return this.customConfigs.get(verticalId);
    }

    // Return built-in config or default
    return VERTICAL_CONFIGS[verticalId] || { ...DEFAULT_VERTICAL_CONFIG, id: verticalId };
  }

  /**
   * Get all available verticals
   */
  getAllVerticals() {
    const verticals = [];

    for (const [id, config] of Object.entries(VERTICAL_CONFIGS)) {
      verticals.push({
        id,
        name: config.name,
        description: config.description,
        category: config.category,
        subcategory: config.subcategory,
        entityType: config.entityType
      });
    }

    // Add custom verticals
    for (const [id, config] of this.customConfigs.entries()) {
      if (!VERTICAL_CONFIGS[id]) {
        verticals.push({
          id,
          name: config.name,
          description: config.description,
          category: config.category,
          subcategory: config.subcategory,
          entityType: config.entityType,
          isCustom: true
        });
      }
    }

    return verticals;
  }

  /**
   * Get verticals by category
   */
  getVerticalsByCategory(category) {
    return this.getAllVerticals().filter(v => v.category === category);
  }

  /**
   * Get scoring configuration for vertical
   */
  getScoringConfig(verticalId) {
    const config = this.getConfig(verticalId);
    return config.scoring;
  }

  /**
   * Get discovery configuration for vertical
   */
  getDiscoveryConfig(verticalId) {
    const config = this.getConfig(verticalId);
    return config.discovery;
  }

  /**
   * Get enrichment configuration for vertical
   */
  getEnrichmentConfig(verticalId) {
    const config = this.getConfig(verticalId);
    return config.enrichment;
  }

  /**
   * Get outreach configuration for vertical
   */
  getOutreachConfig(verticalId) {
    const config = this.getConfig(verticalId);
    return config.outreach;
  }

  /**
   * Get UAE configuration for vertical
   */
  getUAEConfig(verticalId) {
    const config = this.getConfig(verticalId);
    return config.uaeConfig;
  }

  /**
   * Create custom vertical configuration
   */
  async createCustomVertical(id, config) {
    const fullConfig = {
      ...DEFAULT_VERTICAL_CONFIG,
      ...config,
      id,
      isCustom: true,
      tenantId: this.tenantId
    };

    this.customConfigs.set(id, fullConfig);

    // Persist to database
    try {
      await pool.query(
        `INSERT INTO vertical_engine_configs (
          id, tenant_id, vertical_id, config, is_active, created_at
        ) VALUES (gen_random_uuid(), $1, $2, $3, true, NOW())
        ON CONFLICT (tenant_id, vertical_id) DO UPDATE SET
          config = EXCLUDED.config, updated_at = NOW()`,
        [this.tenantId, id, JSON.stringify(fullConfig)]
      );
    } catch (error) {
      Sentry.captureException(error);
      console.error('[VerticalEngine] Error persisting custom vertical:', error);
    }

    return fullConfig;
  }

  /**
   * Load custom verticals from database
   */
  async loadCustomVerticals() {
    try {
      const result = await pool.query(
        `SELECT vertical_id, config FROM vertical_engine_configs
         WHERE tenant_id = $1 AND is_active = true`,
        [this.tenantId]
      );

      for (const row of result.rows) {
        this.customConfigs.set(row.vertical_id, row.config);
      }

      return this.customConfigs.size;
    } catch (error) {
      Sentry.captureException(error);
      console.error('[VerticalEngine] Error loading custom verticals:', error);
      return 0;
    }
  }

  /**
   * Apply vertical configuration to entities
   */
  applyVerticalConfig(entities, verticalId) {
    const config = this.getConfig(verticalId);

    return entities.map(entity => ({
      ...entity,
      verticalId,
      verticalConfig: {
        scoringProfile: config.scoring.profile,
        weights: config.scoring.weights,
        outreachTone: config.outreach.tone,
        outreachChannels: config.outreach.channels
      },
      uaeBoost: config.uaeConfig.enabled && this.isUAEEntity(entity) ? config.uaeConfig.boost : 0
    }));
  }

  /**
   * Check if entity is UAE-based
   */
  isUAEEntity(entity) {
    if (!entity) return false;

    const locations = entity.locations || [];
    const country = entity.country || '';
    const emirate = entity.emirate || '';

    const uaeKeywords = ['UAE', 'Dubai', 'Abu Dhabi', 'Sharjah', 'United Arab Emirates', 'Ajman', 'RAK', 'Fujairah'];

    // Check locations array
    for (const loc of locations) {
      if (typeof loc === 'string') {
        for (const keyword of uaeKeywords) {
          if (loc.toLowerCase().includes(keyword.toLowerCase())) {
            return true;
          }
        }
      }
    }

    // Check country
    if (country.toLowerCase().includes('uae') || country.toLowerCase().includes('emirates')) {
      return true;
    }

    // Check emirate
    if (emirate && uaeKeywords.some(k => emirate.toLowerCase().includes(k.toLowerCase()))) {
      return true;
    }

    return false;
  }

  /**
   * Get recommended verticals for entity
   */
  recommendVerticals(entity) {
    const recommendations = [];

    for (const [id, config] of Object.entries(VERTICAL_CONFIGS)) {
      let score = 0;
      const reasons = [];

      // Check entity type match
      if (config.entityType === entity.type) {
        score += 30;
        reasons.push('entity_type_match');
      }

      // Check industry match
      if (entity.industry && config.discovery.targetIndustries?.includes(entity.industry.toLowerCase())) {
        score += 25;
        reasons.push('industry_match');
      }

      // Check employee count match
      if (config.discovery.minEmployees && entity.employeeCount >= config.discovery.minEmployees) {
        score += 15;
        reasons.push('size_match');
      }

      // Check UAE match
      if (config.uaeConfig.enabled && this.isUAEEntity(entity)) {
        score += 20;
        reasons.push('uae_match');
      }

      // Check keywords match
      const entityText = `${entity.name} ${entity.description || ''} ${entity.industry || ''}`.toLowerCase();
      const matchingKeywords = (config.discovery.keywords || []).filter(k =>
        entityText.includes(k.toLowerCase())
      );
      if (matchingKeywords.length > 0) {
        score += Math.min(10 * matchingKeywords.length, 20);
        reasons.push(`keyword_match:${matchingKeywords.length}`);
      }

      if (score > 0) {
        recommendations.push({
          verticalId: id,
          verticalName: config.name,
          score,
          reasons,
          config: {
            category: config.category,
            entityType: config.entityType,
            scoringProfile: config.scoring.profile
          }
        });
      }
    }

    // Sort by score descending
    return recommendations.sort((a, b) => b.score - a.score);
  }

  /**
   * Validate entity against vertical requirements
   */
  validateEntity(entity, verticalId) {
    const config = this.getConfig(verticalId);
    const issues = [];
    const warnings = [];

    // Check entity type
    if (entity.type !== config.entityType) {
      issues.push({
        field: 'type',
        expected: config.entityType,
        actual: entity.type,
        message: `Entity type mismatch: expected ${config.entityType}, got ${entity.type}`
      });
    }

    // Check minimum requirements
    if (config.discovery.minEmployees && (!entity.employeeCount || entity.employeeCount < config.discovery.minEmployees)) {
      warnings.push({
        field: 'employeeCount',
        expected: config.discovery.minEmployees,
        actual: entity.employeeCount,
        message: `Below minimum employee count: ${entity.employeeCount || 0} < ${config.discovery.minEmployees}`
      });
    }

    if (config.discovery.minRevenue && (!entity.revenue || entity.revenue < config.discovery.minRevenue)) {
      warnings.push({
        field: 'revenue',
        expected: config.discovery.minRevenue,
        actual: entity.revenue,
        message: `Below minimum revenue: ${entity.revenue || 0} < ${config.discovery.minRevenue}`
      });
    }

    // Check required fields for enrichment
    const missingFields = config.enrichment.priorityFields.filter(f => !entity[f]);
    if (missingFields.length > 0) {
      warnings.push({
        field: 'enrichment',
        missingFields,
        message: `Missing enrichment fields: ${missingFields.join(', ')}`
      });
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      score: Math.max(0, 100 - (issues.length * 30) - (warnings.length * 10))
    };
  }

  /**
   * Generate outreach template for vertical
   */
  generateOutreachTemplate(verticalId, entityData = {}) {
    const config = this.getConfig(verticalId);
    const outreach = config.outreach;

    const template = {
      verticalId,
      tone: outreach.tone,
      formality: outreach.formality,
      channels: outreach.channels,
      subject: `${outreach.keyMessages[0] || 'Business Opportunity'}`,
      body: {
        opening: this.generateOpening(outreach.tone, entityData),
        valueProps: outreach.keyMessages,
        painPoints: outreach.painPoints,
        cta: this.generateCTA(outreach.tone)
      },
      metadata: {
        verticalName: config.name,
        category: config.category,
        generatedAt: new Date().toISOString()
      }
    };

    return template;
  }

  generateOpening(tone, entityData) {
    const name = entityData.contactName || entityData.name || 'there';

    switch (tone) {
      case 'executive':
        return `Dear ${name},\n\nI hope this message finds you well.`;
      case 'consultative':
        return `Hi ${name},\n\nI noticed your company is expanding and wanted to share some insights.`;
      case 'friendly':
        return `Hi ${name}!\n\nI came across your profile and thought we might be able to help.`;
      case 'value-driven':
        return `Hi ${name},\n\nI'll keep this brief - I have an idea that could help.`;
      default:
        return `Dear ${name},\n\nI'm reaching out regarding a potential opportunity.`;
    }
  }

  generateCTA(tone) {
    switch (tone) {
      case 'executive':
        return 'Would you be available for a brief call this week to discuss further?';
      case 'consultative':
        return 'Would you be open to a 15-minute call to explore how we might help?';
      case 'friendly':
        return 'Let me know if you\'d like to chat - I\'m happy to work around your schedule!';
      case 'value-driven':
        return 'Worth a quick call? I can show you exactly how this would work for your team.';
      default:
        return 'Would you have time for a brief discussion?';
    }
  }
}

/**
 * Create vertical engine for tenant
 */
export function createVerticalEngine(tenantId) {
  return new VerticalEngine(tenantId);
}

export default VerticalEngine;
