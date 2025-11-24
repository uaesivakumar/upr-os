// Real intelligence modules that analyze actual company data
// NOT generic blog content!

import { HiringSignals } from './insights/hiringSignals.js';
import { BusinessNews } from './insights/businessNews.js';
import { ContactStrategy } from './insights/contactStrategy.js';
import { UrgencyScore } from './insights/urgencyScore.js';
import { UAEContext } from './insights/uaeContext.js';

export class InsightEngine {
  constructor(leads, company, searchParams = {}) {
    this.leads = leads;
    this.company = company;
    this.searchParams = searchParams;

    console.log('[InsightEngine] Initialized with:', {
      companyName: company.name,
      companyId: company.id,
      leadCount: leads.length
    });

    // 🔍 DIAGNOSTIC: Show FULL company data received by InsightEngine
    console.log('[InsightEngine] === FULL COMPANY DATA RECEIVED ===');
    console.log(JSON.stringify(this.company, null, 2));
    console.log('[InsightEngine] === KEY FIELDS CHECK ===');
    console.log('[InsightEngine] Has id?', !!this.company.id, 'value:', this.company.id);
    console.log('[InsightEngine] Has location?', !!this.company.location, 'value:', this.company.location);
    console.log('[InsightEngine] Has headquarters?', !!this.company.headquarters, 'value:', this.company.headquarters);
    console.log('[InsightEngine] Has hq_location?', !!this.company.hq_location, 'value:', this.company.hq_location);
    console.log('[InsightEngine] Has dbHiringSignals?', !!this.company.dbHiringSignals, 'count:', this.company.dbHiringSignals?.length);
    console.log('[InsightEngine] Has signals?', !!this.company.signals, 'count:', this.company.signals?.length);
    console.log('[InsightEngine] === END DIAGNOSTIC ===');
  }

  async generateInsights() {
    const companyId = this.company.id;
    const companyName = this.company.name;

    console.group(`[InsightEngine] ${companyName} (${companyId})`);
    console.log('Company data:', {
      id: companyId,
      name: companyName,
      sector: this.company.sector,
      industry: this.company.industry,
      location: this.company.location,
      headquarters: this.company.headquarters,
      leadCount: this.leads?.length || 0
    });

    const insights = [];

    // Module 5: Hiring Signals
    console.log('→ Generating Hiring Signals...');
    const hiringModule = new HiringSignals(this.company);
    const hiringInsight = await hiringModule.generate();
    if (hiringInsight) {
      console.log('  ✓ Hiring Signals:', hiringInsight.content.summary);
      insights.push(hiringInsight);
    } else {
      console.log('  ✗ Hiring Signals: no insight');
    }

    // Module 6: Business News
    console.log('→ Generating Business News...');
    const newsModule = new BusinessNews(this.company);
    const newsInsight = await newsModule.generate();
    if (newsInsight) {
      console.log('  ✓ Business News:', newsInsight.content.summary);
      insights.push(newsInsight);
    } else {
      console.log('  ✗ Business News: no insight');
    }

    // Module 7: Contact Strategy
    console.log('→ Generating Contact Strategy...');
    const strategyModule = new ContactStrategy(this.leads, this.company);
    const strategyInsight = await strategyModule.generate();
    if (strategyInsight) {
      console.log('  ✓ Contact Strategy:', strategyInsight.content.summary);
      insights.push(strategyInsight);
    } else {
      console.log('  ✗ Contact Strategy: no insight');
    }

    // Module 8: Urgency Score
    console.log('→ Generating Urgency Score...');
    const urgencyModule = new UrgencyScore(insights, this.company);
    const urgencyInsight = await urgencyModule.generate();
    if (urgencyInsight) {
      console.log('  ✓ Urgency Score:', urgencyInsight.content.summary);
      insights.push(urgencyInsight);
    } else {
      console.log('  ✗ Urgency Score: failed');
    }

    // Module 9: UAE Context
    console.log('→ Generating UAE Context...');
    const uaeModule = new UAEContext(this.company);
    const uaeInsight = await uaeModule.generate();
    if (uaeInsight) {
      console.log('  ✓ UAE Context:', uaeInsight.content.summary);
      insights.push(uaeInsight);
    } else {
      console.log('  ✗ UAE Context: not UAE company');
    }

    console.log(`Total insights generated: ${insights.length}`);
    console.groupEnd();

    return insights.sort((a, b) => a.priority - b.priority);
  }
}

export default InsightEngine;
