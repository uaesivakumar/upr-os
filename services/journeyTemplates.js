/**
 * Journey Templates Service
 * Sprint 60: Journey Templates per Vertical
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CRITICAL ARCHITECTURAL RULES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. TEMPLATES ARE DATA, NOT CODE
 *    ─────────────────────────────────────────────────
 *    • Templates are stored in DB, not hardcoded
 *    • Vertical-specific behavior comes from config, not if-statements
 *    • Engine executes templates generically
 *
 * 2. VERSIONING IS IMMUTABLE
 *    ─────────────────────────────────────────────────
 *    • Each version is a new record
 *    • Running instances use their original template version
 *    • Rollback is always possible
 *
 * 3. CLONING PRESERVES LINEAGE
 *    ─────────────────────────────────────────────────
 *    • Clone history is tracked
 *    • Modifications are recorded
 *    • Parent-child relationships are maintained
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

import { query } from '../db/index.js';
import { getConfig } from './configLoader.js';
import { createDefinition } from './journeyEngine.js';

// ============================================================================
// TEMPLATE CRUD
// ============================================================================

/**
 * Get all templates with optional filtering
 */
export async function getAllTemplates(options = {}) {
  const { vertical, persona, isLatest = true, includeInactive = false } = options;

  let sql = `
    SELECT jt.*, vjb.binding_type, vjb.auto_start
    FROM journey_templates jt
    LEFT JOIN vertical_journey_bindings vjb ON jt.id = vjb.template_id AND vjb.is_active = true
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (!includeInactive) {
    sql += ` AND jt.is_active = true`;
  }

  if (isLatest) {
    sql += ` AND jt.is_latest = true`;
  }

  if (vertical) {
    sql += ` AND jt.vertical_slug = $${paramIndex++}`;
    params.push(vertical);
  }

  if (persona) {
    sql += ` AND jt.persona_slug = $${paramIndex++}`;
    params.push(persona);
  }

  sql += ` ORDER BY jt.vertical_slug, jt.name`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get template by slug (latest version) or ID
 */
export async function getTemplate(identifier, version = null) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  let sql;
  let params;

  if (isUuid) {
    sql = `SELECT * FROM journey_templates WHERE id = $1`;
    params = [identifier];
  } else if (version) {
    sql = `SELECT * FROM journey_templates WHERE slug = $1 AND version = $2`;
    params = [identifier, version];
  } else {
    sql = `SELECT * FROM journey_templates WHERE slug = $1 AND is_latest = true`;
    params = [identifier];
  }

  const result = await query(sql, params);
  return result.rows[0] || null;
}

/**
 * Get template with effective config (merged with vertical config)
 */
export async function getTemplateWithConfig(identifier, context = {}) {
  const template = await getTemplate(identifier);
  if (!template) return null;

  // Get vertical-specific config
  const verticalConfig = await getConfig('vertical', template.vertical_slug, context);
  const journeyConfig = await getConfig('journey', template.slug, context);

  // Get tone pack config
  let tonePackConfig = null;
  if (template.tone_pack_slug) {
    tonePackConfig = await getConfig('tonePack', template.tone_pack_slug, context);
  }

  return {
    ...template,
    effectiveConfig: {
      verticalConfig,
      journeyConfig,
      tonePackConfig,
      context
    }
  };
}

/**
 * Get all versions of a template
 */
export async function getTemplateVersions(slug) {
  const sql = `
    SELECT * FROM journey_templates
    WHERE slug = $1
    ORDER BY version DESC
  `;

  const result = await query(sql, [slug]);
  return result.rows;
}

/**
 * Create a new template
 */
export async function createTemplate(data) {
  const {
    slug,
    name,
    description,
    verticalSlug,
    personaSlug,
    journeyDefinition,
    defaultContext = {},
    customizableSteps = [],
    lockedSteps = [],
    tonePackSlug,
    outreachConfig = {},
    personalizationRules = [],
    autoDraftEnabled = false,
    completionMode = 'sequential',
    successCriteria = {},
    isSystem = false,
    createdBy
  } = data;

  // Validate journey definition structure
  validateJourneyDefinition(journeyDefinition);

  const sql = `
    INSERT INTO journey_templates (
      slug, name, description, version, is_latest,
      vertical_slug, persona_slug,
      journey_definition, default_context,
      customizable_steps, locked_steps,
      tone_pack_slug, outreach_config,
      personalization_rules, auto_draft_enabled,
      completion_mode, success_criteria,
      is_system, created_by
    ) VALUES ($1, $2, $3, 1, true, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *
  `;

  const result = await query(sql, [
    slug, name, description,
    verticalSlug, personaSlug,
    JSON.stringify(journeyDefinition), JSON.stringify(defaultContext),
    JSON.stringify(customizableSteps), JSON.stringify(lockedSteps),
    tonePackSlug, JSON.stringify(outreachConfig),
    JSON.stringify(personalizationRules), autoDraftEnabled,
    completionMode, JSON.stringify(successCriteria),
    isSystem, createdBy
  ]);

  return result.rows[0];
}

/**
 * Create a new version of an existing template
 */
export async function createTemplateVersion(slug, updates, createdBy) {
  // Get current version
  const current = await getTemplate(slug);
  if (!current) {
    throw new Error(`Template not found: ${slug}`);
  }

  // Mark current version as not latest
  await query(
    `UPDATE journey_templates SET is_latest = false WHERE slug = $1`,
    [slug]
  );

  // Merge updates with current
  const newDefinition = {
    ...current.journey_definition,
    ...(updates.journeyDefinition || {})
  };

  validateJourneyDefinition(newDefinition);

  const sql = `
    INSERT INTO journey_templates (
      slug, name, description, version, is_latest, parent_version_id,
      vertical_slug, persona_slug,
      journey_definition, default_context,
      customizable_steps, locked_steps,
      tone_pack_slug, outreach_config,
      personalization_rules, auto_draft_enabled,
      completion_mode, success_criteria,
      is_system, created_by
    ) VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *
  `;

  const result = await query(sql, [
    slug,
    updates.name || current.name,
    updates.description || current.description,
    current.version + 1,
    current.id,
    updates.verticalSlug || current.vertical_slug,
    updates.personaSlug || current.persona_slug,
    JSON.stringify(newDefinition),
    JSON.stringify(updates.defaultContext || current.default_context),
    JSON.stringify(updates.customizableSteps || current.customizable_steps),
    JSON.stringify(updates.lockedSteps || current.locked_steps),
    updates.tonePackSlug || current.tone_pack_slug,
    JSON.stringify(updates.outreachConfig || current.outreach_config),
    JSON.stringify(updates.personalizationRules || current.personalization_rules),
    updates.autoDraftEnabled ?? current.auto_draft_enabled,
    updates.completionMode || current.completion_mode,
    JSON.stringify(updates.successCriteria || current.success_criteria),
    current.is_system,
    createdBy
  ]);

  return result.rows[0];
}

/**
 * Clone a template
 */
export async function cloneTemplate(sourceSlug, newSlug, modifications = {}, createdBy) {
  const source = await getTemplate(sourceSlug);
  if (!source) {
    throw new Error(`Source template not found: ${sourceSlug}`);
  }

  // Create new template based on source
  const newTemplate = await createTemplate({
    slug: newSlug,
    name: modifications.name || `${source.name} (Clone)`,
    description: modifications.description || source.description,
    verticalSlug: modifications.verticalSlug || source.vertical_slug,
    personaSlug: modifications.personaSlug || source.persona_slug,
    journeyDefinition: modifications.journeyDefinition || source.journey_definition,
    defaultContext: modifications.defaultContext || source.default_context,
    customizableSteps: modifications.customizableSteps || source.customizable_steps,
    lockedSteps: modifications.lockedSteps || source.locked_steps,
    tonePackSlug: modifications.tonePackSlug || source.tone_pack_slug,
    outreachConfig: modifications.outreachConfig || source.outreach_config,
    personalizationRules: modifications.personalizationRules || source.personalization_rules,
    autoDraftEnabled: modifications.autoDraftEnabled ?? source.auto_draft_enabled,
    completionMode: modifications.completionMode || source.completion_mode,
    successCriteria: modifications.successCriteria || source.success_criteria,
    isSystem: false,
    createdBy
  });

  // Record clone history
  await recordClone(source.id, newTemplate.id, createdBy, modifications);

  return newTemplate;
}

/**
 * Record clone history
 */
async function recordClone(sourceId, clonedId, createdBy, modifications) {
  const sql = `
    INSERT INTO journey_template_clones (
      source_template_id, cloned_template_id, clone_reason, modifications_made, created_by
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  await query(sql, [
    sourceId,
    clonedId,
    modifications.reason || 'User clone',
    JSON.stringify(Object.keys(modifications)),
    createdBy
  ]);
}

/**
 * Get clone history for a template
 */
export async function getCloneHistory(templateId) {
  const sql = `
    SELECT jtc.*,
           source.slug as source_slug, source.name as source_name,
           cloned.slug as cloned_slug, cloned.name as cloned_name
    FROM journey_template_clones jtc
    JOIN journey_templates source ON jtc.source_template_id = source.id
    JOIN journey_templates cloned ON jtc.cloned_template_id = cloned.id
    WHERE jtc.source_template_id = $1 OR jtc.cloned_template_id = $1
    ORDER BY jtc.created_at DESC
  `;

  const result = await query(sql, [templateId]);
  return result.rows;
}

// ============================================================================
// VERTICAL BINDINGS
// ============================================================================

/**
 * Get templates for a vertical
 */
export async function getTemplatesForVertical(verticalSlug, options = {}) {
  const { bindingType, autoStartOnly = false } = options;

  let sql = `
    SELECT jt.*, vjb.binding_type, vjb.auto_start, vjb.auto_start_config, vjb.priority
    FROM journey_templates jt
    JOIN vertical_journey_bindings vjb ON jt.id = vjb.template_id
    WHERE jt.vertical_slug = $1
      AND jt.is_active = true
      AND jt.is_latest = true
      AND vjb.is_active = true
  `;
  const params = [verticalSlug];
  let paramIndex = 2;

  if (bindingType) {
    sql += ` AND vjb.binding_type = $${paramIndex++}`;
    params.push(bindingType);
  }

  if (autoStartOnly) {
    sql += ` AND vjb.auto_start = true`;
  }

  sql += ` ORDER BY vjb.priority`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Bind template to vertical
 */
export async function bindTemplateToVertical(templateId, verticalSlug, binding) {
  const {
    bindingType,
    triggerConditions = {},
    priority = 50,
    autoStart = false,
    autoStartConfig = {}
  } = binding;

  const sql = `
    INSERT INTO vertical_journey_bindings (
      vertical_slug, template_id, binding_type,
      trigger_conditions, priority, auto_start, auto_start_config
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (vertical_slug, template_id, binding_type)
    DO UPDATE SET
      trigger_conditions = $4,
      priority = $5,
      auto_start = $6,
      auto_start_config = $7,
      is_active = true
    RETURNING *
  `;

  const result = await query(sql, [
    verticalSlug, templateId, bindingType,
    JSON.stringify(triggerConditions), priority, autoStart, JSON.stringify(autoStartConfig)
  ]);

  return result.rows[0];
}

/**
 * Unbind template from vertical
 */
export async function unbindTemplateFromVertical(templateId, verticalSlug, bindingType) {
  const sql = `
    UPDATE vertical_journey_bindings
    SET is_active = false
    WHERE template_id = $1 AND vertical_slug = $2 AND binding_type = $3
    RETURNING *
  `;

  const result = await query(sql, [templateId, verticalSlug, bindingType]);
  return result.rows[0];
}

// ============================================================================
// INSTANTIATE TEMPLATE
// ============================================================================

/**
 * Create a journey instance from a template
 */
export async function instantiateTemplate(templateSlug, context = {}, options = {}) {
  const template = await getTemplateWithConfig(templateSlug, context);
  if (!template) {
    throw new Error(`Template not found: ${templateSlug}`);
  }

  // Merge default context with provided context
  const mergedContext = {
    ...template.default_context,
    ...context,
    _template: {
      slug: template.slug,
      version: template.version,
      vertical: template.vertical_slug
    }
  };

  // Apply personalization rules
  const personalizedContext = await applyPersonalization(
    mergedContext,
    template.personalization_rules
  );

  // Create journey definition from template
  const definition = await createDefinition({
    slug: `${template.slug}_instance_${Date.now()}`,
    name: template.name,
    description: template.description,
    ...template.journey_definition,
    verticalSlug: template.vertical_slug,
    isSystem: false,
    createdBy: options.createdBy
  });

  // Import createInstance from journeyEngine
  const { createInstance } = await import('./journeyEngine.js');

  // Create instance
  const instance = await createInstance(definition.id, personalizedContext, {
    initiatedBy: options.initiatedBy,
    priority: options.priority
  });

  return {
    instance,
    definition,
    template,
    personalizedContext
  };
}

/**
 * Apply personalization rules to context
 */
async function applyPersonalization(context, rules) {
  if (!rules || rules.length === 0) {
    return context;
  }

  const personalized = { ...context };

  for (const rule of rules) {
    try {
      const { type, config } = rule;

      switch (type) {
        case 'field_map':
          // Map field values
          for (const [source, target] of Object.entries(config.mappings || {})) {
            personalized[target] = getNestedValue(context, source);
          }
          break;

        case 'default_value':
          // Set default values for missing fields
          for (const [field, defaultValue] of Object.entries(config.defaults || {})) {
            if (!(field in personalized) || personalized[field] === null) {
              personalized[field] = defaultValue;
            }
          }
          break;

        case 'transform':
          // Apply transformations
          for (const transform of config.transforms || []) {
            const value = getNestedValue(context, transform.source);
            personalized[transform.target] = applyTransform(value, transform.operation);
          }
          break;

        case 'conditional':
          // Conditional field setting
          if (evaluateCondition(config.condition, context)) {
            Object.assign(personalized, config.values);
          }
          break;
      }
    } catch (error) {
      console.warn(`Personalization rule failed: ${rule.type}`, error.message);
    }
  }

  return personalized;
}

function applyTransform(value, operation) {
  switch (operation) {
    case 'uppercase':
      return String(value).toUpperCase();
    case 'lowercase':
      return String(value).toLowerCase();
    case 'trim':
      return String(value).trim();
    case 'number':
      return Number(value);
    case 'boolean':
      return Boolean(value);
    default:
      return value;
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function evaluateCondition(conditionStr, context) {
  const match = conditionStr.match(/^(\w+(?:\.\w+)*)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
  if (!match) return false;

  const [, field, operator, valueStr] = match;
  const actualValue = getNestedValue(context, field);
  const expectedValue = valueStr.trim();

  switch (operator) {
    case '>=': return actualValue >= Number(expectedValue);
    case '<=': return actualValue <= Number(expectedValue);
    case '>': return actualValue > Number(expectedValue);
    case '<': return actualValue < Number(expectedValue);
    case '==': return String(actualValue) === expectedValue;
    case '!=': return String(actualValue) !== expectedValue;
    default: return false;
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate journey definition structure
 */
function validateJourneyDefinition(definition) {
  if (!definition) {
    throw new Error('Journey definition is required');
  }

  if (!definition.initial_state) {
    throw new Error('Journey definition must have initial_state');
  }

  if (!Array.isArray(definition.states) || definition.states.length === 0) {
    throw new Error('Journey definition must have at least one state');
  }

  if (!definition.states.includes(definition.initial_state)) {
    throw new Error('initial_state must be in states array');
  }

  if (!Array.isArray(definition.transitions)) {
    throw new Error('Journey definition must have transitions array');
  }

  if (!Array.isArray(definition.steps)) {
    throw new Error('Journey definition must have steps array');
  }

  // Validate transitions
  for (const transition of definition.transitions) {
    if (!transition.from || !transition.to) {
      throw new Error('Each transition must have from and to states');
    }
    if (!definition.states.includes(transition.from)) {
      throw new Error(`Transition from state not in states: ${transition.from}`);
    }
    if (!definition.states.includes(transition.to)) {
      throw new Error(`Transition to state not in states: ${transition.to}`);
    }
  }

  // Validate steps
  for (const step of definition.steps) {
    if (!step.slug || !step.type) {
      throw new Error('Each step must have slug and type');
    }
  }
}

// ============================================================================
// TEMPLATE DASHBOARD
// ============================================================================

/**
 * Get template usage statistics
 */
export async function getTemplateStats(templateId) {
  const [usageStats, versionHistory, bindings] = await Promise.all([
    query(`
      SELECT
        COUNT(*) as total_instances,
        COUNT(*) FILTER (WHERE ji.status = 'completed') as completed,
        COUNT(*) FILTER (WHERE ji.status = 'failed') as failed,
        COUNT(*) FILTER (WHERE ji.status = 'running') as running,
        AVG(EXTRACT(EPOCH FROM (ji.completed_at - ji.started_at))) as avg_duration_seconds
      FROM journey_instances ji
      JOIN journey_definitions jd ON ji.definition_id = jd.id
      WHERE jd.id IN (
        SELECT id FROM journey_definitions WHERE slug LIKE (
          SELECT slug || '%' FROM journey_templates WHERE id = $1
        )
      )
    `, [templateId]),
    getTemplateVersions((await getTemplate(templateId))?.slug),
    query(`
      SELECT * FROM vertical_journey_bindings WHERE template_id = $1
    `, [templateId])
  ]);

  return {
    usage: usageStats.rows[0],
    versions: versionHistory,
    bindings: bindings.rows
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getAllTemplates,
  getTemplate,
  getTemplateWithConfig,
  getTemplateVersions,
  createTemplate,
  createTemplateVersion,
  cloneTemplate,
  getCloneHistory,
  getTemplatesForVertical,
  bindTemplateToVertical,
  unbindTemplateFromVertical,
  instantiateTemplate,
  getTemplateStats
};
