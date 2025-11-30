/**
 * Object Intelligence Service
 * Sprint 64: Object Intelligence v2
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CRITICAL ARCHITECTURAL RULES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. NO TENANT AWARENESS
 *    ─────────────────────────────────────────────────
 *    - Context passed via API params (territory_id, vertical_slug)
 *    - No tenantId references anywhere
 *    - This is PURE engine logic
 *
 * 2. ALL CONFIG VIA ConfigLoader
 *    ─────────────────────────────────────────────────
 *    - No hardcoded vertical names
 *    - All behavior from config
 *    - Deterministic: same config + input = same output
 *
 * 3. GRAPH-FIRST DESIGN
 *    ─────────────────────────────────────────────────
 *    - Objects are nodes
 *    - Relationships are edges
 *    - Everything is queryable
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

import { getDb } from '../db/index.js';
import { ConfigLoader } from './configLoader.js';

// ============================================================================
// OBJECT NODES - Core CRUD Operations
// ============================================================================

/**
 * Register or update an object node
 * Creates new object or merges data with existing
 *
 * @param {string} objectType - Type of object (company, contact, deal, signal)
 * @param {Object} payload - Object data
 * @param {Object} context - Context (territory_id, vertical_slug)
 * @returns {Object} Created/updated object node
 */
export async function registerObject(objectType, payload, context = {}) {
  const db = getDb();

  const { externalId, data = {}, ...restPayload } = payload;
  const { territoryId, verticalSlug } = context;

  // Merge any extra payload fields into data
  const mergedData = { ...data, ...restPayload };

  // Check if object already exists
  if (externalId) {
    const existing = await db('object_nodes')
      .where({ object_type: objectType, external_id: externalId })
      .first();

    if (existing) {
      // Merge data and update
      const [updated] = await db('object_nodes')
        .where({ id: existing.id })
        .update({
          data: db.raw('data || ?', [JSON.stringify(mergedData)]),
          territory_id: territoryId || existing.territory_id,
          vertical_slug: verticalSlug || existing.vertical_slug,
          version: db.raw('version + 1'),
          updated_at: new Date()
        })
        .returning('*');

      // Log the update event
      await appendObjectEvent(updated.id, 'updated', {
        previousVersion: existing.version,
        newVersion: updated.version,
        fieldsUpdated: Object.keys(mergedData)
      });

      return transformObjectNode(updated);
    }
  }

  // Create new object
  const [created] = await db('object_nodes')
    .insert({
      object_type: objectType,
      external_id: externalId || null,
      territory_id: territoryId || null,
      vertical_slug: verticalSlug || null,
      data: mergedData
    })
    .returning('*');

  // Initialize state
  await db('object_states')
    .insert({
      object_id: created.id,
      state: { status: 'new', createdAt: new Date().toISOString() }
    })
    .onConflict('object_id')
    .ignore();

  // Log creation event
  await appendObjectEvent(created.id, 'created', {
    objectType,
    externalId: externalId || null
  });

  return transformObjectNode(created);
}

/**
 * Get object by ID
 */
export async function getObject(objectId) {
  const db = getDb();

  const object = await db('object_nodes')
    .where({ id: objectId, is_active: true })
    .first();

  if (!object) return null;
  return transformObjectNode(object);
}

/**
 * Get object by external ID
 */
export async function getObjectByExternalId(objectType, externalId) {
  const db = getDb();

  const object = await db('object_nodes')
    .where({ object_type: objectType, external_id: externalId, is_active: true })
    .first();

  if (!object) return null;
  return transformObjectNode(object);
}

/**
 * List objects with filters
 */
export async function listObjects(filters = {}, options = {}) {
  const db = getDb();
  const { objectType, territoryId, verticalSlug, search } = filters;
  const { limit = 50, offset = 0, orderBy = 'created_at', order = 'desc' } = options;

  let query = db('object_nodes').where('is_active', true);

  if (objectType) query = query.where('object_type', objectType);
  if (territoryId) query = query.where('territory_id', territoryId);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (search) {
    query = query.where(function () {
      this.where('external_id', 'ilike', `%${search}%`)
        .orWhereRaw("data->>'name' ilike ?", [`%${search}%`])
        .orWhereRaw("data->>'domain' ilike ?", [`%${search}%`]);
    });
  }

  const [{ count }] = await query.clone().count();
  const objects = await query
    .orderBy(orderBy, order)
    .limit(limit)
    .offset(offset);

  return {
    objects: objects.map(transformObjectNode),
    total: parseInt(count, 10),
    limit,
    offset
  };
}

/**
 * Deactivate an object (soft delete)
 */
export async function deactivateObject(objectId) {
  const db = getDb();

  const [updated] = await db('object_nodes')
    .where({ id: objectId })
    .update({
      is_active: false,
      updated_at: new Date()
    })
    .returning('*');

  if (updated) {
    await appendObjectEvent(objectId, 'deactivated', {});
  }

  return updated ? transformObjectNode(updated) : null;
}

// ============================================================================
// OBJECT EDGES - Relationship Management
// ============================================================================

/**
 * Link two objects with an edge
 *
 * @param {string} fromObjectId - Source object ID
 * @param {string} toObjectId - Target object ID
 * @param {string} edgeType - Type of relationship
 * @param {number} weight - Relationship strength (0-1)
 * @param {Object} metadata - Additional edge metadata
 */
export async function linkObjects(fromObjectId, toObjectId, edgeType, weight = 1.0, metadata = {}) {
  const db = getDb();

  const [edge] = await db('object_edges')
    .insert({
      from_object_id: fromObjectId,
      to_object_id: toObjectId,
      edge_type: edgeType,
      weight: Math.max(0, Math.min(1, weight)),
      metadata
    })
    .onConflict(['from_object_id', 'to_object_id', 'edge_type'])
    .merge({
      weight: Math.max(0, Math.min(1, weight)),
      metadata: db.raw('object_edges.metadata || ?', [JSON.stringify(metadata)]),
      updated_at: new Date()
    })
    .returning('*');

  // Log events on both objects
  await Promise.all([
    appendObjectEvent(fromObjectId, 'linked', {
      direction: 'outgoing',
      edgeType,
      relatedObjectId: toObjectId
    }),
    appendObjectEvent(toObjectId, 'linked', {
      direction: 'incoming',
      edgeType,
      relatedObjectId: fromObjectId
    })
  ]);

  return transformEdge(edge);
}

/**
 * Remove link between objects
 */
export async function unlinkObjects(fromObjectId, toObjectId, edgeType) {
  const db = getDb();

  const deleted = await db('object_edges')
    .where({
      from_object_id: fromObjectId,
      to_object_id: toObjectId,
      edge_type: edgeType
    })
    .delete();

  if (deleted > 0) {
    await Promise.all([
      appendObjectEvent(fromObjectId, 'unlinked', {
        direction: 'outgoing',
        edgeType,
        relatedObjectId: toObjectId
      }),
      appendObjectEvent(toObjectId, 'unlinked', {
        direction: 'incoming',
        edgeType,
        relatedObjectId: fromObjectId
      })
    ]);
  }

  return { deleted: deleted > 0 };
}

/**
 * Get object graph (neighbors and relationships)
 *
 * @param {string} objectId - Central object ID
 * @param {Object} options - Query options
 */
export async function getObjectGraph(objectId, options = {}) {
  const db = getDb();
  const { edgeTypes, direction = 'both', maxDepth = 1, includeData = true } = options;

  // Get the central object
  const centralObject = await getObject(objectId);
  if (!centralObject) return null;

  // Use the SQL function for graph traversal
  let neighborsQuery = db.raw(`
    SELECT * FROM get_object_neighbors(
      ?::uuid,
      ?::varchar[],
      ?::varchar,
      ?::integer
    )
  `, [
    objectId,
    edgeTypes ? `{${edgeTypes.join(',')}}` : null,
    direction,
    maxDepth
  ]);

  const neighbors = await neighborsQuery;

  // Get all edges involving the central object
  let edgesQuery = db('object_edges')
    .where('from_object_id', objectId)
    .orWhere('to_object_id', objectId);

  if (edgeTypes && edgeTypes.length > 0) {
    edgesQuery = edgesQuery.whereIn('edge_type', edgeTypes);
  }

  const edges = await edgesQuery;

  return {
    centralObject,
    neighbors: neighbors.rows.map(n => ({
      objectId: n.object_id,
      objectType: n.object_type,
      externalId: n.external_id,
      data: includeData ? n.data : undefined,
      edgeType: n.edge_type,
      edgeWeight: parseFloat(n.edge_weight),
      direction: n.direction,
      depth: n.depth
    })),
    edges: edges.map(transformEdge),
    stats: {
      totalNeighbors: neighbors.rows.length,
      outgoingEdges: edges.filter(e => e.from_object_id === objectId).length,
      incomingEdges: edges.filter(e => e.to_object_id === objectId).length,
      edgeTypes: [...new Set(edges.map(e => e.edge_type))]
    }
  };
}

/**
 * Get edges for an object
 */
export async function getObjectEdges(objectId, options = {}) {
  const db = getDb();
  const { direction = 'both', edgeTypes } = options;

  let query = db('object_edges');

  if (direction === 'outgoing') {
    query = query.where('from_object_id', objectId);
  } else if (direction === 'incoming') {
    query = query.where('to_object_id', objectId);
  } else {
    query = query.where('from_object_id', objectId).orWhere('to_object_id', objectId);
  }

  if (edgeTypes && edgeTypes.length > 0) {
    query = query.whereIn('edge_type', edgeTypes);
  }

  const edges = await query.orderBy('weight', 'desc');
  return edges.map(transformEdge);
}

// ============================================================================
// OBJECT EVENTS - Timeline & Activity
// ============================================================================

/**
 * Append an event to an object's timeline
 *
 * @param {string} objectId - Object ID
 * @param {string} eventType - Type of event
 * @param {Object} payload - Event payload
 * @param {Object} options - Additional options (actorType, actorId, relatedObjectId)
 */
export async function appendObjectEvent(objectId, eventType, payload = {}, options = {}) {
  const db = getDb();
  const { actorType = 'system', actorId, relatedObjectId, eventCategory } = options;

  // Determine category if not provided
  const category = eventCategory || determineEventCategory(eventType);

  const [event] = await db('object_events')
    .insert({
      object_id: objectId,
      event_type: eventType,
      event_category: category,
      payload,
      actor_type: actorType,
      actor_id: actorId || null,
      related_object_id: relatedObjectId || null
    })
    .returning('*');

  return transformEvent(event);
}

/**
 * Get object timeline (events)
 *
 * @param {string} objectId - Object ID
 * @param {Object} options - Query options
 */
export async function getObjectTimeline(objectId, options = {}) {
  const db = getDb();
  const {
    eventTypes,
    eventCategories,
    since,
    until,
    limit = 50,
    offset = 0,
    includeRelated = true
  } = options;

  let query = db('object_events')
    .where('object_id', objectId);

  if (eventTypes && eventTypes.length > 0) {
    query = query.whereIn('event_type', eventTypes);
  }

  if (eventCategories && eventCategories.length > 0) {
    query = query.whereIn('event_category', eventCategories);
  }

  if (since) {
    query = query.where('occurred_at', '>=', since);
  }

  if (until) {
    query = query.where('occurred_at', '<=', until);
  }

  const [{ count }] = await query.clone().count();
  const events = await query
    .orderBy('occurred_at', 'desc')
    .limit(limit)
    .offset(offset);

  // Optionally fetch related objects
  let relatedObjects = {};
  if (includeRelated) {
    const relatedIds = events
      .filter(e => e.related_object_id)
      .map(e => e.related_object_id);

    if (relatedIds.length > 0) {
      const related = await db('object_nodes')
        .whereIn('id', relatedIds)
        .select('id', 'object_type', 'external_id', 'data');

      related.forEach(r => {
        relatedObjects[r.id] = {
          objectType: r.object_type,
          externalId: r.external_id,
          data: r.data
        };
      });
    }
  }

  return {
    events: events.map(e => ({
      ...transformEvent(e),
      relatedObject: e.related_object_id ? relatedObjects[e.related_object_id] : null
    })),
    total: parseInt(count, 10),
    limit,
    offset
  };
}

/**
 * Get aggregated timeline milestones
 */
export async function getObjectMilestones(objectId) {
  const db = getDb();

  // Get key events that represent milestones
  const milestoneTypes = [
    'created', 'enriched', 'scored', 'contacted',
    'qualified', 'converted', 'deactivated'
  ];

  const milestones = await db('object_events')
    .where('object_id', objectId)
    .whereIn('event_type', milestoneTypes)
    .orderBy('occurred_at', 'asc');

  return milestones.map(transformEvent);
}

// ============================================================================
// OBJECT THREADS - Conversations & Notes
// ============================================================================

/**
 * Create a new thread for an object
 *
 * @param {string} objectId - Object ID
 * @param {string} threadType - Type of thread (notes, ai_analysis, discussion)
 * @param {Object} initialMessage - First message in thread
 * @param {string} title - Optional thread title
 */
export async function createObjectThread(objectId, threadType, initialMessage = null, title = null) {
  const db = getDb();

  const messages = initialMessage ? [{
    id: generateMessageId(),
    ...initialMessage,
    timestamp: new Date().toISOString()
  }] : [];

  const [thread] = await db('object_threads')
    .insert({
      object_id: objectId,
      thread_type: threadType,
      title,
      messages: JSON.stringify(messages),
      message_count: messages.length,
      last_message_at: messages.length > 0 ? new Date() : null
    })
    .returning('*');

  await appendObjectEvent(objectId, 'thread_created', {
    threadId: thread.id,
    threadType
  });

  return transformThread(thread);
}

/**
 * Append message to a thread
 *
 * @param {string} threadId - Thread ID
 * @param {Object} message - Message to append
 */
export async function appendToThread(threadId, message) {
  const db = getDb();

  const messageWithId = {
    id: generateMessageId(),
    ...message,
    timestamp: new Date().toISOString()
  };

  const [thread] = await db('object_threads')
    .where({ id: threadId })
    .update({
      messages: db.raw('messages || ?::jsonb', [JSON.stringify([messageWithId])]),
      message_count: db.raw('message_count + 1'),
      last_message_at: new Date()
    })
    .returning('*');

  if (!thread) return null;

  await appendObjectEvent(thread.object_id, 'message_added', {
    threadId,
    messageId: messageWithId.id
  });

  return transformThread(thread);
}

/**
 * Get threads for an object
 */
export async function getObjectThreads(objectId, options = {}) {
  const db = getDb();
  const { threadTypes, isOpen, limit = 20, offset = 0 } = options;

  let query = db('object_threads')
    .where('object_id', objectId);

  if (threadTypes && threadTypes.length > 0) {
    query = query.whereIn('thread_type', threadTypes);
  }

  if (isOpen !== undefined) {
    query = query.where('is_open', isOpen);
  }

  const [{ count }] = await query.clone().count();
  const threads = await query
    .orderBy('last_message_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    threads: threads.map(transformThread),
    total: parseInt(count, 10),
    limit,
    offset
  };
}

/**
 * Get single thread by ID
 */
export async function getThread(threadId) {
  const db = getDb();

  const thread = await db('object_threads')
    .where({ id: threadId })
    .first();

  return thread ? transformThread(thread) : null;
}

/**
 * Close/open a thread
 */
export async function setThreadStatus(threadId, isOpen) {
  const db = getDb();

  const [thread] = await db('object_threads')
    .where({ id: threadId })
    .update({ is_open: isOpen })
    .returning('*');

  return thread ? transformThread(thread) : null;
}

// ============================================================================
// OBJECT STATE - Computed/Derived State
// ============================================================================

/**
 * Get object's current state
 */
export async function getObjectState(objectId) {
  const db = getDb();

  const state = await db('object_states')
    .where({ object_id: objectId })
    .first();

  if (!state) {
    // Initialize state if not exists
    const [newState] = await db('object_states')
      .insert({
        object_id: objectId,
        state: { status: 'unknown' }
      })
      .onConflict('object_id')
      .merge()
      .returning('*');

    return transformState(newState);
  }

  return transformState(state);
}

/**
 * Update object's state (merge patch)
 *
 * @param {string} objectId - Object ID
 * @param {Object} statePatch - State fields to update
 */
export async function setObjectState(objectId, statePatch) {
  const db = getDb();

  const [state] = await db('object_states')
    .insert({
      object_id: objectId,
      state: statePatch,
      state_version: 1
    })
    .onConflict('object_id')
    .merge({
      state: db.raw('object_states.state || ?', [JSON.stringify(statePatch)]),
      state_version: db.raw('object_states.state_version + 1'),
      updated_at: new Date()
    })
    .returning('*');

  await appendObjectEvent(objectId, 'state_updated', {
    fieldsUpdated: Object.keys(statePatch),
    stateVersion: state.state_version
  });

  return transformState(state);
}

/**
 * Replace object's state entirely
 */
export async function replaceObjectState(objectId, newState) {
  const db = getDb();

  const [state] = await db('object_states')
    .insert({
      object_id: objectId,
      state: newState,
      state_version: 1
    })
    .onConflict('object_id')
    .merge({
      state: newState,
      state_version: db.raw('object_states.state_version + 1'),
      updated_at: new Date()
    })
    .returning('*');

  await appendObjectEvent(objectId, 'state_replaced', {
    stateVersion: state.state_version
  });

  return transformState(state);
}

// ============================================================================
// OBJECT ACTIONS - Available Actions
// ============================================================================

/**
 * Get available actions for an object
 *
 * @param {string} objectId - Object ID
 * @param {Object} context - Optional context for filtering
 */
export async function getObjectActions(objectId, context = {}) {
  const db = getDb();

  const object = await getObject(objectId);
  if (!object) return [];

  const state = await getObjectState(objectId);

  // Get all actions for this object type
  let query = db('object_actions')
    .where('is_active', true)
    .whereRaw('? = ANY(object_types)', [object.objectType]);

  // Filter by vertical if specified
  if (object.verticalSlug || context.verticalSlug) {
    const vertical = object.verticalSlug || context.verticalSlug;
    query = query.where(function () {
      this.whereNull('vertical_slugs')
        .orWhereRaw('? = ANY(vertical_slugs)', [vertical]);
    });
  }

  const actions = await query.orderBy('display_order', 'asc');

  // Filter actions based on state conditions
  return actions
    .filter(action => {
      if (!action.conditions || Object.keys(action.conditions).length === 0) {
        return true;
      }
      return evaluateConditions(action.conditions, state.state, object);
    })
    .map(transformAction);
}

/**
 * Execute an action on an object
 * Returns the action configuration for the caller to execute
 */
export async function prepareActionExecution(objectId, actionSlug, params = {}) {
  const db = getDb();

  const object = await getObject(objectId);
  if (!object) {
    throw new Error('Object not found');
  }

  const action = await db('object_actions')
    .where({ action_slug: actionSlug, is_active: true })
    .first();

  if (!action) {
    throw new Error('Action not found');
  }

  // Check if action applies to this object type
  if (!action.object_types.includes(object.objectType)) {
    throw new Error('Action not applicable to this object type');
  }

  // Log the action preparation
  await appendObjectEvent(objectId, 'action_prepared', {
    actionSlug,
    params
  });

  return {
    action: transformAction(action),
    object: object,
    params,
    executionConfig: {
      ...action.config,
      objectId,
      objectType: object.objectType,
      params
    }
  };
}

// ============================================================================
// SIGNAL DERIVATION - Generate Signals from Objects
// ============================================================================

/**
 * Derive signals from an object based on vertical/territory config
 *
 * @param {string} objectId - Object ID
 * @param {Object} context - Context for signal derivation
 */
export async function deriveSignalsFromObject(objectId, context = {}) {
  const object = await getObject(objectId);
  if (!object) return { signals: [], error: 'Object not found' };

  const { verticalSlug, territoryId } = { ...object, ...context };

  // Get signal configuration from ConfigLoader
  const signalConfig = await ConfigLoader.getConfig(
    'signal_rules',
    verticalSlug || 'default'
  );

  if (!signalConfig) {
    return { signals: [], warning: 'No signal configuration found' };
  }

  const state = await getObjectState(objectId);
  const signals = [];

  // Evaluate each signal rule
  for (const rule of (signalConfig.rules || [])) {
    if (!appliesToObjectType(rule, object.objectType)) continue;

    const signalValue = evaluateSignalRule(rule, object, state.state);
    if (signalValue !== null) {
      signals.push({
        signalType: rule.signalType,
        signalName: rule.name,
        value: signalValue,
        confidence: rule.confidence || 0.8,
        derivedFrom: {
          objectId,
          objectType: object.objectType,
          ruleId: rule.id
        }
      });
    }
  }

  // Log signal derivation event
  await appendObjectEvent(objectId, 'signals_derived', {
    signalCount: signals.length,
    signalTypes: signals.map(s => s.signalType)
  });

  return {
    objectId,
    objectType: object.objectType,
    signals,
    derivedAt: new Date().toISOString()
  };
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Register multiple objects in batch
 */
export async function registerObjectsBatch(objects, context = {}) {
  const results = await Promise.all(
    objects.map(({ type, payload }) =>
      registerObject(type, payload, context)
        .then(obj => ({ success: true, object: obj }))
        .catch(error => ({ success: false, error: error.message, payload }))
    )
  );

  return {
    successful: results.filter(r => r.success).map(r => r.object),
    failed: results.filter(r => !r.success),
    total: objects.length
  };
}

/**
 * Link multiple object pairs in batch
 */
export async function linkObjectsBatch(links) {
  const results = await Promise.all(
    links.map(({ fromId, toId, edgeType, weight, metadata }) =>
      linkObjects(fromId, toId, edgeType, weight, metadata)
        .then(edge => ({ success: true, edge }))
        .catch(error => ({ success: false, error: error.message, fromId, toId }))
    )
  );

  return {
    successful: results.filter(r => r.success).map(r => r.edge),
    failed: results.filter(r => !r.success),
    total: links.length
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function transformObjectNode(row) {
  return {
    id: row.id,
    objectType: row.object_type,
    externalId: row.external_id,
    territoryId: row.territory_id,
    verticalSlug: row.vertical_slug,
    data: row.data,
    version: row.version,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function transformEdge(row) {
  return {
    id: row.id,
    fromObjectId: row.from_object_id,
    toObjectId: row.to_object_id,
    edgeType: row.edge_type,
    weight: parseFloat(row.weight),
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function transformEvent(row) {
  return {
    id: row.id,
    objectId: row.object_id,
    eventType: row.event_type,
    eventCategory: row.event_category,
    payload: row.payload,
    actorType: row.actor_type,
    actorId: row.actor_id,
    relatedObjectId: row.related_object_id,
    occurredAt: row.occurred_at,
    createdAt: row.created_at
  };
}

function transformThread(row) {
  return {
    id: row.id,
    objectId: row.object_id,
    threadType: row.thread_type,
    title: row.title,
    messages: row.messages || [],
    isOpen: row.is_open,
    messageCount: row.message_count,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at
  };
}

function transformState(row) {
  return {
    objectId: row.object_id,
    state: row.state,
    stateVersion: row.state_version,
    lastComputedFromEventId: row.last_computed_from_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function transformAction(row) {
  return {
    id: row.id,
    actionSlug: row.action_slug,
    actionName: row.action_name,
    description: row.description,
    objectTypes: row.object_types,
    verticalSlugs: row.vertical_slugs,
    actionType: row.action_type,
    config: row.config,
    conditions: row.conditions,
    icon: row.icon,
    displayOrder: row.display_order,
    isDestructive: row.is_destructive,
    requiresConfirmation: row.requires_confirmation,
    isSystem: row.is_system
  };
}

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function determineEventCategory(eventType) {
  const categories = {
    created: 'system',
    updated: 'system',
    deactivated: 'system',
    linked: 'system',
    unlinked: 'system',
    enriched: 'integration',
    scored: 'ai',
    contacted: 'user',
    qualified: 'user',
    converted: 'user',
    thread_created: 'user',
    message_added: 'user',
    state_updated: 'system',
    state_replaced: 'system',
    signals_derived: 'ai',
    action_prepared: 'user'
  };
  return categories[eventType] || 'system';
}

function evaluateConditions(conditions, state, object) {
  // Simple condition evaluation
  for (const [key, expected] of Object.entries(conditions)) {
    const actual = state[key];

    if (typeof expected === 'object') {
      if (expected.$exists !== undefined && (actual !== undefined) !== expected.$exists) {
        return false;
      }
      if (expected.$eq !== undefined && actual !== expected.$eq) {
        return false;
      }
      if (expected.$ne !== undefined && actual === expected.$ne) {
        return false;
      }
      if (expected.$gt !== undefined && !(actual > expected.$gt)) {
        return false;
      }
      if (expected.$in !== undefined && !expected.$in.includes(actual)) {
        return false;
      }
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function appliesToObjectType(rule, objectType) {
  if (!rule.objectTypes) return true;
  return rule.objectTypes.includes(objectType);
}

function evaluateSignalRule(rule, object, state) {
  // Simple rule evaluation - returns signal value or null
  const { condition, valueField, staticValue } = rule;

  if (!evaluateConditions(condition || {}, state, object)) {
    return null;
  }

  if (staticValue !== undefined) return staticValue;
  if (valueField) {
    return object.data[valueField] || state[valueField] || null;
  }
  return 1; // Default positive signal
}

// Export all functions
export default {
  // Object CRUD
  registerObject,
  getObject,
  getObjectByExternalId,
  listObjects,
  deactivateObject,

  // Edges
  linkObjects,
  unlinkObjects,
  getObjectGraph,
  getObjectEdges,

  // Events
  appendObjectEvent,
  getObjectTimeline,
  getObjectMilestones,

  // Threads
  createObjectThread,
  appendToThread,
  getObjectThreads,
  getThread,
  setThreadStatus,

  // State
  getObjectState,
  setObjectState,
  replaceObjectState,

  // Actions
  getObjectActions,
  prepareActionExecution,

  // Signals
  deriveSignalsFromObject,

  // Batch
  registerObjectsBatch,
  linkObjectsBatch
};
