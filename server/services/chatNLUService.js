/**
 * Chat NLU Service - Real LLM-Powered Natural Language Understanding
 * Sprint 53 - AI Chat Interface
 *
 * Uses Claude/OpenAI for intent recognition, entity extraction, and response generation
 */

const Anthropic = require('@anthropic-ai/sdk');
const { getOpenAICompletion } = require('../../utils/llm');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Intent definitions for SIVA routing
const INTENT_DEFINITIONS = {
  query_leads: {
    description: 'User wants to find, filter, or view leads',
    tools: ['CompanyQualityTool', 'ContactTierTool', 'CompositeScoreTool'],
    examples: ['show me top leads', 'find leads in tech', 'who should I contact first']
  },
  score_lead: {
    description: 'User wants to score or evaluate a specific lead/company',
    tools: ['CompanyQualityTool', 'TimingScoreTool', 'CompositeScoreTool'],
    examples: ['score this company', 'what\'s the quality of Acme Corp', 'evaluate this lead']
  },
  match_products: {
    description: 'User wants to match banking products to a lead',
    tools: ['BankingProductMatchTool'],
    examples: ['what products fit this company', 'banking product recommendations', 'match products']
  },
  contact_tier: {
    description: 'User wants to determine contact priority or tier',
    tools: ['ContactTierTool'],
    examples: ['who should I contact', 'contact priority', 'which decision maker']
  },
  timing_score: {
    description: 'User wants to know the best timing for outreach',
    tools: ['TimingScoreTool'],
    examples: ['when should I reach out', 'best time to contact', 'timing analysis']
  },
  generate_outreach: {
    description: 'User wants to generate outreach content',
    tools: ['OutreachMessageGeneratorTool', 'OpeningContextTool'],
    examples: ['write an email', 'generate outreach', 'create message']
  },
  analytics: {
    description: 'User wants to see analytics, metrics, or performance data',
    tools: [],
    examples: ['show my metrics', 'conversion rates', 'performance stats']
  },
  help: {
    description: 'User needs help or wants to know capabilities',
    tools: [],
    examples: ['help', 'what can you do', 'how does this work']
  },
  general: {
    description: 'General question or conversation',
    tools: [],
    examples: ['hello', 'thanks', 'tell me more']
  }
};

// System prompt for intent recognition
const INTENT_SYSTEM_PROMPT = `You are an intent classifier for UPR, a B2B lead generation and sales intelligence platform.

Available intents:
${Object.entries(INTENT_DEFINITIONS).map(([intent, def]) =>
  `- ${intent}: ${def.description}\n  Examples: ${def.examples.join(', ')}`
).join('\n')}

Analyze the user's message and return a JSON object with:
{
  "intent": "the_intent_name",
  "confidence": 0.0-1.0,
  "entities": [
    {"type": "company_name|industry|timeframe|metric|person_name", "value": "extracted value", "confidence": 0.0-1.0}
  ],
  "reasoning": "Brief explanation of why this intent was chosen"
}

Be precise. If unsure, use "general" intent with lower confidence.`;

// System prompt for chat response generation
const CHAT_SYSTEM_PROMPT = `You are SIVA, the intelligent assistant for UPR (Unified Prospecting & Research).
You help users with B2B lead generation, company research, and sales outreach.

Your capabilities:
1. Lead Scoring - Evaluate companies using quality, timing, and composite scores
2. Contact Selection - Identify the right decision makers and contact tiers
3. Product Matching - Match banking/financial products to company needs
4. Outreach Generation - Create personalized sales messages
5. Analytics - Provide insights on performance and trends

When tools are executed, you'll receive their output. Synthesize the results into a helpful response.

Guidelines:
- Be concise but informative
- Use bullet points for lists
- Include specific numbers and scores when available
- Cite the tools/sources used
- If you need more information, ask clarifying questions
- Format with markdown for readability`;

class ChatNLUService {
  constructor() {
    this.provider = process.env.CHAT_LLM_PROVIDER || 'anthropic';
    this.model = process.env.CHAT_LLM_MODEL || 'claude-3-haiku-20240307';
    this.maxTokens = parseInt(process.env.CHAT_MAX_TOKENS) || 1024;
    this.temperature = parseFloat(process.env.CHAT_TEMPERATURE) || 0.3;
  }

  /**
   * Recognize intent from user message
   * @param {string} message - User message
   * @param {object} context - Page/data context
   * @returns {Promise<{intent, confidence, entities, reasoning}>}
   */
  async recognizeIntent(message, context = {}) {
    const startTime = Date.now();

    try {
      const contextPrompt = context.page
        ? `\nCurrent page: ${context.page.title} (${context.page.path})`
        : '';

      if (this.provider === 'anthropic') {
        const response = await anthropic.messages.create({
          model: this.model,
          max_tokens: 256,
          temperature: 0.1,
          system: INTENT_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `${contextPrompt}\n\nUser message: "${message}"`
          }]
        });

        const content = response.content[0]?.text || '{}';
        const parsed = this._safeParseJSON(content);

        return {
          ...parsed,
          latency_ms: Date.now() - startTime,
          model: this.model,
          tokens: {
            input: response.usage?.input_tokens || 0,
            output: response.usage?.output_tokens || 0
          }
        };
      } else {
        // OpenAI fallback
        const response = await getOpenAICompletion(
          INTENT_SYSTEM_PROMPT,
          `${contextPrompt}\n\nUser message: "${message}"`,
          0.1,
          'gpt-4-turbo'
        );

        const parsed = this._safeParseJSON(response);

        return {
          ...parsed,
          latency_ms: Date.now() - startTime,
          model: 'gpt-4-turbo'
        };
      }
    } catch (error) {
      console.error('[ChatNLU] Intent recognition failed:', error.message);
      return {
        intent: 'general',
        confidence: 0.3,
        entities: [],
        reasoning: 'Fallback due to error',
        error: error.message,
        latency_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Generate chat response using LLM
   * @param {string} userMessage - User's message
   * @param {object} intentResult - Intent recognition result
   * @param {object} toolResults - Results from SIVA tool executions
   * @param {array} history - Recent chat history
   * @returns {Promise<{content, reasoning, citations, metadata}>}
   */
  async generateResponse(userMessage, intentResult, toolResults = [], history = []) {
    const startTime = Date.now();

    try {
      // Build context from tool results
      const toolContext = toolResults.length > 0
        ? `\n\nTool Execution Results:\n${toolResults.map(t =>
            `[${t.tool}] (${t.latency_ms}ms):\n${JSON.stringify(t.output, null, 2)}`
          ).join('\n\n')}`
        : '';

      // Build conversation history
      const historyContext = history.slice(-4).map(m =>
        `${m.role === 'user' ? 'User' : 'SIVA'}: ${m.content.slice(0, 500)}`
      ).join('\n');

      const userPrompt = `${historyContext ? `Recent conversation:\n${historyContext}\n\n` : ''}User: ${userMessage}

Intent detected: ${intentResult.intent} (confidence: ${(intentResult.confidence * 100).toFixed(0)}%)
${intentResult.entities?.length ? `Entities: ${JSON.stringify(intentResult.entities)}` : ''}
${toolContext}

Generate a helpful response. If tools were executed, synthesize their results into actionable insights.`;

      if (this.provider === 'anthropic') {
        const response = await anthropic.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          system: CHAT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }]
        });

        const content = response.content[0]?.text || '';

        return {
          content,
          reasoning: intentResult.reasoning,
          citations: this._extractCitations(toolResults),
          metadata: {
            model: this.model,
            latency_ms: Date.now() - startTime,
            tokens: {
              input: response.usage?.input_tokens || 0,
              output: response.usage?.output_tokens || 0
            },
            cost_usd: this._estimateCost(response.usage)
          }
        };
      } else {
        // OpenAI fallback
        const content = await getOpenAICompletion(
          CHAT_SYSTEM_PROMPT,
          userPrompt,
          this.temperature,
          'gpt-4-turbo',
          { type: 'text' }
        );

        return {
          content,
          reasoning: intentResult.reasoning,
          citations: this._extractCitations(toolResults),
          metadata: {
            model: 'gpt-4-turbo',
            latency_ms: Date.now() - startTime
          }
        };
      }
    } catch (error) {
      console.error('[ChatNLU] Response generation failed:', error.message);
      return {
        content: "I apologize, but I'm having trouble processing your request right now. Please try again.",
        error: error.message,
        metadata: {
          latency_ms: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Stream response using SSE-compatible format
   * @param {string} userMessage
   * @param {object} intentResult
   * @param {object} toolResults
   * @param {function} onChunk - Callback for each chunk
   */
  async *streamResponse(userMessage, intentResult, toolResults = [], history = []) {
    const startTime = Date.now();

    // Build context
    const toolContext = toolResults.length > 0
      ? `\n\nTool Results:\n${toolResults.map(t =>
          `[${t.tool}]: ${JSON.stringify(t.output)}`
        ).join('\n')}`
      : '';

    const userPrompt = `User: ${userMessage}
Intent: ${intentResult.intent}
${toolContext}

Generate a helpful response.`;

    try {
      if (this.provider === 'anthropic') {
        const stream = await anthropic.messages.stream({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          system: CHAT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }]
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield {
              type: 'text',
              content: event.delta.text
            };
          }
        }

        const finalMessage = await stream.finalMessage();
        yield {
          type: 'done',
          metadata: {
            model: this.model,
            latency_ms: Date.now() - startTime,
            tokens: {
              input: finalMessage.usage?.input_tokens || 0,
              output: finalMessage.usage?.output_tokens || 0
            }
          }
        };
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get tools for a given intent
   * @param {string} intent
   * @returns {string[]}
   */
  getToolsForIntent(intent) {
    return INTENT_DEFINITIONS[intent]?.tools || [];
  }

  // Private helpers

  _safeParseJSON(str) {
    try {
      // Extract JSON from markdown code blocks if present
      const match = str.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = match ? match[1] : str;
      return JSON.parse(jsonStr.trim());
    } catch {
      return {
        intent: 'general',
        confidence: 0.3,
        entities: [],
        reasoning: 'Failed to parse response'
      };
    }
  }

  _extractCitations(toolResults) {
    return toolResults.map(t => ({
      source: t.tool,
      text: `${t.tool} execution`,
      relevance: 1.0
    }));
  }

  _estimateCost(usage) {
    if (!usage) return 0;
    // Claude 3 Haiku pricing: $0.25/1M input, $1.25/1M output
    const inputCost = (usage.input_tokens || 0) * 0.00000025;
    const outputCost = (usage.output_tokens || 0) * 0.00000125;
    return parseFloat((inputCost + outputCost).toFixed(6));
  }
}

module.exports = { ChatNLUService, INTENT_DEFINITIONS };
