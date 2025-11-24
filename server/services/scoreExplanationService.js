/**
 * Score Explanation Service - "Why this score" transparency
 */
import pg from 'pg';
const { Pool } = pg;

export class ScoreExplanationService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  async explainScore(opportunityId) {
    const score = await this.getLeadScore(opportunityId);

    if (!score) {
      return { error: 'Score not found', opportunityId };
    }

    return {
      opportunityId,
      leadScore: score.lead_score,
      grade: score.grade,
      breakdown: {
        qScore: {
          value: score.q_score,
          weight: '1x multiplier',
          explanation: 'Quality assessment from company profile',
          contribution: (score.q_score / (score.q_score + score.engagement_score + score.fit_score) * 100).toFixed(1)
        },
        engagementScore: {
          value: score.engagement_score,
          weight: '1x multiplier',
          explanation: 'Activity and responsiveness metrics',
          contribution: (score.engagement_score / (score.q_score + score.engagement_score + score.fit_score) * 100).toFixed(1)
        },
        fitScore: {
          value: score.fit_score,
          weight: '1x multiplier',
          explanation: 'Company-opportunity fit analysis',
          contribution: (score.fit_score / (score.q_score + score.engagement_score + score.fit_score) * 100).toFixed(1)
        }
      },
      formula: `${score.q_score} × ${score.engagement_score} × ${score.fit_score} / 100 = ${score.lead_score}`,
      recommendations: this.generateRecommendations(score),
      risks: this.identifyRisks(score)
    };
  }

  async getLeadScore(opportunityId) {
    const query = 'SELECT * FROM lead_scores WHERE opportunity_id = $1';
    const result = await this.pool.query(query, [opportunityId]);
    return result.rows[0];
  }

  generateRecommendations(score) {
    const recommendations = [];

    if (score.engagement_score >= 80) {
      recommendations.push('High engagement - schedule demo call soon');
    }

    if (score.fit_score >= 80) {
      recommendations.push('Perfect fit - emphasize relevant case studies');
    }

    if (score.grade === 'A+' || score.grade === 'A') {
      recommendations.push('High-value lead - assign to senior rep');
    }

    if (score.q_score >= 80 && score.engagement_score < 60) {
      recommendations.push('High quality but low engagement - increase outreach');
    }

    return recommendations.length > 0 ? recommendations : ['Continue standard engagement process'];
  }

  identifyRisks(score) {
    const risks = [];

    if (score.decay_applied && score.decay_rate > 0.3) {
      risks.push('High decay rate - needs immediate re-engagement');
    }

    if (score.engagement_score < 40) {
      risks.push('Low engagement - risk of going cold');
    }

    const daysSinceCalculation = score.calculated_at ?
      (new Date() - new Date(score.calculated_at)) / (1000 * 60 * 60 * 24) : 0;

    if (daysSinceCalculation > 7) {
      risks.push('Score not updated recently - may not reflect current state');
    }

    return risks;
  }

  async close() {
    await this.pool.end();
  }
}

export default ScoreExplanationService;
