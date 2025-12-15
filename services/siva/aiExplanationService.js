/**
 * SIVA AI Explanation Service
 * VS2: AI-Powered QTLE Explanations
 * VS3: Prompt Injection Defense Integration
 *
 * Generates intelligent, persona-specific explanations for QTLE scores
 * using the LLM router infrastructure with prompt injection protection.
 *
 * Authorization Code: VS1-VS9-APPROVED-20251213
 */

import { completeWithFallback, selectModel } from '../llm/router.js';
import { sanitizeInput, constructSafePrompt } from './promptInjectionDefense.js';

// Task type for model selection
const TASK_TYPE = 'score_explanation';

/**
 * Generate AI-powered explanation for Q-Score (Quality)
 *
 * @param {Object} qScore - Q-Score result with breakdown
 * @param {Object} entity - Entity being scored
 * @param {string} profile - Scoring profile (e.g., 'banking_employee')
 * @returns {Promise<string>} AI-generated explanation
 */
export async function generateAIQScoreExplanation(qScore, entity, profile = 'default') {
  const prompt = buildQScorePrompt(qScore, entity, profile);
  return executeExplanation(prompt, profile, 'q_score');
}

/**
 * Generate AI-powered explanation for T-Score (Timing)
 *
 * @param {Object} tScore - T-Score result with breakdown
 * @param {Object} entity - Entity being scored
 * @param {Array} signals - Signals used for scoring
 * @param {string} profile - Scoring profile
 * @returns {Promise<string>} AI-generated explanation
 */
export async function generateAITScoreExplanation(tScore, entity, signals, profile = 'default') {
  const prompt = buildTScorePrompt(tScore, entity, signals, profile);
  return executeExplanation(prompt, profile, 't_score');
}

/**
 * Generate AI-powered explanation for L-Score (Lead)
 *
 * @param {Object} lScore - L-Score result with breakdown
 * @param {Object} entity - Entity being scored
 * @param {string} profile - Scoring profile
 * @returns {Promise<string>} AI-generated explanation
 */
export async function generateAILScoreExplanation(lScore, entity, profile = 'default') {
  const prompt = buildLScorePrompt(lScore, entity, profile);
  return executeExplanation(prompt, profile, 'l_score');
}

/**
 * Generate AI-powered explanation for E-Score (Evidence)
 *
 * @param {Object} eScore - E-Score result with breakdown
 * @param {Array} signals - Signals used for evidence
 * @param {string} profile - Scoring profile
 * @returns {Promise<string>} AI-generated explanation
 */
export async function generateAIEScoreExplanation(eScore, signals, profile = 'default') {
  const prompt = buildEScorePrompt(eScore, signals, profile);
  return executeExplanation(prompt, profile, 'e_score');
}

/**
 * Generate AI-powered explanation for Composite score
 *
 * @param {Object} scores - All QTLE scores
 * @param {Object} composite - Composite score result
 * @param {Object} entity - Entity being scored
 * @param {string} profile - Scoring profile
 * @returns {Promise<string>} AI-generated explanation
 */
export async function generateAICompositeExplanation(scores, composite, entity, profile = 'default') {
  const prompt = buildCompositePrompt(scores, composite, entity, profile);
  return executeExplanation(prompt, profile, 'composite');
}

/**
 * Generate all explanations in batch (more efficient)
 *
 * @param {Object} scores - All scores object
 * @param {Object} entity - Entity being scored
 * @param {Array} signals - Signals used
 * @param {string} profile - Scoring profile
 * @returns {Promise<Object>} All AI-generated explanations
 */
export async function generateAllExplanations(scores, entity, signals, profile = 'default') {
  const prompt = buildBatchExplanationPrompt(scores, entity, signals, profile);
  const response = await executeExplanation(prompt, profile, 'batch_explanation');

  // Parse JSON response
  try {
    const parsed = JSON.parse(response);
    return {
      q_score: parsed.quality || parsed.q_score,
      t_score: parsed.timing || parsed.t_score,
      l_score: parsed.lead || parsed.l_score,
      e_score: parsed.evidence || parsed.e_score,
      composite: parsed.composite || parsed.overall,
    };
  } catch {
    // If JSON parsing fails, return the raw response for composite
    return {
      composite: response,
    };
  }
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildQScorePrompt(qScore, entity, profile) {
  return {
    system: getSystemPrompt(profile),
    user: `Explain this Quality Score for a salesperson:

COMPANY: ${entity.name || 'Unknown'}
INDUSTRY: ${entity.industry || 'Not specified'}
QUALITY SCORE: ${qScore.value}/100 (${qScore.rating})

BREAKDOWN:
- Domain/Web Presence: ${qScore.breakdown?.domain || 0} points
- LinkedIn Profile: ${qScore.breakdown?.linkedin || 0} points
- Growth Signals: ${qScore.breakdown?.signals || 0} points
- UAE Presence: ${qScore.breakdown?.uae_presence || 0} points
- Recency: ${qScore.breakdown?.recency || 0} points

Generate a 1-2 sentence explanation that helps a salesperson understand why this company has this quality rating and what it means for their outreach. Be specific and actionable.`,
  };
}

function buildTScorePrompt(tScore, entity, signals, profile) {
  const recentSignals = signals.slice(0, 5).map(s => ({
    type: s.signal_type || s.type,
    title: s.title,
    date: s.created_at,
  }));

  return {
    system: getSystemPrompt(profile),
    user: `Explain this Timing Score for a salesperson:

COMPANY: ${entity.name || 'Unknown'}
TIMING SCORE: ${tScore.value}/100 (${tScore.category})

BREAKDOWN:
- Signal Recency: ${tScore.breakdown?.recency || 0} points
- Signal Strength: ${tScore.breakdown?.signal_strength || 0} points
- Market Timing: ${tScore.breakdown?.market_timing || 0} points

RECENT SIGNALS:
${JSON.stringify(recentSignals, null, 2)}

Generate a 1-2 sentence explanation about why NOW is or isn't a good time to reach out. Focus on actionable timing insights.`,
  };
}

function buildLScorePrompt(lScore, entity, profile) {
  return {
    system: getSystemPrompt(profile),
    user: `Explain this Lead Score for a salesperson:

COMPANY: ${entity.name || 'Unknown'}
INDUSTRY: ${entity.industry || 'Not specified'}
SIZE: ${entity.size_range || 'Unknown'}
LEAD SCORE: ${lScore.value}/100 (${lScore.tier} LEAD)

BREAKDOWN:
- Company Fit: ${lScore.breakdown?.company_fit || 0} points
- Engagement Potential: ${lScore.breakdown?.engagement_potential || 0} points
- Timing Alignment: ${lScore.breakdown?.timing_alignment || 0} points
- Profile Match: ${lScore.breakdown?.profile_match || 0} points

Generate a 1-2 sentence explanation about how good this lead is and what makes it ${lScore.tier}. Include specific reasoning.`,
  };
}

function buildEScorePrompt(eScore, signals, profile) {
  const signalSummary = signals.slice(0, 5).map(s => s.signal_type || s.type).join(', ');

  return {
    system: getSystemPrompt(profile),
    user: `Explain this Evidence Score for a salesperson:

EVIDENCE SCORE: ${eScore.value}/100 (${eScore.strength} EVIDENCE)
SIGNAL COUNT: ${signals.length}
SIGNAL TYPES: ${signalSummary || 'None'}

BREAKDOWN:
- Signal Count: ${eScore.breakdown?.signal_count || 0} points
- Average Confidence: ${eScore.breakdown?.avg_confidence || 0} points
- Source Diversity: ${eScore.breakdown?.source_diversity || 0} points

Generate a 1-2 sentence explanation about the strength of evidence supporting this lead. Focus on what the signals tell us.`,
  };
}

function buildCompositePrompt(scores, composite, entity, profile) {
  return {
    system: getSystemPrompt(profile),
    user: `Explain this Composite Score for a salesperson:

COMPANY: ${entity.name || 'Unknown'}
COMPOSITE SCORE: ${composite.value}/100 (${composite.tier})
GRADE: ${composite.grade || 'N/A'}

COMPONENT SCORES:
- Quality (Q): ${scores.q_score?.value || 'N/A'}/100 (${scores.q_score?.rating || 'N/A'})
- Timing (T): ${scores.t_score?.value || 'N/A'}/100 (${scores.t_score?.category || 'N/A'})
- Lead (L): ${scores.l_score?.value || 'N/A'}/100 (${scores.l_score?.tier || 'N/A'})
- Evidence (E): ${scores.e_score?.value || 'N/A'}/100 (${scores.e_score?.strength || 'N/A'})

PROFILE: ${profile}

Generate a 2-3 sentence summary explaining the overall opportunity quality and a clear recommendation for the salesperson.`,
  };
}

function buildBatchExplanationPrompt(scores, entity, signals, profile) {
  const signalSummary = signals.slice(0, 5).map(s => ({
    type: s.signal_type || s.type,
    title: s.title,
  }));

  return {
    system: `${getSystemPrompt(profile)}

You must respond with a JSON object containing explanations for each score type. Format:
{
  "quality": "1-2 sentence explanation for Q-Score",
  "timing": "1-2 sentence explanation for T-Score",
  "lead": "1-2 sentence explanation for L-Score",
  "evidence": "1-2 sentence explanation for E-Score",
  "composite": "2-3 sentence overall summary with recommendation"
}`,
    user: `Generate QTLE explanations for a salesperson:

COMPANY: ${entity.name || 'Unknown'}
INDUSTRY: ${entity.industry || 'Not specified'}
SIZE: ${entity.size_range || 'Unknown'}

SCORES:
- Quality (Q): ${scores.q_score?.value || 'N/A'}/100 - ${JSON.stringify(scores.q_score?.breakdown || {})}
- Timing (T): ${scores.t_score?.value || 'N/A'}/100 - ${JSON.stringify(scores.t_score?.breakdown || {})}
- Lead (L): ${scores.l_score?.value || 'N/A'}/100 - ${JSON.stringify(scores.l_score?.breakdown || {})}
- Evidence (E): ${scores.e_score?.value || 'N/A'}/100 - ${JSON.stringify(scores.e_score?.breakdown || {})}
- Composite: ${scores.composite?.value || 'N/A'}/100 (${scores.composite?.tier || 'N/A'})

SIGNALS: ${JSON.stringify(signalSummary)}

PROFILE: ${profile}

Generate actionable explanations that help a ${getProfileDescription(profile)} understand this opportunity.`,
  };
}

// ============================================================================
// SYSTEM PROMPTS (Persona-Specific)
// ============================================================================

function getSystemPrompt(profile) {
  const basePrompt = `You are SIVA, an intelligent sales assistant that explains lead scores to salespeople. Your explanations should be:
- Concise (1-3 sentences)
- Actionable (tell them what to do)
- Specific (reference actual data points)
- Professional but friendly

Do NOT use jargon or generic statements. Be direct and helpful.`;

  const profilePrompts = {
    banking_employee: `${basePrompt}

You are helping EMPLOYEE BANKING salespeople who sell:
- Payroll accounts
- Salary disbursement services
- Employee benefits packages
- Corporate expense cards

Focus on signals like hiring, headcount growth, new office openings that indicate payroll needs.`,

    banking_corporate: `${basePrompt}

You are helping CORPORATE BANKING salespeople who sell:
- Treasury management
- Trade finance
- Working capital loans
- Corporate credit facilities

Focus on signals like funding rounds, expansions, large projects that indicate treasury/credit needs.`,

    banking_sme: `${basePrompt}

You are helping SME BANKING salespeople who sell:
- Business accounts
- Working capital facilities
- Trade finance for SMEs
- Business credit cards

Focus on growth signals and funding needs appropriate for small-medium businesses.`,

    insurance_individual: `${basePrompt}

You are helping INDIVIDUAL INSURANCE salespeople. Focus on life events and protection needs.`,

    recruitment_hiring: `${basePrompt}

You are helping RECRUITMENT salespeople. Focus on hiring signals and talent acquisition needs.`,

    saas_b2b: `${basePrompt}

You are helping B2B SAAS salespeople. Focus on technology adoption and digital transformation signals.`,

    default: basePrompt,
  };

  return profilePrompts[profile] || profilePrompts.default;
}

function getProfileDescription(profile) {
  const descriptions = {
    banking_employee: 'employee banking salesperson',
    banking_corporate: 'corporate banking salesperson',
    banking_sme: 'SME banking salesperson',
    insurance_individual: 'insurance salesperson',
    recruitment_hiring: 'recruitment consultant',
    saas_b2b: 'B2B SaaS salesperson',
    default: 'salesperson',
  };

  return descriptions[profile] || descriptions.default;
}

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute LLM call for explanation generation
 * VS3: Uses safe prompt construction with injection defense
 * @private
 */
async function executeExplanation(prompt, profile, scoreType) {
  try {
    // VS3: Sanitize any user-derived content in the prompt
    const sanitizedUser = sanitizeInput(prompt.user, {
      maxLength: 2000,
      escapeDelimiters: true,
    });

    // VS3: Construct safe prompt with defense measures
    const { messages } = constructSafePrompt(prompt.system, sanitizedUser, {
      validateInput: true,
      sanitize: false, // Already sanitized above
      wrapUserInput: true,
      addDefensePrefix: true,
    });

    // Map profile to vertical for model selection
    const vertical = mapProfileToVertical(profile);

    const result = await completeWithFallback(messages, {
      taskType: TASK_TYPE,
      vertical,
      preferQuality: false, // Prefer speed for explanations
      temperature: 0.3, // Lower temperature for consistent explanations
      maxTokens: 300, // Short responses
    });

    console.log(`[SIVA] Generated ${scoreType} explanation using ${result.model}`);

    return result.content?.trim() || getFallbackExplanation(scoreType);
  } catch (error) {
    // VS3: Check if it's a prompt injection error
    if (error.code === 'PROMPT_INJECTION_BLOCKED') {
      console.error(`[SIVA] Prompt injection blocked for ${scoreType}:`, error.message);
    } else {
      console.error(`[SIVA] AI explanation failed for ${scoreType}:`, error.message);
    }
    // Return fallback on error
    return getFallbackExplanation(scoreType);
  }
}

/**
 * Map scoring profile to vertical for model selection
 */
function mapProfileToVertical(profile) {
  const mapping = {
    banking_employee: 'banking',
    banking_corporate: 'banking',
    banking_sme: 'banking',
    insurance_individual: 'insurance',
    recruitment_hiring: 'recruitment',
    saas_b2b: 'saas',
  };

  return mapping[profile] || null;
}

/**
 * Get fallback explanation when AI fails
 */
function getFallbackExplanation(scoreType) {
  const fallbacks = {
    q_score: 'Quality assessment based on available company data.',
    t_score: 'Timing assessment based on recent signals.',
    l_score: 'Lead assessment based on fit and engagement potential.',
    e_score: 'Evidence assessment based on signal strength.',
    composite: 'Overall opportunity score combining quality, timing, lead, and evidence factors.',
    batch_explanation: '{"quality":"Based on available data.","timing":"Based on recent activity.","lead":"Based on fit analysis.","evidence":"Based on signals.","composite":"Review recommended."}',
  };

  return fallbacks[scoreType] || 'Assessment completed.';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateAIQScoreExplanation,
  generateAITScoreExplanation,
  generateAILScoreExplanation,
  generateAIEScoreExplanation,
  generateAICompositeExplanation,
  generateAllExplanations,
};
