// services/intelligenceSummarizer.js
// LLM-Powered Company Intelligence Summarization

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../utils/db.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Intelligence Summarizer - LLM-powered company intelligence
 *
 * Automatically summarizes:
 * - Company news and updates
 * - Hiring trends
 * - Funding announcements
 * - Technology stack changes
 * - Market positioning
 */
class IntelligenceSummarizer {

  /**
   * Generate comprehensive company intelligence report
   */
  async generateIntelligenceReport(companyId) {
    console.log(`[IntelligenceSummarizer] Generating report for company ${companyId}`);

    // 1. Gather all intelligence
    const intelligence = await this.gatherIntelligence(companyId);

    if (!intelligence.company) {
      throw new Error(`Company ${companyId} not found`);
    }

    // 2. Generate summary using LLM
    const summary = await this.summarizeIntelligence(intelligence);

    // 3. Extract key insights
    const insights = await this.extractInsights(summary);

    // 4. Generate actionable recommendations
    const recommendations = await this.generateRecommendations(intelligence, insights);

    // 5. Calculate completeness score
    const completenessScore = this.calculateCompleteness(intelligence);

    // 6. Save to database
    await this.saveReport(companyId, {
      summary,
      insights,
      recommendations,
      raw_intelligence: intelligence,
      completeness_score: completenessScore
    });

    return {
      summary,
      insights,
      recommendations,
      completeness_score: completenessScore
    };
  }

  /**
   * Gather all available intelligence about company
   */
  async gatherIntelligence(companyId) {
    // Get company details
    const company = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);

    if (company.rows.length === 0) {
      return { company: null };
    }

    // Get recent knowledge chunks (last 90 days)
    const knowledge = await pool.query(`
      SELECT content, content_type, source_url, source_title, captured_at
      FROM kb_chunks
      WHERE company_id = $1 AND captured_at > NOW() - INTERVAL '90 days'
      ORDER BY captured_at DESC
      LIMIT 20
    `, [companyId]);

    // Get signals
    const signals = await pool.query(`
      SELECT signal_type, headline, url, published_at, meta
      FROM signals
      WHERE company_id = $1 AND published_at > NOW() - INTERVAL '90 days'
      ORDER BY published_at DESC
    `, [companyId]);

    // Get people (key contacts)
    const people = await pool.query(`
      SELECT name, title, function, linkedin_url
      FROM people
      WHERE company_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [companyId]);

    return {
      company: company.rows[0],
      knowledge: knowledge.rows,
      signals: signals.rows,
      people: people.rows
    };
  }

  /**
   * Summarize intelligence using LLM
   */
  async summarizeIntelligence(intelligence) {
    const knowledgeNews = intelligence.knowledge.filter(k => k.content_type === 'news');
    const knowledgeOther = intelligence.knowledge.filter(k => k.content_type !== 'news');

    const prompt = `You are an expert business intelligence analyst. Analyze this company intelligence and create a comprehensive summary.

COMPANY: ${intelligence.company.name}
Industry: ${intelligence.company.industry || 'Unknown'}
Size: ${intelligence.company.size || 'Unknown'}
Location: ${intelligence.company.location || 'UAE'}

RECENT INTELLIGENCE (Last 90 days):

News & Updates:
${knowledgeNews.length > 0 ? knowledgeNews.map(k =>
  `- [${k.captured_at.toISOString().split('T')[0]}] ${k.source_title || 'News'}: ${k.content.substring(0, 200)}...`
).join('\n') : '- No recent news available'}

Other Knowledge:
${knowledgeOther.length > 0 ? knowledgeOther.map(k =>
  `- [${k.captured_at.toISOString().split('T')[0]}] ${k.content_type}: ${k.content.substring(0, 150)}...`
).join('\n') : '- No additional knowledge available'}

Signals:
${intelligence.signals.length > 0 ? intelligence.signals.map(s =>
  `- [${s.published_at.toISOString().split('T')[0]}] ${s.signal_type}: ${s.headline}`
).join('\n') : '- No signals detected'}

Key People:
${intelligence.people.length > 0 ? intelligence.people.map(p =>
  `- ${p.name}${p.title ? ` (${p.title})` : ''}${p.function ? ` - ${p.function}` : ''}`
).join('\n') : '- No key contacts identified'}

Create a structured summary with these sections:

1. COMPANY OVERVIEW (2-3 sentences)
2. RECENT DEVELOPMENTS (3-5 bullet points of key events)
3. HIRING & GROWTH SIGNALS (what their hiring patterns indicate)
4. FINANCIAL HEALTH (if any funding/financial signals present)
5. MARKET POSITIONING (their competitive stance)
6. TECHNOLOGY STACK (technologies mentioned, if any)

Be specific, cite dates when available, and focus on actionable intelligence for B2B sales.
If information is limited, acknowledge gaps and provide what's available.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    return message.content[0].text;
  }

  /**
   * Extract key insights from summary
   */
  async extractInsights(summary) {
    const prompt = `From this company intelligence summary, extract 5 key insights that would be valuable for B2B outreach.

Summary:
${summary}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "insights": [
    {
      "type": "growth",
      "insight": "The insight statement",
      "relevance": "Why this matters for sales/outreach",
      "confidence": 0.8
    }
  ]
}

Valid types: "growth", "hiring", "funding", "technology", "market"
Confidence should be between 0.0 and 1.0`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = message.content[0].text;

    try {
      // Try to extract JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback
      return {
        insights: [
          {
            type: 'growth',
            insight: 'Intelligence data available for analysis',
            relevance: 'Can be used for personalized outreach',
            confidence: 0.5
          }
        ]
      };
    } catch (error) {
      console.error('[IntelligenceSummarizer] Failed to parse insights:', error);
      return {
        insights: [
          {
            type: 'growth',
            insight: 'Intelligence data available for analysis',
            relevance: 'Can be used for personalized outreach',
            confidence: 0.5
          }
        ]
      };
    }
  }

  /**
   * Generate actionable recommendations
   */
  async generateRecommendations(intelligence, insights) {
    const prompt = `Based on this intelligence, provide specific recommendations for outreach strategy.

Company: ${intelligence.company.name}
Key Insights:
${insights.insights.map(i => `- ${i.insight}`).join('\n')}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "recommendations": [
    {
      "category": "timing",
      "recommendation": "Specific actionable recommendation",
      "reasoning": "Why this recommendation",
      "priority": "high"
    }
  ]
}

Valid categories: "timing", "messaging", "contact", "campaign"
Valid priorities: "high", "medium", "low"`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = message.content[0].text;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback
      return {
        recommendations: [
          {
            category: 'messaging',
            recommendation: 'Personalize outreach based on company intelligence',
            reasoning: 'Available intelligence can enhance message relevance',
            priority: 'medium'
          }
        ]
      };
    } catch (error) {
      console.error('[IntelligenceSummarizer] Failed to parse recommendations:', error);
      return {
        recommendations: [
          {
            category: 'messaging',
            recommendation: 'Personalize outreach based on company intelligence',
            reasoning: 'Available intelligence can enhance message relevance',
            priority: 'medium'
          }
        ]
      };
    }
  }

  /**
   * Calculate completeness score
   */
  calculateCompleteness(intelligence) {
    let score = 0;
    const maxScore = 5;

    if (intelligence.company) score += 1;
    if (intelligence.knowledge.length > 0) score += 1;
    if (intelligence.signals.length > 0) score += 1;
    if (intelligence.people.length > 0) score += 1;
    if (intelligence.knowledge.length > 5) score += 1; // Bonus for rich data

    return score / maxScore;
  }

  /**
   * Save intelligence report
   */
  async saveReport(companyId, report) {
    await pool.query(`
      INSERT INTO intelligence_reports (
        company_id, summary, insights, recommendations, raw_data, completeness_score, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      companyId,
      report.summary,
      JSON.stringify(report.insights),
      JSON.stringify(report.recommendations),
      JSON.stringify(report.raw_intelligence),
      report.completeness_score
    ]);
  }

  /**
   * Get cached report or generate new one
   */
  async getOrGenerateReport(companyId, maxAgeDays = 7) {
    // Check for recent report
    const cached = await pool.query(`
      SELECT * FROM intelligence_reports
      WHERE company_id = $1 AND generated_at > NOW() - INTERVAL '${maxAgeDays} days'
      ORDER BY generated_at DESC
      LIMIT 1
    `, [companyId]);

    if (cached.rows.length > 0) {
      return {
        summary: cached.rows[0].summary,
        insights: cached.rows[0].insights,
        recommendations: cached.rows[0].recommendations,
        completeness_score: cached.rows[0].completeness_score,
        cached: true,
        generated_at: cached.rows[0].generated_at
      };
    }

    // Generate new report
    const report = await this.generateIntelligenceReport(companyId);
    return { ...report, cached: false };
  }
}

export default new IntelligenceSummarizer();
