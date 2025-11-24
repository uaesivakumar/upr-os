import { getSectorPlaybook } from '../config/sectorPlaybooks.js';

export class ContactStrategy {
  constructor(leads, company) {
    this.leads = leads;
    this.company = company;
  }

  async generate() {
    // Need at least a few leads to analyze
    if (!this.leads || this.leads.length < 3) {
      console.log('[ContactStrategy] Skipping - not enough leads to analyze');
      return null;
    }

    try {
      // Get sector-specific intelligence
      const playbook = getSectorPlaybook(
        this.company.sector,
        this.company.industry
      );

      // Analyze lead composition by seniority
      const executives = this.leads.filter(l =>
        /chief|cxo|president|ceo|cfo|coo|c-level/i.test(l.seniority || l.title || l.designation || '')
      );

      const directors = this.leads.filter(l =>
        /director|head|vp|vice president/i.test(l.seniority || l.title || '')
      );

      const managers = this.leads.filter(l =>
        /manager|lead|supervisor/i.test(l.seniority || l.title || '')
      );

      const specialists = this.leads.filter(l =>
        /specialist|coordinator|administrator|generalist|officer/i.test(l.title || '')
      );

      // Determine strategy based on playbook + lead composition
      let strategy, icon, details, recommendation;

      // Check if we have the right level based on sector procurement style
      const hasSeniorContacts = executives.length > 0 || directors.length > 0;
      const hasManagerContacts = managers.length > 0;
      const hasSpecialistContacts = specialists.length > 0;

      if (playbook.procurementStyle.includes('Top-down')) {
        if (hasSeniorContacts) {
          strategy = 'TOP DOWN (Perfect for this sector)';
          icon = '🎯';
          details = [
            `👔 ${executives.length + directors.length} senior decision-makers found`,
            `📋 ${playbook.decisionCulture}`,
            `⏱️ Expected cycle: ${playbook.averageSaleCycle}`,
            `✅ Right level for ${this.company.sector || this.company.industry} sector`
          ];
          recommendation = `✅ PERFECT ALIGNMENT: Start with senior contacts. ${playbook.culturalNotes}

**Decision-makers for this sector:** ${playbook.decisionMakers}

**Best practice:** ${playbook.bestPractice}

**What to emphasize:** ${playbook.pitchEmphasis.slice(0, 3).join(', ')}`;
        } else {
          strategy = 'WRONG LEVEL (Not ideal for this sector)';
          icon = '⚠️';
          details = [
            `🔍 Only ${managers.length + specialists.length} mid-level contacts found`,
            `❗ This sector uses: ${playbook.procurementStyle}`,
            `💡 ${playbook.decisionCulture}`,
            `⏱️ Sales cycle: ${playbook.averageSaleCycle}`
          ];
          recommendation = `⚠️ WARNING: ${this.company.name} is in ${this.company.sector || this.company.industry} sector, which requires ${playbook.procurementStyle.toLowerCase()}.

**The Problem:** You only have mid-level contacts, but ${playbook.decisionMakers} make the decision.

**Your Options:**
1. Find executives on LinkedIn (search: "site:linkedin.com ${this.company.name} director OR VP OR chief")
2. Ask current contacts for warm intro to leadership
3. Deprioritize this lead until you can reach decision-makers

**Why this matters:** ${playbook.culturalNotes}`;
        }
      } else if (playbook.procurementStyle.includes('Bottom-up')) {
        if (hasSpecialistContacts || hasManagerContacts) {
          strategy = 'BOTTOM-UP (Perfect for this sector)';
          icon = '🌱';
          details = [
            `💼 ${managers.length + specialists.length} operational contacts found`,
            `📋 ${playbook.decisionCulture}`,
            `✅ ${playbook.procurementStyle}`,
            `⏱️ Expected cycle: ${playbook.averageSaleCycle}`
          ];
          recommendation = `✅ PERFECT ALIGNMENT: Start with specialists/managers.

**Why this works:** ${playbook.culturalNotes}

**Decision flow:** In ${this.company.sector || this.company.industry}, specialists test → managers approve → leadership signs contract.

**Best practice:** ${playbook.bestPractice}

**Avoid:** Don't jump straight to executives - they won't engage without team buy-in first.`;
        } else {
          strategy = 'TOP-HEAVY (Wrong level for this sector)';
          icon = '⚠️';
          details = [
            `👔 Only senior contacts found`,
            `❗ This sector uses bottom-up procurement`,
            `💡 Need operational contacts to pilot`
          ];
          recommendation = `⚠️ MISMATCH: This sector values ${playbook.procurementStyle.toLowerCase()}, but you only have senior contacts.

**The Problem:** Executives in ${this.company.sector || this.company.industry} won't engage without team buy-in.

**What to do:** Find HR specialists or managers who can pilot your solution. They'll champion it upward.

**Search tip:** Look for titles like "HR Specialist", "Onboarding Coordinator", "HR Operations Manager"`;
        }
      } else if (playbook.decisionMakers.includes('dual approval') || playbook.decisionMakers.includes('triple approval')) {
        strategy = 'MULTI-THREADED (Required for this sector)';
        icon = '🔀';
        details = [
          `👥 Multiple approval layers needed: ${playbook.decisionMakers}`,
          `⏱️ Sales cycle: ${playbook.averageSaleCycle}`,
          `📊 Current coverage: ${executives.length} exec, ${directors.length} dir, ${managers.length} mgr, ${specialists.length} spec`
        ];

        const missing = [];
        if (executives.length === 0 && (playbook.decisionMakers.includes('CFO') || playbook.decisionMakers.includes('CEO'))) {
          missing.push('Executive level (C-suite)');
        }
        if (directors.length === 0 && playbook.decisionMakers.includes('Director')) {
          missing.push('Director level');
        }
        if ((managers.length + specialists.length) === 0 && playbook.decisionMakers.includes('Operations')) {
          missing.push('Operational level (HR/Ops)');
        }

        if (missing.length > 0) {
          recommendation = `⚠️ INCOMPLETE COVERAGE: You're missing ${missing.join(' AND ')}.

**Why this matters:** In ${this.company.sector || this.company.industry}, you need parallel engagement across: ${playbook.decisionMakers}

**Cultural context:** ${playbook.culturalNotes}

**Action required:** Find contacts in each decision layer. All stakeholders must say "yes" for deal to close.

**Best practice:** ${playbook.bestPractice}`;
        } else {
          recommendation = `✅ EXCELLENT COVERAGE: You have contacts at multiple levels.

**Strategy:** Engage in parallel across all decision layers: ${playbook.decisionMakers}

**Why:** ${playbook.culturalNotes}

**Best practice:** ${playbook.bestPractice}

**Timeline:** Expect ${playbook.averageSaleCycle} due to multiple approvals.`;
        }
      } else {
        strategy = 'BALANCED';
        icon = '⚖️';
        details = [
          `📊 ${executives.length} executives, ${managers.length} managers, ${specialists.length} specialists`,
          `📋 ${playbook.decisionCulture}`,
          `⏱️ Expected cycle: ${playbook.averageSaleCycle}`
        ];
        recommendation = `**Sector intelligence:** ${playbook.culturalNotes}

**Best practice:** ${playbook.bestPractice}

**Decision-makers:** ${playbook.decisionMakers}`;
      }

      return {
        id: 'contact_strategy',
        category: 'strategy',
        icon,
        title: 'Contact Strategy',
        priority: 3,
        content: {
          summary: strategy,
          details,
          metrics: {
            executives: executives.length,
            directors: directors.length,
            managers: managers.length,
            specialists: specialists.length,
            playbook: {
              sector: this.company.sector || this.company.industry,
              procurementStyle: playbook.procurementStyle,
              saleCycle: playbook.averageSaleCycle
            }
          }
        },
        recommendation,
        confidence: 'high'
      };

    } catch (error) {
      console.error('[ContactStrategy] Error generating insight:', error);
      return null;
    }
  }
}
