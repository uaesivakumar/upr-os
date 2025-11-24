import {
  getCompanyBusinessSignals,
  getHiringSignalSummary,
  daysSinceLastSignal
} from '../../dataHelpers/businessSignals.js';

export class HiringSignals {
  constructor(company) {
    this.company = company;
  }

  async generate() {
    const companyId = this.company.id;
    const companyName = this.company.name;

    console.log('═══════════════════════════════════════════════════');
    console.log('[HiringSignals] INSIGHT GENERATION START');
    console.log('[HiringSignals] Company data received:');
    console.log('[HiringSignals]   - ID:', companyId);
    console.log('[HiringSignals]   - Name:', companyName);
    console.log('[HiringSignals]   - Has dbHiringSignals?', !!this.company.dbHiringSignals, 'count:', this.company.dbHiringSignals?.length);
    console.log('[HiringSignals]   - Has signals?', !!this.company.signals, 'count:', this.company.signals?.length);

    try {
      // Use centralized data source - query by name since table doesn't have company_id
      console.log('[HiringSignals] Calling getCompanyBusinessSignals...');
      const signals = await getCompanyBusinessSignals(companyId, companyName);

      console.log('[HiringSignals] Returned from getCompanyBusinessSignals:', signals.length, 'signals');

      const summary = getHiringSignalSummary(signals);

      console.log('[HiringSignals] Signal summary:', JSON.stringify(summary, null, 2));
      console.log('[HiringSignals] Signal details:', signals.map(s => ({
        type: s.signal_type,
        date: s.signal_date,
        text: s.signal_text?.substring(0, 50) + '...'
      })));

      if (signals.length === 0) {
        console.log('[HiringSignals] ⚠️ RETURNING: NO ACTIVE HIRING SIGNALS');
        console.log('[HiringSignals] INSIGHT GENERATION END');
        console.log('═══════════════════════════════════════════════════');
        return {
          id: 'hiring_signals',
          category: 'urgency',
          icon: '🟡',
          title: 'Hiring Activity Analysis',
          priority: 1,
          content: {
            summary: 'NO ACTIVE HIRING SIGNALS',
            details: [
              '📊 No job postings detected in last 90 days',
              '📰 No expansion/growth news mentions',
              '💼 Company appears to be in stable phase'
            ],
            metrics: {
              signalCount: 0,
              urgency: 'low',
              lastActivity: null,
              summary
            }
          },
          recommendation: '⏸️ LOW PRIORITY: This company is not actively hiring. They won\'t buy onboarding services right now. Add to "watch list" and check back in 3-6 months when hiring resumes. Focus on companies with active hiring signals instead.',
          confidence: 'high'
        };
      }

      // Analyze signal types (case-insensitive matching)
      const expansionSignals = signals.filter(s =>
        s.signal_type?.toLowerCase() === 'expansion_news' || s.signal_type?.toLowerCase() === 'expansion'
      );

      // EXPANSION DETECTED (HIGHEST URGENCY)
      if (expansionSignals.length > 0) {
        const latestExpansion = expansionSignals[0];
        const daysAgo = Math.floor(
          (Date.now() - new Date(latestExpansion.signal_date)) / (1000 * 60 * 60 * 24)
        );

        const details = [
          `📰 "${latestExpansion.signal_text}" (${daysAgo} days ago)`,
          `⏰ Timeline: Partner selection happens in next ${Math.max(30 - daysAgo, 5)} days`,
          `📈 Forecast: 30-50 new hires expected in next 90 days`,
          summary.jobPostings > 0
            ? `✅ Already posting jobs: ${summary.jobPostings} openings`
            : '⚠️ Not posting yet - even more urgent (pre-hiring phase)'
        ];

        const recommendation = `🚨 URGENT - ACT THIS WEEK!

**EXPANSION DETECTED:** "${latestExpansion.signal_text}" (${daysAgo} days ago)

**Why This Matters:**
Companies typically select onboarding partners 30-60 days BEFORE bulk hiring begins. You're in the perfect window RIGHT NOW.

**Expected Timeline:**
• Days 1-30: Select vendors (YOU ARE HERE ⬅️)
• Days 30-60: Onboard vendor systems
• Days 60-90: Start hiring wave (30-50 new hires)

**Action Required:**
Reach out IMMEDIATELY. If they've already selected a partner, you're 6 months too late. Strike now while they're evaluating options.

**What to Say:**
"I saw your recent expansion announcement. We specialize in rapid onboarding for companies scaling quickly. Can we show you how we handled similar expansion for [similar company] in 48 hours?"`;

        console.log('[HiringSignals] ✅ RETURNING: EXPANSION PHASE - URGENT TIMING');
        console.log('[HiringSignals] INSIGHT GENERATION END');
        console.log('═══════════════════════════════════════════════════');

        return {
          id: 'hiring_signals',
          category: 'urgency',
          icon: '🔥',
          title: 'Hiring Activity Analysis',
          priority: 1,
          content: {
            summary: 'EXPANSION PHASE - URGENT TIMING',
            details,
            metrics: {
              signalCount: signals.length,
              urgency: 'high',
              timeline: '30-90 days',
              forecast: '30-50 new hires',
              daysAgo,
              summary
            }
          },
          recommendation,
          confidence: 'high'
        };
      }

      // ACTIVE HIRING (HIGH URGENCY)
      if (summary.jobPostings >= 5 && summary.hasRecent) {
        const recentCount = signals.filter(s =>
          new Date(s.signal_date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ).length;

        const details = [
          `📈 ${summary.jobPostings} job postings in last 90 days`,
          `⚡ ${recentCount} new postings in last 30 days`,
          `🔥 Company is in active hiring mode RIGHT NOW`
        ];

        const recommendation = `✅ GOOD TIMING: They're actively hiring. BUT: They may have already selected an onboarding partner. Your pitch should be: "We can supplement your current process" or "Switch to us for next hiring wave." Don't assume they're still shopping - ask directly: "How are you handling onboarding for these new hires?"`;

        console.log('[HiringSignals] ✅ RETURNING: ACTIVE HIRING WAVE');
        console.log('[HiringSignals] INSIGHT GENERATION END');
        console.log('═══════════════════════════════════════════════════');

        return {
          id: 'hiring_signals',
          category: 'urgency',
          icon: '🟢',
          title: 'Hiring Activity Analysis',
          priority: 1,
          content: {
            summary: 'ACTIVE HIRING WAVE',
            details,
            metrics: {
              signalCount: signals.length,
              urgency: 'high',
              timeline: 'Active now',
              summary
            }
          },
          recommendation,
          confidence: 'high'
        };
      }

      // BUSINESS GROWTH SIGNALS (Investment, Partnership, Awards)
      const businessSignals = signals.filter(s => {
        const type = s.signal_type?.toLowerCase();
        return type === 'investment' || type === 'partnership' || type === 'project_award' ||
               type === 'award' || type === 'funding';
      });

      if (businessSignals.length > 0) {
        const signalTypes = [...new Set(signals.map(s => s.signal_type))].join(', ');
        const details = [
          `💼 ${signals.length} business signals detected: ${signalTypes}`,
          `📊 Signals indicate company growth or new initiatives`,
          `🎯 Growth often precedes hiring waves (3-6 month lag)`
        ];

        const recommendation = `🟢 GOOD TIMING: Business growth signals detected. Companies often hire 3-6 months after investments/partnerships/awards. Reach out now to be top-of-mind when hiring starts. Position as: "Congratulations on [signal]. As you scale, we can help onboard your new team faster."`;

        console.log('[HiringSignals] ✅ RETURNING: BUSINESS GROWTH SIGNALS');
        console.log('[HiringSignals] INSIGHT GENERATION END');
        console.log('═══════════════════════════════════════════════════');

        return {
          id: 'hiring_signals',
          category: 'urgency',
          icon: '🟢',
          title: 'Hiring Activity Analysis',
          priority: 1,
          content: {
            summary: 'BUSINESS GROWTH SIGNALS',
            details,
            metrics: {
              signalCount: signals.length,
              urgency: 'medium-high',
              timeline: '3-6 months',
              signalTypes,
              summary
            }
          },
          recommendation,
          confidence: 'medium'
        };
      }

      // MODERATE ACTIVITY
      const daysAgo = daysSinceLastSignal(signals);
      const details = [
        `📊 ${signals.length} signals detected in last 90 days`,
        `📅 Most recent: ${daysAgo} days ago`,
        `💼 Steady-state hiring (replacements, not expansion)`
      ];

      const recommendation = 'MEDIUM PRIORITY: This company is hiring at normal pace (replacements, not growth). They may already have an onboarding partner. Position yourself as "upgrade" or "replacement" rather than "new solution." Best approach: "How are you currently handling onboarding? We\'ve helped similar companies reduce onboarding time by 50%."';

      console.log('[HiringSignals] ✅ RETURNING: MODERATE HIRING ACTIVITY');
      console.log('[HiringSignals] INSIGHT GENERATION END');
      console.log('═══════════════════════════════════════════════════');

      return {
        id: 'hiring_signals',
        category: 'urgency',
        icon: '🟡',
        title: 'Hiring Activity Analysis',
        priority: 1,
        content: {
          summary: 'MODERATE HIRING ACTIVITY',
          details,
          metrics: {
            signalCount: signals.length,
            urgency: 'medium',
            summary
          }
        },
        recommendation,
        confidence: 'high'
      };

    } catch (error) {
      console.error('═══════════════════════════════════════════════════');
      console.error('[HiringSignals] ❌ ERROR during insight generation');
      console.error('[HiringSignals] Company ID:', companyId);
      console.error('[HiringSignals] Company Name:', companyName);
      console.error('[HiringSignals] Error:', error.message);
      console.error('[HiringSignals] Stack:', error.stack);
      console.error('[HiringSignals] INSIGHT GENERATION FAILED');
      console.error('═══════════════════════════════════════════════════');
      return null;
    }
  }
}
