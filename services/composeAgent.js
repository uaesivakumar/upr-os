// services/composeAgent.js
import { getOpenAICompletion } from '../utils/llm.js';
import { getStyleContext, getPerformanceInsight } from './learningAgent.js';
import { getActivePersonaPrompt } from '../utils/aiPersona.js';

/**
 * A dedicated LLM function to generate a personalized opening paragraph.
 */
async function generateOpeningContext(lead, highConfidenceFacts, styleContext, performanceInsight) {
  const factStrings = highConfidenceFacts.map(fact => {
    if (fact.headline) {
        return `- Recent News (Confidence: ${fact.confidence * 100}%): "${fact.headline}" from ${fact.source}.`;
    }
    if (fact.isHiring) {
        return `- Hiring Intent (Confidence: ${fact.confidence * 100}%): The company's career page shows active hiring.`;
    }
    return '';
  }).filter(Boolean).join('\n');

  let styleGuidance = "Your writing style should be professional, respectful, and concise.";
  if (styleContext?.tone_summary) {
    styleGuidance = `Your writing style MUST match the user's preferred style, which is described as: "${styleContext.tone_summary}".`;
    if (styleContext.example?.corrected) {
      styleGuidance += `\nHere is a good example of their writing to emulate:\n"""${styleContext.example.corrected}"""`;
    }
  }

  let performanceGuidance = '';
  if (performanceInsight) {
    performanceGuidance = `
--- Performance Guidance (Most Important) ---
A recent analysis of successful emails revealed this pattern: "${performanceInsight}". You MUST incorporate this learning into your writing.
---
    `;
  }

  const personaPrompt = await getActivePersonaPrompt();
  const taskPrompt = `Your immediate task is to write a short, professional, and highly relevant opening paragraph (2-3 sentences) for a cold email. You will be given key facts about a target company. Your output MUST be ONLY the paragraph text, without any JSON formatting.`;
  const finalSystemPrompt = `${personaPrompt}\n\n---\n\nCURRENT TASK:\n${taskPrompt}`;

  const userPrompt = `
    ${performanceGuidance}
    --- Style Guidance ---
    ${styleGuidance}
    ---
    
    Recipient Name: ${lead.lead_name}
    Recipient Title: ${lead.designation}
    Recipient Company: ${lead.company_name}

    Key Facts about ${lead.company_name}:
    ${factStrings}

    Based ONLY on one of the facts provided, and incorporating the Performance and Style Guidance, write a 2-3 sentence opening paragraph for an email.
    
    Generate the opening paragraph now.
  `;
  
  const openingContext = await getOpenAICompletion(finalSystemPrompt, userPrompt, 0.7, null, { type: 'text' });
  return (openingContext || '').replace(/["\n]/g, '').trim();
}

/**
 * Replaces placeholders in a string, e.g., {lead_name}.
 */
function populatePlaceholders(text, lead) {
    if (!text) return '';
    return text
        .replace(/{lead_name}/g, lead.lead_name || 'there')
        .replace(/{company_name}/g, lead.company_name || 'your company')
        .replace(/{designation}/g, lead.designation || 'your role');
}

/**
 * Orchestrates the email composition process using the full intelligence stack.
 */
export async function composeEmail(factPack, lead, template, userId) {
  console.log(`[ComposeAgent] Starting AI composition for lead: ${lead.lead_name} with full intelligence stack.`);

  const [styleContext, performanceInsight] = await Promise.all([
    getStyleContext(userId),
    getPerformanceInsight()
  ]);

  const highConfidenceNews = (factPack.recentNews || []).filter(f => f.confidence >= 0.8);
  const highConfidenceHiring = (factPack.hiringIntent?.isHiring && factPack.hiringIntent?.confidence >= 0.8) 
    ? factPack.hiringIntent 
    : null;
  const allFacts = [...highConfidenceNews, highConfidenceHiring].filter(Boolean);

  let openingContext = '';
  if (allFacts.length > 0) {
      openingContext = await generateOpeningContext(lead, allFacts, styleContext, performanceInsight);
  } else {
      console.warn(`[ComposeAgent] No high-confidence facts for ${lead.company_name}. Using template default.`);
      openingContext = populatePlaceholders(template.body_blocks?.opening_context_default, lead);
  }

  const templateBlocks = template.body_blocks || {};
  const bodyParts = [
    populatePlaceholders(templateBlocks.greeting, lead),
    openingContext,
    populatePlaceholders(templateBlocks.value_offer, lead),
    populatePlaceholders(templateBlocks.call_to_action, lead),
    populatePlaceholders(templateBlocks.signature, lead),
  ];

  const finalBody = bodyParts.filter(Boolean).join('\n\n');
  const finalSubject = populatePlaceholders(template.subject_template, lead);

  console.log(`[ComposeAgent] Finished composition for lead: ${lead.lead_name}`);
  
  return {
    finalSubject,
    finalBody,
    openingContext,
  };
}