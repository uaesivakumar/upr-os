/**
 * Entity Service
 * Sprint 68: Entity Abstraction Layer
 *
 * Unified service for managing all entity types:
 * - Company (B2B targets)
 * - Individual (B2C targets)
 * - Hybrid (Company+Contact pairs)
 */

import { pool } from '../../utils/db.js';
import * as Sentry from '@sentry/node';

// Entity types
export const ENTITY_TYPES = {
  COMPANY: 'company',
  INDIVIDUAL: 'individual',
  HYBRID: 'hybrid'
};

// Entity status
export const ENTITY_STATUS = {
  ACTIVE: 'active',
  ENRICHING: 'enriching',
  DISQUALIFIED: 'disqualified',
  ARCHIVED: 'archived'
};

/**
 * Entity Base Class
 * Polymorphic base for all entity types
 */
export class Entity {
  constructor(data) {
    this.id = data.id;
    this.type = data.type || ENTITY_TYPES.COMPANY;
    this.tenantId = data.tenant_id || data.tenantId;
    this.status = data.status || ENTITY_STATUS.ACTIVE;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
    this.metadata = data.metadata || {};

    // Common fields
    this.name = data.name;
    this.displayName = data.display_name || data.displayName || data.name;
    this.source = data.source || 'manual';
    this.sourceId = data.source_id || data.sourceId;

    // Scoring
    this.scores = data.scores || {};
    this.tier = data.tier;
    this.rank = data.rank;

    // Signals
    this.signals = data.signals || [];
    this.signalCount = data.signal_count || data.signalCount || 0;

    // Enrichment
    this.enrichmentStatus = data.enrichment_status || data.enrichmentStatus || 'pending';
    this.enrichmentData = data.enrichment_data || data.enrichmentData || {};
    this.lastEnrichedAt = data.last_enriched_at || data.lastEnrichedAt;
  }

  /**
   * Get canonical identifier
   */
  getCanonicalId() {
    return `${this.type}:${this.id}`;
  }

  /**
   * Check if entity is enrichable
   */
  isEnrichable() {
    return this.status === ENTITY_STATUS.ACTIVE &&
           this.enrichmentStatus !== 'complete';
  }

  /**
   * Check if entity is scorable
   */
  isScorable() {
    return this.status === ENTITY_STATUS.ACTIVE;
  }

  /**
   * Convert to plain object
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      tenantId: this.tenantId,
      status: this.status,
      name: this.name,
      displayName: this.displayName,
      source: this.source,
      sourceId: this.sourceId,
      scores: this.scores,
      tier: this.tier,
      rank: this.rank,
      signals: this.signals,
      signalCount: this.signalCount,
      enrichmentStatus: this.enrichmentStatus,
      enrichmentData: this.enrichmentData,
      lastEnrichedAt: this.lastEnrichedAt,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Company Entity
 */
export class CompanyEntity extends Entity {
  constructor(data) {
    super({ ...data, type: ENTITY_TYPES.COMPANY });

    // Company-specific fields
    this.domain = data.domain;
    this.website = data.website || (data.domain ? `https://${data.domain}` : null);
    this.industry = data.industry;
    this.employeeCount = data.employee_count || data.employeeCount;
    this.revenue = data.revenue;
    this.locations = data.locations || [];
    this.linkedinUrl = data.linkedin_url || data.linkedinUrl;
    this.description = data.description;

    // Company enrichment
    this.technologies = data.technologies || [];
    this.fundingStage = data.funding_stage || data.fundingStage;
    this.fundingTotal = data.funding_total || data.fundingTotal;
    this.foundedYear = data.founded_year || data.foundedYear;

    // UAE-specific
    this.isUAEBased = data.is_uae_based || data.isUAEBased || false;
    this.emirate = data.emirate;
    this.freeZone = data.free_zone || data.freeZone;
    this.licenseNumber = data.license_number || data.licenseNumber;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      domain: this.domain,
      website: this.website,
      industry: this.industry,
      employeeCount: this.employeeCount,
      revenue: this.revenue,
      locations: this.locations,
      linkedinUrl: this.linkedinUrl,
      description: this.description,
      technologies: this.technologies,
      fundingStage: this.fundingStage,
      fundingTotal: this.fundingTotal,
      foundedYear: this.foundedYear,
      isUAEBased: this.isUAEBased,
      emirate: this.emirate,
      freeZone: this.freeZone,
      licenseNumber: this.licenseNumber
    };
  }
}

/**
 * Individual Entity
 */
export class IndividualEntity extends Entity {
  constructor(data) {
    super({ ...data, type: ENTITY_TYPES.INDIVIDUAL });

    // Individual-specific fields
    this.firstName = data.first_name || data.firstName;
    this.lastName = data.last_name || data.lastName;
    this.email = data.email;
    this.phone = data.phone;
    this.title = data.title;
    this.department = data.department;
    this.seniority = data.seniority;
    this.linkedinUrl = data.linkedin_url || data.linkedinUrl;

    // Current employment (optional)
    this.currentCompany = data.current_company || data.currentCompany;
    this.currentCompanyId = data.current_company_id || data.currentCompanyId;

    // Location
    this.location = data.location;
    this.country = data.country;
    this.city = data.city;

    // Professional data
    this.skills = data.skills || [];
    this.experience = data.experience || [];
    this.education = data.education || [];
  }

  /**
   * Get full name
   */
  getFullName() {
    return [this.firstName, this.lastName].filter(Boolean).join(' ') || this.name;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.getFullName(),
      email: this.email,
      phone: this.phone,
      title: this.title,
      department: this.department,
      seniority: this.seniority,
      linkedinUrl: this.linkedinUrl,
      currentCompany: this.currentCompany,
      currentCompanyId: this.currentCompanyId,
      location: this.location,
      country: this.country,
      city: this.city,
      skills: this.skills,
      experience: this.experience,
      education: this.education
    };
  }
}

/**
 * Hybrid Entity (Company + Contact)
 */
export class HybridEntity extends Entity {
  constructor(data) {
    super({ ...data, type: ENTITY_TYPES.HYBRID });

    // Company component
    this.company = data.company ? new CompanyEntity(data.company) : null;
    this.companyId = data.company_id || data.companyId;

    // Individual component
    this.contact = data.contact ? new IndividualEntity(data.contact) : null;
    this.contactId = data.contact_id || data.contactId;

    // Relationship
    this.relationship = data.relationship || 'primary'; // primary, secondary, etc.
    this.isPrimaryContact = data.is_primary_contact || data.isPrimaryContact || false;
  }

  /**
   * Get composite identifier
   */
  getCanonicalId() {
    return `hybrid:${this.companyId}:${this.contactId}`;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      company: this.company?.toJSON(),
      companyId: this.companyId,
      contact: this.contact?.toJSON(),
      contactId: this.contactId,
      relationship: this.relationship,
      isPrimaryContact: this.isPrimaryContact
    };
  }
}

/**
 * Entity Factory
 * Creates appropriate entity type from raw data
 */
export function createEntity(data) {
  const type = data.type || ENTITY_TYPES.COMPANY;

  switch (type) {
    case ENTITY_TYPES.COMPANY:
      return new CompanyEntity(data);
    case ENTITY_TYPES.INDIVIDUAL:
      return new IndividualEntity(data);
    case ENTITY_TYPES.HYBRID:
      return new HybridEntity(data);
    default:
      return new Entity(data);
  }
}

/**
 * Entity Service Class
 */
export class EntityService {
  constructor(tenantId) {
    this.tenantId = tenantId || '00000000-0000-0000-0000-000000000001';
  }

  /**
   * Create entity
   */
  async create(data) {
    const entity = createEntity({ ...data, tenant_id: this.tenantId });

    try {
      const result = await pool.query(
        `INSERT INTO entities (
          id, tenant_id, type, name, display_name, status, source, source_id,
          domain, industry, employee_count, locations, linkedin_url,
          email, phone, title, first_name, last_name,
          metadata, enrichment_status, created_at, updated_at
        ) VALUES (
          COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18,
          $19, $20, NOW(), NOW()
        ) RETURNING *`,
        [
          entity.id,
          this.tenantId,
          entity.type,
          entity.name,
          entity.displayName,
          entity.status,
          entity.source,
          entity.sourceId,
          entity.domain,
          entity.industry,
          entity.employeeCount,
          JSON.stringify(entity.locations || []),
          entity.linkedinUrl,
          entity.email,
          entity.phone,
          entity.title,
          entity.firstName,
          entity.lastName,
          JSON.stringify(entity.metadata || {}),
          entity.enrichmentStatus
        ]
      );

      return createEntity(result.rows[0]);

    } catch (error) {
      Sentry.captureException(error);
      console.error('[EntityService] Error creating entity:', error);
      throw error;
    }
  }

  /**
   * Get entity by ID
   */
  async getById(id) {
    try {
      const result = await pool.query(
        `SELECT * FROM entities WHERE id = $1 AND tenant_id = $2`,
        [id, this.tenantId]
      );

      if (result.rows.length === 0) return null;
      return createEntity(result.rows[0]);

    } catch (error) {
      Sentry.captureException(error);
      console.error('[EntityService] Error getting entity:', error);
      return null;
    }
  }

  /**
   * Get entities by type
   */
  async getByType(type, options = {}) {
    const { limit = 100, offset = 0, status, orderBy = 'created_at', order = 'DESC' } = options;

    try {
      let query = `SELECT * FROM entities WHERE tenant_id = $1 AND type = $2`;
      const params = [this.tenantId, type];
      let paramIndex = 3;

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY ${orderBy} ${order} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);
      return result.rows.map(row => createEntity(row));

    } catch (error) {
      Sentry.captureException(error);
      console.error('[EntityService] Error getting entities by type:', error);
      return [];
    }
  }

  /**
   * Update entity
   */
  async update(id, updates) {
    try {
      const setClauses = [];
      const params = [id, this.tenantId];
      let paramIndex = 3;

      const allowedFields = [
        'name', 'display_name', 'status', 'domain', 'industry',
        'employee_count', 'locations', 'linkedin_url', 'email',
        'phone', 'title', 'first_name', 'last_name', 'metadata',
        'enrichment_status', 'enrichment_data', 'scores', 'tier', 'rank'
      ];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = $${paramIndex}`);
          params.push(typeof value === 'object' ? JSON.stringify(value) : value);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) return null;

      setClauses.push('updated_at = NOW()');

      const result = await pool.query(
        `UPDATE entities SET ${setClauses.join(', ')}
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        params
      );

      if (result.rows.length === 0) return null;
      return createEntity(result.rows[0]);

    } catch (error) {
      Sentry.captureException(error);
      console.error('[EntityService] Error updating entity:', error);
      throw error;
    }
  }

  /**
   * Update entity scores
   */
  async updateScores(id, scores, tier) {
    return this.update(id, { scores, tier });
  }

  /**
   * Update enrichment data
   */
  async updateEnrichment(id, enrichmentData, status = 'complete') {
    return this.update(id, {
      enrichment_data: enrichmentData,
      enrichment_status: status
    });
  }

  /**
   * Search entities
   */
  async search(query, options = {}) {
    const { type, limit = 50, offset = 0 } = options;

    try {
      let sql = `
        SELECT * FROM entities
        WHERE tenant_id = $1
        AND (
          name ILIKE $2
          OR display_name ILIKE $2
          OR domain ILIKE $2
          OR email ILIKE $2
        )
      `;
      const params = [this.tenantId, `%${query}%`];
      let paramIndex = 3;

      if (type) {
        sql += ` AND type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      sql += ` ORDER BY name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(sql, params);
      return result.rows.map(row => createEntity(row));

    } catch (error) {
      Sentry.captureException(error);
      console.error('[EntityService] Error searching entities:', error);
      return [];
    }
  }

  /**
   * Delete entity (soft delete)
   */
  async delete(id) {
    return this.update(id, { status: ENTITY_STATUS.ARCHIVED });
  }

  /**
   * Hard delete entity
   */
  async hardDelete(id) {
    try {
      const result = await pool.query(
        `DELETE FROM entities WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [id, this.tenantId]
      );
      return result.rowCount > 0;

    } catch (error) {
      Sentry.captureException(error);
      console.error('[EntityService] Error deleting entity:', error);
      return false;
    }
  }

  /**
   * Get entity count by type
   */
  async getCountByType(type) {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM entities
         WHERE tenant_id = $1 AND type = $2 AND status != 'archived'`,
        [this.tenantId, type]
      );
      return parseInt(result.rows[0].count, 10);

    } catch (error) {
      Sentry.captureException(error);
      console.error('[EntityService] Error counting entities:', error);
      return 0;
    }
  }

  /**
   * Get entities needing enrichment
   */
  async getEnrichmentQueue(limit = 100) {
    try {
      const result = await pool.query(
        `SELECT * FROM entities
         WHERE tenant_id = $1
         AND status = 'active'
         AND (enrichment_status = 'pending' OR enrichment_status = 'partial')
         ORDER BY created_at ASC
         LIMIT $2`,
        [this.tenantId, limit]
      );
      return result.rows.map(row => createEntity(row));

    } catch (error) {
      Sentry.captureException(error);
      console.error('[EntityService] Error getting enrichment queue:', error);
      return [];
    }
  }

  /**
   * Bulk update entities
   */
  async bulkUpdate(ids, updates) {
    const results = [];
    for (const id of ids) {
      try {
        const updated = await this.update(id, updates);
        if (updated) results.push(updated);
      } catch (error) {
        console.error(`[EntityService] Error updating entity ${id}:`, error);
      }
    }
    return results;
  }

  /**
   * Get entities by tier
   */
  async getByTier(tier, options = {}) {
    const { type, limit = 100, offset = 0 } = options;

    try {
      let sql = `
        SELECT * FROM entities
        WHERE tenant_id = $1 AND tier = $2 AND status = 'active'
      `;
      const params = [this.tenantId, tier];
      let paramIndex = 3;

      if (type) {
        sql += ` AND type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      sql += ` ORDER BY rank ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(sql, params);
      return result.rows.map(row => createEntity(row));

    } catch (error) {
      Sentry.captureException(error);
      console.error('[EntityService] Error getting entities by tier:', error);
      return [];
    }
  }
}

/**
 * Create entity service for tenant
 */
export function createEntityService(tenantId) {
  return new EntityService(tenantId);
}

export default EntityService;
