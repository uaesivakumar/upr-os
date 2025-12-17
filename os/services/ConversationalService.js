/**
 * ConversationalService - OS_AUTHORITY + OS_REASONING
 *
 * Conversational UX System
 *
 * OS decides:
 * - When to show prompts
 * - What context to pass to SIVA
 * - How to interpret user intents
 *
 * SIVA reasons:
 * - Generates prompts (stateless)
 * - Generates commentary (stateless)
 * - Parses natural language refinements
 *
 * SaaS:
 * - Renders prompts returned by OS
 * - Emits user intent events
 * - Never generates or phrases prompts
 *
 * Architecture: OS decides. SIVA reasons. SaaS renders.
 */

class ConversationalService {
  constructor() {
    // Prompt templates for SIVA to fill
    this.promptTemplates = {
      AFTER_BATCH: [
        'Want more companies like {similar_company}?',
        'Should I focus on {preferred_characteristic}?',
        'I can find more in {location} if you prefer.',
        'Looking for larger or smaller companies?'
      ],
      AFTER_LIKE: [
        'Great choice! Want more like {company_name}?',
        'I noticed you like {industry} companies. Show more?',
        'Finding similar companies to {company_name}...'
      ],
      AFTER_DISLIKE: [
        'Got it. Should I avoid {characteristic} companies?',
        'Noted. What type of companies work better for you?'
      ],
      LOW_MATCHES: [
        'Few matches in {location}. Try expanding the search?',
        'The filters are quite narrow. Want me to broaden them?'
      ]
    };
  }

  /**
   * Generate next prompt based on session state
   * OS_AUTHORITY: OS decides when and what prompt to show
   * OS_REASONING: SIVA generates the actual text
   *
   * @param {Object} sessionState - Current session state
   * @param {Object} preferenceContext - User preferences from PreferenceLearningService
   * @returns {Object} Prompt to display (or null)
   */
  generateNextPrompt(sessionState, preferenceContext) {
    const { lastAction, currentBatch, feedback, queueStats } = sessionState;

    // Decide if we should show a prompt
    if (!this._shouldShowPrompt(sessionState)) {
      return null;
    }

    // Select appropriate prompt type
    let promptType = 'AFTER_BATCH';
    if (lastAction === 'LIKE' || lastAction === 'SAVE') {
      promptType = 'AFTER_LIKE';
    } else if (lastAction === 'DISLIKE' || lastAction === 'DISMISS') {
      promptType = 'AFTER_DISLIKE';
    } else if (queueStats?.remaining < 5) {
      promptType = 'LOW_MATCHES';
    }

    // Build context for prompt generation
    const promptContext = this._buildPromptContext(sessionState, preferenceContext);

    return {
      type: promptType,
      context: promptContext,
      templates: this.promptTemplates[promptType],
      // OS provides templates, SIVA picks and fills
      forSiva: {
        instruction: 'Select most appropriate prompt template and fill placeholders based on context',
        context: promptContext
      }
    };
  }

  /**
   * Generate commentary for lead results
   * OS_REASONING: SIVA generates commentary over OS-provided context
   *
   * @param {Array} leads - Leads being shown
   * @param {Object} searchContext - Original search parameters
   * @param {Object} preferenceContext - User preferences
   * @returns {Object} Commentary context for SIVA
   */
  generateCommentaryContext(leads, searchContext, preferenceContext) {
    // Analyze leads for commentary
    const analysis = {
      count: leads.length,
      industries: [...new Set(leads.map(l => l.industry).filter(Boolean))],
      locations: [...new Set(leads.map(l => l.location).filter(Boolean))],
      avgScore: leads.reduce((sum, l) => sum + (l.score || 0), 0) / leads.length,
      signals: [...new Set(leads.flatMap(l => l.signals || []).map(s => s.type))]
    };

    // Build commentary context
    return {
      forSiva: {
        instruction: 'Generate brief, helpful commentary explaining why these leads were selected',
        analysis,
        searchContext,
        preferenceContext: preferenceContext?.summary || null,
        examples: [
          'I found 5 tech companies expanding in Dubai - perfect for EB given their hiring patterns.',
          'These startups just raised funding and are likely scaling their teams.',
          'Based on your preferences, here are companies similar to ones you liked.'
        ],
        rules: [
          'Keep it under 2 sentences',
          'Reference specific signals or patterns',
          'Be helpful, not salesy',
          'If user has preferences, acknowledge them'
        ]
      }
    };
  }

  /**
   * Parse natural language refinement
   * OS_AUTHORITY: OS interprets the intent
   * OS_REASONING: SIVA parses the natural language
   *
   * @param {string} userInput - Raw user input
   * @returns {Object} Parsed intent and filters
   */
  parseNaturalLanguageRefinement(userInput) {
    // Build context for SIVA to parse
    return {
      forSiva: {
        instruction: 'Parse the user input and extract filter intent',
        userInput,
        expectedOutput: {
          intent: 'FILTER | FIND_SIMILAR | EXPAND | NARROW | OTHER',
          filters: {
            min_employees: 'number or null',
            max_employees: 'number or null',
            industries: 'array of strings or null',
            locations: 'array of strings or null',
            exclude_industries: 'array of strings or null'
          },
          confidence: 'number 0-1'
        },
        examples: [
          { input: 'Show only 100+ employees', output: { intent: 'FILTER', filters: { min_employees: 100 } } },
          { input: 'Focus on DIFC', output: { intent: 'FILTER', filters: { locations: ['DIFC'] } } },
          { input: 'No more construction companies', output: { intent: 'FILTER', filters: { exclude_industries: ['Construction'] } } },
          { input: 'Find more like this', output: { intent: 'FIND_SIMILAR', filters: {} } },
          { input: 'Bigger companies please', output: { intent: 'FILTER', filters: { min_employees: 200 } } }
        ]
      }
    };
  }

  /**
   * Handle "Find more like X" intent
   * OS_AUTHORITY: OS decides similarity criteria
   * OS_REASONING: SIVA ranks by similarity
   *
   * @param {Object} referenceCompany - Company to find similar to
   * @param {Array} candidates - Pool of candidate leads
   * @returns {Object} Similarity analysis context
   */
  findSimilarContext(referenceCompany, candidates) {
    // Extract characteristics from reference company
    const characteristics = {
      industry: referenceCompany.industry,
      size_bucket: referenceCompany.size_bucket,
      location: referenceCompany.location,
      signals: referenceCompany.signals?.map(s => s.type) || [],
      founding_year_range: this._getFoundingYearRange(referenceCompany.founding_year)
    };

    return {
      forSiva: {
        instruction: 'Score each candidate by similarity to reference company',
        reference: characteristics,
        candidates: candidates.map(c => ({
          id: c.company_id || c.id,
          industry: c.industry,
          size_bucket: c.size_bucket,
          location: c.location,
          signals: c.signals?.map(s => s.type) || [],
          founding_year: c.founding_year
        })),
        scoringWeights: {
          industry_match: 0.35,
          size_match: 0.25,
          location_match: 0.20,
          signal_overlap: 0.15,
          founding_year_proximity: 0.05
        }
      }
    };
  }

  /**
   * Internal: Decide if we should show a prompt
   * @private
   */
  _shouldShowPrompt(sessionState) {
    const { batchNumber, feedback, lastPromptAt } = sessionState;

    // Don't show prompt on first batch
    if (batchNumber <= 1) return false;

    // Show after every 2 batches or after feedback
    if (batchNumber % 2 === 0) return true;
    if (feedback?.length > 0) return true;

    // Don't spam prompts
    if (lastPromptAt) {
      const timeSince = Date.now() - new Date(lastPromptAt).getTime();
      if (timeSince < 60000) return false; // Min 1 minute between prompts
    }

    return false;
  }

  /**
   * Internal: Build context for prompt generation
   * @private
   */
  _buildPromptContext(sessionState, preferenceContext) {
    const { currentBatch, feedback, queueStats } = sessionState;

    const context = {
      recentLikes: feedback?.filter(f => f.action === 'LIKE').slice(-3) || [],
      recentDislikes: feedback?.filter(f => f.action === 'DISLIKE').slice(-3) || [],
      currentBatchIndustries: [...new Set(currentBatch?.map(l => l.industry) || [])],
      currentBatchLocations: [...new Set(currentBatch?.map(l => l.location) || [])],
      hasMore: queueStats?.remaining > 0,
      userPreferences: preferenceContext?.summary || null
    };

    // Add similar company if user liked something
    if (context.recentLikes.length > 0) {
      context.similar_company = context.recentLikes[0].metadata?.company_name || 'that company';
    }

    // Add preferred characteristic
    if (preferenceContext?.learned?.industries) {
      const topIndustry = Object.entries(preferenceContext.learned.industries)
        .sort((a, b) => b[1].score - a[1].score)[0];
      if (topIndustry) {
        context.preferred_characteristic = `${topIndustry[0]} companies`;
      }
    }

    return context;
  }

  /**
   * Internal: Get founding year range for similarity
   * @private
   */
  _getFoundingYearRange(year) {
    if (!year) return null;
    return {
      min: year - 3,
      max: year + 3
    };
  }
}

module.exports = ConversationalService;
