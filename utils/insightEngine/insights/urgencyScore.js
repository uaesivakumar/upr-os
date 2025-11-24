import { getSectorPlaybook } from '../config/sectorPlaybooks.js';

export class UrgencyScore {
  constructor(allInsights, company) {
    this.allInsights = allInsights;
    this.company = company;
  }

  async generate() {
    const companyId = this.company.id;
    console.log(`[UrgencyScore] companyId=${companyId} name=${this.company.name}`);

    // Get sector playbook for context
    const playbook = getSectorPlaybook(this.company.sector, this.company.industry);
    console.log(`[UrgencyScore] companyId=${companyId} playbook=${playbook.decisionCulture}`);

    let urgencyScore = 50;
    let factors = [];

    // Check hiring signals
    const hiringSignals = this.allInsights.find(i => i.id === 'hiring_signals');
    if (hiringSignals) {
      const urgency = hiringSignals.content.metrics.urgency;
      if (urgency === 'high') {
        urgencyScore += 30;
        factors.push(`🔥 Active hiring/expansion (+30) - ${playbook.averageSaleCycle} typical cycle`);
      } else if (urgency === 'medium') {
        urgencyScore += 15;
        factors.push(`🟡 Steady hiring (+15) - Position as upgrade/replacement`);
      } else {
        urgencyScore -= 20;
        factors.push(`❄️ No hiring activity (-20) - Revisit when hiring resumes`);
      }
    }

    // Check news sentiment
    const newsInsight = this.allInsights.find(i => i.id === 'business_news');
    if (newsInsight) {
      const { positiveCount = 0, negativeCount = 0 } = newsInsight.content.metrics;
      if (positiveCount > negativeCount) {
        urgencyScore += 15;
        factors.push('📈 Positive news momentum (+15)');
      } else if (negativeCount > positiveCount) {
        urgencyScore -= 10;
        factors.push('📉 Negative news signals (-10)');
      }
    }

    // Check lead quality
    const strategyInsight = this.allInsights.find(i => i.id === 'contact_strategy');
    if (strategyInsight) {
      const hasMultipleContacts = strategyInsight.content.details.length >= 2;
      if (hasMultipleContacts) {
        urgencyScore += 10;
        factors.push('👥 Strong contact coverage (+10)');
      }
    }

    // Clamp score
    urgencyScore = Math.max(0, Math.min(100, urgencyScore));

    // Determine action with playbook context
    let priority, icon, action;
    if (urgencyScore >= 75) {
      priority = 'URGENT - ACT NOW';
      icon = '🔴';
      action = `⚡ DROP EVERYTHING - REACH OUT TODAY! ${playbook.bestPractice} Expected cycle: ${playbook.averageSaleCycle}.`;
    } else if (urgencyScore >= 60) {
      priority = 'HIGH PRIORITY';
      icon = '🟠';
      action = `📅 HIGH PRIORITY - Schedule outreach this week. ${playbook.culturalNotes}`;
    } else if (urgencyScore >= 40) {
      priority = 'MODERATE PRIORITY';
      icon = '🟡';
      action = `📊 MODERATE - Add to pipeline. ${playbook.bestPractice}`;
    } else {
      priority = 'LOW PRIORITY';
      icon = '⚪';
      action = `⏸️ LOW PRIORITY - Watch list only. Focus on companies with active hiring signals. Revisit in 3-6 months.`;
    }

    console.log(`[UrgencyScore] companyId=${companyId} score=${urgencyScore} priority=${priority}`);

    return {
      id: 'urgency_score',
      category: 'priority',
      icon,
      title: 'Overall Urgency Assessment',
      priority: 4,
      content: {
        summary: `${priority} (Score: ${urgencyScore}/100)`,
        details: factors,
        metrics: {
          score: urgencyScore,
          priority
        }
      },
      recommendation: action,
      confidence: 'high'
    };
  }
}
