/**
 * Create Employee Banking PRE-ENTRY Suite
 *
 * This suite tests: "Would I allow my RM to CONTACT this company NOW, and HOW?"
 *
 * NOT about product pitching or post-entry conversations.
 * ABOUT opportunity discovery and timing judgment.
 *
 * EB RM questions this suite answers:
 * - Who should I approach?
 * - Is this company worth approaching NOW?
 * - What signal triggered this lead?
 * - Is there hiring / expansion / payroll opportunity?
 * - Who is the right persona to contact?
 * - Is outreach appropriate or premature?
 * - Should I wait, escalate, or disengage?
 */

import pool from '../server/db.js';

// ===========================
// GOLDEN SCENARIOS (Should ENGAGE)
// ===========================
// These are opportunities where an EB RM SHOULD reach out

const GOLDEN_SCENARIOS = [
  // 1. New entity setup + hiring
  {
    company: { name: 'TechVentures DMCC', industry: 'technology', employees: 0, hq: 'Dubai', entity_age_months: 1 },
    signal: { type: 'new-entity-setup', detail: 'Just registered DMCC license, posting 15 tech roles on LinkedIn', strength: 0.9 },
    contact: { title: 'Founder/CEO', name: 'Raj Mehta' },
    context: 'Indian tech entrepreneur setting up Dubai entity. No existing bank relationship. Actively hiring.',
    expected_decision: 'ENGAGE',
    expected_reason: 'New entity with active hiring = needs payroll from day 1. First-mover advantage. Contact founder directly while setting up operations.',
    expected_persona: 'Founder/CEO',
    expected_timing: 'NOW',
  },

  // 2. Company crosses 50-employee threshold
  {
    company: { name: 'CloudKitchen UAE', industry: 'food-tech', employees: 52, hq: 'Dubai', entity_age_months: 18 },
    signal: { type: 'headcount-threshold', detail: 'Just crossed 50 employees, hired 8 in last month', strength: 0.85 },
    contact: { title: 'HR Manager', name: 'Fatima Al-Hassan' },
    context: 'Fast-growing cloud kitchen. Previously small, now scaling. Current bank may not scale with them.',
    expected_decision: 'ENGAGE',
    expected_reason: '50+ employees = payroll complexity increases. Good time to offer scalable solution. HR Manager likely feeling pain of growth.',
    expected_persona: 'HR Manager',
    expected_timing: 'NOW',
  },

  // 3. New HR Director (first 60 days)
  {
    company: { name: 'Emirates Steel Industries', industry: 'manufacturing', employees: 2500, hq: 'Abu Dhabi', entity_age_months: 240 },
    signal: { type: 'leadership-change', detail: 'New CHRO joined 3 weeks ago from Etisalat', strength: 0.88 },
    contact: { title: 'CHRO', name: 'Ahmed Al-Mansouri' },
    context: 'Large established manufacturer. New CHRO may want to review vendor relationships.',
    expected_decision: 'ENGAGE',
    expected_reason: 'New CHRO in first 60 days = window to introduce ourselves. May be reviewing all HR vendors. Leverage timing before they settle.',
    expected_persona: 'CHRO',
    expected_timing: 'NOW - within 60-day window',
  },

  // 4. MNC establishing regional HQ
  {
    company: { name: 'Siemens Middle East', industry: 'engineering', employees: 0, hq: 'Dubai', entity_age_months: 0 },
    signal: { type: 'regional-hq-setup', detail: 'Announced UAE as new regional HQ, relocating 200 staff from Cairo', strength: 0.95 },
    contact: { title: 'Regional CFO', name: 'Thomas Mueller' },
    context: 'German MNC setting up regional headquarters. Large payroll, premium accounts.',
    expected_decision: 'ENGAGE',
    expected_reason: 'MNC regional HQ = premium payroll opportunity. 200 employees relocating need local salary accounts. High-value, move fast.',
    expected_persona: 'Regional CFO',
    expected_timing: 'URGENT - before they sign with competitor',
  },

  // 5. Company opening second UAE office
  {
    company: { name: 'PropertyFinder', industry: 'real-estate-tech', employees: 180, hq: 'Dubai', entity_age_months: 96 },
    signal: { type: 'office-expansion', detail: 'Opening Abu Dhabi office, hiring 40 local staff', strength: 0.82 },
    contact: { title: 'Finance Director', name: 'Sarah Thompson' },
    context: 'Established proptech. Dubai-based but expanding to Abu Dhabi. Need local banking presence.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Abu Dhabi expansion = may need bank with Abu Dhabi presence. 40 new hires = payroll opportunity. Finance Director handles banking.',
    expected_persona: 'Finance Director',
    expected_timing: 'NOW',
  },

  // 6. Payroll manager role posted
  {
    company: { name: 'Noon Daily', industry: 'e-commerce', employees: 800, hq: 'Dubai', entity_age_months: 36 },
    signal: { type: 'payroll-role-posted', detail: 'Hiring Payroll Manager - "to overhaul payroll processes"', strength: 0.87 },
    contact: { title: 'HR Director', name: 'Layla Ibrahim' },
    context: 'Large e-commerce. Posting for payroll manager suggests current pain or change.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Payroll Manager hire + "overhaul" language = actively looking to change. Perfect timing. Contact HR Director before new hire arrives.',
    expected_persona: 'HR Director',
    expected_timing: 'NOW - before new Payroll Manager joins',
  },

  // 7. Contract renewal approaching
  {
    company: { name: 'Chalhoub Group', industry: 'luxury-retail', employees: 12000, hq: 'Dubai', entity_age_months: 360 },
    signal: { type: 'contract-renewal', detail: 'Industry intel: 3-year bank contract ending Q1 2024', strength: 0.75 },
    contact: { title: 'Group Treasurer', name: 'Philippe Arnaud' },
    context: 'Luxury retail giant. Current contract expiring = competitive situation.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Contract renewal = rare window for large corporate. Start relationship building now. 12,000 employees = significant payroll.',
    expected_persona: 'Group Treasurer',
    expected_timing: 'NOW - 6 months before renewal',
  },

  // 8. WPS compliance issue signal
  {
    company: { name: 'Al-Futtaim Motors', industry: 'automotive', employees: 5000, hq: 'Dubai', entity_age_months: 480 },
    signal: { type: 'wps-compliance', detail: 'MOHRE flagged for WPS delays last month', strength: 0.8 },
    contact: { title: 'VP HR', name: 'Khaled Al-Futtaim' },
    context: 'Large automotive group with WPS compliance issues. May need better payroll solution.',
    expected_decision: 'ENGAGE',
    expected_reason: 'WPS compliance issues = pain point. Can offer solution that prevents MOHRE problems. VP HR likely under pressure to fix.',
    expected_persona: 'VP HR',
    expected_timing: 'NOW - while pain is fresh',
  },

  // 9. Startup post-Series A
  {
    company: { name: 'Zywa', industry: 'fintech', employees: 45, hq: 'Dubai', entity_age_months: 24 },
    signal: { type: 'funding-round', detail: 'Raised $10M Series A, planning to triple team', strength: 0.9 },
    contact: { title: 'COO', name: 'Noor Alnahdi' },
    context: 'Teen fintech startup. Post-funding, will scale rapidly. Need banking partner that scales.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Series A + tripling team = 135 employees soon. Need scalable payroll. COO handles operations. Move fast, VCs may influence banking.',
    expected_persona: 'COO',
    expected_timing: 'NOW - before they commit elsewhere',
  },

  // 10. Acquisition integration
  {
    company: { name: 'Talabat', industry: 'food-delivery', employees: 3000, hq: 'Dubai', entity_age_months: 120 },
    signal: { type: 'acquisition-integration', detail: 'Acquiring 3 small delivery startups, consolidating 400 employees', strength: 0.85 },
    contact: { title: 'Integration PMO Lead', name: 'Omar Siddiqui' },
    context: 'Food delivery giant integrating acquisitions. Payroll consolidation needed.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Post-acquisition = payroll consolidation opportunity. 400 new employees on different systems. Integration PMO handles vendor decisions.',
    expected_persona: 'Integration PMO Lead or CFO',
    expected_timing: 'NOW - during integration window',
  },

  // 11. Government entity going private
  {
    company: { name: 'DEWA Solar', industry: 'renewable-energy', employees: 500, hq: 'Dubai', entity_age_months: 6 },
    signal: { type: 'privatization', detail: 'Newly corporatized subsidiary, needs commercial banking', strength: 0.88 },
    contact: { title: 'Finance Manager', name: 'Abdullah Al-Maktoum' },
    context: 'DEWA spin-off. Government entity now needs commercial banking relationships.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Privatization = must move from government banking to commercial. High-value, prestigious account. Finance Manager setting up new structures.',
    expected_persona: 'Finance Manager',
    expected_timing: 'NOW - during setup phase',
  },

  // 12. Hotel chain expansion
  {
    company: { name: 'Rotana Hotels', industry: 'hospitality', employees: 8000, hq: 'Abu Dhabi', entity_age_months: 360 },
    signal: { type: 'property-opening', detail: 'Opening 3 new hotels in Dubai, hiring 600 staff', strength: 0.85 },
    contact: { title: 'Regional HR Head', name: 'Maria Santos' },
    context: 'Hotel chain expanding. Bulk hiring for new properties = payroll opportunity.',
    expected_decision: 'ENGAGE',
    expected_reason: '600 new hires for hotel openings = significant payroll add. Hospitality = high turnover, ongoing opportunity. Regional HR Head handles staffing.',
    expected_persona: 'Regional HR Head',
    expected_timing: 'NOW - 3-6 months before openings',
  },

  // 13. Construction project win
  {
    company: { name: 'Arabtec Construction', industry: 'construction', employees: 25000, hq: 'Dubai', entity_age_months: 480 },
    signal: { type: 'project-award', detail: 'Won $500M government infrastructure contract', strength: 0.82 },
    contact: { title: 'Project Finance Manager', name: 'Vikram Patel' },
    context: 'Large contractor with new mega-project. Will hire 2000+ workers.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Mega-project = mass hiring. Construction workers need WPS-compliant payroll. Project Finance Manager controls project-specific banking.',
    expected_persona: 'Project Finance Manager',
    expected_timing: 'NOW - before project mobilization',
  },

  // 14. Free zone company graduating to mainland
  {
    company: { name: 'MediaWorks FZ-LLC', industry: 'media', employees: 75, hq: 'Dubai Media City', entity_age_months: 60 },
    signal: { type: 'mainland-migration', detail: 'Converting to mainland LLC, opening Deira office', strength: 0.8 },
    contact: { title: 'General Manager', name: 'Faisal Khan' },
    context: 'Free zone company going mainland. Needs new banking setup for mainland entity.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Mainland conversion = new banking requirements. Good time to capture before they default to existing bank. GM handles entity setup.',
    expected_persona: 'General Manager',
    expected_timing: 'NOW - during conversion',
  },

  // 15. Retail chain seasonal hiring
  {
    company: { name: 'Landmark Group', industry: 'retail', employees: 50000, hq: 'Dubai', entity_age_months: 480 },
    signal: { type: 'seasonal-hiring', detail: 'Hiring 3000 temporary staff for Ramadan/Eid season', strength: 0.78 },
    contact: { title: 'Group CHRO', name: 'Ravi Krishnan' },
    context: 'Retail giant seasonal hiring. Temporary payroll = specific product opportunity.',
    expected_decision: 'ENGAGE',
    expected_reason: '3000 temporary staff = bulk account opening opportunity. Seasonal = repeating annual opportunity. CHRO controls HR vendor decisions.',
    expected_persona: 'Group CHRO',
    expected_timing: 'NOW - 2 months before season',
  },

  // 16. Healthcare expansion
  {
    company: { name: 'Aster Clinics', industry: 'healthcare', employees: 2000, hq: 'Dubai', entity_age_months: 180 },
    signal: { type: 'clinic-network-expansion', detail: 'Opening 10 new clinics, hiring 300 medical staff', strength: 0.85 },
    contact: { title: 'HR Director', name: 'Dr. Sneha Reddy' },
    context: 'Healthcare network expanding. Medical staff = premium payroll accounts.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Healthcare expansion = premium employees (doctors, nurses). 300 medical staff = high-value accounts. HR Director manages staffing.',
    expected_persona: 'HR Director',
    expected_timing: 'NOW',
  },

  // 17. Logistics company scaling
  {
    company: { name: 'Aramex Express', industry: 'logistics', employees: 4000, hq: 'Dubai', entity_age_months: 360 },
    signal: { type: 'fleet-expansion', detail: 'Adding 500 delivery drivers for e-commerce surge', strength: 0.8 },
    contact: { title: 'Fleet HR Manager', name: 'John Mathews' },
    context: 'Logistics scaling delivery fleet. High-volume, quick onboarding needed.',
    expected_decision: 'ENGAGE',
    expected_reason: '500 drivers = high-volume account opening. Need fast WPS setup. Fleet HR Manager handles driver payroll specifically.',
    expected_persona: 'Fleet HR Manager',
    expected_timing: 'NOW',
  },

  // 18. Education sector growth
  {
    company: { name: 'GEMS Education', industry: 'education', employees: 15000, hq: 'Dubai', entity_age_months: 360 },
    signal: { type: 'school-opening', detail: 'Opening 2 new schools, hiring 200 teachers', strength: 0.83 },
    contact: { title: 'Group HR Director', name: 'Caroline Smith' },
    context: 'School operator expanding. Teachers = stable, long-term payroll accounts.',
    expected_decision: 'ENGAGE',
    expected_reason: 'New schools = predictable teacher hiring. Education sector = stable employment, low churn. Group HR Director oversees all hiring.',
    expected_persona: 'Group HR Director',
    expected_timing: 'NOW - before academic year hiring',
  },

  // 19. Airline launching UAE hub
  {
    company: { name: 'Air India Express', industry: 'aviation', employees: 0, hq: 'Abu Dhabi', entity_age_months: 2 },
    signal: { type: 'hub-launch', detail: 'Launching Abu Dhabi hub, hiring 500 ground staff', strength: 0.9 },
    contact: { title: 'Station Manager', name: 'Priya Sharma' },
    context: 'Indian airline establishing UAE presence. Large staff, WPS compliance critical.',
    expected_decision: 'ENGAGE',
    expected_reason: 'New hub = 500 employees needing local payroll. Aviation = strict compliance requirements. Station Manager handles local ops.',
    expected_persona: 'Station Manager or Regional HR',
    expected_timing: 'URGENT - hub launching',
  },

  // 20. Manufacturing plant opening
  {
    company: { name: 'Johnson Controls', industry: 'manufacturing', employees: 0, hq: 'Dubai', entity_age_months: 3 },
    signal: { type: 'factory-setup', detail: 'Setting up Jebel Ali manufacturing facility, 200 workers', strength: 0.88 },
    contact: { title: 'Plant HR Manager', name: 'David Chen' },
    context: 'MNC setting up manufacturing. Blue-collar + white-collar payroll.',
    expected_decision: 'ENGAGE',
    expected_reason: 'New factory = 200 workers needing WPS accounts. MNC = premium. Plant HR Manager handles all local HR.',
    expected_persona: 'Plant HR Manager',
    expected_timing: 'NOW - during setup',
  },

  // 21. Bank consolidation opportunity
  {
    company: { name: 'Majid Al Futtaim Retail', industry: 'retail', employees: 30000, hq: 'Dubai', entity_age_months: 360 },
    signal: { type: 'bank-consolidation', detail: 'Currently using 4 different banks for payroll across divisions', strength: 0.75 },
    contact: { title: 'Group Treasurer', name: 'Michael Brown' },
    context: 'Large retail with fragmented banking. Consolidation = large opportunity.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Multi-bank situation = consolidation pain. 30,000 employees across 4 banks = operational complexity. Offer unified solution.',
    expected_persona: 'Group Treasurer',
    expected_timing: 'NOW - propose consolidation',
  },

  // 22. Dissatisfied competitor client
  {
    company: { name: 'Emaar Hospitality', industry: 'hospitality', employees: 5000, hq: 'Dubai', entity_age_months: 180 },
    signal: { type: 'competitor-dissatisfaction', detail: 'Industry intel: unhappy with current bank service levels', strength: 0.72 },
    contact: { title: 'CFO', name: 'James Wilson' },
    context: 'Large hospitality. Unhappy with current provider = switching opportunity.',
    expected_decision: 'ENGAGE',
    expected_reason: 'Service dissatisfaction = open to alternatives. 5000 employees = significant. CFO likely driving change if unhappy.',
    expected_persona: 'CFO',
    expected_timing: 'NOW - while pain is active',
  },

  // 23. IPO preparation
  {
    company: { name: 'Anghami', industry: 'entertainment-tech', employees: 300, hq: 'Abu Dhabi', entity_age_months: 120 },
    signal: { type: 'ipo-preparation', detail: 'Preparing for NASDAQ listing, cleaning up operations', strength: 0.85 },
    contact: { title: 'VP Finance', name: 'Elie Habib' },
    context: 'Tech company going public. Need institutional-grade banking.',
    expected_decision: 'ENGAGE',
    expected_reason: 'IPO prep = upgrading all vendors. Need bank that supports public company requirements. VP Finance handling IPO readiness.',
    expected_persona: 'VP Finance',
    expected_timing: 'NOW - during preparation',
  },

  // 24. Joint venture formation
  {
    company: { name: 'ADNOC-Total JV', industry: 'oil-gas', employees: 0, hq: 'Abu Dhabi', entity_age_months: 1 },
    signal: { type: 'jv-formation', detail: 'New JV between ADNOC and Total, 150 employees transferring', strength: 0.9 },
    contact: { title: 'JV Finance Director', name: 'Pierre Dubois' },
    context: 'Oil & gas JV. New entity needs fresh banking. Premium opportunity.',
    expected_decision: 'ENGAGE',
    expected_reason: 'New JV = new entity needing banking from scratch. 150 employees transferring need new accounts. Oil & gas = premium sector.',
    expected_persona: 'JV Finance Director',
    expected_timing: 'URGENT - JV just formed',
  },
];

// ===========================
// KILL SCENARIOS (Should NOT ENGAGE)
// ===========================
// These are situations where EB RM should NOT reach out

const KILL_SCENARIOS = [
  // 1. Just switched banks
  {
    company: { name: 'Dubai Properties Group', industry: 'real-estate', employees: 800, hq: 'Dubai', entity_age_months: 240 },
    signal: { type: 'recent-bank-switch', detail: 'Switched all payroll to FAB 4 months ago', strength: 0.1 },
    contact: { title: 'CFO', name: 'Ahmed Hassan' },
    context: 'Just moved payroll. Unlikely to switch again soon.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Switched 4 months ago = locked in. No pain, no motivation to change. Wait 18-24 months minimum. Add to nurture list.',
    blocker: 'recent_switch',
  },

  // 2. Hiring freeze
  {
    company: { name: 'Careem', industry: 'transportation', employees: 2000, hq: 'Dubai', entity_age_months: 120 },
    signal: { type: 'hiring-freeze', detail: 'Announced 20% workforce reduction last month', strength: 0.1 },
    contact: { title: 'CHRO', name: 'Sara Ahmed' },
    context: 'Company downsizing. No payroll growth opportunity.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Layoffs = shrinking payroll, not growing. CHRO focused on reductions, not new vendors. Monitor for recovery.',
    blocker: 'downsizing',
  },

  // 3. Long-term contract locked
  {
    company: { name: 'Etisalat', industry: 'telecom', employees: 15000, hq: 'Abu Dhabi', entity_age_months: 600 },
    signal: { type: 'contract-locked', detail: '5-year exclusive deal with ADCB signed 2 years ago', strength: 0.05 },
    contact: { title: 'Group Treasurer', name: 'Mohammad Al-Qasimi' },
    context: 'Long-term exclusive contract. Cannot switch.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: '5-year exclusive = 3 years remaining. Waste of effort. Set reminder for Year 4 to start relationship building.',
    blocker: 'contract_locked',
  },

  // 4. Global mandate blocks local banking
  {
    company: { name: 'McKinsey & Company', industry: 'consulting', employees: 500, hq: 'Dubai', entity_age_months: 360 },
    signal: { type: 'global-mandate', detail: 'Global policy: all payroll through Citibank worldwide', strength: 0.05 },
    contact: { title: 'Office Manager', name: 'Lisa Park' },
    context: 'MNC with global banking mandate. Local decision not possible.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Global mandate = no local authority. Even if interested, cannot switch. Focus on companies with local decision rights.',
    blocker: 'global_mandate',
  },

  // 5. Compliance red flag
  {
    company: { name: 'Dubai Gold Trading', industry: 'trading', employees: 100, hq: 'Dubai', entity_age_months: 180 },
    signal: { type: 'compliance-issue', detail: 'Under investigation for money laundering', strength: 0.0 },
    contact: { title: 'Owner', name: 'Raj Kapoor' },
    context: 'AML investigation ongoing. High risk.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'AML investigation = compliance block. Cannot onboard until cleared. Reputational risk. Hard no.',
    blocker: 'compliance',
  },

  // 6. Shell company / minimal payroll
  {
    company: { name: 'Investment Holdings Ltd', industry: 'holding-company', employees: 3, hq: 'DIFC', entity_age_months: 24 },
    signal: { type: 'no-real-payroll', detail: 'Holding company with 3 admin staff only', strength: 0.1 },
    contact: { title: 'Director', name: 'John Smith' },
    context: 'Holding company. No real payroll, just directors.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: '3 employees = no payroll value. Holding company structure. Focus effort on operating companies.',
    blocker: 'no_payroll',
  },

  // 7. Outsourced payroll
  {
    company: { name: 'Deloitte Middle East', industry: 'consulting', employees: 2000, hq: 'Dubai', entity_age_months: 360 },
    signal: { type: 'outsourced-payroll', detail: 'Payroll fully outsourced to ADP with 4-year contract', strength: 0.1 },
    contact: { title: 'HR Director', name: 'Amanda Peters' },
    context: 'Payroll outsourced to third party. Bank not in loop.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Payroll outsourced to ADP = bank relationship goes through ADP. Need to target ADP partnership, not direct client.',
    blocker: 'outsourced',
  },

  // 8. Company exiting UAE
  {
    company: { name: 'WeWork UAE', industry: 'real-estate', employees: 150, hq: 'Dubai', entity_age_months: 60 },
    signal: { type: 'market-exit', detail: 'Announced UAE market exit, closing all locations', strength: 0.05 },
    contact: { title: 'Country Manager', name: 'Alex Johnson' },
    context: 'Company leaving market. No future opportunity.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Market exit = company leaving. Zero opportunity. Do not waste time.',
    blocker: 'market_exit',
  },

  // 9. Sanctioned entity connection
  {
    company: { name: 'Iran Trade FZE', industry: 'trading', employees: 50, hq: 'Sharjah', entity_age_months: 120 },
    signal: { type: 'sanctions-risk', detail: 'Majority owned by Iranian national, unclear sanctions status', strength: 0.0 },
    contact: { title: 'General Manager', name: 'Ali Tehrani' },
    context: 'Potential sanctions exposure. Compliance review required.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Sanctions risk = compliance block. Cannot proceed without extensive due diligence. Escalate to compliance before any contact.',
    blocker: 'sanctions',
  },

  // 10. Recently rejected
  {
    company: { name: 'Fast Logistics LLC', industry: 'logistics', employees: 200, hq: 'Dubai', entity_age_months: 60 },
    signal: { type: 'recently-rejected', detail: 'We rejected their application 3 months ago (credit issues)', strength: 0.1 },
    contact: { title: 'Finance Manager', name: 'Suresh Kumar' },
    context: 'Previously rejected by our bank. Cannot re-approach yet.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Rejected 3 months ago = cooling off period required. Re-approaching too soon damages reputation. Wait 12 months minimum.',
    blocker: 'recently_rejected',
  },

  // 11. Government entity (non-corporatized)
  {
    company: { name: 'Dubai Municipality', industry: 'government', employees: 10000, hq: 'Dubai', entity_age_months: 600 },
    signal: { type: 'government-entity', detail: 'Pure government entity with ministry banking', strength: 0.05 },
    contact: { title: 'HR Department Head', name: 'Khalid Al-Maktoum' },
    context: 'Government entity. Uses government banking channels.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Government entity = government banking mandate. Cannot compete. Only target corporatized government entities.',
    blocker: 'government',
  },

  // 12. Competitor relationship with decision maker
  {
    company: { name: 'National Petroleum', industry: 'oil-gas', employees: 3000, hq: 'Abu Dhabi', entity_age_months: 360 },
    signal: { type: 'competitor-relationship', detail: 'CFO previously worked at ADCB, strong personal relationship', strength: 0.15 },
    contact: { title: 'CFO', name: 'Omar Bin Rashid' },
    context: 'Decision maker has personal ties to competitor.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'CFO ex-ADCB = strong incumbent relationship. Low probability of switch. Monitor for CFO change.',
    blocker: 'competitor_relationship',
  },

  // 13. Too small / below threshold
  {
    company: { name: 'Creative Studio LLC', industry: 'media', employees: 12, hq: 'Dubai', entity_age_months: 36 },
    signal: { type: 'below-threshold', detail: 'Small creative agency, 12 employees', strength: 0.2 },
    contact: { title: 'Owner', name: 'Mona Hassan' },
    context: 'Below minimum threshold for EB segment.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: '12 employees = below 25-employee minimum for EB segment. Direct to SME banking or retail banking.',
    blocker: 'below_threshold',
  },

  // 14. Payroll through parent company
  {
    company: { name: 'Microsoft UAE', industry: 'technology', employees: 400, hq: 'Dubai', entity_age_months: 240 },
    signal: { type: 'parent-payroll', detail: 'All payroll processed through Microsoft Singapore hub', strength: 0.1 },
    contact: { title: 'Country HR Manager', name: 'Jennifer Lee' },
    context: 'Payroll centralized at parent. Local entity has no authority.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Payroll through Singapore = no local decision authority. Target regional treasury hub, not UAE entity.',
    blocker: 'parent_payroll',
  },

  // 15. Bad debt history
  {
    company: { name: 'Al-Rashid Trading', industry: 'trading', employees: 150, hq: 'Sharjah', entity_age_months: 180 },
    signal: { type: 'bad-debt', detail: 'Previous relationship ended with bad debt write-off', strength: 0.0 },
    contact: { title: 'Owner', name: 'Rashid Al-Balushi' },
    context: 'Previous bad debt with our bank. Cannot re-engage.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Bad debt history = blacklisted. Cannot re-onboard without special approval. Do not contact.',
    blocker: 'bad_debt',
  },

  // 16. Stagnant / no growth
  {
    company: { name: 'Legacy Textiles', industry: 'manufacturing', employees: 500, hq: 'Ajman', entity_age_months: 360 },
    signal: { type: 'no-growth', detail: 'Same headcount for 5 years, no expansion plans', strength: 0.15 },
    contact: { title: 'Finance Manager', name: 'Vinod Sharma' },
    context: 'Stagnant company. No growth signals.',
    expected_decision: 'DO NOT ENGAGE',
    expected_reason: 'Zero growth for 5 years = no urgency, no pain. Entrenched in current setup. Low probability of change. Monitor only.',
    blocker: 'no_growth',
  },
];

async function createPreEntrySuite() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(60));
    console.log('CREATING EB PRE-ENTRY SUITE');
    console.log('='.repeat(60));

    await client.query('BEGIN');

    // Check if suite already exists
    const existingCheck = await client.query(`
      SELECT id FROM sales_bench_suites WHERE suite_key = 'banking-eb-uae-pre-entry'
    `);

    let suiteId;

    if (existingCheck.rows.length > 0) {
      suiteId = existingCheck.rows[0].id;
      console.log('Suite already exists, clearing scenarios...');
      await client.query(`DELETE FROM sales_bench.sales_scenarios WHERE suite_id = $1`, [suiteId]);
    } else {
      // Get vertical and sub_vertical IDs
      const verticalResult = await client.query(`
        SELECT id FROM os_verticals WHERE key = 'banking' LIMIT 1
      `);
      const subVerticalResult = await client.query(`
        SELECT id FROM os_sub_verticals WHERE key = 'employee_banking' LIMIT 1
      `);

      if (verticalResult.rows.length === 0 || subVerticalResult.rows.length === 0) {
        throw new Error('Vertical or sub-vertical not found');
      }

      // Create new suite
      const suiteResult = await client.query(`
        INSERT INTO sales_bench_suites (
          suite_key, name, vertical_id, sub_vertical_id, region_code,
          stage, scenario_count, is_frozen, created_by
        ) VALUES (
          'banking-eb-uae-pre-entry',
          'Banking EB UAE Pre-Entry Discovery',
          $1,
          $2,
          'UAE',
          'PRE_ENTRY',
          $3,
          false,
          'FOUNDER'
        ) RETURNING id
      `, [verticalResult.rows[0].id, subVerticalResult.rows[0].id, GOLDEN_SCENARIOS.length + KILL_SCENARIOS.length]);

      suiteId = suiteResult.rows[0].id;

      // Create status
      await client.query(`
        INSERT INTO sales_bench_suite_status (suite_id, status)
        VALUES ($1, 'DRAFT')
      `, [suiteId]);

      console.log(`Created new suite: ${suiteId}`);
    }

    // Get a buyer_bot_id (required for the scenarios table)
    const buyerBotResult = await client.query(`
      SELECT id FROM sales_bench.buyer_bots LIMIT 1
    `);

    let buyerBotId;
    if (buyerBotResult.rows.length === 0) {
      // Create a default buyer bot with correct schema
      const newBotResult = await client.query(`
        INSERT INTO sales_bench.buyer_bots (
          name, category, vertical, sub_vertical,
          persona_description, system_prompt, is_mandatory
        )
        VALUES (
          'EB Pre-Entry Decision Maker',
          'decision_maker',
          'banking',
          'employee_banking',
          'UAE company decision maker evaluating banking relationships for payroll and employee services',
          'You are evaluating potential banking relationships for your company in the UAE.',
          false
        )
        RETURNING id
      `);
      buyerBotId = newBotResult.rows[0].id;
      console.log('Created buyer bot:', buyerBotId);
    } else {
      buyerBotId = buyerBotResult.rows[0].id;
    }

    // Insert GOLDEN scenarios
    console.log('\nInserting GOLDEN scenarios (should ENGAGE)...');
    let order = 1;
    for (const scenario of GOLDEN_SCENARIOS) {
      await client.query(`
        INSERT INTO sales_bench.sales_scenarios (
          vertical, sub_vertical, region, path_type, expected_outcome, hash,
          entry_intent, buyer_bot_id, success_condition,
          company_profile, contact_profile, signal_context, scenario_data
        ) VALUES (
          'banking', 'employee_banking', 'UAE', 'GOLDEN', 'PASS', $1,
          'pre-entry-discovery', $2, 'next_step_committed',
          $3, $4, $5, $6
        )
      `, [
        `pre-entry-golden-${order}-${Date.now()}`,
        buyerBotId,
        JSON.stringify(scenario.company),
        JSON.stringify(scenario.contact),
        JSON.stringify(scenario.signal),
        JSON.stringify({
          context: scenario.context,
          expected_decision: scenario.expected_decision,
          expected_reason: scenario.expected_reason,
          expected_persona: scenario.expected_persona,
          expected_timing: scenario.expected_timing,
        }),
      ]);
      console.log(`  ${order}. ${scenario.company.name} - ${scenario.signal.type}`);
      order++;
    }

    // Insert KILL scenarios
    console.log('\nInserting KILL scenarios (should NOT ENGAGE)...');
    for (const scenario of KILL_SCENARIOS) {
      await client.query(`
        INSERT INTO sales_bench.sales_scenarios (
          vertical, sub_vertical, region, path_type, expected_outcome, hash,
          entry_intent, buyer_bot_id, success_condition,
          company_profile, contact_profile, signal_context, scenario_data
        ) VALUES (
          'banking', 'employee_banking', 'UAE', 'KILL', 'BLOCK', $1,
          'pre-entry-discovery', $2, 'correct_refusal',
          $3, $4, $5, $6
        )
      `, [
        `pre-entry-kill-${order}-${Date.now()}`,
        buyerBotId,
        JSON.stringify(scenario.company),
        JSON.stringify(scenario.contact),
        JSON.stringify({ ...scenario.signal, blocker: scenario.blocker }),
        JSON.stringify({
          context: scenario.context,
          expected_decision: scenario.expected_decision,
          expected_reason: scenario.expected_reason,
          blocker: scenario.blocker,
        }),
      ]);
      console.log(`  ${order}. ${scenario.company.name} - ${scenario.blocker}`);
      order++;
    }

    // Update scenario count
    await client.query(`
      UPDATE sales_bench_suites SET scenario_count = $2 WHERE id = $1
    `, [suiteId, GOLDEN_SCENARIOS.length + KILL_SCENARIOS.length]);

    await client.query('COMMIT');

    console.log('\n' + '='.repeat(60));
    console.log('SUITE CREATED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`Suite ID: ${suiteId}`);
    console.log(`Total Scenarios: ${GOLDEN_SCENARIOS.length + KILL_SCENARIOS.length}`);
    console.log(`GOLDEN (should engage): ${GOLDEN_SCENARIOS.length}`);
    console.log(`KILL (should NOT engage): ${KILL_SCENARIOS.length}`);
    console.log('='.repeat(60));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to create suite:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createPreEntrySuite();
