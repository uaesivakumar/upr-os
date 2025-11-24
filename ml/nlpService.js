// ml/nlpService.js
// Advanced NLP Service
//
// - Named Entity Recognition
// - Topic Modeling
// - Sentiment Analysis
// - Text Classification

import { getOpenAICompletion } from '../utils/llm.js';

/**
 * Advanced NLP Service
 *
 * - Named Entity Recognition
 * - Topic Modeling
 * - Sentiment Analysis
 * - Text Classification
 */
class NLPService {

  /**
   * Extract entities from text (companies, people, locations, technologies)
   */
  async extractEntities(text) {
    const prompt = `Extract named entities from this text. Return JSON:

{
  "companies": ["company names"],
  "people": ["person names"],
  "locations": ["city, country"],
  "technologies": ["tech/product names"],
  "events": ["event names"]
}

Text: ${text}

Return ONLY the JSON, no other text.`;

    try {
      const response = await getOpenAICompletion(
        'You are an expert at named entity recognition. Extract entities and return them as JSON.',
        prompt,
        0.3
      );

      // Clean response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return JSON.parse(response);
    } catch (error) {
      console.error('[NLPService] Entity extraction error:', error);
      return {
        companies: [],
        people: [],
        locations: [],
        technologies: [],
        events: []
      };
    }
  }

  /**
   * Classify email reply sentiment
   */
  async analyzeSentiment(text) {
    const prompt = `Analyze the sentiment of this email reply. Return JSON:

{
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": 0.0-1.0,
  "key_phrases": ["phrases that indicate sentiment"]
}

Reply: ${text}

Return ONLY the JSON, no other text.`;

    try {
      const response = await getOpenAICompletion(
        'You are an expert at sentiment analysis. Analyze sentiment and return JSON.',
        prompt,
        0.3
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return JSON.parse(response);
    } catch (error) {
      console.error('[NLPService] Sentiment analysis error:', error);
      return {
        sentiment: 'neutral',
        confidence: 0.5,
        key_phrases: []
      };
    }
  }

  /**
   * Extract topics from company content
   */
  async extractTopics(texts) {
    const combinedText = Array.isArray(texts) ? texts.join('\n\n') : texts;

    const prompt = `Identify 5 main topics/themes in these texts about a company. Return JSON:

{
  "topics": [
    {"name": "topic name", "keywords": ["key", "words"], "relevance": 0.0-1.0}
  ]
}

Texts: ${combinedText}

Return ONLY the JSON, no other text.`;

    try {
      const response = await getOpenAICompletion(
        'You are an expert at topic modeling. Extract topics and return JSON.',
        prompt,
        0.5
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return JSON.parse(response);
    } catch (error) {
      console.error('[NLPService] Topic extraction error:', error);
      return { topics: [] };
    }
  }

  /**
   * Classify email intent
   */
  async classifyIntent(emailText) {
    const prompt = `Classify the intent of this email. Return JSON:

{
  "intent": "sales_inquiry" | "support_request" | "partnership" | "job_application" | "general_inquiry" | "complaint" | "other",
  "confidence": 0.0-1.0,
  "summary": "one sentence summary of the email"
}

Email: ${emailText}

Return ONLY the JSON, no other text.`;

    try {
      const response = await getOpenAICompletion(
        'You are an expert at email classification. Classify intent and return JSON.',
        prompt,
        0.3
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return JSON.parse(response);
    } catch (error) {
      console.error('[NLPService] Intent classification error:', error);
      return {
        intent: 'general_inquiry',
        confidence: 0.5,
        summary: 'Unable to classify'
      };
    }
  }
}

export default new NLPService();
