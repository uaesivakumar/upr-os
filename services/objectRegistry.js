/**
 * Object Registry Service
 * Sprint 50: API Provider Management
 *
 * Service for managing business objects (Company, Contact, Deal, etc.)
 * with automatic population, dependency graphs, and field derivation.
 *
 * Key Features:
 * - Object schema definitions
 * - Field dependency tracking
 * - Auto-population from providers
 * - Derived field calculation
 * - Object relationship management
 */

import * as providerRegistry from './providerRegistry.js';
import * as verticalChain from './verticalProviderChain.js';
import crypto from 'crypto';

// ============================================================================
// OBJECT SCHEMA DEFINITIONS
// ============================================================================

const OBJECT_SCHEMAS = {
  company: {
    name: 'Company',
    slug: 'company',
    description: 'Business entity with firmographic data',
    fields: {
      // Identity
      id: { type: 'uuid', required: true, generated: true },
      name: { type: 'string', required: true, sources: ['apollo', 'clearbit', 'zoominfo'] },
      domain: { type: 'string', required: false, sources: ['clearbit', 'apollo'], unique: true },
      linkedin_url: { type: 'url', required: false, sources: ['apollo', 'linkedin_scraper'] },

      // Firmographics
      industry: { type: 'string', required: false, sources: ['clearbit', 'zoominfo', 'apollo'] },
      sub_industry: { type: 'string', required: false, sources: ['zoominfo'] },
      employee_count: { type: 'integer', required: false, sources: ['clearbit', 'zoominfo', 'apollo'] },
      employee_range: { type: 'string', required: false, derived: true, deriveFrom: 'employee_count' },
      revenue: { type: 'decimal', required: false, sources: ['zoominfo'] },
      revenue_range: { type: 'string', required: false, derived: true, deriveFrom: 'revenue' },
      founding_year: { type: 'integer', required: false, sources: ['clearbit', 'apollo'] },
      company_type: { type: 'string', required: false, sources: ['clearbit'] },  // public, private, nonprofit

      // Location
      headquarters: { type: 'string', required: false, sources: ['clearbit', 'apollo', 'zoominfo'] },
      country: { type: 'string', required: false, derived: true, deriveFrom: 'headquarters' },
      city: { type: 'string', required: false, derived: true, deriveFrom: 'headquarters' },
      region: { type: 'string', required: false, derived: true, deriveFrom: 'country' },

      // Contact Info
      phone: { type: 'string', required: false, sources: ['apollo', 'zoominfo'] },
      email: { type: 'email', required: false, sources: ['hunter', 'apollo'] },

      // Social
      twitter_handle: { type: 'string', required: false, sources: ['clearbit'] },
      facebook_url: { type: 'url', required: false, sources: ['clearbit'] },

      // Tech
      tech_stack: { type: 'array', required: false, sources: ['clearbit'] },

      // Metadata
      description: { type: 'text', required: false, sources: ['clearbit', 'linkedin_scraper'] },
      logo_url: { type: 'url', required: false, sources: ['clearbit'] },
      tags: { type: 'array', required: false, sources: [] },

      // Timestamps
      created_at: { type: 'timestamp', required: true, generated: true },
      updated_at: { type: 'timestamp', required: true, generated: true },
      last_enriched_at: { type: 'timestamp', required: false, generated: true }
    },
    relationships: {
      contacts: { type: 'one-to-many', target: 'contact', foreignKey: 'company_id' },
      deals: { type: 'one-to-many', target: 'deal', foreignKey: 'company_id' },
      signals: { type: 'one-to-many', target: 'signal', foreignKey: 'company_id' }
    },
    indexes: ['domain', 'industry', 'headquarters'],
    enrichmentCapability: 'company_enrichment'
  },

  contact: {
    name: 'Contact',
    slug: 'contact',
    description: 'Individual person with professional data',
    fields: {
      // Identity
      id: { type: 'uuid', required: true, generated: true },
      full_name: { type: 'string', required: true, sources: ['apollo', 'linkedin_scraper'] },
      first_name: { type: 'string', required: false, derived: true, deriveFrom: 'full_name' },
      last_name: { type: 'string', required: false, derived: true, deriveFrom: 'full_name' },
      email: { type: 'email', required: false, sources: ['apollo', 'hunter'] },
      email_verified: { type: 'boolean', required: false, sources: ['neverbounce', 'zerobounce'] },
      linkedin_url: { type: 'url', required: false, sources: ['apollo', 'linkedin_scraper'] },

      // Professional
      current_title: { type: 'string', required: false, sources: ['apollo', 'linkedin_scraper'] },
      seniority_level: { type: 'string', required: false, derived: true, deriveFrom: 'current_title' },
      department: { type: 'string', required: false, derived: true, deriveFrom: 'current_title' },
      company_id: { type: 'uuid', required: false },
      company_name: { type: 'string', required: false, sources: ['apollo', 'linkedin_scraper'] },

      // Location
      location: { type: 'string', required: false, sources: ['apollo', 'linkedin_scraper'] },
      country: { type: 'string', required: false, derived: true, deriveFrom: 'location' },
      city: { type: 'string', required: false, derived: true, deriveFrom: 'location' },

      // Contact
      phone: { type: 'string', required: false, sources: ['apollo', 'zoominfo'] },
      mobile: { type: 'string', required: false, sources: ['zoominfo'] },

      // Social
      twitter_handle: { type: 'string', required: false, sources: ['clearbit'] },

      // Professional Details
      experience: { type: 'array', required: false, sources: ['linkedin_scraper'] },
      education: { type: 'array', required: false, sources: ['linkedin_scraper'] },
      skills: { type: 'array', required: false, sources: ['linkedin_scraper'] },

      // Timestamps
      created_at: { type: 'timestamp', required: true, generated: true },
      updated_at: { type: 'timestamp', required: true, generated: true },
      last_enriched_at: { type: 'timestamp', required: false, generated: true }
    },
    relationships: {
      company: { type: 'many-to-one', target: 'company', foreignKey: 'company_id' },
      activities: { type: 'one-to-many', target: 'activity', foreignKey: 'contact_id' }
    },
    indexes: ['email', 'linkedin_url', 'company_id'],
    enrichmentCapability: 'contact_lookup'
  },

  deal: {
    name: 'Deal',
    slug: 'deal',
    description: 'Sales opportunity or deal',
    fields: {
      id: { type: 'uuid', required: true, generated: true },
      name: { type: 'string', required: true },
      company_id: { type: 'uuid', required: true },
      stage: { type: 'string', required: true },
      value: { type: 'decimal', required: false },
      probability: { type: 'decimal', required: false },
      expected_close: { type: 'date', required: false },
      owner_id: { type: 'uuid', required: false },
      created_at: { type: 'timestamp', required: true, generated: true },
      updated_at: { type: 'timestamp', required: true, generated: true }
    },
    relationships: {
      company: { type: 'many-to-one', target: 'company', foreignKey: 'company_id' },
      contacts: { type: 'many-to-many', target: 'contact', through: 'deal_contacts' }
    },
    indexes: ['company_id', 'stage', 'expected_close'],
    enrichmentCapability: null  // Deals are not enriched externally
  },

  signal: {
    name: 'Signal',
    slug: 'signal',
    description: 'Intent signal or business event',
    fields: {
      id: { type: 'uuid', required: true, generated: true },
      type: { type: 'string', required: true },  // funding, hiring, news, job_change, etc.
      source: { type: 'string', required: true },
      company_id: { type: 'uuid', required: false },
      contact_id: { type: 'uuid', required: false },
      title: { type: 'string', required: true },
      description: { type: 'text', required: false },
      url: { type: 'url', required: false },
      signal_date: { type: 'timestamp', required: true },
      strength: { type: 'decimal', required: false },
      created_at: { type: 'timestamp', required: true, generated: true }
    },
    relationships: {
      company: { type: 'many-to-one', target: 'company', foreignKey: 'company_id' },
      contact: { type: 'many-to-one', target: 'contact', foreignKey: 'contact_id' }
    },
    indexes: ['type', 'company_id', 'signal_date'],
    enrichmentCapability: null
  }
};

// ============================================================================
// FIELD DERIVATION RULES
// ============================================================================

const DERIVATION_RULES = {
  // Name splitting
  first_name: {
    deriveFrom: 'full_name',
    deriveFn: (value) => value?.split(' ')[0] || null
  },
  last_name: {
    deriveFrom: 'full_name',
    deriveFn: (value) => {
      const parts = value?.split(' ');
      return parts && parts.length > 1 ? parts.slice(1).join(' ') : null;
    }
  },

  // Employee range
  employee_range: {
    deriveFrom: 'employee_count',
    deriveFn: (value) => {
      if (!value) return null;
      if (value < 10) return '1-10';
      if (value < 50) return '11-50';
      if (value < 200) return '51-200';
      if (value < 500) return '201-500';
      if (value < 1000) return '501-1000';
      if (value < 5000) return '1001-5000';
      if (value < 10000) return '5001-10000';
      return '10000+';
    }
  },

  // Revenue range
  revenue_range: {
    deriveFrom: 'revenue',
    deriveFn: (value) => {
      if (!value) return null;
      if (value < 1000000) return '<$1M';
      if (value < 10000000) return '$1M-$10M';
      if (value < 50000000) return '$10M-$50M';
      if (value < 100000000) return '$50M-$100M';
      if (value < 500000000) return '$100M-$500M';
      if (value < 1000000000) return '$500M-$1B';
      return '$1B+';
    }
  },

  // Location parsing
  country: {
    deriveFrom: ['headquarters', 'location'],
    deriveFn: (value) => {
      if (!value) return null;
      // Simple country extraction - in production use a proper geocoding service
      const parts = value.split(',').map(p => p.trim());
      return parts[parts.length - 1] || null;
    }
  },
  city: {
    deriveFrom: ['headquarters', 'location'],
    deriveFn: (value) => {
      if (!value) return null;
      const parts = value.split(',').map(p => p.trim());
      return parts[0] || null;
    }
  },

  // Region mapping
  region: {
    deriveFrom: 'country',
    deriveFn: (value) => {
      if (!value) return null;
      const regionMap = {
        'UAE': 'GCC',
        'United Arab Emirates': 'GCC',
        'Saudi Arabia': 'GCC',
        'Kuwait': 'GCC',
        'Qatar': 'GCC',
        'Bahrain': 'GCC',
        'Oman': 'GCC',
        'Egypt': 'MENA',
        'Jordan': 'MENA',
        'Lebanon': 'MENA',
        'USA': 'North America',
        'United States': 'North America',
        'Canada': 'North America',
        'UK': 'Europe',
        'United Kingdom': 'Europe',
        'Germany': 'Europe',
        'France': 'Europe'
      };
      return regionMap[value] || 'Other';
    }
  },

  // Seniority detection
  seniority_level: {
    deriveFrom: 'current_title',
    deriveFn: (value) => {
      if (!value) return null;
      const lower = value.toLowerCase();

      if (/\b(ceo|cto|cfo|coo|chief|founder|owner|president)\b/.test(lower)) return 'C-Level';
      if (/\b(vp|vice president|evp|svp)\b/.test(lower)) return 'VP';
      if (/\b(director|head of)\b/.test(lower)) return 'Director';
      if (/\b(manager|lead|supervisor)\b/.test(lower)) return 'Manager';
      if (/\b(senior|sr\.?|principal)\b/.test(lower)) return 'Senior';
      if (/\b(junior|jr\.?|associate|assistant)\b/.test(lower)) return 'Junior';
      return 'Individual Contributor';
    }
  },

  // Department detection
  department: {
    deriveFrom: 'current_title',
    deriveFn: (value) => {
      if (!value) return null;
      const lower = value.toLowerCase();

      if (/\b(sales|account executive|ae|sdr|bdr)\b/.test(lower)) return 'Sales';
      if (/\b(marketing|growth|demand gen)\b/.test(lower)) return 'Marketing';
      if (/\b(engineer|developer|architect|devops|sre)\b/.test(lower)) return 'Engineering';
      if (/\b(product|pm|product manager)\b/.test(lower)) return 'Product';
      if (/\b(design|ux|ui)\b/.test(lower)) return 'Design';
      if (/\b(finance|accounting|controller|cfo)\b/.test(lower)) return 'Finance';
      if (/\b(hr|human resources|people|talent)\b/.test(lower)) return 'HR';
      if (/\b(legal|counsel|attorney)\b/.test(lower)) return 'Legal';
      if (/\b(operations|ops|coo)\b/.test(lower)) return 'Operations';
      if (/\b(support|customer success|cs)\b/.test(lower)) return 'Customer Success';
      return 'Other';
    }
  }
};

// ============================================================================
// OBJECT OPERATIONS
// ============================================================================

/**
 * Get object schema
 */
function getObjectSchema(objectType) {
  return OBJECT_SCHEMAS[objectType] || null;
}

/**
 * Get all object schemas
 */
function getAllObjectSchemas() {
  return Object.entries(OBJECT_SCHEMAS).map(([slug, schema]) => ({
    slug,
    name: schema.name,
    description: schema.description,
    fieldCount: Object.keys(schema.fields).length,
    relationships: Object.keys(schema.relationships || {})
  }));
}

/**
 * Get object dependency graph
 */
function getObjectDependencyGraph() {
  const nodes = [];
  const edges = [];

  for (const [slug, schema] of Object.entries(OBJECT_SCHEMAS)) {
    nodes.push({
      id: slug,
      name: schema.name,
      type: 'object'
    });

    // Add relationship edges
    for (const [relName, rel] of Object.entries(schema.relationships || {})) {
      edges.push({
        source: slug,
        target: rel.target,
        type: rel.type,
        name: relName
      });
    }

    // Add provider edges
    for (const [fieldName, field] of Object.entries(schema.fields)) {
      if (field.sources) {
        for (const source of field.sources) {
          const edgeId = `${slug}-${source}`;
          if (!edges.find(e => e.id === edgeId)) {
            edges.push({
              id: edgeId,
              source: slug,
              target: source,
              type: 'provider',
              fields: [fieldName]
            });
          } else {
            const edge = edges.find(e => e.id === edgeId);
            edge.fields.push(fieldName);
          }
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Get field dependency graph for an object
 */
function getFieldDependencyGraph(objectType) {
  const schema = OBJECT_SCHEMAS[objectType];
  if (!schema) return null;

  const nodes = [];
  const edges = [];

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    nodes.push({
      id: fieldName,
      type: field.type,
      required: field.required,
      derived: field.derived || false,
      sources: field.sources || []
    });

    // Add derivation edges
    if (field.deriveFrom) {
      const sourceFields = Array.isArray(field.deriveFrom) ? field.deriveFrom : [field.deriveFrom];
      for (const sourceField of sourceFields) {
        edges.push({
          source: sourceField,
          target: fieldName,
          type: 'derivation'
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Auto-populate an object with data from providers
 */
async function autoPopulateObject(objectType, seedData, options = {}) {
  const schema = OBJECT_SCHEMAS[objectType];
  if (!schema) {
    throw new Error(`Unknown object type: ${objectType}`);
  }

  const { vertical, tenantId } = options;

  // Start with seed data
  let populatedData = { ...seedData };

  // Get fields that need enrichment
  const fieldsToEnrich = Object.entries(schema.fields)
    .filter(([_, field]) => !field.generated && !field.derived && field.sources?.length > 0)
    .filter(([name]) => !populatedData[name])
    .map(([name]) => name);

  if (fieldsToEnrich.length === 0) {
    // No enrichment needed, just derive fields
    return {
      success: true,
      data: deriveFields(populatedData, schema),
      enriched: false,
      fieldsPopulated: 0
    };
  }

  // Use vertical chain if capability exists
  if (schema.enrichmentCapability) {
    const enrichResult = await verticalChain.executeVerticalChain(
      vertical || 'default',
      populatedData,
      { tenantId }
    );

    if (enrichResult.success && enrichResult.data) {
      populatedData = { ...populatedData, ...enrichResult.data };
    }
  }

  // Derive fields
  populatedData = deriveFields(populatedData, schema);

  // Add generated fields
  populatedData = addGeneratedFields(populatedData, schema);

  return {
    success: true,
    data: populatedData,
    enriched: true,
    fieldsPopulated: Object.keys(populatedData).length
  };
}

/**
 * Derive calculated fields
 */
function deriveFields(data, schema) {
  const result = { ...data };

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    if (!field.derived || result[fieldName]) continue;

    const rule = DERIVATION_RULES[fieldName];
    if (!rule) continue;

    const sourceFields = Array.isArray(rule.deriveFrom) ? rule.deriveFrom : [rule.deriveFrom];
    for (const sourceField of sourceFields) {
      if (data[sourceField]) {
        const derivedValue = rule.deriveFn(data[sourceField]);
        if (derivedValue) {
          result[fieldName] = derivedValue;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Add generated fields (timestamps, ids)
 */
function addGeneratedFields(data, schema) {
  const result = { ...data };
  const now = new Date().toISOString();

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    if (!field.generated) continue;

    switch (fieldName) {
      case 'id':
        if (!result.id) {
          result.id = crypto.randomUUID();
        }
        break;
      case 'created_at':
        if (!result.created_at) {
          result.created_at = now;
        }
        break;
      case 'updated_at':
        result.updated_at = now;
        break;
      case 'last_enriched_at':
        result.last_enriched_at = now;
        break;
    }
  }

  return result;
}

/**
 * Validate object data against schema
 */
function validateObject(objectType, data) {
  const schema = OBJECT_SCHEMAS[objectType];
  if (!schema) {
    return { valid: false, errors: [`Unknown object type: ${objectType}`] };
  }

  const errors = [];

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    const value = data[fieldName];

    // Check required fields
    if (field.required && !field.generated && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required field: ${fieldName}`);
    }

    // Type validation
    if (value !== undefined && value !== null) {
      switch (field.type) {
        case 'email':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errors.push(`Invalid email format for field: ${fieldName}`);
          }
          break;
        case 'url':
          try {
            new URL(value);
          } catch {
            errors.push(`Invalid URL format for field: ${fieldName}`);
          }
          break;
        case 'integer':
          if (!Number.isInteger(value)) {
            errors.push(`Expected integer for field: ${fieldName}`);
          }
          break;
        case 'decimal':
          if (typeof value !== 'number') {
            errors.push(`Expected number for field: ${fieldName}`);
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`Expected array for field: ${fieldName}`);
          }
          break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get provider sources for an object field
 */
function getFieldProviders(objectType, fieldName) {
  const schema = OBJECT_SCHEMAS[objectType];
  if (!schema || !schema.fields[fieldName]) {
    return [];
  }

  return schema.fields[fieldName].sources || [];
}

export {
  getObjectSchema,
  getAllObjectSchemas,
  getObjectDependencyGraph,
  getFieldDependencyGraph,
  autoPopulateObject,
  deriveFields,
  validateObject,
  getFieldProviders,
  OBJECT_SCHEMAS,
  DERIVATION_RULES
};
