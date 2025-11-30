/**
 * Vertical Pack Service
 * Sprint 52: Vertical Pack System
 *
 * Service for managing vertical packs and their configurations.
 * Includes signal types, scoring templates, evidence rules,
 * persona templates, journey templates, and radar targets.
 *
 * Key Features:
 * - CRUD operations for vertical packs
 * - Complete vertical configuration retrieval
 * - Sub-vertical management
 * - Version history and cloning
 */

import db from '../utils/db.js';
import crypto from 'crypto';

const { pool } = db;

// ============================================================================
// VERTICAL PACK CRUD
// ============================================================================

/**
 * Get all vertical packs
 */
async function getAllVerticals(options = {}) {
  const { includeSubVerticals = true, activeOnly = true } = options;

  let query = `
    SELECT vp.*, parent.name as parent_name
    FROM vertical_packs vp
    LEFT JOIN vertical_packs parent ON vp.parent_vertical_id = parent.id
    WHERE 1=1
  `;

  const params = [];

  if (!includeSubVerticals) {
    query += ' AND vp.is_sub_vertical = false';
  }

  if (activeOnly) {
    query += ' AND vp.is_active = true';
  }

  query += ' ORDER BY vp.is_sub_vertical, vp.name';

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get vertical by slug
 */
async function getVertical(slug) {
  const result = await pool.query(`
    SELECT vp.*, parent.name as parent_name
    FROM vertical_packs vp
    LEFT JOIN vertical_packs parent ON vp.parent_vertical_id = parent.id
    WHERE vp.slug = $1
  `, [slug]);

  return result.rows[0] || null;
}

/**
 * Get complete vertical configuration
 */
async function getVerticalConfig(slug) {
  const result = await pool.query(
    'SELECT get_vertical_config($1) as config',
    [slug]
  );

  return result.rows[0]?.config || null;
}

/**
 * Create a new vertical pack
 */
async function createVertical(data) {
  const {
    slug,
    name,
    description,
    parentVerticalId,
    config = {},
    features = {},
    icon,
    color
  } = data;

  const result = await pool.query(`
    INSERT INTO vertical_packs
      (slug, name, description, parent_vertical_id, is_sub_vertical, config, features, icon, color)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    slug,
    name,
    description,
    parentVerticalId,
    !!parentVerticalId,
    JSON.stringify(config),
    JSON.stringify(features),
    icon,
    color
  ]);

  // Create initial version
  await createVersion(result.rows[0].id, 'Initial creation');

  return result.rows[0];
}

/**
 * Update a vertical pack
 */
async function updateVertical(slug, updates) {
  const vertical = await getVertical(slug);
  if (!vertical) {
    throw new Error(`Vertical not found: ${slug}`);
  }

  if (vertical.is_system && updates.slug && updates.slug !== slug) {
    throw new Error('Cannot change slug of system vertical');
  }

  const allowedFields = ['name', 'description', 'config', 'features', 'icon', 'color', 'is_active'];
  const setClause = [];
  const values = [slug];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = $${paramIndex}`);
      values.push(key === 'config' || key === 'features' ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  if (setClause.length === 0) {
    return vertical;
  }

  setClause.push('updated_at = NOW()');

  const result = await pool.query(`
    UPDATE vertical_packs
    SET ${setClause.join(', ')}
    WHERE slug = $1
    RETURNING *
  `, values);

  // Create version for the update
  await createVersion(result.rows[0].id, `Updated: ${Object.keys(updates).join(', ')}`);

  return result.rows[0];
}

/**
 * Delete a vertical pack
 */
async function deleteVertical(slug) {
  const vertical = await getVertical(slug);
  if (!vertical) {
    throw new Error(`Vertical not found: ${slug}`);
  }

  if (vertical.is_system) {
    throw new Error('Cannot delete system vertical');
  }

  await pool.query('DELETE FROM vertical_packs WHERE slug = $1', [slug]);

  return { deleted: true, slug };
}

/**
 * Clone a vertical pack
 */
async function cloneVertical(sourceSlug, newSlug, newName) {
  const result = await pool.query(
    'SELECT clone_vertical_pack($1, $2, $3) as new_id',
    [sourceSlug, newSlug, newName]
  );

  return getVertical(newSlug);
}

// ============================================================================
// SIGNAL TYPES
// ============================================================================

/**
 * Get signal types for a vertical
 */
async function getSignalTypes(verticalSlug) {
  const result = await pool.query(`
    SELECT st.*
    FROM vertical_signal_types st
    JOIN vertical_packs vp ON st.vertical_id = vp.id
    WHERE vp.slug = $1 AND st.is_active = true
    ORDER BY st.priority, st.name
  `, [verticalSlug]);

  return result.rows;
}

/**
 * Create a signal type
 */
async function createSignalType(verticalSlug, data) {
  const vertical = await getVertical(verticalSlug);
  if (!vertical) {
    throw new Error(`Vertical not found: ${verticalSlug}`);
  }

  const result = await pool.query(`
    INSERT INTO vertical_signal_types
      (vertical_id, slug, name, description, category, detection_config, score_weight, score_category, decay_days, decay_type, priority)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `, [
    vertical.id,
    data.slug,
    data.name,
    data.description,
    data.category,
    JSON.stringify(data.detectionConfig || {}),
    data.scoreWeight || 1.0,
    data.scoreCategory,
    data.decayDays || 30,
    data.decayType || 'linear',
    data.priority || 100
  ]);

  return result.rows[0];
}

/**
 * Update a signal type
 */
async function updateSignalType(verticalSlug, signalSlug, updates) {
  const result = await pool.query(`
    UPDATE vertical_signal_types st
    SET
      name = COALESCE($3, st.name),
      description = COALESCE($4, st.description),
      category = COALESCE($5, st.category),
      detection_config = COALESCE($6, st.detection_config),
      score_weight = COALESCE($7, st.score_weight),
      score_category = COALESCE($8, st.score_category),
      decay_days = COALESCE($9, st.decay_days),
      priority = COALESCE($10, st.priority),
      is_active = COALESCE($11, st.is_active)
    FROM vertical_packs vp
    WHERE st.vertical_id = vp.id AND vp.slug = $1 AND st.slug = $2
    RETURNING st.*
  `, [
    verticalSlug,
    signalSlug,
    updates.name,
    updates.description,
    updates.category,
    updates.detectionConfig ? JSON.stringify(updates.detectionConfig) : null,
    updates.scoreWeight,
    updates.scoreCategory,
    updates.decayDays,
    updates.priority,
    updates.isActive
  ]);

  return result.rows[0];
}

/**
 * Delete a signal type
 */
async function deleteSignalType(verticalSlug, signalSlug) {
  await pool.query(`
    DELETE FROM vertical_signal_types st
    USING vertical_packs vp
    WHERE st.vertical_id = vp.id AND vp.slug = $1 AND st.slug = $2
  `, [verticalSlug, signalSlug]);

  return { deleted: true };
}

// ============================================================================
// SCORING TEMPLATES
// ============================================================================

/**
 * Get scoring templates for a vertical
 */
async function getScoringTemplates(verticalSlug) {
  const result = await pool.query(`
    SELECT sc.*
    FROM vertical_scoring_templates sc
    JOIN vertical_packs vp ON sc.vertical_id = vp.id
    WHERE vp.slug = $1 AND sc.is_active = true
    ORDER BY sc.is_default DESC, sc.name
  `, [verticalSlug]);

  return result.rows;
}

/**
 * Get default scoring template for a vertical and score type
 */
async function getDefaultScoringTemplate(verticalSlug, scoringType) {
  const result = await pool.query(`
    SELECT sc.*
    FROM vertical_scoring_templates sc
    JOIN vertical_packs vp ON sc.vertical_id = vp.id
    WHERE vp.slug = $1 AND sc.scoring_type = $2 AND sc.is_default = true AND sc.is_active = true
    LIMIT 1
  `, [verticalSlug, scoringType]);

  return result.rows[0] || null;
}

/**
 * Create a scoring template
 */
async function createScoringTemplate(verticalSlug, data) {
  const vertical = await getVertical(verticalSlug);
  if (!vertical) {
    throw new Error(`Vertical not found: ${verticalSlug}`);
  }

  const result = await pool.query(`
    INSERT INTO vertical_scoring_templates
      (vertical_id, slug, name, description, scoring_type, weights, thresholds, normalization, is_default)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    vertical.id,
    data.slug,
    data.name,
    data.description,
    data.scoringType,
    JSON.stringify(data.weights || {}),
    JSON.stringify(data.thresholds || {}),
    JSON.stringify(data.normalization || {}),
    data.isDefault || false
  ]);

  return result.rows[0];
}

/**
 * Update a scoring template
 */
async function updateScoringTemplate(verticalSlug, templateSlug, updates) {
  const result = await pool.query(`
    UPDATE vertical_scoring_templates sc
    SET
      name = COALESCE($3, sc.name),
      description = COALESCE($4, sc.description),
      weights = COALESCE($5, sc.weights),
      thresholds = COALESCE($6, sc.thresholds),
      normalization = COALESCE($7, sc.normalization),
      is_default = COALESCE($8, sc.is_default),
      is_active = COALESCE($9, sc.is_active),
      updated_at = NOW()
    FROM vertical_packs vp
    WHERE sc.vertical_id = vp.id AND vp.slug = $1 AND sc.slug = $2
    RETURNING sc.*
  `, [
    verticalSlug,
    templateSlug,
    updates.name,
    updates.description,
    updates.weights ? JSON.stringify(updates.weights) : null,
    updates.thresholds ? JSON.stringify(updates.thresholds) : null,
    updates.normalization ? JSON.stringify(updates.normalization) : null,
    updates.isDefault,
    updates.isActive
  ]);

  return result.rows[0];
}

// ============================================================================
// EVIDENCE RULES
// ============================================================================

/**
 * Get evidence rules for a vertical
 */
async function getEvidenceRules(verticalSlug) {
  const result = await pool.query(`
    SELECT er.*
    FROM vertical_evidence_rules er
    JOIN vertical_packs vp ON er.vertical_id = vp.id
    WHERE vp.slug = $1 AND er.is_active = true
    ORDER BY er.priority, er.name
  `, [verticalSlug]);

  return result.rows;
}

/**
 * Create an evidence rule
 */
async function createEvidenceRule(verticalSlug, data) {
  const vertical = await getVertical(verticalSlug);
  if (!vertical) {
    throw new Error(`Vertical not found: ${verticalSlug}`);
  }

  const result = await pool.query(`
    INSERT INTO vertical_evidence_rules
      (vertical_id, slug, name, description, rule_type, conditions, actions, evidence_category, evidence_weight, priority)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    vertical.id,
    data.slug,
    data.name,
    data.description,
    data.ruleType,
    JSON.stringify(data.conditions || {}),
    JSON.stringify(data.actions || []),
    data.evidenceCategory,
    data.evidenceWeight || 1.0,
    data.priority || 100
  ]);

  return result.rows[0];
}

/**
 * Evaluate evidence rules against entity data
 */
async function evaluateEvidenceRules(verticalSlug, entityData) {
  const rules = await getEvidenceRules(verticalSlug);
  const evidence = [];

  for (const rule of rules) {
    if (evaluateCondition(rule.conditions, entityData)) {
      for (const action of rule.actions) {
        if (action.type === 'add_evidence') {
          evidence.push({
            type: action.evidence_type,
            confidence: action.confidence,
            source: `rule:${rule.slug}`,
            category: rule.evidence_category,
            weight: rule.evidence_weight
          });
        }
      }
    }
  }

  return evidence;
}

/**
 * Evaluate a condition against data
 */
function evaluateCondition(condition, data) {
  if (!condition || Object.keys(condition).length === 0) {
    return false;
  }

  const { field, operator, value } = condition;
  const fieldValue = data[field];

  switch (operator) {
    case 'eq':
    case 'equals':
      return fieldValue === value;

    case 'neq':
    case 'not_equals':
      return fieldValue !== value;

    case 'gt':
      return fieldValue > value;

    case 'gte':
      return fieldValue >= value;

    case 'lt':
      return fieldValue < value;

    case 'lte':
      return fieldValue <= value;

    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);

    case 'not_in':
      return Array.isArray(value) && !value.includes(fieldValue);

    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(value);

    case 'contains_any':
      if (!Array.isArray(fieldValue) || !Array.isArray(value)) return false;
      return value.some(v => fieldValue.includes(v));

    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;

    case 'not_exists':
      return fieldValue === undefined || fieldValue === null;

    case 'within_days':
      if (!fieldValue) return false;
      const date = new Date(fieldValue);
      const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= value;

    default:
      console.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

// ============================================================================
// PERSONA TEMPLATES
// ============================================================================

/**
 * Get persona templates for a vertical
 */
async function getPersonaTemplates(verticalSlug) {
  const result = await pool.query(`
    SELECT pt.*
    FROM vertical_persona_templates pt
    JOIN vertical_packs vp ON pt.vertical_id = vp.id
    WHERE vp.slug = $1 AND pt.is_active = true
    ORDER BY pt.is_default DESC, pt.priority, pt.name
  `, [verticalSlug]);

  return result.rows;
}

/**
 * Create a persona template
 */
async function createPersonaTemplate(verticalSlug, data) {
  const vertical = await getVertical(verticalSlug);
  if (!vertical) {
    throw new Error(`Vertical not found: ${verticalSlug}`);
  }

  const result = await pool.query(`
    INSERT INTO vertical_persona_templates
      (vertical_id, slug, name, description, target_titles, target_departments, seniority_levels, characteristics, messaging_config, outreach_templates, score_multipliers, is_default, priority)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `, [
    vertical.id,
    data.slug,
    data.name,
    data.description,
    JSON.stringify(data.targetTitles || []),
    JSON.stringify(data.targetDepartments || []),
    JSON.stringify(data.seniorityLevels || []),
    JSON.stringify(data.characteristics || {}),
    JSON.stringify(data.messagingConfig || {}),
    JSON.stringify(data.outreachTemplates || {}),
    JSON.stringify(data.scoreMultipliers || {}),
    data.isDefault || false,
    data.priority || 100
  ]);

  return result.rows[0];
}

/**
 * Match persona to contact
 */
async function matchPersona(verticalSlug, contactData) {
  const personas = await getPersonaTemplates(verticalSlug);
  let bestMatch = null;
  let bestScore = 0;

  for (const persona of personas) {
    let score = 0;

    // Title match
    if (contactData.title) {
      const titleLower = contactData.title.toLowerCase();
      for (const targetTitle of persona.target_titles || []) {
        if (titleLower.includes(targetTitle.toLowerCase())) {
          score += 30;
          break;
        }
      }
    }

    // Department match
    if (contactData.department) {
      const deptLower = contactData.department.toLowerCase();
      for (const targetDept of persona.target_departments || []) {
        if (deptLower.includes(targetDept.toLowerCase())) {
          score += 20;
          break;
        }
      }
    }

    // Seniority match
    if (contactData.seniority) {
      if ((persona.seniority_levels || []).includes(contactData.seniority)) {
        score += 25;
      }
    }

    // Default persona bonus
    if (persona.is_default) {
      score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = persona;
    }
  }

  return bestMatch ? { persona: bestMatch, matchScore: bestScore } : null;
}

// ============================================================================
// JOURNEY TEMPLATES
// ============================================================================

/**
 * Get journey templates for a vertical
 */
async function getJourneyTemplates(verticalSlug, journeyType = null) {
  let query = `
    SELECT jt.*
    FROM vertical_journey_templates jt
    JOIN vertical_packs vp ON jt.vertical_id = vp.id
    WHERE vp.slug = $1 AND jt.is_active = true
  `;

  const params = [verticalSlug];

  if (journeyType) {
    query += ' AND jt.journey_type = $2';
    params.push(journeyType);
  }

  query += ' ORDER BY jt.is_default DESC, jt.name';

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get default journey template
 */
async function getDefaultJourneyTemplate(verticalSlug, journeyType) {
  const result = await pool.query(`
    SELECT jt.*
    FROM vertical_journey_templates jt
    JOIN vertical_packs vp ON jt.vertical_id = vp.id
    WHERE vp.slug = $1 AND jt.journey_type = $2 AND jt.is_default = true AND jt.is_active = true
    LIMIT 1
  `, [verticalSlug, journeyType]);

  return result.rows[0] || null;
}

/**
 * Create a journey template
 */
async function createJourneyTemplate(verticalSlug, data) {
  const vertical = await getVertical(verticalSlug);
  if (!vertical) {
    throw new Error(`Vertical not found: ${verticalSlug}`);
  }

  const result = await pool.query(`
    INSERT INTO vertical_journey_templates
      (vertical_id, slug, name, description, journey_type, steps, entry_conditions, exit_conditions, llm_config, timeout_minutes, retry_config, is_default)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `, [
    vertical.id,
    data.slug,
    data.name,
    data.description,
    data.journeyType,
    JSON.stringify(data.steps || []),
    JSON.stringify(data.entryConditions || {}),
    JSON.stringify(data.exitConditions || {}),
    JSON.stringify(data.llmConfig || {}),
    data.timeoutMinutes || 30,
    JSON.stringify(data.retryConfig || {}),
    data.isDefault || false
  ]);

  return result.rows[0];
}

// ============================================================================
// RADAR TARGETS
// ============================================================================

/**
 * Get radar targets for a vertical
 */
async function getRadarTargets(verticalSlug) {
  const result = await pool.query(`
    SELECT rt.*, sc.name as scoring_template_name
    FROM vertical_radar_targets rt
    JOIN vertical_packs vp ON rt.vertical_id = vp.id
    LEFT JOIN vertical_scoring_templates sc ON rt.scoring_template_id = sc.id
    WHERE vp.slug = $1 AND rt.is_active = true
    ORDER BY rt.priority, rt.name
  `, [verticalSlug]);

  return result.rows;
}

/**
 * Create a radar target
 */
async function createRadarTarget(verticalSlug, data) {
  const vertical = await getVertical(verticalSlug);
  if (!vertical) {
    throw new Error(`Vertical not found: ${verticalSlug}`);
  }

  const result = await pool.query(`
    INSERT INTO vertical_radar_targets
      (vertical_id, slug, name, description, target_type, discovery_config, scoring_template_id, min_score_threshold, alert_config, priority)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    vertical.id,
    data.slug,
    data.name,
    data.description,
    data.targetType,
    JSON.stringify(data.discoveryConfig || {}),
    data.scoringTemplateId,
    data.minScoreThreshold || 50,
    JSON.stringify(data.alertConfig || {}),
    data.priority || 100
  ]);

  return result.rows[0];
}

// ============================================================================
// VERSION MANAGEMENT
// ============================================================================

/**
 * Create a version snapshot
 */
async function createVersion(verticalId, changeSummary, changedBy = 'system') {
  // Get current version number
  const versionResult = await pool.query(`
    SELECT COALESCE(MAX(version), 0) + 1 as next_version
    FROM vertical_pack_versions
    WHERE vertical_id = $1
  `, [verticalId]);

  const nextVersion = versionResult.rows[0].next_version;

  // Get complete config snapshot
  const vertical = await pool.query('SELECT * FROM vertical_packs WHERE id = $1', [verticalId]);
  const config = await pool.query('SELECT get_vertical_config($1) as config', [vertical.rows[0].slug]);

  await pool.query(`
    INSERT INTO vertical_pack_versions (vertical_id, version, snapshot, change_summary, changed_by)
    VALUES ($1, $2, $3, $4, $5)
  `, [verticalId, nextVersion, config.rows[0].config, changeSummary, changedBy]);

  return nextVersion;
}

/**
 * Get version history
 */
async function getVersionHistory(verticalSlug) {
  const result = await pool.query(`
    SELECT vpv.*
    FROM vertical_pack_versions vpv
    JOIN vertical_packs vp ON vpv.vertical_id = vp.id
    WHERE vp.slug = $1
    ORDER BY vpv.version DESC
  `, [verticalSlug]);

  return result.rows;
}

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * Get vertical dashboard summary
 */
async function getDashboard() {
  const result = await pool.query('SELECT * FROM v_vertical_pack_dashboard');
  return result.rows;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Vertical CRUD
  getAllVerticals,
  getVertical,
  getVerticalConfig,
  createVertical,
  updateVertical,
  deleteVertical,
  cloneVertical,

  // Signal Types
  getSignalTypes,
  createSignalType,
  updateSignalType,
  deleteSignalType,

  // Scoring Templates
  getScoringTemplates,
  getDefaultScoringTemplate,
  createScoringTemplate,
  updateScoringTemplate,

  // Evidence Rules
  getEvidenceRules,
  createEvidenceRule,
  evaluateEvidenceRules,
  evaluateCondition,

  // Persona Templates
  getPersonaTemplates,
  createPersonaTemplate,
  matchPersona,

  // Journey Templates
  getJourneyTemplates,
  getDefaultJourneyTemplate,
  createJourneyTemplate,

  // Radar Targets
  getRadarTargets,
  createRadarTarget,

  // Version Management
  createVersion,
  getVersionHistory,

  // Dashboard
  getDashboard
};
