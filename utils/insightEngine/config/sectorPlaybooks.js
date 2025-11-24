/**
 * Sector Intelligence Playbooks
 *
 * Strategic intelligence for each business sector:
 * - Decision-making culture
 * - Procurement processes
 * - Key pain points
 * - Sales cycle expectations
 * - Best practices
 */

export const SECTOR_PLAYBOOKS = {
  technology: {
    decisionCulture: 'Fast-moving, innovation-focused',
    averageSaleCycle: '2-4 months',
    keyPainPoints: ['Scaling quickly', 'Tech talent retention', 'Speed to market'],
    pitchEmphasis: ['API integration', 'Scalability', 'Developer experience'],
    pitchAvoid: ['Manual processes', 'Legacy systems'],
    decisionMakers: 'HR Ops + Engineering leadership (dual approval)',
    procurementStyle: 'Bottom-up: Specialists test, managers approve',
    culturalNotes: 'Tech companies value efficiency and automation. Show ROI in terms of developer time saved.',
    competitiveLandscape: 'High competition. Differentiate on integration speed and API quality.',
    bestPractice: 'Offer free pilot with their existing HR tech stack. Tech companies want to "try before buy".'
  },

  software: {
    decisionCulture: 'Fast-moving, innovation-focused',
    averageSaleCycle: '2-4 months',
    keyPainPoints: ['Scaling quickly', 'Tech talent retention', 'Speed to market'],
    pitchEmphasis: ['API integration', 'Scalability', 'Developer experience'],
    pitchAvoid: ['Manual processes', 'Legacy systems'],
    decisionMakers: 'HR Ops + Engineering leadership (dual approval)',
    procurementStyle: 'Bottom-up: Specialists test, managers approve',
    culturalNotes: 'Tech companies value efficiency and automation. Show ROI in terms of developer time saved.',
    competitiveLandscape: 'High competition. Differentiate on integration speed and API quality.',
    bestPractice: 'Offer free pilot with their existing HR tech stack. Tech companies want to "try before buy".'
  },

  healthcare: {
    decisionCulture: 'Compliance-first, risk-averse',
    averageSaleCycle: '6-9 months',
    keyPainPoints: ['Regulatory compliance', 'Data security', 'Credential verification'],
    pitchEmphasis: ['HIPAA/DHA compliance', 'Security certifications', 'Audit trails'],
    pitchAvoid: ['Cutting-edge tech', 'Move fast and break things', 'Beta features'],
    decisionMakers: 'HR Director + Compliance Officer + Legal (triple approval)',
    procurementStyle: 'Top-down with extensive vetting',
    culturalNotes: 'Healthcare prioritizes patient safety and compliance over speed. Use medical terminology, reference similar healthcare clients.',
    competitiveLandscape: 'Low competition due to compliance barriers. Emphasize your healthcare expertise.',
    bestPractice: 'Lead with compliance certifications and healthcare client logos. Offer compliance audit as part of onboarding.'
  },

  medical: {
    decisionCulture: 'Compliance-first, risk-averse',
    averageSaleCycle: '6-9 months',
    keyPainPoints: ['Regulatory compliance', 'Data security', 'Credential verification'],
    pitchEmphasis: ['HIPAA/DHA compliance', 'Security certifications', 'Audit trails'],
    pitchAvoid: ['Cutting-edge tech', 'Move fast and break things', 'Beta features'],
    decisionMakers: 'HR Director + Compliance Officer + Legal (triple approval)',
    procurementStyle: 'Top-down with extensive vetting',
    culturalNotes: 'Healthcare prioritizes patient safety and compliance over speed. Use medical terminology, reference similar healthcare clients.',
    competitiveLandscape: 'Low competition due to compliance barriers. Emphasize your healthcare expertise.',
    bestPractice: 'Lead with compliance certifications and healthcare client logos. Offer compliance audit as part of onboarding.'
  },

  finance: {
    decisionCulture: 'ROI-driven, process-oriented',
    averageSaleCycle: '4-6 months',
    keyPainPoints: ['Cost control', 'Audit compliance', 'Risk management'],
    pitchEmphasis: ['Cost per hire reduction', 'Audit readiness', 'Financial controls'],
    pitchAvoid: ['Experimental features', 'Unproven ROI'],
    decisionMakers: 'HR + Finance + Risk Management (CFO approval for >$50k)',
    procurementStyle: 'Business case driven with detailed ROI analysis',
    culturalNotes: 'Finance values numbers. Bring cost-benefit analysis, not feature lists. Show cost savings in first 90 days.',
    competitiveLandscape: 'Price-sensitive market. Win on ROI, not features.',
    bestPractice: 'Provide detailed ROI calculator. Finance teams want to see exact savings before committing.'
  },

  banking: {
    decisionCulture: 'ROI-driven, process-oriented',
    averageSaleCycle: '4-6 months',
    keyPainPoints: ['Cost control', 'Audit compliance', 'Risk management'],
    pitchEmphasis: ['Cost per hire reduction', 'Audit readiness', 'Financial controls'],
    pitchAvoid: ['Experimental features', 'Unproven ROI'],
    decisionMakers: 'HR + Finance + Risk Management (CFO approval for >$50k)',
    procurementStyle: 'Business case driven with detailed ROI analysis',
    culturalNotes: 'Finance values numbers. Bring cost-benefit analysis, not feature lists. Show cost savings in first 90 days.',
    competitiveLandscape: 'Price-sensitive market. Win on ROI, not features.',
    bestPractice: 'Provide detailed ROI calculator. Finance teams want to see exact savings before committing.'
  },

  government: {
    decisionCulture: 'Bureaucratic, policy-driven',
    averageSaleCycle: '9-18 months',
    keyPainPoints: ['Procurement regulations', 'National priorities', 'Transparency'],
    pitchEmphasis: ['Government compliance', 'Local presence', 'National strategy alignment'],
    pitchAvoid: ['Foreign-only solutions', 'Rapid change', 'Unproven vendors'],
    decisionMakers: 'Multiple layers: Department head → Director → Board → Minister (in some cases)',
    procurementStyle: 'Formal tender process, often requires local partner',
    culturalNotes: 'Government entities move slowly but contracts are large and stable. Reference national development goals (UAE Vision 2030, AI strategy, etc.). Local presence and Arabic support are huge advantages.',
    competitiveLandscape: 'Relationship-driven. Warm intros from existing government clients are critical.',
    bestPractice: 'DO NOT cold call government entities in UAE. Always get warm introduction. Reference national AI/digital transformation strategies.'
  },

  energy: {
    decisionCulture: 'Project-based, operational excellence',
    averageSaleCycle: '6-12 months',
    keyPainPoints: ['Project staffing', 'Safety compliance', 'Remote workforce'],
    pitchEmphasis: ['Bulk onboarding', 'Safety certifications', 'Project timeline alignment'],
    pitchAvoid: ['Consumer-grade tools', 'Small-scale solutions'],
    decisionMakers: 'HR + Operations + Project Management (project-based approval)',
    procurementStyle: 'Tied to project cycles, vendor must align with project timelines',
    culturalNotes: 'Energy sector hires in waves tied to project milestones. Position as project partner, not HR vendor.',
    competitiveLandscape: 'Relationship-driven. Incumbent advantage is strong.',
    bestPractice: 'Ask about upcoming projects FIRST. If no projects in pipeline, revisit in 6 months. Energy companies only buy when they have a project.'
  },

  oil: {
    decisionCulture: 'Project-based, operational excellence',
    averageSaleCycle: '6-12 months',
    keyPainPoints: ['Project staffing', 'Safety compliance', 'Remote workforce'],
    pitchEmphasis: ['Bulk onboarding', 'Safety certifications', 'Project timeline alignment'],
    pitchAvoid: ['Consumer-grade tools', 'Small-scale solutions'],
    decisionMakers: 'HR + Operations + Project Management (project-based approval)',
    procurementStyle: 'Tied to project cycles, vendor must align with project timelines',
    culturalNotes: 'Energy sector hires in waves tied to project milestones. Position as project partner, not HR vendor.',
    competitiveLandscape: 'Relationship-driven. Incumbent advantage is strong.',
    bestPractice: 'Ask about upcoming projects FIRST. If no projects in pipeline, revisit in 6 months. Energy companies only buy when they have a project.'
  },

  hospitality: {
    decisionCulture: 'Service-oriented, seasonal',
    averageSaleCycle: '3-5 months',
    keyPainPoints: ['High turnover', 'Seasonal hiring', 'Multi-location coordination'],
    pitchEmphasis: ['Speed of onboarding', 'Multi-location support', 'Seasonal flexibility'],
    pitchAvoid: ['Long implementation', 'Complex processes'],
    decisionMakers: 'HR Manager + Operations Manager (dual approval)',
    procurementStyle: 'Fast decisions during peak hiring seasons',
    culturalNotes: 'Hospitality has tight margins and high turnover. They value speed and simplicity over sophisticated features.',
    competitiveLandscape: 'Price-sensitive. Win on speed and ease of use.',
    bestPractice: 'Time your outreach to pre-season (Oct-Nov for winter season, Mar-Apr for summer). They buy when they need to hire NOW.'
  },

  tourism: {
    decisionCulture: 'Service-oriented, seasonal',
    averageSaleCycle: '3-5 months',
    keyPainPoints: ['High turnover', 'Seasonal hiring', 'Multi-location coordination'],
    pitchEmphasis: ['Speed of onboarding', 'Multi-location support', 'Seasonal flexibility'],
    pitchAvoid: ['Long implementation', 'Complex processes'],
    decisionMakers: 'HR Manager + Operations Manager (dual approval)',
    procurementStyle: 'Fast decisions during peak hiring seasons',
    culturalNotes: 'Hospitality has tight margins and high turnover. They value speed and simplicity over sophisticated features.',
    competitiveLandscape: 'Price-sensitive. Win on speed and ease of use.',
    bestPractice: 'Time your outreach to pre-season (Oct-Nov for winter season, Mar-Apr for summer). They buy when they need to hire NOW.'
  },

  fashion: {
    decisionCulture: 'Brand-conscious, aesthetic-driven',
    averageSaleCycle: '3-6 months',
    keyPainPoints: ['Seasonal hiring', 'Brand alignment', 'Retail turnover'],
    pitchEmphasis: ['Brand experience', 'Visual appeal', 'Retail-specific features'],
    pitchAvoid: ['Generic enterprise tools', 'Ugly interfaces'],
    decisionMakers: 'HR + Brand/Marketing (brand alignment check)',
    procurementStyle: 'Influenced by brand perception and user experience',
    culturalNotes: 'Fashion brands care deeply about aesthetics and brand alignment. Your platform UI matters. They want tools that reflect their brand values.',
    competitiveLandscape: 'Relationship and brand-driven. Luxury brands only work with premium-positioned vendors.',
    bestPractice: 'Emphasize your platform design and UX. Show how your tool aligns with their brand premium positioning.'
  },

  luxury: {
    decisionCulture: 'Brand-conscious, aesthetic-driven',
    averageSaleCycle: '3-6 months',
    keyPainPoints: ['Seasonal hiring', 'Brand alignment', 'Retail turnover'],
    pitchEmphasis: ['Brand experience', 'Visual appeal', 'Retail-specific features'],
    pitchAvoid: ['Generic enterprise tools', 'Ugly interfaces'],
    decisionMakers: 'HR + Brand/Marketing (brand alignment check)',
    procurementStyle: 'Influenced by brand perception and user experience',
    culturalNotes: 'Fashion brands care deeply about aesthetics and brand alignment. Your platform UI matters. They want tools that reflect their brand values.',
    competitiveLandscape: 'Relationship and brand-driven. Luxury brands only work with premium-positioned vendors.',
    bestPractice: 'Emphasize your platform design and UX. Show how your tool aligns with their brand premium positioning.'
  },

  manufacturing: {
    decisionCulture: 'Efficiency-focused, operational',
    averageSaleCycle: '4-8 months',
    keyPainPoints: ['Workforce scaling', 'Compliance', 'Cost per hire'],
    pitchEmphasis: ['Bulk processing', 'Efficiency metrics', 'Cost reduction'],
    pitchAvoid: ['Consumer features', 'Aesthetics over function'],
    decisionMakers: 'HR + Operations + Plant Manager',
    procurementStyle: 'ROI-driven with operational involvement',
    culturalNotes: 'Manufacturing values operational efficiency. Speak in terms of throughput, cycle time, cost per hire.',
    competitiveLandscape: 'Efficiency-driven. Win on cost and speed.',
    bestPractice: 'Offer time-motion study of current onboarding process. Manufacturing leaders love process optimization.'
  },

  industrial: {
    decisionCulture: 'Efficiency-focused, operational',
    averageSaleCycle: '4-8 months',
    keyPainPoints: ['Workforce scaling', 'Compliance', 'Cost per hire'],
    pitchEmphasis: ['Bulk processing', 'Efficiency metrics', 'Cost reduction'],
    pitchAvoid: ['Consumer features', 'Aesthetics over function'],
    decisionMakers: 'HR + Operations + Plant Manager',
    procurementStyle: 'ROI-driven with operational involvement',
    culturalNotes: 'Manufacturing values operational efficiency. Speak in terms of throughput, cycle time, cost per hire.',
    competitiveLandscape: 'Efficiency-driven. Win on cost and speed.',
    bestPractice: 'Offer time-motion study of current onboarding process. Manufacturing leaders love process optimization.'
  },

  automotive: {
    decisionCulture: 'Quality-focused, process-driven',
    averageSaleCycle: '5-8 months',
    keyPainPoints: ['Technical skills verification', 'Safety compliance', 'Global standards'],
    pitchEmphasis: ['Credential verification', 'Safety training tracking', 'Quality assurance'],
    pitchAvoid: ['Speed over quality', 'Shortcuts'],
    decisionMakers: 'HR + Quality Assurance + Operations',
    procurementStyle: 'Vendor qualification process similar to supplier onboarding',
    culturalNotes: 'Automotive industry treats HR vendors like manufacturing suppliers. Expect extensive vetting and quality audits.',
    competitiveLandscape: 'Quality-driven. Win on process excellence and certification.',
    bestPractice: 'Position as quality partner, not speed vendor. Automotive companies will put you through supplier audit process.'
  },

  'human resources': {
    decisionCulture: 'Service-oriented, relationship-driven',
    averageSaleCycle: '3-5 months',
    keyPainPoints: ['Client acquisition', 'Candidate sourcing', 'Operational efficiency'],
    pitchEmphasis: ['Time savings', 'Quality of candidates', 'Industry expertise'],
    pitchAvoid: ['Replacing their service', 'Direct competition'],
    decisionMakers: 'Founder/CEO + Operations Manager',
    procurementStyle: 'Fast decision if clear ROI shown',
    culturalNotes: 'HR/Recruitment firms understand hiring pain points intimately. Position as complementary tool, not replacement. They value speed and efficiency.',
    competitiveLandscape: 'Partnership-focused. Win by showing how you make THEM more efficient.',
    bestPractice: 'Demo how your platform saves them 2-3 hours per client onboarding. Speak their language (ATS, candidate pipeline, etc.).'
  },

  recruitment: {
    decisionCulture: 'Fast-moving, ROI-focused',
    averageSaleCycle: '2-4 months',
    keyPainPoints: ['Client onboarding speed', 'Candidate experience', 'Operational overhead'],
    pitchEmphasis: ['Faster client onboarding', 'Better candidate experience', 'Automation'],
    pitchAvoid: ['Disrupting their model', 'Replacing recruiters'],
    decisionMakers: 'Operations Manager + CEO (for small firms)',
    procurementStyle: 'Trial-based, show value quickly',
    culturalNotes: 'Recruitment firms are time-starved. Show immediate time savings. Use their terminology (bench, placement, ATS).',
    competitiveLandscape: 'Win on speed and user experience.',
    bestPractice: 'Offer free trial for 2-3 client onboardings. Let them experience value firsthand.'
  },

  consulting: {
    decisionCulture: 'Analytical, process-driven',
    averageSaleCycle: '4-6 months',
    keyPainPoints: ['Project staffing', 'Consultant onboarding', 'Compliance'],
    pitchEmphasis: ['Rapid scaling', 'Compliance automation', 'Project-based workflows'],
    pitchAvoid: ['One-size-fits-all', 'Consumer-grade tools'],
    decisionMakers: 'HR + Operations + Partner approval',
    procurementStyle: 'Business case with ROI analysis',
    culturalNotes: 'Consultants value efficiency and professionalism. Emphasize project-based workflows and rapid consultant onboarding.',
    competitiveLandscape: 'Enterprise-focused. Win on sophistication and integration.',
    bestPractice: 'Case study from similar consulting firm showing 50% faster consultant onboarding.'
  },

  retail: {
    decisionCulture: 'Fast-paced, high-volume',
    averageSaleCycle: '3-5 months',
    keyPainPoints: ['High turnover', 'Seasonal hiring', 'Multi-location coordination'],
    pitchEmphasis: ['Bulk onboarding', 'Mobile-first', 'Multi-location support'],
    pitchAvoid: ['Complex features', 'Long implementation'],
    decisionMakers: 'HR Manager + Regional Manager',
    procurementStyle: 'Price-sensitive, seasonal buying cycles',
    culturalNotes: 'Retail has razor-thin margins. Emphasize cost per hire reduction and speed. They hire in waves.',
    competitiveLandscape: 'Price-driven. Win on ease of use and speed.',
    bestPractice: 'Time outreach to pre-season (Sep-Oct for holiday, Mar-Apr for summer).'
  },

  'real estate': {
    decisionCulture: 'Relationship-driven, brand-conscious',
    averageSaleCycle: '4-6 months',
    keyPainPoints: ['Agent onboarding', 'Licensing compliance', 'Brand consistency'],
    pitchEmphasis: ['Agent onboarding speed', 'Compliance tracking', 'Brand experience'],
    pitchAvoid: ['Generic tools', 'Poor UX'],
    decisionMakers: 'HR + Brokerage Manager',
    procurementStyle: 'Brand alignment check required',
    culturalNotes: 'Real estate values brand and relationships. Premium positioning works. Emphasize agent experience.',
    competitiveLandscape: 'Relationship-driven. Win on brand alignment and agent experience.',
    bestPractice: 'Show how premium experience attracts better agents (agents are their customers).'
  },

  default: {
    decisionCulture: 'Varies by organization',
    averageSaleCycle: '4-6 months',
    keyPainPoints: ['Efficiency', 'Cost', 'Compliance'],
    pitchEmphasis: ['ROI', 'Ease of use', 'Support'],
    pitchAvoid: ['Over-promising', 'Complexity'],
    decisionMakers: 'HR leadership with finance approval',
    procurementStyle: 'Standard vendor evaluation',
    culturalNotes: 'Research the specific company culture and industry before outreach.',
    competitiveLandscape: 'Relationship and value-driven.',
    bestPractice: 'Lead with customer testimonials and case studies from similar companies.'
  }
};

/**
 * Get sector playbook with fuzzy matching
 * @param {string} sector - Company sector
 * @param {string} industry - Company industry (fallback)
 * @returns {object} Sector playbook
 */
export function getSectorPlaybook(sector, industry) {
  // Normalize input (lowercase, trim)
  const normalized = (sector || industry || '').toLowerCase().trim();

  if (!normalized) {
    console.warn('[getSectorPlaybook] No sector/industry provided -> using default');
    return SECTOR_PLAYBOOKS.default;
  }

  // Direct match (exact key)
  if (SECTOR_PLAYBOOKS[normalized]) {
    console.log(`[getSectorPlaybook] Direct match: "${normalized}"`);
    return SECTOR_PLAYBOOKS[normalized];
  }

  // Keyword mapping (common aliases)
  const keywords = {
    'hr': 'human resources',
    'staffing': 'recruitment',
    'talent': 'recruitment',
    'recruiting': 'recruitment',
    'outsourcing': 'recruitment',
    'advisory': 'consulting',
    'professional services': 'consulting',
    'store': 'retail',
    'shop': 'retail',
    'ecommerce': 'retail',
    'property': 'real estate',
    'estate': 'real estate',
    'realty': 'real estate',
    'oil': 'energy',
    'gas': 'energy',
    'petroleum': 'energy',
    'renewable': 'energy',
    'hospital': 'healthcare',
    'medical': 'healthcare',
    'pharma': 'healthcare',
    'clinic': 'healthcare',
    'bank': 'finance',
    'investment': 'finance',
    'financial': 'finance',
    'fintech': 'finance',
    'hotel': 'hospitality',
    'restaurant': 'hospitality',
    'tourism': 'hospitality',
    'travel': 'hospitality',
    'software': 'technology',
    'saas': 'technology',
    'tech': 'technology',
    'it ': 'technology',
    'auto': 'automotive',
    'vehicle': 'automotive',
    'car': 'automotive'
  };

  // Check keywords
  for (const [keyword, sector] of Object.entries(keywords)) {
    if (normalized.includes(keyword) && SECTOR_PLAYBOOKS[sector]) {
      console.log(`[getSectorPlaybook] Keyword match: "${keyword}" -> "${sector}"`);
      return SECTOR_PLAYBOOKS[sector];
    }
  }

  // Partial match (substring in either direction)
  for (const [key, playbook] of Object.entries(SECTOR_PLAYBOOKS)) {
    if (key === 'default') continue;

    if (normalized.includes(key) || key.includes(normalized)) {
      console.log(`[getSectorPlaybook] Partial match: "${normalized}" <-> "${key}"`);
      return playbook;
    }
  }

  // Fallback
  console.warn(`[getSectorPlaybook] No match for: "${normalized}" -> using default`);
  return SECTOR_PLAYBOOKS.default;
}
