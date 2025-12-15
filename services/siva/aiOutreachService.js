/**
 * SIVA AI Outreach Service
 * VS2.3: Persona-Specific Outreach Generation
 * VS3: Prompt Injection Defense Integration
 *
 * Generates intelligent, persona-specific outreach messages
 * using the LLM router infrastructure with prompt injection protection.
 *
 * Authorization Code: VS1-VS9-APPROVED-20251213
 */

import { completeWithFallback } from '../llm/router.js';
import {
  sanitizeInput,
  sanitizeObject,
  constructSafePrompt,
  detectInjection,
} from './promptInjectionDefense.js';

// Task type for model selection
const TASK_TYPE = 'outreach_generation';

/**
 * Generate AI-powered outreach message for a lead
 * VS3: Includes prompt injection defense
 *
 * @param {Object} lead - Lead data (name, designation, company, industry, etc.)
 * @param {Object} options - Outreach options
 * @param {Object} score - Optional QTLE score data for personalization
 * @returns {Promise<Object>} Generated outreach content
 */
export async function generateAIOutreach(lead, options = {}, score = null) {
  const {
    channel = 'email',
    tone = 'friendly',
    profile = 'default',
    personalization_level = 'high',
    context = {}
  } = options;

  // VS3: Sanitize lead data to prevent injection through user-provided content
  const safeLead = sanitizeObject(lead, {
    maxLength: 500,
    escapeDelimiters: true,
  });

  // VS3: Check for injection in lead data (which may come from user input)
  const injectionCheck = detectInjection(JSON.stringify(lead));
  if (injectionCheck.blocked) {
    console.error(`[SIVA Outreach] Blocked potential injection in lead data`);
    return generateFallbackContent(safeLead, channel, tone, profile);
  }

  const prompt = buildOutreachPrompt(safeLead, channel, tone, profile, score, context);

  try {
    // VS3: Construct safe prompt with defense measures
    const { messages } = constructSafePrompt(prompt.system, prompt.user, {
      validateInput: true,
      sanitize: false, // Already sanitized above
      wrapUserInput: true,
      addDefensePrefix: true,
    });

    const vertical = mapProfileToVertical(profile);

    const result = await completeWithFallback(messages, {
      taskType: TASK_TYPE,
      vertical,
      preferQuality: personalization_level === 'high',
      temperature: 0.7, // Higher creativity for outreach
      maxTokens: 800,
    });

    console.log(`[SIVA Outreach] Generated ${channel} for ${safeLead.name} using ${result.model}`);

    // Parse the response
    const parsed = parseOutreachResponse(result.content, channel, safeLead);

    return {
      success: true,
      channel,
      ...parsed,
      ai_generated: true,
      model_used: result.model,
      personalization_level,
    };
  } catch (error) {
    // VS3: Check if blocked by prompt injection defense
    if (error.code === 'PROMPT_INJECTION_BLOCKED') {
      console.error(`[SIVA Outreach] Prompt injection blocked:`, error.message);
    } else {
      console.error(`[SIVA Outreach] AI generation failed:`, error.message);
    }
    // Return fallback content
    return generateFallbackContent(safeLead, channel, tone, profile);
  }
}

/**
 * Generate batch outreach for multiple leads
 *
 * @param {Array} leads - Array of lead objects
 * @param {Object} options - Outreach options
 * @returns {Promise<Array>} Array of outreach results
 */
export async function generateBatchOutreach(leads, options = {}) {
  const results = await Promise.all(
    leads.map(lead => generateAIOutreach(lead, options, lead.score))
  );

  return results;
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildOutreachPrompt(lead, channel, tone, profile, score, context) {
  return {
    system: getSystemPrompt(profile, channel, tone),
    user: buildUserPrompt(lead, channel, score, context),
  };
}

function getSystemPrompt(profile, channel, tone) {
  const baseInstructions = `You are SIVA, an expert sales outreach assistant. Generate personalized ${channel} outreach messages.

OUTPUT FORMAT (JSON):
{
  "subject": "${channel === 'email' ? 'Email subject line' : 'Connection request headline'} - max 60 chars",
  "body": "The main message body",
  "opening_hook": "A compelling first sentence to grab attention",
  "personalization_notes": ["Note about personalization 1", "Note about personalization 2"],
  "call_to_action": "Clear CTA"
}

TONE: ${tone.toUpperCase()}
${tone === 'formal' ? '- Use professional language, complete sentences, proper titles' : ''}
${tone === 'friendly' ? '- Be warm but professional, use first names, conversational' : ''}
${tone === 'direct' ? '- Get straight to the point, no fluff, clear value proposition' : ''}

CRITICAL RULES:
1. NEVER use generic phrases like "I hope this finds you well"
2. ALWAYS reference specific details about the lead/company
3. Keep subject lines under 60 characters
4. Body should be 3-5 short paragraphs
5. Include ONE clear call-to-action
6. ${channel === 'linkedin' ? 'Keep under 300 characters for connection request' : 'Keep body under 200 words'}`;

  const profilePrompts = {
    banking_employee: `${baseInstructions}

PERSONA: Employee Banking Sales Representative
YOU SELL: Payroll accounts, salary disbursement services, employee benefits, corporate cards
YOUR VALUE: Help companies manage employee banking needs efficiently

KEY TRIGGERS TO REFERENCE:
- Hiring expansion signals
- New office openings
- Headcount growth
- Employee benefits upgrades

NEVER MENTION: Loans, mortgages, personal banking products`,

    banking_corporate: `${baseInstructions}

PERSONA: Corporate Banking Relationship Manager
YOU SELL: Treasury management, trade finance, working capital, corporate credit facilities
YOUR VALUE: Help enterprises optimize cash flow and fund growth

KEY TRIGGERS TO REFERENCE:
- Funding rounds
- Large project awards
- Market expansion
- Subsidiary creation

FOCUS ON: Strategic value, ROI, enterprise-level benefits`,

    banking_sme: `${baseInstructions}

PERSONA: SME Banking Specialist
YOU SELL: Business accounts, working capital facilities, trade finance for SMEs
YOUR VALUE: Help growing businesses access the right banking products

KEY TRIGGERS TO REFERENCE:
- Business growth signals
- New contracts
- Market expansion
- Scaling challenges`,

    insurance_individual: `${baseInstructions}

PERSONA: Individual Insurance Advisor
YOU SELL: Life insurance, health coverage, retirement planning
YOUR VALUE: Help individuals and families protect their future

FOCUS ON: Life events, family needs, financial security`,

    recruitment_hiring: `${baseInstructions}

PERSONA: Recruitment Consultant
YOU SELL: Talent acquisition services, executive search
YOUR VALUE: Help companies find top talent faster

KEY TRIGGERS TO REFERENCE:
- Job postings
- Team expansion
- Leadership changes
- Skills gaps`,

    saas_b2b: `${baseInstructions}

PERSONA: B2B SaaS Sales Representative
YOU SELL: Software solutions for business challenges
YOUR VALUE: Help companies improve efficiency through technology

KEY TRIGGERS TO REFERENCE:
- Digital transformation
- Tech stack changes
- Growth signals
- Process inefficiencies`,

    default: baseInstructions,
  };

  return profilePrompts[profile] || profilePrompts.default;
}

function buildUserPrompt(lead, channel, score, context) {
  let prompt = `Generate a ${channel} outreach message for this lead:

LEAD DETAILS:
- Name: ${lead.name || 'Unknown'}
- Title/Designation: ${lead.designation || 'Professional'}
- Company: ${lead.company || 'Unknown Company'}
- Industry: ${lead.industry || 'Not specified'}
${lead.linkedin ? `- LinkedIn: ${lead.linkedin}` : ''}
${lead.email ? `- Email: ${lead.email}` : ''}`;

  // Add score context if available
  if (score && score.qtle) {
    prompt += `

OPPORTUNITY SCORE:
- Quality: ${score.qtle.quality?.score || 'N/A'}/100 (${score.qtle.quality?.band || 'Unknown'})
- Timing: ${score.qtle.timing?.score || 'N/A'}/100 (${score.qtle.timing?.band || 'Unknown'})
- Lead Score: ${score.qtle.likelihood?.score || 'N/A'}/100 (${score.qtle.likelihood?.band || 'Unknown'})
- Evidence: ${score.qtle.effort?.score || 'N/A'}/100 (${score.qtle.effort?.band || 'Unknown'})
- Overall: ${score.total?.score || 'N/A'}/100
${score.flags?.length ? `- Flags: ${score.flags.join(', ')}` : ''}`;
  }

  // Add context
  if (context && Object.keys(context).length > 0) {
    prompt += `

ADDITIONAL CONTEXT:
${context.campaign ? `- Campaign: ${context.campaign}` : ''}
${context.product ? `- Product Focus: ${context.product}` : ''}
${context.recent_signals ? `- Recent Signals: ${JSON.stringify(context.recent_signals)}` : ''}
${context.custom_note ? `- Note: ${context.custom_note}` : ''}`;
  }

  prompt += `

Generate a compelling, personalized ${channel} message that will get a response. Remember to output valid JSON.`;

  return prompt;
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

function parseOutreachResponse(content, channel, lead) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        subject: parsed.subject || generateDefaultSubject(lead, channel),
        body: parsed.body || content,
        opening_hook: parsed.opening_hook,
        personalization_notes: parsed.personalization_notes || [],
        call_to_action: parsed.call_to_action,
      };
    }
  } catch {
    // JSON parsing failed
  }

  // Fallback: use raw content
  return {
    subject: generateDefaultSubject(lead, channel),
    body: content,
    personalization_notes: [],
  };
}

function generateDefaultSubject(lead, channel) {
  const firstName = lead.name?.split(' ')[0] || 'there';
  const company = lead.company || 'your company';

  if (channel === 'linkedin') {
    return `Quick connect, ${firstName}`;
  }
  return `${company} opportunity`;
}

// ============================================================================
// FALLBACK GENERATION
// ============================================================================

function generateFallbackContent(lead, channel, tone, profile) {
  const firstName = lead.name?.split(' ')[0] || 'there';
  const company = lead.company || 'your organization';

  const templates = {
    banking_employee: {
      subject: `${company}'s employee banking needs`,
      body: `Hi ${firstName},

I noticed ${company} has been growing, and I wanted to reach out about how we're helping similar organizations streamline their employee banking services.

Companies like yours are using our payroll and employee benefits solutions to improve employee satisfaction while reducing administrative overhead.

Would you be open to a brief call to explore if there's a fit?`,
    },
    banking_corporate: {
      subject: `Strategic opportunity for ${company}`,
      body: `Dear ${firstName},

I'm reaching out regarding ${company}'s treasury and corporate banking needs.

Our corporate banking solutions are helping enterprises optimize their cash flow and access growth capital more efficiently.

I'd welcome the opportunity to discuss how we might support ${company}'s strategic objectives.`,
    },
    default: {
      subject: `Quick note for ${firstName}`,
      body: `Hi ${firstName},

I came across ${company} and thought there might be an opportunity to connect.

We're helping organizations like yours achieve better outcomes through our solutions.

Would you have 15 minutes for a brief conversation?`,
    },
  };

  const content = templates[profile] || templates.default;

  return {
    success: true,
    channel,
    subject: content.subject,
    body: content.body,
    personalization_notes: [],
    fallback_generated: true,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

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

// ============================================================================
// EXPORTS
// ============================================================================


