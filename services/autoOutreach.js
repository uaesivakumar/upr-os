/**
 * S68: Auto-Outreach Engine
 * Sprint 68: Autonomous Outreach System
 *
 * Features:
 *   1. Outreach Queue Manager - centralized queue for all outreach
 *   2. Send Time Optimization - ML-based optimal send time prediction
 *   3. Auto-Follow-up Sequences - automated sequence management
 *   4. Response Classification - AI-powered response categorization
 *
 * Architecture:
 *   - NO tenant awareness (OS-only)
 *   - Context via territoryId, verticalSlug parameters
 *   - Integrates with S64 Object Intelligence
 *   - Integrates with S65 Evidence System
 *   - Integrates with S66 Autonomous Safety (kill switch, activity log, checkpoints)
 *   - Integrates with S67 Auto-Discovery
 *
 * S66 Integration:
 *   - Before sending: check isAutonomyEnabled()
 *   - High-value outreach: registerCheckpoint() for human approval
 *   - On send: logAutonomousEvent({ eventType: 'outreach_sent', source: 'auto-outreach' })
 *   - On error: logAutonomousEvent({ eventType: 'outreach_failed', severity: 'error' })
 *
 * S70 Integration:
 *   - Record performance metrics for each outreach operation
 *   - Track conversion indicators (opened, clicked, replied, converted)
 */

import { getDb } from '../db/index.js';
import { ConfigLoader } from './configLoader.js';
import * as Sentry from '@sentry/node';
import * as autonomousSafety from './autonomousSafety.js';
import * as autonomousMetrics from './autonomousMetrics.js';

// =====================================================
// OUTREACH QUEUE MANAGER
// =====================================================

/**
 * Queue outreach message
 */
export async function queueOutreach({
  objectId,
  objectType,
  contactId = null,
  verticalSlug,
  territoryId,
  channel,
  templateId = null,
  sequenceId = null,
  stepNumber = 1,
  subject = null,
  body = null,
  personalization = {},
  scheduledAt = null,
  sendWindowStart = null,
  sendWindowEnd = null,
  timezone = 'UTC',
  priority = 5,
  source = 'manual',
  correlationId = null
}) {
  const db = getDb();

  // Get optimal send time if not scheduled
  let optimalSendTime = null;
  if (!scheduledAt) {
    optimalSendTime = await calculateOptimalSendTime({
      objectId,
      channel,
      verticalSlug,
      territoryId,
      windowStart: sendWindowStart,
      windowEnd: sendWindowEnd,
      timezone
    });
  }

  const [item] = await db('outreach_queue')
    .insert({
      object_id: objectId,
      object_type: objectType,
      contact_id: contactId,
      territory_id: territoryId,
      vertical_slug: verticalSlug,
      channel,
      template_id: templateId,
      sequence_id: sequenceId,
      step_number: stepNumber,
      subject,
      body,
      personalization,
      scheduled_at: scheduledAt,
      send_window_start: sendWindowStart,
      send_window_end: sendWindowEnd,
      timezone,
      optimal_send_time: optimalSendTime,
      priority,
      source,
      correlation_id: correlationId
    })
    .returning('*');

  return item;
}

/**
 * Get next batch of outreach items for sending
 */
export async function getOutreachBatch({
  batchSize = 10,
  channel = null,
  verticalSlug = null,
  territoryId = null,
  respectKillSwitch = true
}) {
  const db = getDb();

  // Check kill switch before processing
  if (respectKillSwitch) {
    const enabled = await autonomousSafety.isAutonomyEnabled({ verticalSlug, territoryId });
    if (!enabled) {
      await autonomousSafety.logAutonomousEvent({
        eventType: 'outreach_blocked',
        severity: 'warning',
        source: 'auto-outreach',
        message: 'Kill switch is active - skipping outreach batch',
        verticalSlug,
        territoryId
      });
      return [];
    }
  }

  const result = await db.raw(
    'SELECT * FROM get_outreach_batch(?, ?, ?)',
    [batchSize, channel, verticalSlug]
  );

  // Log batch fetch
  if (result.rows?.length > 0) {
    await autonomousSafety.logAutonomousEvent({
      eventType: 'outreach_batch_fetched',
      severity: 'info',
      source: 'auto-outreach',
      message: `Fetched ${result.rows.length} items for outreach`,
      verticalSlug,
      territoryId,
      metadata: { batchSize: result.rows.length, channel }
    });
  }

  return result.rows || [];
}

/**
 * Record outreach event (sent, delivered, opened, clicked, replied, bounced)
 */
export async function recordOutreachEvent({
  outreachId,
  eventType,
  eventData = {},
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  await db.raw(
    'SELECT record_outreach_event(?, ?, ?::jsonb)',
    [outreachId, eventType, JSON.stringify(eventData)]
  );

  // Log outreach event to activity log
  const isError = eventType === 'bounced' || eventType === 'failed';
  await autonomousSafety.logAutonomousEvent({
    eventType: `outreach_${eventType}`,
    severity: isError ? 'warning' : 'info',
    source: 'auto-outreach',
    message: `Outreach ${eventType} for item ${outreachId}`,
    verticalSlug,
    territoryId,
    metadata: { outreachId, eventType, ...eventData }
  });

  // Update send time patterns if we have enough data
  if (['opened', 'clicked', 'replied', 'bounced'].includes(eventType)) {
    const item = await db('outreach_queue').where('id', outreachId).first();
    if (item && item.sent_at) {
      await updateSendTimePattern({
        channel: item.channel,
        verticalSlug: item.vertical_slug,
        territoryId: item.territory_id,
        objectType: item.object_type,
        sentAt: item.sent_at,
        opened: eventType === 'opened' || item.opened_at !== null,
        clicked: eventType === 'clicked' || item.clicked_at !== null,
        replied: eventType === 'replied' || item.replied_at !== null,
        bounced: eventType === 'bounced'
      });
    }
  }

  // Record to S70 performance metrics with conversion tracking
  try {
    await autonomousMetrics.recordPerformanceEvent({
      service: 'auto-outreach',
      operation: eventType === 'sent' ? 'send' : 'conversion',
      eventType: isError ? 'failed' : 'completed',
      verticalSlug,
      territoryId,
      entityId: outreachId,
      opened: eventType === 'opened',
      clicked: eventType === 'clicked',
      replied: eventType === 'replied',
      converted: eventType === 'converted',
      metadata: { outreachId, eventType, ...eventData }
    });
  } catch (e) {
    // Don't fail on metrics error
    Sentry.captureException(e);
  }

  return { outreachId, eventType, recorded: true };
}

/**
 * Get outreach item by ID
 */
export async function getOutreachItem(itemId) {
  const db = getDb();
  return db('outreach_queue').where('id', itemId).first();
}

/**
 * Get outreach queue status
 */
export async function getOutreachQueueStatus({
  verticalSlug = null,
  territoryId = null,
  channel = null
}) {
  const db = getDb();

  let query = db('outreach_queue')
    .select('status', 'channel')
    .count('* as count')
    .groupBy('status', 'channel');

  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);
  if (channel) query = query.where('channel', channel);

  const statusCounts = await query;

  const byChannel = {};
  for (const row of statusCounts) {
    if (!byChannel[row.channel]) {
      byChannel[row.channel] = { pending: 0, scheduled: 0, processing: 0, sent: 0, delivered: 0, completed: 0, failed: 0, bounced: 0 };
    }
    byChannel[row.channel][row.status] = parseInt(row.count, 10);
  }

  return byChannel;
}

/**
 * Cancel outreach item
 */
export async function cancelOutreach(itemId) {
  const db = getDb();

  const [item] = await db('outreach_queue')
    .where('id', itemId)
    .whereIn('status', ['pending', 'scheduled', 'retry'])
    .update({
      status: 'cancelled',
      updated_at: new Date()
    })
    .returning('*');

  return item;
}

// =====================================================
// CHANNEL MANAGEMENT
// =====================================================

/**
 * Get channel configuration
 */
export async function getChannel(slug) {
  const db = getDb();
  return db('outreach_channels').where('slug', slug).first();
}

/**
 * List channels
 */
export async function listChannels({ isActive = true } = {}) {
  const db = getDb();
  let query = db('outreach_channels');
  if (isActive !== null) query = query.where('is_active', isActive);
  return query.orderBy('name');
}

/**
 * Update channel configuration
 */
export async function updateChannel(slug, updates) {
  const db = getDb();

  const allowedFields = ['name', 'description', 'config', 'rate_limits', 'default_send_window_start', 'default_send_window_end', 'allowed_days', 'is_active'];

  const filteredUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey)) {
      filteredUpdates[snakeKey] = value;
    }
  }

  filteredUpdates.updated_at = new Date();

  const [channel] = await db('outreach_channels')
    .where('slug', slug)
    .update(filteredUpdates)
    .returning('*');

  return channel;
}

// =====================================================
// SEND TIME OPTIMIZATION
// =====================================================

/**
 * Calculate optimal send time for an outreach
 */
export async function calculateOptimalSendTime({
  objectId,
  channel,
  verticalSlug = null,
  territoryId = null,
  windowStart = '09:00',
  windowEnd = '18:00',
  timezone = 'UTC'
}) {
  const db = getDb();

  const result = await db.raw(
    'SELECT calculate_optimal_send_time(?, ?, ?, ?, ?::time, ?::time, ?)',
    [objectId, channel, verticalSlug, territoryId, windowStart, windowEnd, timezone]
  );

  return result.rows?.[0]?.calculate_optimal_send_time || null;
}

/**
 * Update send time pattern from event data
 */
export async function updateSendTimePattern({
  channel,
  verticalSlug,
  territoryId,
  objectType,
  sentAt,
  opened = false,
  clicked = false,
  replied = false,
  bounced = false
}) {
  const db = getDb();

  await db.raw(
    'SELECT update_send_time_patterns(?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [channel, verticalSlug, territoryId, objectType, sentAt, opened, clicked, replied, bounced]
  );
}

/**
 * Get send time patterns
 */
export async function getSendTimePatterns({
  channel,
  verticalSlug = null,
  territoryId = null,
  minSamples = 10
}) {
  const db = getDb();

  let query = db('send_time_patterns')
    .where('channel', channel)
    .where('sample_size', '>=', minSamples);

  if (verticalSlug) {
    query = query.where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    });
  }

  if (territoryId) {
    query = query.where(function() {
      this.whereNull('territory_id').orWhere('territory_id', territoryId);
    });
  }

  return query.orderBy('engagement_score', 'desc');
}

/**
 * Get optimal send times view
 */
export async function getOptimalSendTimes({
  channel,
  verticalSlug = null,
  territoryId = null,
  topN = 5
}) {
  const db = getDb();

  let query = db('v_optimal_send_times')
    .where('channel', channel)
    .where('rank', '<=', topN);

  if (verticalSlug) {
    query = query.where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    });
  }

  if (territoryId) {
    query = query.where(function() {
      this.whereNull('territory_id').orWhere('territory_id', territoryId);
    });
  }

  return query.orderBy('rank');
}

/**
 * Create send time prediction
 */
export async function createSendTimePrediction({
  objectId,
  contactId = null,
  channel,
  verticalSlug = null,
  territoryId = null,
  predictedOptimalTime,
  predictedOpenRate = null,
  predictedReplyRate = null,
  modelVersion = '1.0.0',
  featuresUsed = {},
  confidence = null
}) {
  const db = getDb();

  const [prediction] = await db('send_time_predictions')
    .insert({
      object_id: objectId,
      contact_id: contactId,
      channel,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      predicted_optimal_time: predictedOptimalTime,
      predicted_open_rate: predictedOpenRate,
      predicted_reply_rate: predictedReplyRate,
      model_version: modelVersion,
      features_used: featuresUsed,
      confidence
    })
    .returning('*');

  return prediction;
}

// =====================================================
// FOLLOW-UP SEQUENCES
// =====================================================

/**
 * Create sequence
 */
export async function createSequence({
  slug,
  name,
  description,
  verticalSlug = null,
  territoryId = null,
  channel = 'email',
  triggerConditions = {},
  exitConditions = {},
  maxSteps = 5,
  defaultDelayHours = 48,
  respectSendWindow = true,
  stopOnReply = true,
  stopOnBounce = true
}) {
  const db = getDb();

  const [sequence] = await db('outreach_sequences')
    .insert({
      slug,
      name,
      description,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      channel,
      trigger_conditions: triggerConditions,
      exit_conditions: exitConditions,
      max_steps: maxSteps,
      default_delay_hours: defaultDelayHours,
      respect_send_window: respectSendWindow,
      stop_on_reply: stopOnReply,
      stop_on_bounce: stopOnBounce
    })
    .returning('*');

  return sequence;
}

/**
 * Get sequence by slug
 */
export async function getSequence(slug, verticalSlug = null) {
  const db = getDb();

  const sequence = await db('outreach_sequences')
    .where('slug', slug)
    .where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    })
    .first();

  if (sequence) {
    sequence.steps = await db('outreach_sequence_steps')
      .where('sequence_id', sequence.id)
      .orderBy('step_number');
  }

  return sequence;
}

/**
 * List sequences
 */
export async function listSequences({
  verticalSlug = null,
  territoryId = null,
  isActive = true
}) {
  const db = getDb();

  let query = db('outreach_sequences');

  if (verticalSlug) {
    query = query.where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    });
  }

  if (territoryId) {
    query = query.where(function() {
      this.whereNull('territory_id').orWhere('territory_id', territoryId);
    });
  }

  if (isActive !== null) {
    query = query.where('is_active', isActive);
  }

  return query.orderBy('name');
}

/**
 * Add step to sequence
 */
export async function addSequenceStep({
  sequenceId,
  stepNumber,
  delayHours = 48,
  templateId = null,
  subjectTemplate = null,
  bodyTemplate = null,
  conditions = {},
  variants = []
}) {
  const db = getDb();

  const [step] = await db('outreach_sequence_steps')
    .insert({
      sequence_id: sequenceId,
      step_number: stepNumber,
      delay_hours: delayHours,
      template_id: templateId,
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      conditions,
      variants
    })
    .returning('*');

  return step;
}

/**
 * Enroll object in sequence
 */
export async function enrollInSequence({
  sequenceId,
  objectId,
  contactId = null,
  verticalSlug = null,
  territoryId = null,
  personalizationContext = {},
  startAtStep = 1
}) {
  const db = getDb();

  // Get sequence to calculate first step time
  const sequence = await db('outreach_sequences').where('id', sequenceId).first();
  if (!sequence) {
    throw new Error(`Sequence not found: ${sequenceId}`);
  }

  const firstStep = await db('outreach_sequence_steps')
    .where('sequence_id', sequenceId)
    .where('step_number', startAtStep)
    .first();

  const delayHours = firstStep?.delay_hours || sequence.default_delay_hours;
  const nextStepAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

  const [instance] = await db('sequence_instances')
    .insert({
      sequence_id: sequenceId,
      object_id: objectId,
      contact_id: contactId,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      current_step: startAtStep,
      next_step_at: nextStepAt,
      personalization_context: personalizationContext
    })
    .onConflict(['sequence_id', 'object_id', 'contact_id'])
    .ignore()
    .returning('*');

  if (instance) {
    await db('sequence_instance_events').insert({
      instance_id: instance.id,
      step_number: startAtStep,
      event_type: 'enrolled',
      event_data: { personalizationContext }
    });
  }

  return instance;
}

/**
 * Get sequence instance
 */
export async function getSequenceInstance(instanceId) {
  const db = getDb();

  const instance = await db('sequence_instances').where('id', instanceId).first();
  if (instance) {
    instance.events = await db('sequence_instance_events')
      .where('instance_id', instanceId)
      .orderBy('occurred_at', 'desc')
      .limit(50);
  }

  return instance;
}

/**
 * Exit sequence instance
 */
export async function exitSequence(instanceId, reason = 'manual') {
  const db = getDb();

  const [instance] = await db('sequence_instances')
    .where('id', instanceId)
    .where('status', 'active')
    .update({
      status: 'exited',
      exited_at: new Date(),
      exit_reason: reason,
      updated_at: new Date()
    })
    .returning('*');

  if (instance) {
    await db('sequence_instance_events').insert({
      instance_id: instanceId,
      event_type: 'exited',
      event_data: { reason }
    });
  }

  return instance;
}

/**
 * Get instances due for next step
 */
export async function getDueSequenceInstances({ limit = 50 }) {
  const db = getDb();

  return db('sequence_instances')
    .where('status', 'active')
    .where('next_step_at', '<=', new Date())
    .limit(limit);
}

/**
 * Advance sequence instances
 */
export async function advanceSequenceInstances() {
  const db = getDb();

  const result = await db.raw('SELECT * FROM advance_sequence_instances()');
  return result.rows || [];
}

/**
 * Get sequence performance
 */
export async function getSequencePerformance({
  sequenceId = null,
  verticalSlug = null
}) {
  const db = getDb();

  let query = db('v_sequence_performance');

  if (sequenceId) query = query.where('sequence_id', sequenceId);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);

  return query;
}

// =====================================================
// RESPONSE CLASSIFICATION
// =====================================================

/**
 * Get response categories
 */
export async function getResponseCategories({ isActive = true } = {}) {
  const db = getDb();
  let query = db('response_categories');
  if (isActive !== null) query = query.where('is_active', isActive);
  return query.orderBy('priority', 'desc');
}

/**
 * Classify response
 */
export async function classifyResponse({
  outreachId = null,
  objectId,
  contactId = null,
  verticalSlug = null,
  territoryId = null,
  channel,
  responseText,
  responseSubject = null,
  receivedAt = null
}) {
  const db = getDb();

  // Get all active categories
  const categories = await getResponseCategories();

  // Simple keyword-based classification (in production, use LLM)
  let bestMatch = null;
  let bestScore = 0;

  const lowerText = (responseText || '').toLowerCase();
  const lowerSubject = (responseSubject || '').toLowerCase();
  const combinedText = `${lowerSubject} ${lowerText}`;

  for (const category of categories) {
    let score = 0;
    const keywords = category.keywords || [];
    const patterns = category.patterns || [];

    // Check keywords
    for (const keyword of keywords) {
      if (combinedText.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    // Check patterns
    for (const pattern of patterns) {
      try {
        if (new RegExp(pattern, 'i').test(combinedText)) {
          score += 2;
        }
      } catch (e) {
        // Invalid regex, skip
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }

  // Calculate confidence based on score
  const confidence = bestMatch ? Math.min(bestScore / 5, 0.95) : 0.3;

  // Determine sentiment from category or text analysis
  let sentiment = bestMatch?.sentiment || 'neutral';
  if (!bestMatch) {
    // Simple sentiment detection
    const positiveWords = ['interested', 'yes', 'great', 'love', 'perfect', 'sounds good'];
    const negativeWords = ['no', 'not interested', 'unsubscribe', 'stop', 'remove'];

    if (positiveWords.some(w => combinedText.includes(w))) sentiment = 'positive';
    if (negativeWords.some(w => combinedText.includes(w))) sentiment = 'negative';
  }

  // Store classification
  const [classification] = await db('response_classifications')
    .insert({
      outreach_id: outreachId,
      object_id: objectId,
      contact_id: contactId,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      channel,
      response_text: responseText,
      response_subject: responseSubject,
      received_at: receivedAt || new Date(),
      category_id: bestMatch?.id || null,
      category_slug: bestMatch?.slug || 'unknown',
      sentiment,
      intent: bestMatch?.intent || 'unknown',
      confidence,
      ai_analysis: {
        method: 'keyword_matching',
        score: bestScore,
        matched_category: bestMatch?.slug
      },
      suggested_actions: bestMatch?.auto_actions || []
    })
    .returning('*');

  return classification;
}

/**
 * Get classification by ID
 */
export async function getClassification(classificationId) {
  const db = getDb();
  return db('response_classifications').where('id', classificationId).first();
}

/**
 * List classifications
 */
export async function listClassifications({
  objectId = null,
  categorySlug = null,
  isReviewed = null,
  verticalSlug = null,
  limit = 50,
  offset = 0
}) {
  const db = getDb();

  let query = db('response_classifications');

  if (objectId) query = query.where('object_id', objectId);
  if (categorySlug) query = query.where('category_slug', categorySlug);
  if (isReviewed !== null) query = query.where('is_reviewed', isReviewed);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);

  const [{ count }] = await query.clone().count();
  const classifications = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);

  return { classifications, total: parseInt(count, 10) };
}

/**
 * Review classification
 */
export async function reviewClassification({
  classificationId,
  reviewedBy,
  finalCategoryId = null,
  finalCategorySlug = null
}) {
  const db = getDb();

  const updates = {
    is_reviewed: true,
    reviewed_by: reviewedBy,
    reviewed_at: new Date(),
    updated_at: new Date()
  };

  if (finalCategoryId) updates.final_category_id = finalCategoryId;

  const [classification] = await db('response_classifications')
    .where('id', classificationId)
    .update(updates)
    .returning('*');

  return classification;
}

/**
 * Get response summary
 */
export async function getResponseSummary({ verticalSlug = null }) {
  const db = getDb();

  let query = db('v_response_summary');
  if (verticalSlug) {
    // Join back to get vertical-specific data
    query = db('response_categories as rc')
      .leftJoin('response_classifications as rcl', function() {
        this.on('rcl.category_id', 'rc.id')
          .andOn(db.raw('rcl.vertical_slug = ? OR rcl.vertical_slug IS NULL', [verticalSlug]));
      })
      .select(
        'rc.slug as category_slug',
        'rc.name as category_name',
        'rc.sentiment',
        'rc.intent',
        db.raw('COUNT(rcl.id) as response_count'),
        db.raw('AVG(rcl.confidence) as avg_confidence'),
        db.raw('COUNT(rcl.id) FILTER (WHERE rcl.is_reviewed) as reviewed_count')
      )
      .groupBy('rc.id', 'rc.slug', 'rc.name', 'rc.sentiment', 'rc.intent');
  }

  return query;
}

// =====================================================
// OUTREACH PERFORMANCE
// =====================================================

/**
 * Get outreach performance metrics
 */
export async function getOutreachPerformance({
  channel = null,
  verticalSlug = null,
  territoryId = null,
  days = 30
}) {
  const db = getDb();

  let query = db('v_outreach_performance_by_channel');

  if (channel) query = query.where('channel', channel);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);

  return query.orderBy('date', 'desc');
}

/**
 * Get outreach health metrics
 */
export async function getOutreachHealth({
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  const queueStatus = await getOutreachQueueStatus({ verticalSlug, territoryId });

  // Get recent performance
  let perfQuery = db('outreach_queue')
    .select(
      db.raw("COUNT(*) as total"),
      db.raw("COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opens"),
      db.raw("COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as replies"),
      db.raw("COUNT(*) FILTER (WHERE bounced_at IS NOT NULL) as bounces")
    )
    .where('created_at', '>', db.raw("NOW() - INTERVAL '24 hours'"));

  if (verticalSlug) perfQuery = perfQuery.where('vertical_slug', verticalSlug);
  if (territoryId) perfQuery = perfQuery.where('territory_id', territoryId);

  const [recentPerf] = await perfQuery;

  // Get sequence health
  let seqQuery = db('sequence_instances')
    .select(
      db.raw("COUNT(*) as total_enrolled"),
      db.raw("COUNT(*) FILTER (WHERE status = 'active') as active"),
      db.raw("COUNT(*) FILTER (WHERE status = 'completed') as completed"),
      db.raw("COUNT(*) FILTER (WHERE status = 'exited') as exited")
    );

  if (verticalSlug) seqQuery = seqQuery.where('vertical_slug', verticalSlug);
  if (territoryId) seqQuery = seqQuery.where('territory_id', territoryId);

  const [sequenceHealth] = await seqQuery;

  return {
    queue: queueStatus,
    recentPerformance: recentPerf,
    sequences: sequenceHealth,
    timestamp: new Date().toISOString()
  };
}

// =====================================================
// DEFAULT EXPORT
// =====================================================

export default {
  // Queue
  queueOutreach,
  getOutreachBatch,
  recordOutreachEvent,
  getOutreachItem,
  getOutreachQueueStatus,
  cancelOutreach,

  // Channels
  getChannel,
  listChannels,
  updateChannel,

  // Send Time Optimization
  calculateOptimalSendTime,
  updateSendTimePattern,
  getSendTimePatterns,
  getOptimalSendTimes,
  createSendTimePrediction,

  // Sequences
  createSequence,
  getSequence,
  listSequences,
  addSequenceStep,
  enrollInSequence,
  getSequenceInstance,
  exitSequence,
  getDueSequenceInstances,
  advanceSequenceInstances,
  getSequencePerformance,

  // Response Classification
  getResponseCategories,
  classifyResponse,
  getClassification,
  listClassifications,
  reviewClassification,
  getResponseSummary,

  // Performance
  getOutreachPerformance,
  getOutreachHealth
};
