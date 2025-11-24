// services/promptBuilder.js
// Dynamic Prompt Builder for Campaign-Specific AI Email Generation

/**
 * Build a dynamic AI prompt based on campaign type and context
 * @param {Object} campaignType - Campaign type object from database
 * @param {Object} context - Additional context (brief, enrichedContext, styleContext, personaPrompt)
 * @returns {Object} {systemPrompt, userPrompt, temperature}
 */
export function buildCampaignPrompt(campaignType, context = {}) {
  const {
    brief = '',
    enrichedContext = null,
    styleContext = null,
    personaPrompt = ''
  } = context;

  // Extract campaign psychology and strategy
  const psychology = campaignType.psychology || {};
  const triggers = psychology.triggers || [];
  const painPoints = psychology.pain_points || [];
  const desires = psychology.desires || [];

  // Build system prompt components
  const psychologyGuidance = buildPsychologyGuidance(triggers, painPoints, desires);
  const structureGuidance = buildStructureGuidance(campaignType.structure_type);
  const toneGuidance = buildToneGuidance(campaignType.tone);
  const conversionGuidance = buildConversionGuidance(campaignType.conversion_driver);
  const ctaGuidance = buildCTAGuidance(campaignType.ideal_cta);
  const personalizationGuidance = buildPersonalizationGuidance(
    campaignType.personalization_vars || []
  );

  // Build style guidance from learning agent
  let styleGuidance = '';
  if (styleContext?.tone_summary) {
    styleGuidance = `\n\nSTYLE ADAPTATION:\nYou MUST adapt to the user's preferred writing style: "${styleContext.tone_summary}".`;
  }

  // Build enriched context guidance
  let contextGuidance = '';
  if (enrichedContext && enrichedContext.companies && enrichedContext.companies.length > 0) {
    contextGuidance = buildEnrichedContextGuidance(enrichedContext.companies);
  }

  // Assemble complete system prompt
  const systemPrompt = `${personaPrompt}

CAMPAIGN TYPE: ${campaignType.name}
CATEGORY: ${campaignType.category.replace('_', ' ').toUpperCase()}
OBJECTIVE: ${campaignType.description}

${psychologyGuidance}

${structureGuidance}

${toneGuidance}

${conversionGuidance}

${ctaGuidance}

${personalizationGuidance}

CRITICAL OUTPUT REQUIREMENTS:
1. Your output MUST be a single minified JSON object with these exact keys:
   {
     "subject": "...",
     "opening": "...",
     "greeting": "...",
     "value_offer": "...",
     "cta": "...",
     "signature": "..."
   }

2. SUBJECT LINE:
   - Under 50 characters
   - Specific and personal, not generic
   - Reference their company/role/context
   - Curiosity-driven without being clickbait
   - Align with campaign psychology triggers

3. OPENING (1-2 sentences):
   - Reference specific context about their company/role/recent news
   - Use campaign-appropriate personalization variables
   - Establish immediate relevance
   - No generic fluff - be SPECIFIC

4. GREETING:
   - Brief and natural
   - Use {recipient_name} variable
   - Match campaign tone

5. VALUE OFFER (2-3 sentences):
   - Lead with specific outcome/benefit for THEIR business
   - Address campaign-specific pain points
   - Align with their desires (psychology)
   - Include concrete details (numbers, timelines, examples)
   - NOT generic features - specific value

6. CTA (Call-to-Action):
   - Follow campaign's ideal CTA style: "${campaignType.ideal_cta}"
   - Single, specific, low-friction ask
   - Create urgency through value, not pressure
   - Make it conversational and natural

7. SIGNATURE:
   - Professional but warm
   - Include {sender_name}, {sender_title}, {sender_company}
   - Optional: Add relevant credentials or social proof

SPAM-PROOF RULES:
- Avoid: "free", "act now", "limited time", "urgent", "guarantee", "amazing", "incredible"
- No excessive punctuation (!!!) or ALL CAPS
- No pushy or desperate language
- Keep it human, professional, and authentic

${styleGuidance}

${contextGuidance}`;

  // Build user prompt
  const userPrompt = buildUserPrompt(brief, campaignType);

  // Determine temperature based on tone and structure
  const temperature = determineTemperature(campaignType.tone, campaignType.structure_type);

  return {
    systemPrompt,
    userPrompt,
    temperature
  };
}

/**
 * Build psychology guidance based on triggers, pain points, and desires
 */
function buildPsychologyGuidance(triggers, painPoints, desires) {
  let guidance = 'PSYCHOLOGICAL STRATEGY:\n';

  if (triggers.length > 0) {
    guidance += `• Triggers to activate: ${formatList(triggers)}\n`;
    guidance += `  ${getTriggerExplanation(triggers)}\n`;
  }

  if (painPoints.length > 0) {
    guidance += `• Pain points to address: ${formatList(painPoints)}\n`;
    guidance += `  Show empathy for these challenges and position your solution as relief\n`;
  }

  if (desires.length > 0) {
    guidance += `• Desires to appeal to: ${formatList(desires)}\n`;
    guidance += `  Paint a picture of achieving these outcomes\n`;
  }

  return guidance;
}

/**
 * Build structure guidance based on structure type
 */
function buildStructureGuidance(structureType) {
  const structures = {
    value_first: `EMAIL STRUCTURE (Value-First):
• Lead immediately with the primary benefit/outcome
• Follow with brief context on how it's achieved
• End with low-friction CTA
• Keep it concise - respect their time`,

    problem_solution: `EMAIL STRUCTURE (Problem-Solution):
• Open by acknowledging their specific pain point
• Briefly describe the impact of this problem
• Present your solution as the natural answer
• CTA as the first step toward relief`,

    story_driven: `EMAIL STRUCTURE (Story-Driven):
• Start with a relatable scenario or brief case study
• Show transformation or outcome achieved
• Connect their situation to the story
• CTA as invitation to similar success`,

    data_driven: `EMAIL STRUCTURE (Data-Driven):
• Lead with compelling statistic or insight
• Connect data to their specific situation
• Quantify potential impact for them
• CTA as way to get personalized analysis`,

    aspirational: `EMAIL STRUCTURE (Aspirational):
• Paint picture of elevated state/outcome
• Create desire for transformation
• Show exclusivity or premium positioning
• CTA as gateway to elevated experience`,

    consultative: `EMAIL STRUCTURE (Consultative):
• Position as trusted advisor, not vendor
• Ask thought-provoking question or share insight
• Offer strategic perspective
• CTA as professional conversation, not sales pitch`
  };

  return structures[structureType] || structures.value_first;
}

/**
 * Build tone guidance
 */
function buildToneGuidance(tone) {
  const tones = {
    professional: `TONE: Professional
• Clear, direct, and respectful
• Business-appropriate language
• Confident without being pushy
• Avoid overly casual language or slang`,

    friendly: `TONE: Friendly
• Warm and approachable
• Conversational and natural
• Use contractions (we're, you'll, it's)
• Like a helpful colleague, not a salesperson`,

    urgent: `TONE: Urgent (but not desperate)
• Emphasize time-sensitivity authentically
• Create FOMO through value, not pressure
• Use action-oriented language
• Maintain professionalism - never desperate`,

    consultative: `TONE: Consultative
• Expert advisor, not vendor
• Thought-provoking and insightful
• Ask intelligent questions
• Position as strategic partner`,

    aspirational: `TONE: Aspirational
• Elevating and premium
• Exclusive and sophisticated
• Appeal to status and achievement
• Inspiring without being salesy`,

    compassionate: `TONE: Compassionate
• Empathetic and understanding
• Human-centered language
• Show genuine care
• Supportive and helpful`
  };

  return tones[tone] || tones.professional;
}

/**
 * Build conversion driver guidance
 */
function buildConversionGuidance(conversionDriver) {
  const drivers = {
    time_savings: '• Emphasize hours/days saved, efficiency gains, automated workflows',
    cost_savings: '• Quantify potential savings, ROI, cost reduction opportunities',
    risk_mitigation: '• Highlight risks avoided, security enhanced, compliance assured',
    exclusive_access: '• Emphasize limited availability, VIP status, insider access',
    roi_calculation: '• Provide concrete numbers, calculable returns, measurable outcomes',
    cashback_rewards: '• Show earning potential, reward accumulation, value back',
    expert_consultation: '• Offer strategic insights, professional guidance, expert knowledge',
    employee_benefit: '• Focus on employee satisfaction, retention, morale improvement',
    talent_development: '• Emphasize skill growth, career advancement, learning opportunities',
    social_responsibility: '• Highlight ethical impact, social good, responsible business',
    talent_attraction: '• Show competitive advantage in hiring, employer brand enhancement',
    speed_convenience: '• Stress instant access, immediate results, zero friction',
    exclusive_rates: '• Emphasize preferential pricing, member-only deals, special terms',
    investment_opportunity: '• Present wealth building, asset growth, financial returns',
    guaranteed_returns: '• Highlight security, predictability, assured outcomes',
    strategic_alignment: '• Show long-term vision, aligned incentives, partnership mindset',
    compliance_assurance: '• Stress regulatory adherence, audit readiness, legal protection',
    global_access: '• Emphasize borderless capabilities, international reach, multi-market access',
    enhanced_benefits: '• Show comprehensive coverage, upgraded features, premium experience',
    family_protection: '• Focus on loved ones, legacy, peace of mind for family',
    security_peace_of_mind: '• Highlight safety, protection, worry-free operations',
    employee_welfare: '• Emphasize care for workforce, human-centric policies, support',
    cash_flow_improvement: '• Show liquidity enhancement, working capital optimization, breathing room',
    engagement_boost: '• Stress motivation increase, participation growth, active involvement',
    flexible_rewards: '• Highlight choice, customization, personalized options',
    lifestyle_enhancement: '• Paint picture of improved quality of life, experiences, enjoyment',
    financial_relief: '• Show burden reduction, stress relief, manageable payments',
    lifestyle_upgrade: '• Emphasize status elevation, quality improvement, premium living',
    immediate_liquidity: '• Stress instant cash access, no waiting, rapid funding',
    asset_acquisition: '• Focus on ownership, capability expansion, growth enablement',
    financial_security: '• Highlight stability, predictability, protected future',
    growth_enablement: '• Show expansion facilitation, scaling support, opportunity capture',
    technical_enablement: '• Emphasize integration capabilities, technical power, developer-friendly',
    convenience: '• Stress ease of use, simplicity, hassle-free experience',
    efficiency_gains: '• Quantify process improvements, workflow optimization, productivity boost',
    travel_comfort: '• Paint picture of stress-free travel, premium experience, relaxation',
    networking_opportunities: '• Highlight connections, relationships, business development',
    travel_rewards: '• Show miles earned, trips unlocked, experiences gained',
    exclusive_savings: '• Emphasize member discounts, special pricing, insider deals',
    cost_comparison: '• Provide side-by-side analysis, transparent pricing, clear value',
    cost_control: '• Highlight budget management, expense tracking, spending governance'
  };

  const guidance = drivers[conversionDriver] || '• Focus on clear value proposition and tangible benefits';

  return `CONVERSION DRIVER: ${conversionDriver.replace('_', ' ')}\n${guidance}`;
}

/**
 * Build CTA guidance
 */
function buildCTAGuidance(idealCTA) {
  return `IDEAL CALL-TO-ACTION:
Reference example: "${idealCTA}"
• Keep it simple and specific (not generic "schedule demo")
• Low friction - minimize commitment fear
• Natural and conversational
• Action-oriented but not pushy
• Create urgency through value, not scarcity tactics`;
}

/**
 * Build personalization guidance
 */
function buildPersonalizationGuidance(personalizationVars) {
  if (!personalizationVars || personalizationVars.length === 0) {
    return `PERSONALIZATION:
Use standard variables: {company_name}, {recipient_name}, {industry}`;
  }

  return `PERSONALIZATION VARIABLES (use these liberally):
${personalizationVars.map(v => `• {${v}}`).join('\n')}

IMPORTANT: Include placeholders like {variable_name} throughout for dynamic personalization.
The more personalized, the better the conversion rate.`;
}

/**
 * Build enriched context guidance from company data
 */
function buildEnrichedContextGuidance(companies) {
  const companyInfo = companies.map(c => {
    let info = `Company: ${c.name}`;
    if (c.industry) info += `, Industry: ${c.industry}`;
    if (c.size) info += `, Size: ${c.size}`;
    if (c.location) info += `, Location: ${c.location}`;
    if (c.source) info += ` [Source: ${c.source}]`;
    return info;
  }).join('\n');

  return `\n\nENRICHED CONTEXT (use this to hyper-personalize):
${companyInfo}

INSTRUCTION: Reference this context in your opening and value offer to show you've done research.
Be specific - mention their industry challenges, location-specific opportunities, or company stage.`;
}

/**
 * Build user prompt from brief and campaign
 */
function buildUserPrompt(brief, campaignType) {
  return `Generate a complete email template for the following campaign:

CAMPAIGN: ${campaignType.name}
BRIEF: """
${brief || 'Create a compelling outreach email following the campaign guidelines above.'}
"""

Remember:
1. Output valid minified JSON only
2. Follow the campaign's psychological strategy
3. Use the specified structure type and tone
4. Include personalization variables
5. Make it human, specific, and conversion-focused`;
}

/**
 * Determine optimal temperature based on tone and structure
 */
function determineTemperature(tone, structureType) {
  // More creative tones and structures = higher temperature
  const toneTemp = {
    professional: 0.7,
    friendly: 0.8,
    urgent: 0.75,
    consultative: 0.7,
    aspirational: 0.85,
    compassionate: 0.8
  };

  const structureTemp = {
    value_first: 0.7,
    problem_solution: 0.75,
    story_driven: 0.85,
    data_driven: 0.7,
    aspirational: 0.85,
    consultative: 0.75
  };

  const toneTempValue = toneTemp[tone] || 0.75;
  const structureTempValue = structureTemp[structureType] || 0.75;

  // Average the two and round to 2 decimals
  return parseFloat(((toneTempValue + structureTempValue) / 2).toFixed(2));
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Format array as readable list
 */
function formatList(items) {
  if (!items || items.length === 0) return '';
  return items.map(item => item.replace(/_/g, ' ')).join(', ');
}

/**
 * Get explanation for psychology triggers
 */
function getTriggerExplanation(triggers) {
  const explanations = {
    urgency: 'Create time-sensitivity through value (limited slots, seasonal opportunity, market timing)',
    scarcity: 'Emphasize exclusivity or limited availability authentically',
    social_proof: 'Reference other companies, success stories, widespread adoption',
    authority: 'Demonstrate expertise, credentials, industry leadership',
    reciprocity: 'Offer value upfront (insight, data, tool) before asking',
    consistency: 'Align with their existing values, past decisions, stated goals',
    liking: 'Build rapport through commonality, shared challenges, empathy',
    exclusivity: 'Position as VIP access, insider opportunity, premium tier',
    convenience: 'Stress ease, simplicity, zero-friction experience',
    efficiency: 'Highlight time saved, processes streamlined, automation enabled',
    reliability: 'Emphasize consistency, dependability, proven track record',
    innovation: 'Showcase cutting-edge, modern, forward-thinking solutions',
    security: 'Stress safety, protection, risk mitigation, compliance',
    status: 'Appeal to prestige, recognition, elite positioning',
    belonging: 'Emphasize community, network, peer group membership',
    achievement: 'Highlight success, goals reached, milestones achieved',
    growth: 'Focus on expansion, scaling, advancement opportunities',
    savings: 'Quantify cost reductions, ROI, financial benefits',
    recognition: 'Show how it elevates their profile, reputation, brand',
    control: 'Emphasize autonomy, choice, customization, governance',
    transparency: 'Stress visibility, clarity, no hidden fees, openness',
    simplicity: 'Highlight ease of understanding, straightforward approach',
    personalization: 'Show customization, tailored solutions, individual attention',
    empowerment: 'Enable self-service, independence, capability enhancement',
    compassion: 'Demonstrate genuine care, human-centered approach, support',
    responsibility: 'Appeal to ethics, duty, social good, sustainability',
    trust: 'Build credibility through specifics, proof, transparent communication',
    global_presence: 'Emphasize international capabilities, multi-market reach',
    smart_money: 'Position as savvy, intelligent, strategic financial decision',
    financial_optimization: 'Show maximized returns, efficiency, smart resource allocation',
    development: 'Focus on growth, learning, skill advancement, evolution',
    loyalty: 'Reward long-term relationship, commitment, partnership',
    attraction: 'Show competitive advantage, differentiation, magnetism',
    retention: 'Highlight stickiness, loyalty building, reduced churn',
    alignment: 'Stress shared goals, synchronized incentives, mutual success',
    investment: 'Frame as wealth building, asset creation, future value',
    protection: 'Emphasize safeguarding, insurance, risk coverage',
    modern_risk: 'Address contemporary threats (cyber, data, digital risks)',
    growth_enabler: 'Show how it unlocks opportunities, removes barriers',
    automation: 'Highlight AI, machine learning, intelligent systems, hands-free',
    integration: 'Stress seamless connectivity, unified systems, smooth workflows',
    home_ties: 'Connect to heritage, roots, home country, family connections',
    employee_satisfaction: 'Show impact on morale, happiness, engagement',
    comprehensive_benefit: 'Emphasize all-inclusive, complete coverage, holistic approach',
    time_constraints: 'Acknowledge busy schedules, offer time-saving solutions',
    access_to_experiences: 'Provide entry to exclusive events, venues, opportunities',
    comfort: 'Stress relaxation, ease, pleasant experience, stress reduction',
    productivity: 'Show enhanced output, efficient work, better results',
    networking: 'Facilitate connections, relationships, business development',
    flexibility: 'Highlight adaptable terms, customizable options, choice',
    cash_flow: 'Address liquidity, working capital, financial breathing room',
    opportunity: 'Frame as chance to capitalize, seize moment, gain advantage'
  };

  const relevantExplanations = triggers
    .filter(t => explanations[t])
    .map(t => explanations[t]);

  return relevantExplanations.length > 0
    ? relevantExplanations[0]
    : 'Leverage these psychological drivers to increase engagement';
}

/**
 * Build a prompt for regenerating a single block
 * @param {string} blockName - Block to regenerate (subject, opening, etc.)
 * @param {Object} campaignType - Campaign type object
 * @param {Object} context - Context including brief, existing blocks
 * @returns {Object} {systemPrompt, userPrompt, temperature}
 */
export function buildBlockRegenerationPrompt(blockName, campaignType, context = {}) {
  const { brief = '', existingBlocks = {}, styleContext = null, personaPrompt = '' } = context;

  // Get full campaign prompt for context
  const fullPrompt = buildCampaignPrompt(campaignType, context);

  // Build style guidance
  let styleGuidance = '';
  if (styleContext?.tone_summary) {
    styleGuidance = `\n\nYou MUST adapt to the user's preferred writing style: "${styleContext.tone_summary}".`;
  }

  const systemPrompt = `${personaPrompt}

Your task is to regenerate ONLY the "${blockName}" block of an email template.
This is for campaign: ${campaignType.name}

${fullPrompt.systemPrompt.split('CRITICAL OUTPUT REQUIREMENTS:')[0]}

${styleGuidance}

OUTPUT REQUIREMENT:
Return a single minified JSON object with ONLY ONE key: "${blockName}"
Example: {"${blockName}": "your regenerated content here"}`;

  const userPrompt = `The user's original brief was: "${brief}"

The current draft of the template is:
${JSON.stringify(existingBlocks, null, 2)}

Now, regenerate ONLY the "${blockName}" block.
Make it consistent with the campaign strategy and other existing blocks.
Output valid JSON with only the "${blockName}" key.`;

  return {
    systemPrompt,
    userPrompt,
    temperature: fullPrompt.temperature
  };
}
