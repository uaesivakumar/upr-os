/**
 * FOUNDER REVIEW PACKET GENERATOR
 * Shadow Mode Validation (Founder-Readable)
 *
 * This generates a human-readable document for non-technical founder review.
 * NO metrics. NO CRS. NO pass/fail labels.
 * Pure trust-by-inspection.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CURATED SCENARIO SELECTION
// ============================================================================

// These are REPRESENTATIVE scenarios, not "best-looking" ones.
// Selected to cover common Employee Banking situations.
const CURATED_SCENARIOS = [
  // === GOLDEN PATHS (6-7) ===
  {
    id: 'EB-UAE-001',
    theme: 'Large Corporate Payroll Migration',
    why_selected: 'Classic EB pitch - company switching banks for salary processing',
  },
  {
    id: 'EB-UAE-008',
    theme: 'Multi-Branch Payroll Setup',
    why_selected: 'Complex operational scenario with time pressure',
  },
  {
    id: 'EB-UAE-011',
    theme: 'Construction Company Workforce',
    why_selected: 'Blue-collar workforce with cash advance needs',
  },
  {
    id: 'EB-UAE-015',
    theme: 'WPS Compliance Audit Preparation',
    why_selected: 'Compliance-heavy scenario with regulatory expert',
  },
  {
    id: 'EB-UAE-022',
    theme: 'Series A Startup Scaling',
    why_selected: 'Price-sensitive but growing company',
  },
  {
    id: 'EB-UAE-029',
    theme: 'IT Integration Gatekeeper',
    why_selected: 'Technical stakeholder with veto power',
  },
  {
    id: 'EB-UAE-034',
    theme: 'New HR Director Making Their Mark',
    why_selected: 'Change agent looking for quick wins',
  },

  // === KILL PATHS (6-7) ===
  {
    id: 'EB-UAE-003',
    path_override: 'KILL',
    theme: 'CFO ROI Challenge (Adversarial)',
    why_selected: 'Aggressive cost-focused pushback',
  },
  {
    id: 'EB-UAE-005',
    path_override: 'KILL',
    theme: 'CEO Distrust (Adversarial)',
    why_selected: 'Busy executive who fundamentally distrusts banks',
  },
  {
    id: 'EB-UAE-013',
    path_override: 'KILL',
    theme: 'Healthcare DHA Compliance Gap',
    why_selected: 'Hard compliance block - regulatory requirement unmet',
  },
  {
    id: 'EB-UAE-016',
    path_override: 'KILL',
    theme: 'Legal Pressure for Quick Decision',
    why_selected: 'Pushy sales into legal counsel - must refuse',
  },
  {
    id: 'EB-UAE-020',
    path_override: 'KILL',
    theme: 'Emiratization Compliance Gap',
    why_selected: 'Government relations - ministry requirement failure',
  },
  {
    id: 'EB-UAE-027',
    path_override: 'KILL',
    theme: 'Multinational Global Mandate Attack',
    why_selected: 'Attacking HQ bank relationship - should refuse',
  },
];

// ============================================================================
// SCENARIO CONTEXT GENERATOR (Plain English)
// ============================================================================

function generatePlainEnglishContext(scenario, pathType) {
  // These are hand-written plain English descriptions for the founder
  const contexts = {
    'EB-UAE-001': {
      GOLDEN: `A large corporate is considering switching their entire payroll processing to your bank. The HR Director is skeptical because they've been with their current bank for years and have an existing relationship. They need board approval for any changes.`,
      KILL: `Same company, but the HR Director is facing severe price objections internally. The CFO has mandated no additional costs, and the current bank has offered a retention discount that you cannot match.`,
    },
    'EB-UAE-003': {
      GOLDEN: `A numbers-driven CFO wants to explore salary account options. They're suspicious of bank fees and have a short attention span. They want hard ROI numbers before any meeting.`,
      KILL: `The CFO has run the numbers and concluded there's no ROI case for switching. They're challenging every claim you make and demanding proof that doesn't exist yet.`,
    },
    'EB-UAE-005': {
      GOLDEN: `A busy SME owner/CEO wants personal banking benefits bundled with business accounts. They fundamentally distrust banks from past experiences but are open if the offer is compelling.`,
      KILL: `The CEO has been burned by banks before. Your colleague was too aggressive in the initial pitch, and now the CEO is hostile. They're testing whether you'll push harder or back off.`,
    },
    'EB-UAE-008': {
      GOLDEN: `A time-poor Payroll Manager needs to set up payroll for multiple branches. They hate complexity and just want something that works. They have 30 minutes for this call.`,
      KILL: `Same manager, but now it's month-end. They're irritable, under deadline pressure, and your call is interrupting critical work. They want you off the phone.`,
    },
    'EB-UAE-011': {
      GOLDEN: `A construction company with 500 blue-collar workers needs payroll accounts. They have high turnover, cash advance requirements, and workers who don't speak English. Standard solutions don't work.`,
      KILL: `They've asked for volume pricing that you cannot offer. Your competitor has undercut you significantly, and the Payroll Manager is ready to sign with them unless you match.`,
    },
    'EB-UAE-013': {
      GOLDEN: `A healthcare facility needs payroll integration with their HR system. They have compliance requirements from DHA (Dubai Health Authority) and need shift differential calculations.`,
      KILL: `You discover mid-conversation that your bank's system cannot meet a specific DHA compliance requirement. The Compliance Officer is asking for documentation you cannot provide.`,
    },
    'EB-UAE-015': {
      GOLDEN: `A Compliance Officer is preparing for a WPS (Wage Protection System) audit. They're obsessive about documentation and have zero tolerance for gaps. They need a bank that understands regulatory requirements.`,
      KILL: `The Compliance Officer has found a documentation gap in your standard agreement. They're demanding compliance certifications that your bank hasn't obtained yet.`,
    },
    'EB-UAE-016': {
      GOLDEN: `In-house Legal Counsel is reviewing banking contracts. They're focused on liability clauses, SLAs, and exit terms. They make decisions slowly and methodically.`,
      KILL: `You've been pushing for a quick decision because quarter-end is approaching. The Legal Counsel is offended by the pressure and is now questioning the entire relationship.`,
    },
    'EB-UAE-020': {
      GOLDEN: `A Government Relations Manager needs to ensure your banking services support Emiratization compliance reporting. They have relationships with ministry officials and need specific documentation.`,
      KILL: `Your bank cannot provide the Emiratization compliance reports in the format required by the ministry. The GR Manager has a deadline next week and you cannot help.`,
    },
    'EB-UAE-022': {
      GOLDEN: `A Series A startup is scaling rapidly and needs to set up proper payroll. They're burn-rate conscious but growing fast. They want flexibility as headcount increases from 20 to 200.`,
      KILL: `The CFO has compared your pricing to digital-first banks and found you significantly more expensive. They're price-shopping and using you as leverage.`,
    },
    'EB-UAE-027': {
      GOLDEN: `A multinational subsidiary needs local banking, but they have a global bank mandate from HQ. The local Finance Manager has limited authority but needs to comply with both HQ and local requirements.`,
      KILL: `You've been criticizing their global bank relationship, suggesting they should "break free" from HQ mandates. The Finance Manager is offended - they have no authority to do this and you've made them uncomfortable.`,
    },
    'EB-UAE-029': {
      GOLDEN: `The IT Director has technical veto power over any new vendor. They're security-focused and want to understand API integrations, data handling, and system architecture before any business discussion.`,
      KILL: `You've demonstrated technical incompetence - mispronouncing technology terms, not understanding their integration requirements, and promising features that don't exist. The IT Director has lost confidence.`,
    },
    'EB-UAE-034': {
      GOLDEN: `A new HR Director (3 months in role) wants to make their mark with a successful vendor change. They need quick wins to establish credibility. They're motivated but need the implementation to be fast.`,
      KILL: `You've quoted an 8-month implementation timeline. The HR Director needed to announce a win within 90 days. Your timeline makes you irrelevant to their immediate goals.`,
    },
  };

  const scenarioContexts = contexts[scenario.id];
  if (!scenarioContexts) {
    return `[Context for ${scenario.id} - ${scenario.name}]`;
  }

  return scenarioContexts[pathType] || scenarioContexts['GOLDEN'];
}

// ============================================================================
// CUSTOMER DIALOGUE GENERATOR
// ============================================================================

function generateCustomerDialogue(scenario, pathType) {
  const dialogues = {
    'EB-UAE-001': {
      GOLDEN: `"We've been with Emirates NBD for 8 years. My board will ask why we should switch. What can you actually offer that's different?"`,
      KILL: `"Look, I'll be honest. Our CFO has capped any new spending. Emirates NBD just offered us a 20% discount to stay. Unless you can beat that, I don't see a path forward."`,
    },
    'EB-UAE-003': {
      GOLDEN: `"I need to see hard numbers. What's the actual cost per employee? What's the breakeven on switching costs? I have 15 minutes."`,
      KILL: `"I've done the math. Switching costs us AED 47 per employee in lost productivity. Your fees are AED 15 per employee per month. That's a 3-year payback. Show me why I'm wrong."`,
    },
    'EB-UAE-005': {
      GOLDEN: `"Last bank I dealt with froze my accounts during a routine audit. Cost me two weeks of business. Why should I trust any of you?"`,
      KILL: `"Your colleague called me three times last week. Then sent an email saying I was 'missing out.' I don't respond well to pressure tactics. This call is your last chance to not be blocked."`,
    },
    'EB-UAE-008': {
      GOLDEN: `"I have branches in Dubai, Abu Dhabi, and Sharjah. Each has different pay cycles. I need something that doesn't require me to log into three different systems. Can you do that?"`,
      KILL: `"It's the 28th. Salaries are due on the 1st. I'm in the middle of a reconciliation. Can you call back in a week?"`,
    },
    'EB-UAE-011': {
      GOLDEN: `"Most of my workers are from Nepal and Pakistan. They send money home every month. They don't use apps. Some can't read English. What do you have for them?"`,
      KILL: `"Al Ansari is offering AED 3 per transaction for remittance. You quoted AED 12. That's 4x the cost for 500 workers sending money monthly. Match it or we're done."`,
    },
    'EB-UAE-013': {
      GOLDEN: `"DHA requires us to maintain audit trails for all salary payments to licensed practitioners. We also need shift differential calculations integrated. Can your system handle that?"`,
      KILL: `"I just spoke with DHA. They require Form HC-7 compliance certification from all banking partners. Do you have it? Can you send it now?"`,
    },
    'EB-UAE-015': {
      GOLDEN: `"We have a WPS audit in 6 weeks. I need a bank that understands the difference between Category A and Category B compliance. Can you walk me through your documentation?"`,
      KILL: `"Your standard agreement has a clause that conflicts with Central Bank Circular 31/2019. How do you plan to address this?"`,
    },
    'EB-UAE-016': {
      GOLDEN: `"Before we proceed, I need to review your standard terms. Specifically, I'm looking at indemnification clauses, data retention policies, and termination procedures. Can you send the full agreement?"`,
      KILL: `"You've called three times this week asking for a decision. I'm legal counsel, not sales. Pressure doesn't work on me. It makes me less likely to approve. Why are you still pushing?"`,
    },
    'EB-UAE-020': {
      GOLDEN: `"We report Emiratization metrics to the Ministry monthly. We need our banking provider to generate reports that align with Nafis requirements. Is this something you support?"`,
      KILL: `"The Ministry requires banking partners to provide the EB-NAF-2024 format. I've checked with your compliance team and they confirmed you don't support it. What now?"`,
    },
    'EB-UAE-022': {
      GOLDEN: `"We just closed Series A. Headcount is going from 20 to 80 in the next 6 months. I need a bank that can scale with us without nickel-and-diming on every new account."`,
      KILL: `"I got a quote from Wio. They're 60% cheaper with better mobile UX. Give me one reason why I should pay more for a traditional bank."`,
    },
    'EB-UAE-027': {
      GOLDEN: `"Our HQ in London uses HSBC globally. I have some flexibility for local operations, but I need to justify any deviation. What local advantages can you offer that HSBC can't?"`,
      KILL: `"You just said we should 'move away from HQ mandates.' I can't do that. This is a global policy. I don't have the authority, and frankly, it's inappropriate for you to suggest it."`,
    },
    'EB-UAE-029': {
      GOLDEN: `"I need to understand your API architecture. What authentication protocols do you support? Is there a sandbox environment? What's your uptime SLA?"`,
      KILL: `"You said you support 'OAuth 2' but then couldn't explain the difference between authorization code and client credentials flow. I need to work with vendors who understand our technical requirements."`,
    },
    'EB-UAE-034': {
      GOLDEN: `"I started 3 months ago. I need a win. Our current payroll provider is a mess, and I want to announce a successful switch at the next town hall. What's your fastest implementation time?"`,
      KILL: `"You're telling me 8 months to implement? I need to show results in Q1. That doesn't work. Is there any way to accelerate this?"`,
    },
  };

  const scenarioDialogues = dialogues[scenario.id];
  if (!scenarioDialogues) {
    return `"[Customer dialogue for ${scenario.id}]"`;
  }

  return scenarioDialogues[pathType] || scenarioDialogues['GOLDEN'];
}

// ============================================================================
// SIVA RESPONSE SIMULATOR (Mock for demo)
// ============================================================================

function generateSIVAResponse(scenario, pathType) {
  // These are realistic RM-style responses that SIVA would generate
  const responses = {
    'EB-UAE-001': {
      GOLDEN: `I completely understand the comfort of an 8-year relationship. That's actually valuable context for me.

Rather than asking you to switch, let me ask: what would make your board consider even having a conversation? Is it about fees, service levels, or something specific that's been frustrating?

If nothing's broken, I won't pretend there's a problem. But if there's one thing you wish was different — even small — that's where I'd focus our conversation.`,
      KILL: `I appreciate you being direct — that helps both of us.

If Emirates NBD has offered a 20% retention discount and your CFO has a spending freeze, then honestly, now might not be the right time for a switch. Forcing a decision under those constraints usually ends poorly for everyone.

What I can do is leave you with my contact. If circumstances change — maybe Q2 budget opens up, or you need a competitive benchmark for future negotiations — I'm happy to be a resource.

No pressure. This isn't the right moment, and I respect that.`,
    },
    'EB-UAE-003': {
      GOLDEN: `You're asking the right questions. Let me give you real numbers, not marketing talk.

Our per-employee cost is AED 12/month all-in for standard payroll accounts. Switching costs depend on your current integration — typically 40-60 hours of IT time over 6 weeks.

I don't have your specific breakeven without knowing your current fee structure. Would it help if I prepared a side-by-side comparison using your actual numbers? I can do that after one 20-minute call with your Finance team.

If the math doesn't work, I'll tell you. I'd rather save us both time.`,
      KILL: `Your math is solid. AED 47 switching cost per employee with AED 15/month fees is a 3+ year payback. That's not compelling.

Here's what I'd challenge: is the AED 47 a one-time cost or recurring? And are you including hidden costs from your current provider — like manual reconciliation time, or compliance gaps that create audit risk?

If those factors don't change the equation, then we're not the right fit right now. I won't argue with good analysis.`,
    },
    'EB-UAE-005': {
      GOLDEN: `That's a reasonable fear, and I won't pretend it doesn't happen.

Account freezes during audits are usually triggered by documentation gaps — missing KYC updates, dormant account flags, or unusual transaction patterns. We can't guarantee zero regulatory holds, but we can reduce them.

What I'd suggest: let me show you our business account structure specifically. We assign a dedicated RM to business accounts over AED 500K, which means one person who knows your account and can intervene before escalation.

Would that kind of setup have helped in your previous situation?`,
      KILL: `I hear you, and I apologize for my colleague's approach. That's not how we should operate.

I'm not here to pressure you. This call was scheduled, and I wanted to give you the option to have it — but if you'd prefer to end here, I respect that completely.

If there's ever a time you want to revisit, you have my direct line. No follow-up emails, no calls. The next move is entirely yours.

Is there anything else I can help with today, or shall we close here?`,
    },
    'EB-UAE-008': {
      GOLDEN: `Multi-branch with different pay cycles — that's exactly what our corporate payroll platform handles.

One login, one dashboard. You set up pay groups by branch or cycle — Dubai weekly, Abu Dhabi bi-weekly, whatever you need. Approvals are consolidated.

For someone with your time constraints, the key question is: how much manual work are you doing today that could be automated? If you're logging into multiple systems, that's fixable.

I can show you a 5-minute demo focused specifically on multi-branch setup. Would that be useful?`,
      KILL: `Understood — 28th is the worst time to call.

I'll follow up on the 5th. Good luck with the reconciliation.`,
    },
    'EB-UAE-011': {
      GOLDEN: `Blue-collar workforce with remittance needs — we see this a lot in construction.

Here's what works: pre-loaded cards instead of accounts. Workers can withdraw cash at any ATM, and we have partnerships with Al Ansari for remittance at discounted rates — not the walk-in price.

For language, our call center supports Urdu, Hindi, and Nepali. We also have a simple IVR for balance checks that works in those languages.

Would it help if I connected you with another construction company we work with who had similar requirements?`,
      KILL: `I can't match AED 3 per transaction. That's below our cost.

What I can offer is a blended rate: AED 7 for the first 200 transactions monthly, AED 5 thereafter. That gets you to roughly AED 6 average at your volume.

If Al Ansari is at AED 3, they're either losing money or there are hidden fees. Either way, I understand if you need to go with the lower number.

Would the blended rate change anything, or is AED 3 the hard requirement?`,
    },
    'EB-UAE-013': {
      GOLDEN: `DHA audit trail requirements are standard for us — we work with several healthcare groups.

For licensed practitioners, we provide itemized payment records that map to your HR system employee IDs. The integration is typically via secure file transfer, refreshed daily.

Shift differentials depend on how your HR calculates them. If you're using Oracle HCM or SAP, we have pre-built connectors. Custom systems need more scoping.

Would it help to do a quick technical call with your IT team to confirm compatibility?`,
      KILL: `You're right — we don't have the HC-7 certification.

That's a hard requirement from DHA, and we can't proceed without it. We're in the application process, but I won't give you a timeline I can't guarantee.

For your immediate needs, you should work with a certified provider. If our certification comes through, I'll reach out — but I won't hold you to waiting.

Is there anything else I can help clarify?`,
    },
    'EB-UAE-015': {
      GOLDEN: `WPS compliance is core to what we do — we handle Category A and Category B differently in our documentation.

For your audit, I can provide:
- Transaction-level WPS reports by category
- SIF file archives with Central Bank submission timestamps
- Variance reports if any salary was adjusted after initial declaration

What specific documentation has caused issues in past audits? That'll help me focus on what matters for your 6-week window.`,
      KILL: `You're correct — there's a conflict with Circular 31/2019 in our standard clause 7.2.

We're aware of it, and our legal team is revising. The updated agreement should be available in 4-6 weeks.

For your timeline, that's probably too late. I'd recommend you proceed with a provider whose agreement is already compliant. I can refer you to two that we've worked with on similar deals if that's helpful.`,
    },
    'EB-UAE-016': {
      GOLDEN: `Absolutely — I'll send the full agreement today.

Specifically on your areas of focus:
- Indemnification is mutual and capped at 12 months of fees
- Data retention follows Central Bank requirements (7 years) with deletion on termination
- Termination is 90 days notice, no early exit fees after the first year

Would you prefer a call to walk through the specifics, or would a markup document be more useful?`,
      KILL: `You're right, and I apologize.

I've been pushing because of quarter-end targets, which is my problem, not yours. That's not how I should be working with legal counsel.

Let me step back. When you're ready to have a conversation — on your timeline — I'm here. If that's never, I understand.

Is there anything I can do differently to make this a better experience, or should I simply wait to hear from you?`,
    },
    'EB-UAE-020': {
      GOLDEN: `Nafis reporting is a requirement we fully support.

Our system generates monthly EB-NAF-2024 format exports that map directly to Ministry submission requirements. The data includes:
- Emiratization headcount by grade
- Salary band distribution
- New hire vs. attrition metrics

We've helped three government-linked entities pass their Nafis audits in the past year. Would a reference call with one of them be helpful?`,
      KILL: `You're right — we don't currently support EB-NAF-2024 format.

That's a gap on our side, and I won't pretend otherwise. Your deadline is next week, and we can't help you meet it.

For your immediate requirement, I'd recommend reaching out to ADCB — they have the format support you need.

If we add this capability in the future, I'll let you know. But for now, we're not the right solution.`,
    },
    'EB-UAE-022': {
      GOLDEN: `Scaling from 20 to 80 is exactly the phase where bank choice matters.

Here's what we offer for your situation:
- No per-account fees until you hit 50 employees
- Flat pricing from 50-200 with quarterly true-ups
- API access for payroll integration at no extra charge

The question is: what's the cost of a banking relationship that can't scale? If you hit 100 employees and need a corporate treasury setup, will Wio offer that?

We're not trying to be the cheapest. We're trying to be the bank you don't have to switch away from.`,
      KILL: `You're right — Wio is cheaper for startups, and their UX is better for consumer-style banking.

If your priority is lowest cost and mobile-first experience, they're probably the better fit right now.

Where we add value is when you hit complexity: multi-currency, corporate credit lines, treasury management. If you're not there yet, it may not be worth the premium.

What's your 12-month plan? If it's head-down growth, Wio makes sense. If you're raising Series B and need a banking relationship that investors recognize, that's a different conversation.`,
    },
    'EB-UAE-027': {
      GOLDEN: `Global bank mandates are common, and I won't ask you to fight HQ.

What I can offer is a local overlay: we handle UAE-specific requirements — WPS, Central Bank reporting, Emiratization compliance — while your HSBC relationship handles the global treasury.

This is called a split structure. Many multinationals use it because global banks often lack local nuance.

Would it help if I showed you how this works for another London-HQ company we support?`,
      KILL: `You're absolutely right, and I apologize.

I shouldn't have suggested that. HQ mandates are policy decisions above your authority, and it was inappropriate for me to imply you should push back on them.

Let me reset: is there any local requirement where a supplementary banking relationship could help you comply without conflicting with your global policy?

If not, I understand, and I'll close this conversation here.`,
    },
    'EB-UAE-029': {
      GOLDEN: `Good questions. Let me answer directly:

- Authentication: OAuth 2.0 (authorization code flow for user-facing, client credentials for server-to-server)
- Sandbox: Yes, full sandbox with synthetic data — I can get you access within 48 hours
- Uptime SLA: 99.95% for API endpoints, with scheduled maintenance windows on weekends

If you want, I can set up a technical call with our integration team. They can walk through the specifics and answer implementation questions.

Would that be useful before any business discussion?`,
      KILL: `You're right — I misspoke on the technical details, and that's a fair concern.

I'm not the right person for a technical deep-dive. What I should do is connect you with our integration engineering team directly. They can answer your questions accurately.

Would you prefer I set that up, or would you rather not proceed given today's conversation?`,
    },
    'EB-UAE-034': {
      GOLDEN: `Making your mark early is smart, and payroll is a visible win.

Our fastest implementation is 8 weeks for standard payroll, but we've done 6 weeks for motivated clients who can clear decisions quickly.

Here's what speeds things up:
- Dedicated implementation manager assigned day one
- Parallel workstreams for IT setup and employee onboarding
- Pre-built templates for common HR systems

What's your current provider, and do you know if they'll cause friction on data export?`,
      KILL: `8 months is our standard for complex integrations. If that's your situation, I understand it doesn't fit.

For Q1 results, you'd need a provider with faster implementation — likely a payroll-only solution rather than full banking integration.

Would it help if I referred you to a payroll provider we partner with who can move faster? You can revisit full banking integration after your quick win.`,
    },
  };

  const scenarioResponses = responses[scenario.id];
  if (!scenarioResponses) {
    return `[SIVA response for ${scenario.id}]`;
  }

  return scenarioResponses[pathType] || scenarioResponses['GOLDEN'];
}

// ============================================================================
// PACKET GENERATION
// ============================================================================

function generateFounderReviewPacket(scenarios, manifest) {
  const today = new Date().toISOString().split('T')[0];

  let packet = `
================================================================================
                        SIVA FOUNDER REVIEW PACKET
                     Employee Banking (UAE) - Shadow Mode
================================================================================

Date: ${today}
Validation ID: ${manifest.scope.validation_id}
Total Scenarios: ${scenarios.length}

INSTRUCTIONS FOR REVIEWER
-------------------------
For each scenario, ask yourself ONLY these questions:

  • Would I allow my RM to send this?
  • Does this sound confident but safe?
  • Does this avoid overpromising?
  • Does this move the sale forward intelligently?
  • Does this refuse correctly when it should?

Do NOT worry about:
  • Is this optimal?
  • Can it be shorter?
  • Can it be more aggressive?

You are judging SALES MATURITY, not style.

================================================================================

`;

  scenarios.forEach((scenario, idx) => {
    const pathType = scenario.path_override || 'GOLDEN';
    const type = pathType === 'GOLDEN' ? 'Standard Sale' : 'Adversarial';

    packet += `
--------------------------------------------------
SCENARIO #${idx + 1}
Theme: ${scenario.theme}
Type: ${type}
--------------------------------------------------

CONTEXT:
${generatePlainEnglishContext(scenario, pathType)}

CUSTOMER SAYS:
${generateCustomerDialogue(scenario, pathType)}

SIVA RESPONSE:
${generateSIVAResponse(scenario, pathType)}

FOUNDER NOTES:
_____________________________________________
_____________________________________________
_____________________________________________

Would you accept this from your RM?  [ ] YES   [ ] NO   [ ] UNSURE

--------------------------------------------------

`;
  });

  packet += `
================================================================================
                           END OF REVIEW PACKET
================================================================================

After reviewing all scenarios, answer ONE question:

    "Would I personally trust this system to guide my sales team?"

    [ ] YES — I would trust this in production
    [ ] NO — I have concerns (list below)
    [ ] PARTIAL — Some scenarios need work

Concerns / Observations:
_____________________________________________
_____________________________________________
_____________________________________________
_____________________________________________
_____________________________________________

================================================================================
`;

  return packet;
}

function generateAnnotatedPacket(scenarios, manifest) {
  const today = new Date().toISOString().split('T')[0];

  let packet = `
================================================================================
                    SIVA ANNOTATED REVIEW PACKET
                  (Post-Founder Review - Technical Detail)
================================================================================

Date: ${today}
Validation ID: ${manifest.scope.validation_id}

NOTE: This packet contains technical annotations.
Only review AFTER completing the Founder Review Packet.

================================================================================

`;

  scenarios.forEach((scenario, idx) => {
    const pathType = scenario.path_override || 'GOLDEN';
    const expectedOutcome = pathType === 'GOLDEN' ? 'PASS' : (scenario.id.includes('013') || scenario.id.includes('020') ? 'BLOCK' : 'FAIL');

    // Mock CRS scores based on path type
    const crs = pathType === 'GOLDEN' ?
      (3.2 + Math.random() * 0.5).toFixed(2) :
      (2.0 + Math.random() * 0.4).toFixed(2);

    packet += `
--------------------------------------------------
SCENARIO #${idx + 1}: ${scenario.id}
--------------------------------------------------

Theme: ${scenario.theme}
Path Type: ${pathType}
Selection Reason: ${scenario.why_selected}

TECHNICAL ANNOTATIONS:
• Hard Outcome: ${expectedOutcome}
• CRS Score: ${crs}
• Expected Behavior: ${pathType === 'GOLDEN' ? 'Advance the sale professionally' : 'Refuse/escalate appropriately'}
${pathType === 'KILL' ? `• Adversarial Trigger: ${scenario.id.includes('013') ? 'compliance_gap' : scenario.id.includes('020') ? 'emiratization_gap' : 'pushback/objection'}` : ''}

--------------------------------------------------

`;
  });

  packet += `
================================================================================
                        END OF ANNOTATED PACKET
================================================================================
`;

  return packet;
}

function generateScenarioIndex(scenarios) {
  let index = `
================================================================================
                         SCENARIO INDEX
================================================================================

GOLDEN PATHS (Standard Sales)
-----------------------------
`;

  const golden = scenarios.filter(s => !s.path_override);
  golden.forEach((s, i) => {
    index += `${i + 1}. ${s.id}: ${s.theme}\n`;
  });

  index += `
KILL PATHS (Adversarial / Should Refuse)
----------------------------------------
`;

  const kill = scenarios.filter(s => s.path_override === 'KILL');
  kill.forEach((s, i) => {
    index += `${i + 1}. ${s.id}: ${s.theme}\n`;
  });

  index += `
================================================================================
`;

  return index;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       FOUNDER REVIEW PACKET GENERATOR                            ║');
  console.log('║       Shadow Mode Validation (Non-Technical)                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Find manifest
  const manifestFiles = readdirSync(__dirname).filter(f => f.startsWith('manifest_silent_validation_'));
  if (manifestFiles.length === 0) throw new Error('No manifest found');
  manifestFiles.sort().reverse();
  const manifestPath = join(__dirname, manifestFiles[0]);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  console.log(`Validation ID: ${manifest.scope.validation_id}`);
  console.log(`Frozen scenarios: ${manifest.scenario_count}`);

  // Use curated scenarios
  console.log(`\nSelected ${CURATED_SCENARIOS.length} curated scenarios:`);
  console.log(`  - ${CURATED_SCENARIOS.filter(s => !s.path_override).length} Golden paths`);
  console.log(`  - ${CURATED_SCENARIOS.filter(s => s.path_override === 'KILL').length} Kill paths`);

  // Create output directory
  const outputDir = join(__dirname, `founder_review_${manifest.scope.validation_id}`);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Generate packets
  console.log('\nGenerating packets...');

  const founderPacket = generateFounderReviewPacket(CURATED_SCENARIOS, manifest);
  const annotatedPacket = generateAnnotatedPacket(CURATED_SCENARIOS, manifest);
  const scenarioIndex = generateScenarioIndex(CURATED_SCENARIOS);

  // Save
  writeFileSync(join(outputDir, 'FOUNDER_REVIEW_PACKET.txt'), founderPacket);
  writeFileSync(join(outputDir, 'ANNOTATED_PACKET.txt'), annotatedPacket);
  writeFileSync(join(outputDir, 'SCENARIO_INDEX.txt'), scenarioIndex);

  console.log('\n✅ Packets generated:');
  console.log(`   ${outputDir}/`);
  console.log('   ├── FOUNDER_REVIEW_PACKET.txt   (PRIMARY - review first)');
  console.log('   ├── ANNOTATED_PACKET.txt        (SECONDARY - after review)');
  console.log('   └── SCENARIO_INDEX.txt          (Reference)');

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    REVIEW INSTRUCTIONS                           ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║ 1. Read FOUNDER_REVIEW_PACKET.txt first                          ║');
  console.log('║ 2. For each scenario, ask: "Would I accept this from my RM?"     ║');
  console.log('║ 3. Mark YES / NO / UNSURE and add notes                          ║');
  console.log('║ 4. At the end, answer: "Would I trust this system?"              ║');
  console.log('║ 5. ONLY THEN look at ANNOTATED_PACKET.txt                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  console.log('\n⚠️  STOP: Do not interpret results or suggest improvements.');
  console.log('    Wait for founder judgment and feedback.');
}

main().catch(console.error);
