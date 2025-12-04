/**
 * PersonaService - SIVA Multi-Vertical Persona Management
 * Sprint 71: Sub-Vertical Personas
 *
 * Service for managing persona configurations per sub-vertical.
 * Personas define HOW the salesperson thinks - the brain specification
 * that controls all SIVA tool behavior.
 *
 * Architecture:
 * - Vertical = WHAT industry the salesperson works in
 * - Sub-Vertical = WHO the salesperson is (their role)
 * - Persona = HOW the salesperson thinks (their brain)
 *
 * Key Features:
 * - CRUD operations for personas
 * - Caching for performance
 * - Version history tracking
 * - Persona cloning for new sub-verticals
 */

import { pool } from '../../utils/db.js';
import * as Sentry from '@sentry/node';

// ============================================================================
// CACHE
// ============================================================================

// In-memory cache for personas (TTL: 5 minutes)
const personaCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get cached persona or null if expired/missing
 */
function getCached(subVerticalSlug) {
  const cached = personaCache.get(subVerticalSlug);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    personaCache.delete(subVerticalSlug);
    return null;
  }

  return cached.persona;
}

/**
 * Set persona in cache
 */
function setCache(subVerticalSlug, persona) {
  personaCache.set(subVerticalSlug, {
    persona,
    timestamp: Date.now()
  });
}

/**
 * Clear cache for a specific sub-vertical or all
 */
function clearCache(subVerticalSlug = null) {
  if (subVerticalSlug) {
    personaCache.delete(subVerticalSlug);
  } else {
    personaCache.clear();
  }
}

// ============================================================================
// CORE CRUD OPERATIONS
// ============================================================================

/**
 * Get persona by sub-vertical slug
 * This is the primary method used by SIVA tools
 *
 * @param {string} subVerticalSlug - e.g., 'employee-banking'
 * @returns {Promise<Object|null>} Persona object or null
 */
async function getPersona(subVerticalSlug) {
  try {
    // Check cache first
    const cached = getCached(subVerticalSlug);
    if (cached) {
      console.log(`[PersonaService] Cache hit for ${subVerticalSlug}`);
      return cached;
    }

    // Query database
    const result = await pool.query(
      `SELECT * FROM siva.sub_vertical_personas
       WHERE sub_vertical_slug = $1
         AND is_active = true
         AND is_default = true
       LIMIT 1`,
      [subVerticalSlug]
    );

    if (result.rows.length === 0) {
      console.warn(`[PersonaService] No persona found for ${subVerticalSlug}`);
      return null;
    }

    const persona = formatPersona(result.rows[0]);

    // Cache it
    setCache(subVerticalSlug, persona);
    console.log(`[PersonaService] Loaded persona for ${subVerticalSlug}: ${persona.persona_name}`);

    return persona;

  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: 'PersonaService', method: 'getPersona' },
      extra: { subVerticalSlug }
    });
    console.error(`[PersonaService] Error loading persona for ${subVerticalSlug}:`, error);
    throw error;
  }
}

/**
 * Get persona by ID
 *
 * @param {string} id - Persona UUID
 * @returns {Promise<Object|null>} Persona object or null
 */
async function getPersonaById(id) {
  try {
    const result = await pool.query(
      `SELECT * FROM siva.sub_vertical_personas WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return formatPersona(result.rows[0]);

  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: 'PersonaService', method: 'getPersonaById' },
      extra: { id }
    });
    throw error;
  }
}

/**
 * Get all personas (optionally filtered)
 *
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} List of personas
 */
async function getAllPersonas(options = {}) {
  try {
    const { activeOnly = true, subVerticalSlug = null } = options;

    let query = `SELECT * FROM siva.sub_vertical_personas WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (activeOnly) {
      query += ` AND is_active = true`;
    }

    if (subVerticalSlug) {
      query += ` AND sub_vertical_slug = $${paramIndex}`;
      params.push(subVerticalSlug);
      paramIndex++;
    }

    query += ` ORDER BY sub_vertical_slug, is_default DESC, created_at DESC`;

    const result = await pool.query(query, params);

    return result.rows.map(formatPersona);

  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: 'PersonaService', method: 'getAllPersonas' }
    });
    throw error;
  }
}

/**
 * Create a new persona
 *
 * @param {Object} data - Persona data
 * @returns {Promise<Object>} Created persona
 */
async function createPersona(data) {
  try {
    const {
      sub_vertical_slug,
      persona_name,
      persona_role,
      persona_organization,
      persona_description,
      primary_mission,
      core_goal,
      north_star_metric,
      core_belief,
      entity_type = 'company',
      contact_priority_rules = {},
      edge_cases = {},
      timing_rules = {},
      outreach_doctrine = {},
      quality_standards = {},
      anti_patterns = [],
      success_patterns = [],
      failure_patterns = [],
      confidence_gates = [],
      scoring_config = null,
      is_default = false,
      created_by = 'system'
    } = data;

    // If setting as default, unset other defaults first
    if (is_default) {
      await pool.query(
        `UPDATE siva.sub_vertical_personas
         SET is_default = false, updated_at = NOW()
         WHERE sub_vertical_slug = $1 AND is_default = true`,
        [sub_vertical_slug]
      );
    }

    const result = await pool.query(
      `INSERT INTO siva.sub_vertical_personas (
        sub_vertical_slug,
        persona_name,
        persona_role,
        persona_organization,
        persona_description,
        primary_mission,
        core_goal,
        north_star_metric,
        core_belief,
        entity_type,
        contact_priority_rules,
        edge_cases,
        timing_rules,
        outreach_doctrine,
        quality_standards,
        anti_patterns,
        success_patterns,
        failure_patterns,
        confidence_gates,
        scoring_config,
        is_default,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *`,
      [
        sub_vertical_slug,
        persona_name,
        persona_role,
        persona_organization,
        persona_description,
        primary_mission,
        core_goal,
        north_star_metric,
        core_belief,
        entity_type,
        JSON.stringify(contact_priority_rules),
        JSON.stringify(edge_cases),
        JSON.stringify(timing_rules),
        JSON.stringify(outreach_doctrine),
        JSON.stringify(quality_standards),
        JSON.stringify(anti_patterns),
        JSON.stringify(success_patterns),
        JSON.stringify(failure_patterns),
        JSON.stringify(confidence_gates),
        scoring_config ? JSON.stringify(scoring_config) : null,
        is_default,
        created_by
      ]
    );

    // Clear cache for this sub-vertical
    clearCache(sub_vertical_slug);

    const persona = formatPersona(result.rows[0]);
    console.log(`[PersonaService] Created persona: ${persona.persona_name} for ${sub_vertical_slug}`);

    return persona;

  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: 'PersonaService', method: 'createPersona' },
      extra: { data }
    });
    throw error;
  }
}

/**
 * Update an existing persona
 *
 * @param {string} id - Persona UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated persona
 */
async function updatePersona(id, updates) {
  try {
    // Get current persona to find sub_vertical_slug
    const current = await getPersonaById(id);
    if (!current) {
      throw new Error(`Persona not found: ${id}`);
    }

    // Build dynamic update query
    const allowedFields = [
      'persona_name', 'persona_role', 'persona_organization', 'persona_description',
      'primary_mission', 'core_goal', 'north_star_metric', 'core_belief',
      'entity_type', 'contact_priority_rules', 'edge_cases', 'timing_rules',
      'outreach_doctrine', 'quality_standards', 'anti_patterns', 'success_patterns',
      'failure_patterns', 'confidence_gates', 'scoring_config', 'is_active', 'is_default'
    ];

    const setClauses = [];
    const values = [id];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramIndex}`);

        // Stringify JSONB fields
        if (['contact_priority_rules', 'edge_cases', 'timing_rules', 'outreach_doctrine',
             'quality_standards', 'anti_patterns', 'success_patterns', 'failure_patterns',
             'confidence_gates', 'scoring_config'].includes(key)) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }

        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return current;
    }

    // Add updated_by if provided
    if (updates.updated_by) {
      setClauses.push(`updated_by = $${paramIndex}`);
      values.push(updates.updated_by);
    }

    // If setting as default, unset other defaults first
    if (updates.is_default === true) {
      await pool.query(
        `UPDATE siva.sub_vertical_personas
         SET is_default = false, updated_at = NOW()
         WHERE sub_vertical_slug = $1 AND is_default = true AND id != $2`,
        [current.sub_vertical_slug, id]
      );
    }

    const result = await pool.query(
      `UPDATE siva.sub_vertical_personas
       SET ${setClauses.join(', ')}
       WHERE id = $1
       RETURNING *`,
      values
    );

    // Clear cache
    clearCache(current.sub_vertical_slug);

    const persona = formatPersona(result.rows[0]);
    console.log(`[PersonaService] Updated persona: ${persona.persona_name}`);

    return persona;

  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: 'PersonaService', method: 'updatePersona' },
      extra: { id, updates }
    });
    throw error;
  }
}

/**
 * Clone a persona for a new sub-vertical
 *
 * @param {string} sourceId - Source persona ID to clone
 * @param {string} targetSubVerticalSlug - Target sub-vertical slug
 * @param {string} newName - New persona name
 * @returns {Promise<Object>} Cloned persona
 */
async function clonePersona(sourceId, targetSubVerticalSlug, newName) {
  try {
    const source = await getPersonaById(sourceId);
    if (!source) {
      throw new Error(`Source persona not found: ${sourceId}`);
    }

    // Create clone with new sub-vertical and name
    const cloneData = {
      ...source,
      sub_vertical_slug: targetSubVerticalSlug,
      persona_name: newName,
      cloned_from_id: sourceId,
      is_default: true,
      version: 1,
      created_by: 'clone_operation'
    };

    // Remove fields that shouldn't be copied
    delete cloneData.id;
    delete cloneData.created_at;
    delete cloneData.updated_at;

    const result = await pool.query(
      `INSERT INTO siva.sub_vertical_personas (
        sub_vertical_slug,
        persona_name,
        persona_role,
        persona_organization,
        persona_description,
        primary_mission,
        core_goal,
        north_star_metric,
        core_belief,
        entity_type,
        contact_priority_rules,
        edge_cases,
        timing_rules,
        outreach_doctrine,
        quality_standards,
        anti_patterns,
        success_patterns,
        failure_patterns,
        confidence_gates,
        scoring_config,
        is_default,
        cloned_from_id,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *`,
      [
        cloneData.sub_vertical_slug,
        cloneData.persona_name,
        cloneData.persona_role,
        cloneData.persona_organization,
        cloneData.persona_description,
        cloneData.primary_mission,
        cloneData.core_goal,
        cloneData.north_star_metric,
        cloneData.core_belief,
        cloneData.entity_type,
        JSON.stringify(cloneData.contact_priority_rules),
        JSON.stringify(cloneData.edge_cases),
        JSON.stringify(cloneData.timing_rules),
        JSON.stringify(cloneData.outreach_doctrine),
        JSON.stringify(cloneData.quality_standards),
        JSON.stringify(cloneData.anti_patterns),
        JSON.stringify(cloneData.success_patterns),
        JSON.stringify(cloneData.failure_patterns),
        JSON.stringify(cloneData.confidence_gates),
        cloneData.scoring_config ? JSON.stringify(cloneData.scoring_config) : null,
        cloneData.is_default,
        sourceId,
        cloneData.created_by
      ]
    );

    const persona = formatPersona(result.rows[0]);
    console.log(`[PersonaService] Cloned persona: ${source.persona_name} → ${persona.persona_name} for ${targetSubVerticalSlug}`);

    return persona;

  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: 'PersonaService', method: 'clonePersona' },
      extra: { sourceId, targetSubVerticalSlug, newName }
    });
    throw error;
  }
}

/**
 * Get version history for a persona
 *
 * @param {string} personaId - Persona UUID
 * @returns {Promise<Array>} Version history
 */
async function getVersionHistory(personaId) {
  try {
    const result = await pool.query(
      `SELECT * FROM siva.persona_versions
       WHERE persona_id = $1
       ORDER BY version DESC`,
      [personaId]
    );

    return result.rows;

  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: 'PersonaService', method: 'getVersionHistory' },
      extra: { personaId }
    });
    throw error;
  }
}

/**
 * Restore persona to a previous version
 *
 * @param {string} personaId - Persona UUID
 * @param {number} version - Version number to restore
 * @returns {Promise<Object>} Restored persona
 */
async function restoreVersion(personaId, version) {
  try {
    // Get the version snapshot
    const versionResult = await pool.query(
      `SELECT snapshot FROM siva.persona_versions
       WHERE persona_id = $1 AND version = $2`,
      [personaId, version]
    );

    if (versionResult.rows.length === 0) {
      throw new Error(`Version ${version} not found for persona ${personaId}`);
    }

    const snapshot = versionResult.rows[0].snapshot;

    // Update persona with snapshot data
    const updates = {
      persona_name: snapshot.persona_name,
      persona_role: snapshot.persona_role,
      persona_organization: snapshot.persona_organization,
      persona_description: snapshot.persona_description,
      primary_mission: snapshot.primary_mission,
      core_goal: snapshot.core_goal,
      north_star_metric: snapshot.north_star_metric,
      core_belief: snapshot.core_belief,
      entity_type: snapshot.entity_type,
      contact_priority_rules: snapshot.contact_priority_rules,
      edge_cases: snapshot.edge_cases,
      timing_rules: snapshot.timing_rules,
      outreach_doctrine: snapshot.outreach_doctrine,
      quality_standards: snapshot.quality_standards,
      anti_patterns: snapshot.anti_patterns,
      success_patterns: snapshot.success_patterns,
      failure_patterns: snapshot.failure_patterns,
      confidence_gates: snapshot.confidence_gates,
      scoring_config: snapshot.scoring_config,
      updated_by: `restore_to_v${version}`
    };

    return await updatePersona(personaId, updates);

  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: 'PersonaService', method: 'restoreVersion' },
      extra: { personaId, version }
    });
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format raw database row to persona object
 */
function formatPersona(row) {
  return {
    id: row.id,
    sub_vertical_slug: row.sub_vertical_slug,
    sub_vertical_id: row.sub_vertical_id,

    // Identity
    persona_name: row.persona_name,
    persona_role: row.persona_role,
    persona_organization: row.persona_organization,
    persona_description: row.persona_description,

    // Mission
    primary_mission: row.primary_mission,
    core_goal: row.core_goal,
    north_star_metric: row.north_star_metric,
    core_belief: row.core_belief,

    // Entity
    entity_type: row.entity_type,

    // Rules (parse JSONB)
    contact_priority_rules: typeof row.contact_priority_rules === 'string'
      ? JSON.parse(row.contact_priority_rules)
      : row.contact_priority_rules || {},
    edge_cases: typeof row.edge_cases === 'string'
      ? JSON.parse(row.edge_cases)
      : row.edge_cases || {},
    timing_rules: typeof row.timing_rules === 'string'
      ? JSON.parse(row.timing_rules)
      : row.timing_rules || {},
    outreach_doctrine: typeof row.outreach_doctrine === 'string'
      ? JSON.parse(row.outreach_doctrine)
      : row.outreach_doctrine || {},
    quality_standards: typeof row.quality_standards === 'string'
      ? JSON.parse(row.quality_standards)
      : row.quality_standards || {},
    anti_patterns: typeof row.anti_patterns === 'string'
      ? JSON.parse(row.anti_patterns)
      : row.anti_patterns || [],
    success_patterns: typeof row.success_patterns === 'string'
      ? JSON.parse(row.success_patterns)
      : row.success_patterns || [],
    failure_patterns: typeof row.failure_patterns === 'string'
      ? JSON.parse(row.failure_patterns)
      : row.failure_patterns || [],
    confidence_gates: typeof row.confidence_gates === 'string'
      ? JSON.parse(row.confidence_gates)
      : row.confidence_gates || [],
    scoring_config: row.scoring_config
      ? (typeof row.scoring_config === 'string' ? JSON.parse(row.scoring_config) : row.scoring_config)
      : null,

    // Metadata
    is_active: row.is_active,
    is_default: row.is_default,
    version: row.version,
    cloned_from_id: row.cloned_from_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by
  };
}

/**
 * Validate persona data
 */
function validatePersona(data) {
  const errors = [];

  if (!data.sub_vertical_slug) {
    errors.push('sub_vertical_slug is required');
  }

  if (!data.persona_name) {
    errors.push('persona_name is required');
  }

  if (data.entity_type && !['company', 'individual', 'family'].includes(data.entity_type)) {
    errors.push('entity_type must be one of: company, individual, family');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Core CRUD
  getPersona,
  getPersonaById,
  getAllPersonas,
  createPersona,
  updatePersona,
  clonePersona,

  // Version Management
  getVersionHistory,
  restoreVersion,

  // Cache Management
  clearCache,

  // Helpers
  validatePersona
};

export default {
  getPersona,
  getPersonaById,
  getAllPersonas,
  createPersona,
  updatePersona,
  clonePersona,
  getVersionHistory,
  restoreVersion,
  clearCache,
  validatePersona
};
