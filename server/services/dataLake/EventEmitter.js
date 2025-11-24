/**
 * Event Emitter Service
 * Sprint 74: Data Lake v0 + UPR Graph Schema
 *
 * Central event emission framework for pipeline events and analytics
 */

import { pool } from '../../../utils/db.js';
import { v4 as uuidv4 } from 'uuid';

// Standard event types
export const EVENT_TYPES = {
  // Pipeline events
  LEAD_DISCOVERED: 'lead_discovered',
  LEAD_ENRICHED: 'lead_enriched',
  LEAD_SCORED: 'lead_scored',
  LEAD_RANKED: 'lead_ranked',
  OUTREACH_GENERATED: 'outreach_generated',

  // Engagement events
  OUTREACH_SENT: 'outreach_sent',
  OUTREACH_OPENED: 'outreach_opened',
  OUTREACH_CLICKED: 'outreach_clicked',
  OUTREACH_REPLIED: 'outreach_replied',

  // System events
  PIPELINE_STARTED: 'pipeline_started',
  PIPELINE_COMPLETED: 'pipeline_completed',
  PIPELINE_FAILED: 'pipeline_failed',

  // Analytics events
  SCORE_CHANGED: 'score_changed',
  TIER_CHANGED: 'tier_changed',

  // Intelligence events
  SIGNAL_DETECTED: 'signal_detected',
  RELATIONSHIP_DISCOVERED: 'relationship_discovered'
};

class EventEmitterService {
  constructor() {
    this.handlers = new Map();
    this.batchQueue = [];
    this.batchSize = 100;
    this.flushInterval = 5000; // 5 seconds
    this.flushTimer = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the event emitter
   */
  async initialize() {
    if (this.isInitialized) return;

    // Start batch flush timer
    this.flushTimer = setInterval(() => {
      this._flushBatch().catch(console.error);
    }, this.flushInterval);

    this.isInitialized = true;
    console.log('[EventEmitter] Initialized');
  }

  /**
   * Emit a single event
   * @param {string} eventType - Event type from EVENT_TYPES
   * @param {Object} payload - Event payload
   * @param {Object} context - Event context (tenant, region, pipeline, etc.)
   * @returns {Promise<Object>}
   */
  async emit(eventType, payload, context = {}) {
    const event = this._buildEvent(eventType, payload, context);

    // Persist immediately if not batching
    if (!context.batch) {
      await this._persistEvent(event);
    } else {
      this._addToBatch(event);
    }

    // Notify subscribers
    await this._notifyHandlers(eventType, event);

    return event;
  }

  /**
   * Emit multiple events in batch
   * @param {Object[]} events - Array of {eventType, payload, context}
   * @returns {Promise<Object[]>}
   */
  async emitBatch(events) {
    const builtEvents = events.map(e =>
      this._buildEvent(e.eventType, e.payload, e.context)
    );

    // Persist all at once
    await this._persistBatch(builtEvents);

    // Notify handlers for each
    for (const event of builtEvents) {
      await this._notifyHandlers(event.event_type, event);
    }

    return builtEvents;
  }

  /**
   * Subscribe to event type
   * @param {string} eventType - Event type to subscribe to
   * @param {Function} handler - Handler function (async)
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType).add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Subscribe to all events
   * @param {Function} handler - Handler function
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(handler) {
    return this.subscribe('*', handler);
  }

  /**
   * Query events from data lake
   * @param {Object} filters - Query filters
   * @returns {Promise<Object[]>}
   */
  async queryEvents(filters = {}) {
    const {
      eventType,
      entityId,
      tenantId,
      pipelineId,
      regionId,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = filters;

    let query = `
      SELECT *
      FROM data_lake_events
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }
    if (eventType) {
      query += ` AND event_type = $${paramIndex++}`;
      params.push(eventType);
    }
    if (entityId) {
      query += ` AND entity_id = $${paramIndex++}`;
      params.push(entityId);
    }
    if (pipelineId) {
      query += ` AND pipeline_id = $${paramIndex++}`;
      params.push(pipelineId);
    }
    if (regionId) {
      query += ` AND region_id = $${paramIndex++}`;
      params.push(regionId);
    }
    if (startDate) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get event counts by type
   * @param {Object} filters - Query filters
   * @returns {Promise<Object>}
   */
  async getEventCounts(filters = {}) {
    const { tenantId, startDate, endDate } = filters;

    let query = `
      SELECT event_type, COUNT(*) as count
      FROM data_lake_events
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      query += ` AND tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }
    if (startDate) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` GROUP BY event_type ORDER BY count DESC`;

    const result = await pool.query(query, params);

    const counts = {};
    for (const row of result.rows) {
      counts[row.event_type] = parseInt(row.count);
    }
    return counts;
  }

  /**
   * Shutdown the emitter
   */
  async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this._flushBatch();
    this.isInitialized = false;
    console.log('[EventEmitter] Shutdown complete');
  }

  /**
   * Build event object
   * @private
   */
  _buildEvent(eventType, payload, context) {
    return {
      event_id: uuidv4(),
      event_type: eventType,
      entity_id: context.entityId || payload.entity_id || null,
      entity_type: context.entityType || payload.entity_type || null,
      tenant_id: context.tenantId,
      region_id: context.regionId || null,
      vertical_id: context.verticalId || null,
      pipeline_id: context.pipelineId || null,
      step_name: context.stepName || null,
      payload: payload,
      metadata: {
        source: context.source || 'system',
        version: '1.0',
        timestamp: new Date().toISOString(),
        ...context.metadata
      },
      created_at: new Date()
    };
  }

  /**
   * Persist single event to database
   * @private
   */
  async _persistEvent(event) {
    const query = `
      INSERT INTO data_lake_events (
        event_id, event_type, entity_id, entity_type, tenant_id,
        region_id, vertical_id, pipeline_id, step_name, payload, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    try {
      await pool.query(query, [
        event.event_id,
        event.event_type,
        event.entity_id,
        event.entity_type,
        event.tenant_id,
        event.region_id,
        event.vertical_id,
        event.pipeline_id,
        event.step_name,
        JSON.stringify(event.payload),
        JSON.stringify(event.metadata)
      ]);
    } catch (error) {
      console.error('[EventEmitter] Persist error:', error);
      throw error;
    }
  }

  /**
   * Persist batch of events
   * @private
   */
  async _persistBatch(events) {
    if (events.length === 0) return;

    // Build bulk insert
    const values = [];
    const params = [];
    let paramIndex = 1;

    for (const event of events) {
      values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      params.push(
        event.event_id,
        event.event_type,
        event.entity_id,
        event.entity_type,
        event.tenant_id,
        event.region_id,
        event.vertical_id,
        event.pipeline_id,
        event.step_name,
        JSON.stringify(event.payload),
        JSON.stringify(event.metadata)
      );
    }

    const query = `
      INSERT INTO data_lake_events (
        event_id, event_type, entity_id, entity_type, tenant_id,
        region_id, vertical_id, pipeline_id, step_name, payload, metadata
      ) VALUES ${values.join(', ')}
    `;

    try {
      await pool.query(query, params);
      console.log(`[EventEmitter] Persisted ${events.length} events`);
    } catch (error) {
      console.error('[EventEmitter] Batch persist error:', error);
      throw error;
    }
  }

  /**
   * Add event to batch queue
   * @private
   */
  _addToBatch(event) {
    this.batchQueue.push(event);

    if (this.batchQueue.length >= this.batchSize) {
      this._flushBatch().catch(console.error);
    }
  }

  /**
   * Flush batch queue to database
   * @private
   */
  async _flushBatch() {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    await this._persistBatch(batch);
  }

  /**
   * Notify event handlers
   * @private
   */
  async _notifyHandlers(eventType, event) {
    // Notify type-specific handlers
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error(`[EventEmitter] Handler error for ${eventType}:`, error);
        }
      }
    }

    // Notify wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error('[EventEmitter] Wildcard handler error:', error);
        }
      }
    }
  }
}

// Singleton instance
export const eventEmitter = new EventEmitterService();
export default eventEmitter;
