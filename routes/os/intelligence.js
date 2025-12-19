/**
 * Intelligence Router - S218-S227 SIVA Intelligence Enhancement
 *
 * OS_AUTHORITY: All endpoints are controlled by OS
 * - Session management
 * - Progressive lead delivery
 * - Preference learning
 * - Interaction Ledger (PRD v1.2: NOT "conversation history")
 * - Conversational UX
 *
 * S224-S227 DECISION MODE:
 * - S224: ONE primary recommendation with reasoning (directive, not descriptive)
 * - S226: Aggressive shortlisting (Top 5 only, no 46-dump)
 * - S227: Score explainability (Top 3 drivers, personalized)
 * - S225: Visible learning feedback (immediate acknowledgment)
 *
 * Architecture: OS decides. SIVA reasons. SaaS renders.
 *
 * PRD v1.2 Compliance:
 * - OS MAY invoke permitted SIVA tools based on persona, phase, and policy gates
 * - ConversationalService = OS orchestration (NOT SIVA tool)
 * - Interaction Ledger = replayable, hashed records
 */

import express from 'express';
import { createRequire } from 'module';

// Import CommonJS services using createRequire
const require = createRequire(import.meta.url);
const LeadQueueService = require('../../os/services/LeadQueueService.js');
const PreferenceLearningService = require('../../os/services/PreferenceLearningService.js');
const ConversationalService = require('../../os/services/ConversationalService.js');

const router = express.Router();

// Initialize services (in production, these would be singletons managed by DI)
const leadQueueService = new LeadQueueService();
const preferenceLearningService = new PreferenceLearningService();
const conversationalService = new ConversationalService();

// In-memory session store (production: Redis)
const sessions = new Map();

// =============================================================================
// S224: DECISION MODE - Generate Primary Recommendation
// =============================================================================

/**
 * S224: Generate primary recommendation from leads
 * OS decides THE ONE company to focus on - directive, not descriptive
 *
 * Output contract:
 * {
 *   company: "G42",
 *   company_id: "...",
 *   why_now: ["Hiring velocity spike", "Payroll-scale headcount", "Tech expansion"],
 *   confidence: 0.82,
 *   next_action: "Find HR decision-maker",
 *   score_drivers: [...]  // S227
 * }
 */
function generatePrimaryRecommendation(leads, preferenceContext) {
  if (!leads || leads.length === 0) {
    return null;
  }

  // Top lead is the recommendation (already sorted by score)
  const top = leads[0];
  const score = top.score || top.qtle_score || 0;

  // S224: Generate "why_now" reasons - directive language
  const whyNow = [];

  // Signal-based reasons
  if (top.signals && top.signals.length > 0) {
    const topSignal = top.signals[0];
    if (topSignal.type === 'hiring-expansion' || topSignal.title?.toLowerCase().includes('hiring')) {
      whyNow.push('Hiring velocity spike');
    } else if (topSignal.type === 'office-opening' || topSignal.title?.toLowerCase().includes('expansion')) {
      whyNow.push('Active expansion in your territory');
    } else if (topSignal.type === 'funding-round' || topSignal.title?.toLowerCase().includes('funding')) {
      whyNow.push('Fresh capital = budget for banking solutions');
    } else {
      whyNow.push(topSignal.title || 'Strong growth signal detected');
    }
  }

  // Headcount-based reason
  if (top.headcount) {
    if (top.headcount >= 500) {
      whyNow.push('Payroll-scale headcount (500+ employees)');
    } else if (top.headcount >= 100) {
      whyNow.push('Growing team (' + top.headcount + ' employees)');
    }
  }

  // Preference-aligned reason (personalized)
  if (preferenceContext && preferenceContext.preferred_industries) {
    if (preferenceContext.preferred_industries.includes(top.industry)) {
      whyNow.push('Matches your preferred industry pattern');
    }
  }

  // Industry/tech reason
  if (top.industry) {
    if (top.industry.toLowerCase().includes('tech') || top.industry.toLowerCase().includes('technology')) {
      whyNow.push('Tech sector = digital-first banking fit');
    }
  }

  // Ensure at least 2 reasons
  if (whyNow.length < 2) {
    whyNow.push('High opportunity score (' + score + ')');
  }

  // S227: Score drivers (top 3, personalized)
  const scoreDrivers = generateScoreDrivers(top, preferenceContext);

  return {
    company: top.name || top.company_name,
    company_id: top.company_id || top.id,
    industry: top.industry,
    score: score,
    why_now: whyNow.slice(0, 3), // Max 3 reasons
    confidence: Math.min(0.95, score / 100),
    next_action: 'Find HR decision-maker at ' + (top.name || 'this company'),
    score_drivers: scoreDrivers // S227
  };
}

// =============================================================================
// S227: SCORE EXPLAINABILITY - Top 3 drivers, personalized
// =============================================================================

/**
 * S227: Generate score drivers - explain WHY this score
 * Rules:
 * - Top 3 drivers only
 * - At least 1 personalized driver
 * - No math dumps, no jargon
 */
function generateScoreDrivers(lead, preferenceContext) {
  const drivers = [];
  const score = lead.score || lead.qtle_score || 0;

  // Signal strength driver
  if (lead.signals && lead.signals.length > 0) {
    const signalCount = lead.signals.length;
    if (signalCount >= 3) {
      drivers.push({
        driver: 'Multiple growth signals',
        detail: signalCount + ' verified signals from multiple sources',
        impact: 'high'
      });
    } else if (signalCount >= 1) {
      const topSignal = lead.signals[0];
      drivers.push({
        driver: topSignal.title || 'Active growth signal',
        detail: 'Source: ' + (topSignal.source || 'verified'),
        impact: 'medium'
      });
    }
  }

  // Size/scale driver
  if (lead.headcount) {
    if (lead.headcount >= 500) {
      drivers.push({
        driver: 'Enterprise scale',
        detail: lead.headcount + ' employees = significant payroll volume',
        impact: 'high'
      });
    } else if (lead.headcount >= 100) {
      drivers.push({
        driver: 'Growth-stage company',
        detail: lead.headcount + ' employees with expansion signals',
        impact: 'medium'
      });
    }
  }

  // Personalized driver (REQUIRED - at least 1)
  if (preferenceContext) {
    if (preferenceContext.preferred_industries?.includes(lead.industry)) {
      drivers.push({
        driver: 'Matches your pattern',
        detail: 'Similar to companies you previously engaged with',
        impact: 'high',
        personalized: true
      });
    } else if (preferenceContext.preferred_size_bucket === lead.size_bucket) {
      drivers.push({
        driver: 'Right company size',
        detail: 'Matches your preferred company profile',
        impact: 'medium',
        personalized: true
      });
    }
  }

  // If no personalized driver yet, add a generic personalized one
  if (!drivers.some(d => d.personalized)) {
    drivers.push({
      driver: 'Strong fit for your territory',
      detail: 'Active in ' + (lead.location || lead.city || 'your region'),
      impact: 'medium',
      personalized: true
    });
  }

  // Return top 3 only
  return drivers.slice(0, 3);
}

// =============================================================================
// S226: AGGRESSIVE SHORTLISTING - Top 5 only
// =============================================================================

const SHORTLIST_SIZE = 5; // Hard cap - no exceptions

/**
 * S226: Create aggressive shortlist
 * Rules:
 * - Default: Top 5 only
 * - Everything else collapsed behind intent
 * - Shortlist changes after feedback
 */
function createShortlist(leads, preferenceContext) {
  if (!leads || leads.length === 0) {
    return { shortlist: [], total_available: 0, collapsed_count: 0 };
  }

  // Apply preference boost before shortlisting
  const boostedLeads = leads.map(lead => {
    let boost = 0;
    if (preferenceContext) {
      if (preferenceContext.preferred_industries?.includes(lead.industry)) {
        boost += 5;
      }
      if (preferenceContext.preferred_size_bucket === lead.size_bucket) {
        boost += 3;
      }
    }
    return {
      ...lead,
      score: (lead.score || lead.qtle_score || 0) + boost,
      preference_boosted: boost > 0
    };
  });

  // Sort by boosted score
  boostedLeads.sort((a, b) => b.score - a.score);

  // Take top 5 ONLY
  const shortlist = boostedLeads.slice(0, SHORTLIST_SIZE);
  const collapsedCount = Math.max(0, boostedLeads.length - SHORTLIST_SIZE);

  return {
    shortlist,
    total_available: leads.length,
    collapsed_count: collapsedCount,
    message: collapsedCount > 0
      ? `${collapsedCount} more available. Ask to see more if needed.`
      : null
  };
}

/**
 * POST /api/os/intelligence/session
 * Start a new discovery session - OS_AUTHORITY
 *
 * OS decides:
 * - Initial batch size (from pack config)
 * - Queue initialization
 * - First batch to show
 */
router.post('/session', async (req, res) => {
  try {
    const {
      tenant_id,
      user_id,
      vertical,
      sub_vertical,
      region_code,
      filters,
      leads // Pre-discovered leads to queue
    } = req.body;

    // Validate required fields
    if (!tenant_id || !vertical || !sub_vertical) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'tenant_id, vertical, and sub_vertical are required'
      });
    }

    // Generate session ID
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Load pack config for progressive delivery settings
    const packConfig = await loadPackConfig(vertical, sub_vertical);
    leadQueueService.loadPackConfig(packConfig);
    preferenceLearningService.loadPackConfig(packConfig);

    // Initialize queue with leads (or empty if discovering later)
    const initialBatch = leadQueueService.initializeQueue(sessionId, leads || []);

    // Get user preference context
    const preferenceContext = preferenceLearningService.getPreferenceContext(user_id || tenant_id);

    // S224: Generate PRIMARY RECOMMENDATION (ONE company, directive)
    const primaryRecommendation = generatePrimaryRecommendation(initialBatch.leads, preferenceContext);

    // S226: Aggressive shortlisting (Top 5 ONLY)
    const shortlistResult = createShortlist(initialBatch.leads, preferenceContext);

    // Store session
    sessions.set(sessionId, {
      sessionId,
      tenantId: tenant_id,
      userId: user_id || tenant_id,
      vertical,
      subVertical: sub_vertical,
      regionCode: region_code,
      filters,
      createdAt: new Date().toISOString()
    });

    // S224: Decision Mode response - NO 46-dump, ONE recommendation + shortlist
    res.json({
      success: true,
      session_id: sessionId,

      // S224: THE decision - directive, not descriptive
      primary_recommendation: primaryRecommendation,

      // S226: Top 5 only - aggressive shortlist
      shortlist: shortlistResult.shortlist,
      total_available: shortlistResult.total_available,
      collapsed_count: shortlistResult.collapsed_count,
      collapsed_message: shortlistResult.message,

      // Legacy fields (for backward compatibility during transition)
      leads: shortlistResult.shortlist, // Only shortlist, NOT all leads
      batch_number: 1,
      has_more: shortlistResult.collapsed_count > 0,
      remaining: shortlistResult.collapsed_count,

      // Stats
      stats: {
        shown: shortlistResult.shortlist.length,
        total: shortlistResult.total_available,
        collapsed: shortlistResult.collapsed_count
      },

      // No prompt on first batch
      prompt: null,

      config: {
        decision_mode: true, // S224 flag
        shortlist_size: SHORTLIST_SIZE, // S226 cap
        progressive_delivery: packConfig?.progressive_delivery || {
          initial_batch: SHORTLIST_SIZE,
          subsequent_batch: 3,
          require_feedback_before_next: true
        },
        preference_learning: packConfig?.preference_learning || {
          enabled: true
        }
      }
    });

  } catch (error) {
    console.error('[Intelligence] Session start error:', error);
    res.status(500).json({
      success: false,
      error: 'SESSION_START_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/os/intelligence/batch
 * Get next batch of leads - OS_AUTHORITY
 *
 * OS decides:
 * - Whether to allow next batch (feedback requirement)
 * - How many leads to return
 * - Queue re-prioritization based on preferences
 */
router.post('/batch', async (req, res) => {
  try {
    const { session_id, action } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SESSION_ID'
      });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'SESSION_NOT_FOUND'
      });
    }

    // Get preference context for queue adjustment
    const preferenceContext = preferenceLearningService.getPreferenceContext(session.userId);

    // Get next batch
    const batch = leadQueueService.getNextBatch(session_id, {
      preferences: preferenceContext?.learned ? {
        preferred_industries: Object.entries(preferenceContext.learned.industries || {})
          .filter(([_, v]) => v.score > 0)
          .map(([k]) => k),
        preferred_size_bucket: Object.entries(preferenceContext.learned.sizes || {})
          .sort((a, b) => b[1].score - a[1].score)[0]?.[0]
      } : null
    });

    // Check if feedback required
    if (batch.error === 'FEEDBACK_REQUIRED') {
      return res.status(200).json({
        success: true,
        requires_feedback: true,
        message: batch.message,
        leads: []
      });
    }

    // Generate session state for conversational prompt
    const sessionState = {
      lastAction: action || 'SHOW_MORE',
      currentBatch: batch.leads,
      feedback: [], // Would come from queue service
      queueStats: batch.stats,
      batchNumber: batch.batchNumber
    };

    // Generate contextual prompt
    const promptData = conversationalService.generateNextPrompt(sessionState, preferenceContext);

    res.json({
      success: true,
      leads: batch.leads,
      batch_number: batch.batchNumber,
      has_more: batch.hasMore,
      remaining: batch.remaining,
      stats: batch.stats,
      prompt: promptData ? {
        id: `prompt_${Date.now()}`,
        type: promptData.type,
        text: selectPromptText(promptData),
        options: generatePromptOptions(promptData.type),
        allowFreeform: true,
        placeholder: 'Or tell me what you prefer...'
      } : null
    });

  } catch (error) {
    console.error('[Intelligence] Batch error:', error);
    res.status(500).json({
      success: false,
      error: 'BATCH_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/os/intelligence/feedback
 * Record feedback on a lead - OS_AUTHORITY
 *
 * OS decides:
 * - How to interpret feedback
 * - Preference model updates
 * - Queue re-prioritization
 */
router.post('/feedback', async (req, res) => {
  try {
    const {
      session_id,
      company_id,
      action, // LIKE, DISLIKE, SAVE, DISMISS
      metadata
    } = req.body;

    if (!session_id || !company_id || !action) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'session_id, company_id, and action are required'
      });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'SESSION_NOT_FOUND'
      });
    }

    // Record feedback in queue service
    const queueResult = leadQueueService.recordFeedback(session_id, company_id, action, metadata);

    // Record signal in preference learning service
    const preferenceResult = preferenceLearningService.recordSignal(session.userId, {
      action,
      companyId: company_id,
      metadata: {
        ...metadata,
        sessionId: session_id
      }
    });

    // Get updated stats
    const stats = leadQueueService.getQueueStats(session_id);

    // Get preference context for prompt generation
    const preferenceContext = preferenceLearningService.getPreferenceContext(session.userId);

    // Generate contextual prompt based on feedback
    const sessionState = {
      lastAction: action,
      feedback: [{ action, companyId: company_id, metadata }],
      queueStats: stats
    };

    const promptData = conversationalService.generateNextPrompt(sessionState, preferenceContext);

    res.json({
      success: true,
      feedback_recorded: true,
      preference_updated: preferenceResult.recorded,
      stats,
      prompt: promptData ? {
        id: `prompt_${Date.now()}`,
        type: promptData.type,
        text: selectPromptText(promptData, metadata),
        options: generatePromptOptions(promptData.type),
        allowFreeform: promptData.type !== 'AFTER_DISLIKE'
      } : null
    });

  } catch (error) {
    console.error('[Intelligence] Feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'FEEDBACK_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/os/intelligence/prompt/respond
 * Handle user response to conversational prompt - OS_AUTHORITY + OS_REASONING
 *
 * OS decides:
 * - How to interpret response
 * - What action to take
 * SIVA reasons:
 * - Natural language parsing
 */
router.post('/prompt/respond', async (req, res) => {
  try {
    const {
      session_id,
      prompt_id,
      response // { action: string, value?: string }
    } = req.body;

    if (!session_id || !prompt_id || !response) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'SESSION_NOT_FOUND'
      });
    }

    let commentary = null;
    let nextPrompt = null;

    // Handle different response types
    if (response.action === 'FIND_SIMILAR') {
      commentary = 'Finding more companies with similar characteristics...';
      // Would trigger similarity search via ConversationalService.findSimilarContext()
    } else if (response.action === 'FILTER_OUT') {
      commentary = 'I\'ll focus on different types of companies for you.';
      // Would update preference filters
    } else if (response.action === 'DIVERSIFY') {
      commentary = 'Showing you a more diverse set of opportunities.';
    } else if (response.action === 'FREEFORM' && response.value) {
      // Parse natural language - OS_REASONING via SIVA
      const parseContext = conversationalService.parseNaturalLanguageRefinement(response.value);
      commentary = `Processing: "${response.value}"`;
      // In production, this would call SIVA to actually parse
    }

    res.json({
      success: true,
      prompt_id,
      action_taken: response.action,
      commentary,
      next_prompt: nextPrompt
    });

  } catch (error) {
    console.error('[Intelligence] Prompt respond error:', error);
    res.status(500).json({
      success: false,
      error: 'PROMPT_RESPOND_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/os/intelligence/refine
 * Apply natural language refinement - OS_AUTHORITY + OS_REASONING
 *
 * OS decides:
 * - How to apply parsed filters
 * - Queue updates
 * SIVA reasons:
 * - Parse natural language into structured filters
 */
router.post('/refine', async (req, res) => {
  try {
    const {
      session_id,
      refinement_text
    } = req.body;

    if (!session_id || !refinement_text) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'SESSION_NOT_FOUND'
      });
    }

    // Get parse context for SIVA - OS_REASONING
    const parseContext = conversationalService.parseNaturalLanguageRefinement(refinement_text);

    // In production, this would:
    // 1. Call SIVA to parse the refinement
    // 2. Apply parsed filters to the queue
    // 3. Re-fetch/re-rank leads
    // 4. Return new batch

    // For now, return acknowledgment
    res.json({
      success: true,
      refinement_text,
      parse_context: parseContext.forSiva,
      commentary: `Adjusting search based on: "${refinement_text}"`,
      // Would include new leads, stats, etc.
    });

  } catch (error) {
    console.error('[Intelligence] Refine error:', error);
    res.status(500).json({
      success: false,
      error: 'REFINE_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/os/intelligence/saved
 * Get saved leads for user - OS_AUTHORITY
 */
router.get('/saved', async (req, res) => {
  try {
    const userId = req.query.user_id || req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_USER_ID'
      });
    }

    const savedLeads = preferenceLearningService.getSavedLeads(userId);

    res.json({
      success: true,
      saved_leads: savedLeads,
      total_count: savedLeads.length
    });

  } catch (error) {
    console.error('[Intelligence] Get saved error:', error);
    res.status(500).json({
      success: false,
      error: 'GET_SAVED_FAILED',
      message: error.message
    });
  }
});

/**
 * DELETE /api/os/intelligence/saved/:companyId
 * Remove a saved lead - OS_AUTHORITY
 */
router.delete('/saved/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const userId = req.query.user_id || req.headers['x-user-id'];

    if (!userId || !companyId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const result = preferenceLearningService.removeSavedLead(userId, companyId);

    res.json({
      success: result.success,
      company_id: companyId
    });

  } catch (error) {
    console.error('[Intelligence] Remove saved error:', error);
    res.status(500).json({
      success: false,
      error: 'REMOVE_SAVED_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/os/intelligence/preferences
 * Get user preference context - OS_AUTHORITY
 */
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.query.user_id || req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_USER_ID'
      });
    }

    const preferenceContext = preferenceLearningService.getPreferenceContext(userId);

    res.json({
      success: true,
      preferences: preferenceContext
    });

  } catch (error) {
    console.error('[Intelligence] Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'GET_PREFERENCES_FAILED',
      message: error.message
    });
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Load pack config from database or file
 */
async function loadPackConfig(vertical, subVertical) {
  // In production, this would load from database
  // For now, return default config
  try {
    const fs = await import('fs');
    const path = await import('path');
    const packPath = path.join(
      process.cwd(),
      'os/packs',
      vertical,
      `${subVertical.replace('_', '-')}.json`
    );

    if (fs.existsSync(packPath)) {
      const packData = JSON.parse(fs.readFileSync(packPath, 'utf8'));
      return packData;
    }
  } catch (e) {
    console.warn('[Intelligence] Could not load pack config:', e.message);
  }

  return {
    progressive_delivery: {
      enabled: true,
      initial_batch: 5,
      subsequent_batch: 3,
      require_feedback_before_next: true,
      max_leads_per_session: 50
    },
    preference_learning: {
      enabled: true,
      signals_to_track: ['LIKE', 'DISLIKE', 'SAVE', 'DISMISS'],
      learning_window_days: 90,
      min_signals_for_learning: 5
    }
  };
}

/**
 * Select prompt text from templates
 */
function selectPromptText(promptData, metadata = {}) {
  const templates = promptData.templates || [];
  if (templates.length === 0) {
    return 'What would you like to do next?';
  }

  // Select first template and fill placeholders
  let text = templates[0];

  // Replace placeholders
  if (metadata?.company_name) {
    text = text.replace('{company_name}', metadata.company_name);
  }
  if (promptData.context?.similar_company) {
    text = text.replace('{similar_company}', promptData.context.similar_company);
  }
  if (promptData.context?.preferred_characteristic) {
    text = text.replace('{preferred_characteristic}', promptData.context.preferred_characteristic);
  }

  return text;
}

/**
 * Generate prompt options based on type
 */
function generatePromptOptions(promptType) {
  const optionSets = {
    AFTER_LIKE: [
      { label: 'Yes, more like this', value: 'similar', action: 'FIND_SIMILAR' },
      { label: 'Show different types', value: 'different', action: 'DIVERSIFY' }
    ],
    AFTER_DISLIKE: [
      { label: 'Yes, avoid this type', value: 'avoid', action: 'FILTER_OUT' },
      { label: 'No, keep showing all', value: 'keep', action: 'CONTINUE' }
    ],
    AFTER_BATCH: [
      { label: 'Show more', value: 'more', action: 'SHOW_MORE' },
      { label: 'Refine search', value: 'refine', action: 'REFINE' }
    ],
    LOW_MATCHES: [
      { label: 'Expand search', value: 'expand', action: 'EXPAND' },
      { label: 'Try different filters', value: 'different', action: 'RESET_FILTERS' }
    ]
  };

  return optionSets[promptType] || optionSets.AFTER_BATCH;
}

/**
 * Generate SIVA commentary
 */
function generateSivaCommentary(commentaryContext, leadCount) {
  if (leadCount === 0) {
    return 'No matching companies found. Try adjusting your filters.';
  }

  const examples = commentaryContext?.forSiva?.examples || [];
  if (examples.length > 0) {
    // Return a contextual example
    return examples[Math.floor(Math.random() * examples.length)]
      .replace('5', String(leadCount));
  }

  return `Found ${leadCount} companies matching your criteria.`;
}

export default router;
