/**
 * Graph Query Service
 * Sprint 74: Data Lake v0 + UPR Graph Schema
 *
 * Query and traverse the UPR Graph for entities, signals, and relationships
 */

import { pool } from '../../../utils/db.js';
import { v4 as uuidv4 } from 'uuid';

class GraphService {
  /**
   * Get entity by ID
   * @param {string} entityId - Entity UUID
   * @param {Object} options - Query options
   * @returns {Promise<Object|null>}
   */
  async getEntity(entityId, options = {}) {
    const { includeSignals = false, includeRelationships = false, tenantId } = options;

    let query = `
      SELECT * FROM graph_entities
      WHERE entity_id = $1 AND is_active = true
    `;
    const params = [entityId];

    if (tenantId) {
      query += ` AND tenant_id = $2`;
      params.push(tenantId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) return null;

    const entity = result.rows[0];

    if (includeSignals) {
      entity.signals = await this.getSignals(entityId, { tenantId });
    }

    if (includeRelationships) {
      entity.relationships = await this.getRelationships(entityId, { tenantId });
    }

    return entity;
  }

  /**
   * Get entities by external ID
   * @param {string} externalId - External identifier
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object|null>}
   */
  async getEntityByExternalId(externalId, tenantId) {
    const query = `
      SELECT * FROM graph_entities
      WHERE external_id = $1 AND tenant_id = $2 AND is_active = true
    `;
    const result = await pool.query(query, [externalId, tenantId]);
    return result.rows[0] || null;
  }

  /**
   * Create or update entity
   * @param {Object} entityData - Entity data
   * @returns {Promise<Object>}
   */
  async upsertEntity(entityData) {
    const {
      entityId = uuidv4(),
      externalId,
      entityType,
      entityName,
      tenantId,
      regionId,
      properties = {},
      scores = {},
      tags = [],
      source,
      confidence = 1.0
    } = entityData;

    const query = `
      INSERT INTO graph_entities (
        entity_id, external_id, entity_type, entity_name, tenant_id,
        region_id, properties, scores, tags, source, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (tenant_id, external_id)
      DO UPDATE SET
        entity_name = EXCLUDED.entity_name,
        properties = EXCLUDED.properties || graph_entities.properties,
        scores = EXCLUDED.scores,
        tags = EXCLUDED.tags,
        source = EXCLUDED.source,
        confidence = EXCLUDED.confidence,
        version = graph_entities.version + 1,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      entityId,
      externalId,
      entityType,
      entityName,
      tenantId,
      regionId,
      JSON.stringify(properties),
      JSON.stringify(scores),
      tags,
      source,
      confidence
    ]);

    return result.rows[0];
  }

  /**
   * Get signals for an entity
   * @param {string} entityId - Entity UUID
   * @param {Object} options - Query options
   * @returns {Promise<Object[]>}
   */
  async getSignals(entityId, options = {}) {
    const { tenantId, signalType, activeOnly = true, limit = 50 } = options;

    let query = `
      SELECT s.*, st.category, st.description as type_description
      FROM graph_signals s
      LEFT JOIN graph_signal_types st ON s.signal_type = st.signal_type
      WHERE s.source_entity_id = $1
    `;
    const params = [entityId];
    let paramIndex = 2;

    if (tenantId) {
      query += ` AND s.tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }
    if (signalType) {
      query += ` AND s.signal_type = $${paramIndex++}`;
      params.push(signalType);
    }
    if (activeOnly) {
      query += ` AND s.is_active = true AND (s.expires_at IS NULL OR s.expires_at > NOW())`;
    }

    query += ` ORDER BY s.captured_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Add signal to entity
   * @param {Object} signalData - Signal data
   * @returns {Promise<Object>}
   */
  async addSignal(signalData) {
    const {
      signalType,
      sourceEntityId,
      targetEntityId,
      tenantId,
      strength = 1.0,
      decayRate = 0.1,
      signalData: data = {},
      source,
      confidence = 1.0,
      expiresAt
    } = signalData;

    const query = `
      INSERT INTO graph_signals (
        signal_type, source_entity_id, target_entity_id, tenant_id,
        strength, decay_rate, signal_data, source, confidence, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await pool.query(query, [
      signalType,
      sourceEntityId,
      targetEntityId,
      tenantId,
      strength,
      decayRate,
      JSON.stringify(data),
      source,
      confidence,
      expiresAt
    ]);

    return result.rows[0];
  }

  /**
   * Get relationships for an entity
   * @param {string} entityId - Entity UUID
   * @param {Object} options - Query options
   * @returns {Promise<Object[]>}
   */
  async getRelationships(entityId, options = {}) {
    const { tenantId, relType, direction = 'both', limit = 50 } = options;

    let query;
    const params = [entityId];
    let paramIndex = 2;

    if (direction === 'outgoing') {
      query = `
        SELECT r.*, e.entity_name as target_name, e.entity_type as target_type
        FROM graph_relationships r
        JOIN graph_entities e ON r.to_entity_id = e.entity_id
        WHERE r.from_entity_id = $1 AND r.is_active = true
      `;
    } else if (direction === 'incoming') {
      query = `
        SELECT r.*, e.entity_name as source_name, e.entity_type as source_type
        FROM graph_relationships r
        JOIN graph_entities e ON r.from_entity_id = e.entity_id
        WHERE r.to_entity_id = $1 AND r.is_active = true
      `;
    } else {
      query = `
        SELECT r.*,
          CASE WHEN r.from_entity_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction,
          CASE WHEN r.from_entity_id = $1 THEN ef.entity_name ELSE et.entity_name END as related_name,
          CASE WHEN r.from_entity_id = $1 THEN ef.entity_type ELSE et.entity_type END as related_type
        FROM graph_relationships r
        LEFT JOIN graph_entities ef ON r.from_entity_id = ef.entity_id
        LEFT JOIN graph_entities et ON r.to_entity_id = et.entity_id
        WHERE (r.from_entity_id = $1 OR r.to_entity_id = $1) AND r.is_active = true
      `;
    }

    if (tenantId) {
      query += ` AND r.tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }
    if (relType) {
      query += ` AND r.rel_type = $${paramIndex++}`;
      params.push(relType);
    }

    query += ` ORDER BY r.strength DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get related entities
   * @param {string} entityId - Entity UUID
   * @param {Object} options - Query options
   * @returns {Promise<Object[]>}
   */
  async getRelatedEntities(entityId, options = {}) {
    const { tenantId, relType, depth = 1, limit = 50 } = options;

    // Simple single-depth query
    if (depth === 1) {
      const query = `
        SELECT DISTINCT e.*, r.rel_type, r.strength as relationship_strength
        FROM graph_relationships r
        JOIN graph_entities e ON
          (r.from_entity_id = $1 AND e.entity_id = r.to_entity_id) OR
          (r.to_entity_id = $1 AND e.entity_id = r.from_entity_id)
        WHERE r.is_active = true AND e.is_active = true
        ${tenantId ? 'AND r.tenant_id = $2' : ''}
        ${relType ? `AND r.rel_type = $${tenantId ? 3 : 2}` : ''}
        ORDER BY r.strength DESC
        LIMIT $${tenantId && relType ? 4 : tenantId || relType ? 3 : 2}
      `;

      const params = [entityId];
      if (tenantId) params.push(tenantId);
      if (relType) params.push(relType);
      params.push(limit);

      const result = await pool.query(query, params);
      return result.rows;
    }

    // Multi-depth traversal (recursive)
    const query = `
      WITH RECURSIVE graph_traversal AS (
        SELECT
          CASE WHEN r.from_entity_id = $1 THEN r.to_entity_id ELSE r.from_entity_id END as entity_id,
          r.rel_type,
          r.strength,
          1 as depth,
          ARRAY[r.rel_id] as path
        FROM graph_relationships r
        WHERE (r.from_entity_id = $1 OR r.to_entity_id = $1)
          AND r.is_active = true
          ${tenantId ? 'AND r.tenant_id = $2' : ''}

        UNION ALL

        SELECT
          CASE WHEN r.from_entity_id = gt.entity_id THEN r.to_entity_id ELSE r.from_entity_id END,
          r.rel_type,
          r.strength * gt.strength,
          gt.depth + 1,
          gt.path || r.rel_id
        FROM graph_traversal gt
        JOIN graph_relationships r ON
          (r.from_entity_id = gt.entity_id OR r.to_entity_id = gt.entity_id)
        WHERE gt.depth < $${tenantId ? 3 : 2}
          AND r.is_active = true
          AND NOT (r.rel_id = ANY(gt.path))
          ${tenantId ? 'AND r.tenant_id = $2' : ''}
      )
      SELECT DISTINCT e.*, gt.depth, gt.strength as path_strength, gt.rel_type as final_relationship
      FROM graph_traversal gt
      JOIN graph_entities e ON gt.entity_id = e.entity_id
      WHERE e.is_active = true
      ORDER BY gt.depth, gt.strength DESC
      LIMIT $${tenantId ? 4 : 3}
    `;

    const params = [entityId];
    if (tenantId) params.push(tenantId);
    params.push(depth);
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Add relationship between entities
   * @param {Object} relData - Relationship data
   * @returns {Promise<Object>}
   */
  async addRelationship(relData) {
    const {
      fromEntityId,
      toEntityId,
      relType,
      tenantId,
      strength = 1.0,
      bidirectional = false,
      properties = {},
      source,
      confidence = 1.0
    } = relData;

    const query = `
      INSERT INTO graph_relationships (
        from_entity_id, to_entity_id, rel_type, tenant_id,
        strength, bidirectional, properties, source, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (from_entity_id, to_entity_id, rel_type, tenant_id)
      DO UPDATE SET
        strength = EXCLUDED.strength,
        properties = EXCLUDED.properties,
        source = EXCLUDED.source,
        confidence = EXCLUDED.confidence,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      fromEntityId,
      toEntityId,
      relType,
      tenantId,
      strength,
      bidirectional,
      JSON.stringify(properties),
      source,
      confidence
    ]);

    return result.rows[0];
  }

  /**
   * Traverse graph with custom query
   * @param {Object} traversalConfig - Traversal configuration
   * @returns {Promise<Object[]>}
   */
  async traverseGraph(traversalConfig) {
    const {
      startEntityId,
      tenantId,
      maxDepth = 3,
      relationshipTypes = [],
      entityTypes = [],
      minStrength = 0,
      limit = 100
    } = traversalConfig;

    // Build conditions
    const relTypeCondition = relationshipTypes.length > 0
      ? `AND r.rel_type = ANY($3)`
      : '';
    const entityTypeCondition = entityTypes.length > 0
      ? `AND e.entity_type = ANY($${relationshipTypes.length > 0 ? 4 : 3})`
      : '';

    const query = `
      WITH RECURSIVE traversal AS (
        SELECT
          e.entity_id,
          e.entity_name,
          e.entity_type,
          NULL::varchar as via_relationship,
          0 as depth,
          1.0::decimal as path_strength,
          ARRAY[e.entity_id] as visited
        FROM graph_entities e
        WHERE e.entity_id = $1 AND e.is_active = true

        UNION ALL

        SELECT
          CASE WHEN r.from_entity_id = t.entity_id THEN e_to.entity_id ELSE e_from.entity_id END,
          CASE WHEN r.from_entity_id = t.entity_id THEN e_to.entity_name ELSE e_from.entity_name END,
          CASE WHEN r.from_entity_id = t.entity_id THEN e_to.entity_type ELSE e_from.entity_type END,
          r.rel_type,
          t.depth + 1,
          t.path_strength * r.strength,
          t.visited || CASE WHEN r.from_entity_id = t.entity_id THEN e_to.entity_id ELSE e_from.entity_id END
        FROM traversal t
        JOIN graph_relationships r ON
          (r.from_entity_id = t.entity_id OR r.to_entity_id = t.entity_id)
        JOIN graph_entities e_from ON r.from_entity_id = e_from.entity_id
        JOIN graph_entities e_to ON r.to_entity_id = e_to.entity_id
        WHERE t.depth < $2
          AND r.is_active = true
          AND r.strength >= ${minStrength}
          AND NOT (
            CASE WHEN r.from_entity_id = t.entity_id THEN e_to.entity_id ELSE e_from.entity_id END
            = ANY(t.visited)
          )
          ${relTypeCondition}
      )
      SELECT *
      FROM traversal
      WHERE depth > 0
      ${entityTypeCondition}
      ORDER BY depth, path_strength DESC
      LIMIT $${relationshipTypes.length > 0 && entityTypes.length > 0 ? 5 :
               relationshipTypes.length > 0 || entityTypes.length > 0 ? 4 : 3}
    `;

    const params = [startEntityId, maxDepth];
    if (relationshipTypes.length > 0) params.push(relationshipTypes);
    if (entityTypes.length > 0) params.push(entityTypes);
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Search entities
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object[]>}
   */
  async searchEntities(searchParams) {
    const {
      tenantId,
      entityType,
      namePattern,
      tags,
      regionId,
      minScore,
      limit = 50
    } = searchParams;

    let query = `
      SELECT * FROM graph_entities
      WHERE is_active = true
    `;
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }
    if (entityType) {
      query += ` AND entity_type = $${paramIndex++}`;
      params.push(entityType);
    }
    if (namePattern) {
      query += ` AND entity_name ILIKE $${paramIndex++}`;
      params.push(`%${namePattern}%`);
    }
    if (tags && tags.length > 0) {
      query += ` AND tags && $${paramIndex++}`;
      params.push(tags);
    }
    if (regionId) {
      query += ` AND region_id = $${paramIndex++}`;
      params.push(regionId);
    }
    if (minScore) {
      query += ` AND (scores->>'composite')::decimal >= $${paramIndex++}`;
      params.push(minScore);
    }

    query += ` ORDER BY confidence DESC, updated_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }
}

// Singleton instance
export const graphService = new GraphService();
export default graphService;
