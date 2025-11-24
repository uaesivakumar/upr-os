/**
 * Agent Activity Streaming API
 * Sprint 50 - SIVA Visualization (Feature #6)
 *
 * Provides real-time agent activity streams using Server-Sent Events (SSE)
 * and historical agent activity via REST endpoints.
 */

const express = require('express');
const router = express.Router();

// In-memory store for mock agent events (development only)
let mockEvents = [];
let eventIdCounter = 0;

// Connected SSE clients
const clients = [];

// ============================================================================
// Mock Data Generator
// ============================================================================

/**
 * Generate mock agent events for development
 * @param {number} count - Number of events to generate
 * @returns {Array} Array of agent events
 */
function generateMockEvents(count = 50) {
  const agentTypes = ['lead', 'research', 'validation', 'outreach', 'system'];
  const actions = {
    lead: [
      'Enriched lead profile',
      'Found decision maker',
      'Updated contact information',
      'Scored company fit',
      'Identified key stakeholders',
    ],
    research: [
      'Found 8 market signals',
      'Discovered tech stack',
      'Analyzed competitors',
      'Gathered funding data',
      'Mapped org structure',
    ],
    validation: [
      'Verified 12 email addresses',
      'Validated phone numbers',
      'Checked domain authority',
      'Confirmed company status',
      'Cross-referenced data sources',
    ],
    outreach: [
      'Generated personalized email',
      'Scheduled follow-up',
      'Sent connection request',
      'Tracked engagement',
      'Optimized sending time',
    ],
    system: [
      'Health check passed',
      'Cache refreshed',
      'Database synced',
      'Cleared old data',
      'Updated indexes',
    ],
  };

  const companies = [
    'Acme Corp',
    'Tech Innovations LLC',
    'Dubai Ventures',
    'Emirates Solutions',
    'Global Trading Co',
    'Smart Systems DMCC',
    'Digital Dynamics',
    'Future Finance',
    'Al-Noor Industries',
    'Peak Performance',
  ];

  const events = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const type = agentTypes[Math.floor(Math.random() * agentTypes.length)];
    const actionsList = actions[type];
    const action = actionsList[Math.floor(Math.random() * actionsList.length)];
    const target = companies[Math.floor(Math.random() * companies.length)];

    const confidence = Math.floor(Math.random() * 40) + 60; // 60-100
    const outcome = Math.random() > 0.1 ? 'success' : Math.random() > 0.5 ? 'in_progress' : 'failure';

    const event = {
      id: `evt_${eventIdCounter++}`,
      agentType: type,
      action,
      target,
      confidence,
      timestamp: new Date(now.getTime() - i * 120000).toISOString(), // 2 minutes apart
      reasoning: Math.random() > 0.3
        ? `Analyzed ${Math.floor(Math.random() * 10) + 3} data points from LinkedIn, company website, and public records. Cross-referenced with industry benchmarks and historical patterns. Confidence score derived from data freshness (${Math.floor(Math.random() * 30) + 70}%) and source reliability (${Math.floor(Math.random() * 25) + 75}%).`
        : undefined,
      outcome,
      metadata: {
        entityId: `entity_${i}`,
        entityType: 'lead',
        sources: ['LinkedIn', 'Company Website', 'Public Records'].slice(0, Math.floor(Math.random() * 3) + 1),
        processingTime: Math.floor(Math.random() * 5000) + 500,
        cost: Math.random() > 0.5 ? parseFloat((Math.random() * 0.5).toFixed(2)) : undefined,
      },
    };

    events.push(event);
  }

  return events.reverse(); // Newest first
}

/**
 * Initialize mock events on server start
 */
function initializeMockEvents() {
  mockEvents = generateMockEvents(50);
  console.log(`✅ Initialized ${mockEvents.length} mock agent events`);

  // Simulate new events every 5 seconds (development only)
  setInterval(() => {
    const newEvent = generateMockEvents(1)[0];
    mockEvents.unshift(newEvent);

    // Keep only last 100 events in memory
    if (mockEvents.length > 100) {
      mockEvents = mockEvents.slice(0, 100);
    }

    // Broadcast to all SSE clients
    broadcastEvent(newEvent);
  }, 5000);
}

/**
 * Broadcast event to all connected SSE clients
 * @param {Object} event - Agent event to broadcast
 */
function broadcastEvent(event) {
  const message = `data: ${JSON.stringify({
    type: 'agent_action',
    data: event,
    timestamp: new Date().toISOString(),
  })}\n\n`;

  clients.forEach((client) => {
    client.write(message);
  });

  console.log(`📡 Broadcasted event ${event.id} to ${clients.length} clients`);
}

// Initialize mock data
initializeMockEvents();

// ============================================================================
// PII Redaction (Security)
// ============================================================================

/**
 * Redact sensitive information from reasoning text
 * @param {string} text - Text to redact
 * @returns {string} Redacted text
 */
function redactPII(text) {
  if (!text) return text;

  let redacted = text;
  let hasRedactions = false;

  // Redact email addresses
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi.test(redacted)) {
    redacted = redacted.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
    hasRedactions = true;
  }

  // Redact phone numbers
  if (/\b\+?\d{10,15}\b/g.test(redacted)) {
    redacted = redacted.replace(/\b\+?\d{10,15}\b/g, '[phone]');
    hasRedactions = true;
  }

  // Redact SSN/Tax IDs
  if (/\b\d{3}-\d{2}-\d{4}\b/g.test(redacted)) {
    redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****');
    hasRedactions = true;
  }

  // Redact credit card numbers
  if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g.test(redacted)) {
    redacted = redacted.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[card]');
    hasRedactions = true;
  }

  return redacted;
}

/**
 * Sanitize event before sending to client
 * @param {Object} event - Agent event
 * @returns {Object} Sanitized event
 */
function sanitizeEvent(event) {
  return {
    ...event,
    reasoning: redactPII(event.reasoning),
    metadata: {
      ...event.metadata,
      redacted: event.reasoning !== redactPII(event.reasoning),
    },
  };
}

// ============================================================================
// SSE Streaming Endpoint
// ============================================================================

/**
 * GET /api/agents/activity/stream
 * Server-Sent Events endpoint for real-time agent activity
 */
router.get('/stream', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    message: 'Connected to SIVA agent activity stream',
    timestamp: new Date().toISOString(),
  })}\n\n`);

  // Send last 10 events as initial data
  const recentEvents = mockEvents.slice(0, 10).map(sanitizeEvent);
  res.write(`data: ${JSON.stringify({
    type: 'initial_data',
    data: recentEvents,
    timestamp: new Date().toISOString(),
  })}\n\n`);

  // Add client to list
  clients.push(res);
  console.log(`✅ SSE client connected (total: ${clients.length})`);

  // Heartbeat to keep connection alive (every 30 seconds)
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    const index = clients.indexOf(res);
    if (index !== -1) {
      clients.splice(index, 1);
    }
    console.log(`❌ SSE client disconnected (remaining: ${clients.length})`);
  });
});

// ============================================================================
// REST Endpoints
// ============================================================================

/**
 * GET /api/agents/activity
 * Get historical agent activity with pagination
 *
 * Query params:
 * - limit: Number of events to return (default: 50, max: 100)
 * - offset: Number of events to skip (default: 0)
 * - agentType: Filter by agent type (optional)
 * - outcome: Filter by outcome (optional)
 * - confidenceMin: Minimum confidence score (optional)
 */
router.get('/', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const agentType = req.query.agentType;
    const outcome = req.query.outcome;
    const confidenceMin = parseInt(req.query.confidenceMin) || 0;

    // Filter events
    let filtered = mockEvents;

    if (agentType) {
      filtered = filtered.filter((e) => e.agentType === agentType);
    }

    if (outcome && outcome !== 'all') {
      filtered = filtered.filter((e) => e.outcome === outcome);
    }

    if (confidenceMin > 0) {
      filtered = filtered.filter((e) => e.confidence >= confidenceMin);
    }

    // Paginate
    const events = filtered
      .slice(offset, offset + limit)
      .map(sanitizeEvent);

    res.json({
      data: events,
      pagination: {
        total: filtered.length,
        limit,
        offset,
        hasMore: offset + limit < filtered.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching agent activity:', error);
    res.status(500).json({
      error: 'Failed to fetch agent activity',
      message: error.message,
    });
  }
});

/**
 * GET /api/agents/metrics
 * Get aggregated agent performance metrics
 *
 * Query params:
 * - timeRange: Time window (1h, 24h, 7d, 30d) - default: 24h
 */
router.get('/metrics', (req, res) => {
  try {
    const timeRange = req.query.timeRange || '24h';

    // Calculate time cutoff
    const now = new Date();
    const cutoffMap = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    const cutoff = new Date(now.getTime() - (cutoffMap[timeRange] || cutoffMap['24h']));

    // Filter events within time range
    const recentEvents = mockEvents.filter((e) => new Date(e.timestamp) >= cutoff);

    // Calculate metrics
    const totalEvents = recentEvents.length;
    const successfulEvents = recentEvents.filter((e) => e.outcome === 'success').length;
    const successRate = totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0;

    const avgConfidence = totalEvents > 0
      ? recentEvents.reduce((sum, e) => sum + e.confidence, 0) / totalEvents
      : 0;

    const activeAgents = new Set(recentEvents.map((e) => e.agentType)).size;

    // Calculate actions per hour
    const timeRangeHours = (cutoffMap[timeRange] || cutoffMap['24h']) / (60 * 60 * 1000);
    const actionsPerHour = totalEvents / timeRangeHours;

    // Top performers
    const agentStats = {};
    recentEvents.forEach((e) => {
      if (!agentStats[e.agentType]) {
        agentStats[e.agentType] = { total: 0, successful: 0 };
      }
      agentStats[e.agentType].total++;
      if (e.outcome === 'success') {
        agentStats[e.agentType].successful++;
      }
    });

    const topPerformers = Object.entries(agentStats)
      .map(([type, stats]) => ({
        agentType: type,
        successRate: (stats.successful / stats.total) * 100,
        totalActions: stats.total,
      }))
      .sort((a, b) => b.successRate - a.successRate);

    res.json({
      data: {
        actionsPerHour: Math.round(actionsPerHour * 10) / 10,
        successRate: Math.round(successRate * 10) / 10,
        avgConfidence: Math.round(avgConfidence),
        activeAgents,
        topPerformers,
      },
      timeRange,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error calculating agent metrics:', error);
    res.status(500).json({
      error: 'Failed to calculate metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/agents/collaboration
 * Get agent collaboration graph data
 *
 * Query params:
 * - timeRange: Time window (1h, 24h, 7d, 30d) - default: 24h
 */
router.get('/collaboration', (req, res) => {
  try {
    const timeRange = req.query.timeRange || '24h';

    // For now, return mock collaboration data
    // In production, this would analyze actual agent handoffs
    const nodes = [
      { id: 'lead', type: 'lead', activeNow: true, actionCount: 42 },
      { id: 'research', type: 'research', activeNow: true, actionCount: 38 },
      { id: 'validation', type: 'validation', activeNow: false, actionCount: 28 },
      { id: 'outreach', type: 'outreach', activeNow: true, actionCount: 15 },
    ];

    const edges = [
      { from: 'lead', to: 'research', handoffs: 35, avgLatency: 1200 },
      { from: 'research', to: 'validation', handoffs: 28, avgLatency: 800 },
      { from: 'validation', to: 'outreach', handoffs: 15, avgLatency: 1500 },
      { from: 'lead', to: 'validation', handoffs: 12, avgLatency: 900 },
    ];

    res.json({
      data: {
        nodes,
        edges,
        lastUpdated: new Date().toISOString(),
      },
      timeRange,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching collaboration data:', error);
    res.status(500).json({
      error: 'Failed to fetch collaboration data',
      message: error.message,
    });
  }
});

// ============================================================================
// Health Check
// ============================================================================

/**
 * GET /api/agents/health
 * Health check endpoint for monitoring
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connectedClients: clients.length,
    eventsInMemory: mockEvents.length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
