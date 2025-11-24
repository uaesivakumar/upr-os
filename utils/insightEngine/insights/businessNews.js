import { pool } from '../../../utils/db.js';

export class BusinessNews {
  constructor(company) {
    this.company = company;
  }

  async generate() {
    // Skip if no company ID
    if (!this.company.id) {
      console.log('[BusinessNews] Skipping - no company ID');
      return null;
    }

    try {
      // Query company news from last 60 days
      const result = await pool.query(
        `SELECT headline, summary, published_date, sentiment, source
         FROM company_news
         WHERE company_id = $1
         AND published_date >= NOW() - INTERVAL '60 days'
         ORDER BY published_date DESC
         LIMIT 10`,
        [this.company.id]
      );

      const news = result.rows;

      if (news.length === 0) {
        console.log(`[BusinessNews] No recent news found for company ${this.company.id}`);
        return null;
      }

      console.log(`[BusinessNews] Found ${news.length} news items for ${this.company.name}`);

      // Analyze sentiment
      const sentimentCounts = {
        positive: news.filter(n => (n.sentiment || '').toLowerCase() === 'positive').length,
        neutral: news.filter(n => (n.sentiment || '').toLowerCase() === 'neutral' || !n.sentiment).length,
        negative: news.filter(n => (n.sentiment || '').toLowerCase() === 'negative').length
      };

      // Calculate recent activity (last 14 days)
      const recentNews = news.filter(n => {
        const daysAgo = (Date.now() - new Date(n.published_date).getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= 14;
      });

      // Determine overall sentiment and icon
      let overallSentiment, sentimentIcon, recommendation;

      if (sentimentCounts.positive > sentimentCounts.negative * 2) {
        overallSentiment = 'very_positive';
        sentimentIcon = '🟢';
        recommendation = `Strong positive momentum: ${sentimentCounts.positive} positive news mentions. Excellent timing for outreach - company is likely receptive to new partnerships.`;
      } else if (sentimentCounts.positive > sentimentCounts.negative) {
        overallSentiment = 'positive';
        sentimentIcon = '🟢';
        recommendation = `Positive news coverage detected. Good timing for outreach with ${sentimentCounts.positive} favorable mentions.`;
      } else if (sentimentCounts.negative > sentimentCounts.positive) {
        overallSentiment = 'challenging';
        sentimentIcon = '🟡';
        recommendation = `${sentimentCounts.negative} challenging news items detected. Approach with caution - may be dealing with internal priorities.`;
      } else {
        overallSentiment = 'neutral';
        sentimentIcon = '⚪';
        recommendation = `Neutral news cycle. Standard outreach timing recommended.`;
      }

      // Build detailed breakdown
      const details = [];

      if (sentimentCounts.positive > 0) {
        details.push(`✅ ${sentimentCounts.positive} positive mention${sentimentCounts.positive > 1 ? 's' : ''}`);
      }
      if (sentimentCounts.negative > 0) {
        details.push(`⚠️ ${sentimentCounts.negative} challenging mention${sentimentCounts.negative > 1 ? 's' : ''}`);
      }
      if (sentimentCounts.neutral > 0) {
        details.push(`ℹ️ ${sentimentCounts.neutral} neutral mention${sentimentCounts.neutral > 1 ? 's' : ''}`);
      }
      if (recentNews.length > 0) {
        details.push(`📅 ${recentNews.length} mention${recentNews.length > 1 ? 's' : ''} in last 2 weeks`);
      }

      // Top 3 most recent news items
      const topNews = news.slice(0, 3).map(n => ({
        headline: n.headline,
        summary: n.summary?.substring(0, 150),
        date: n.published_date,
        sentiment: n.sentiment,
        source: n.source
      }));

      return {
        id: 'business_news',
        category: 'context',
        icon: sentimentIcon,
        title: 'Recent Business News',
        priority: 2,
        content: {
          summary: `${overallSentiment.replace('_', ' ').toUpperCase()} news sentiment`,
          details,
          metrics: {
            totalNews: news.length,
            recentNews: recentNews.length,
            sentiment: sentimentCounts,
            overallSentiment,
            topNews
          }
        },
        recommendation,
        confidence: news.length >= 3 ? 'high' : 'medium'
      };

    } catch (error) {
      console.error('[BusinessNews] Error generating insight:', error);
      return null;
    }
  }
}
