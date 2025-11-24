// utils/insightEngine/scoring/leadScoring.js
/**
 * Lead Scoring System for UPR
 * Scores leads 0-100 based on relevance for onboarding/account opening services
 *
 * CRITICAL: This scoring methodology is UPR's competitive advantage.
 * The algorithm is NOT revealed to users - they see results only.
 *
 * Only leads scoring 70+ are shown to users.
 *
 * Scoring Factors:
 * - Role Relevance: 40 points (onboarding > HR management > general HR > recruitment)
 * - Seniority Match: 25 points (company-size dependent)
 * - Email Verification: 15 points
 * - LinkedIn Availability: 10 points
 * - Data Completeness: 10 points
 */

/**
 * Main scoring function
 * @param {Object} lead - Lead object with title, department, emailStatus, etc.
 * @param {Number} companySize - Company employee count
 * @returns {Number} Score from 0-100
 */
export function calculateLeadScore(lead, companySize = 1000) {
  let score = 0;

  // 1. Role Relevance (40 points) - MOST IMPORTANT
  score += getRoleRelevanceScore(lead.designation || lead.title, lead.role_bucket);

  // 2. Seniority Match (25 points) - Company-size dependent
  score += getSeniorityScore(lead.designation || lead.title, lead.seniority, companySize);

  // 3. Email Verification (15 points)
  score += getEmailScore(lead.email_status || lead.emailStatus);

  // 4. LinkedIn Availability (10 points)
  score += getLinkedInScore(lead.linkedin_url || lead.linkedinUrl);

  // 5. Data Completeness (10 points)
  score += getCompletenessScore(lead);

  return Math.round(score);
}

/**
 * Score based on role relevance to onboarding/account opening
 * Target: HR Admin, Payroll, Onboarding, Office Admin (people who set up new employees)
 * Avoid: Talent Acquisition, Recruiters (they hire but don't onboard)
 */
function getRoleRelevanceScore(title, roleBucket) {
  if (!title) return 0;

  const titleLower = title.toLowerCase();

  // CRITICAL: Filter out Sales/Business Development roles (0 points = will be filtered at 70% threshold)
  // Sales roles are NOT relevant for account opening/onboarding services
  const salesKeywords = [
    'sales', 'business development', 'account executive',
    'account manager', 'sales manager', 'business development manager',
    'sales director', 'key account', 'commercial', 'revenue',
    'sales representative', 'sales associate', 'inside sales',
    'outside sales', 'field sales', 'regional sales', 'vp sales',
    'chief revenue', 'cro', 'head of sales'
  ];

  for (const keyword of salesKeywords) {
    if (titleLower.includes(keyword)) {
      return 0;  // ZERO points - will result in <70% score and get filtered
    }
  }

  // Perfect match: Onboarding/Admin/Payroll roles (40 points)
  // These are the EXACT people who handle account opening for new employees
  const onboardingKeywords = [
    'onboarding', 'employee onboarding', 'new hire',
    'hr admin', 'hr administrator', 'hr operations',
    'payroll', 'compensation', 'benefits admin',
    'office admin', 'admin assistant', 'executive assistant',
    'benefits administrator', 'hr coordinator'
  ];

  for (const keyword of onboardingKeywords) {
    if (titleLower.includes(keyword)) {
      return 40;
    }
  }

  // Strong match: General HR management (35 points)
  // These people often oversee onboarding processes
  const hrManagementKeywords = [
    'hr manager', 'hr generalist', 'human resources manager',
    'hr business partner', 'hrbp', 'employee relations',
    'people manager', 'people operations'
  ];

  for (const keyword of hrManagementKeywords) {
    if (titleLower.includes(keyword)) {
      return 35;
    }
  }

  // Acceptable: General HR (20 points)
  // In HR but not specific onboarding role
  if (roleBucket === 'hr' || titleLower.includes('human resources') || titleLower.includes(' hr ')) {
    return 20;
  }

  // Poor match: Talent Acquisition (10 points)
  // They recruit but DON'T handle onboarding/account setup
  const recruitmentKeywords = [
    'talent acquisition', 'recruiter', 'recruitment',
    'talent scout', 'sourcer', 'recruiting', 'talent partner'
  ];

  for (const keyword of recruitmentKeywords) {
    if (titleLower.includes(keyword)) {
      return 10;
    }
  }

  // No match - non-HR role
  return 0;
}

/**
 * Score based on seniority level matching company size
 * Large companies: Too-senior people don't handle operational tasks
 * Small companies: Everyone does everything
 */
function getSeniorityScore(title, seniority, companySize) {
  if (!title) return 15; // Default mid-range

  const titleLower = title.toLowerCase();

  // Detect seniority from title
  const isExecutive = /chief|cxo|head of company|vp|vice president|president/i.test(title);
  const isDirector = /director|dir\b/i.test(title) && !/director.*admin|director.*payroll/i.test(title);
  const isManager = /manager|lead\b/i.test(title);
  const isSpecialist = /specialist|coordinator|administrator|generalist|assistant|executive|officer/i.test(title);

  // Large companies (5000+): Mid-level is best
  // C-suite and Directors don't handle operational onboarding
  if (companySize >= 5000) {
    if (isManager || isSpecialist) return 25;  // Perfect - hands-on operational level
    if (isDirector) return 5;  // Too senior for day-to-day onboarding
    if (isExecutive) return 0;  // Way too senior
    return 15;  // Other/unclear
  }

  // Medium companies (500-5000): Avoid only C-suite
  // Directors might still be operational
  if (companySize >= 500) {
    if (isManager || isSpecialist) return 25;  // Perfect
    if (isDirector) return 10;  // Acceptable but not ideal
    if (isExecutive) return 0;  // Too senior
    return 20;  // Other
  }

  // Small companies (<500): All levels handle everything
  // Even directors and VPs are hands-on
  return 25;  // Everyone is operational in small companies
}

/**
 * Score based on email verification status
 */
function getEmailScore(emailStatus) {
  if (!emailStatus) return 5; // Default for having an email

  const status = emailStatus.toLowerCase();
  if (status === 'verified' || status === 'valid') return 15;
  if (status === 'pattern' || status === 'patterned') return 10;
  if (status === 'accept_all') return 8;
  return 5;
}

/**
 * Score based on LinkedIn availability
 */
function getLinkedInScore(linkedinUrl) {
  if (!linkedinUrl) return 0;

  // Check if URL is valid (not empty string, not "null", etc.)
  if (typeof linkedinUrl !== 'string' || linkedinUrl.length < 10) return 0;

  // Basic validation: should contain linkedin.com
  if (linkedinUrl.includes('linkedin.com')) {
    return 7;  // For now, just check if URL exists
    // In Phase 2, we'll check activity level (posts, updates, etc.)
  }

  return 0;
}

/**
 * Score based on data completeness
 */
function getCompletenessScore(lead) {
  let score = 0;

  // Email is most important for outreach
  if (lead.email) score += 3;

  // LinkedIn for alternative outreach
  if (lead.linkedin_url || lead.linkedinUrl) score += 3;

  // Title helps us understand their role
  if (lead.designation || lead.title) score += 2;

  // Phone is nice to have
  if (lead.phone) score += 2;

  return score;
}

/**
 * Get score category for display
 * @param {Number} score - Score from 0-100
 * @returns {Object} Category with label and color
 */
export function getScoreCategory(score) {
  if (score >= 85) return { label: 'Top Lead', color: 'green', priority: 1 };
  if (score >= 70) return { label: 'Good Lead', color: 'blue', priority: 2 };
  return { label: 'Low Quality', color: 'gray', priority: 3 }; // These get filtered out
}

/**
 * Filter leads to only show high-quality ones (70+)
 * @param {Array} leads - Array of lead objects
 * @param {Number} companySize - Company employee count
 * @returns {Array} Filtered and sorted leads
 */
export function filterAndScoreLeads(leads, companySize = 1000) {
  // Score all leads
  const scoredLeads = leads.map(lead => {
    const score = calculateLeadScore(lead, companySize);
    const category = getScoreCategory(score);

    return {
      ...lead,
      leadScore: score,
      scoreCategory: category.label,
      scorePriority: category.priority
    };
  });

  // Filter out low-quality leads (below 70%)
  const qualityLeads = scoredLeads.filter(lead => lead.leadScore >= 70);

  // Sort by score (highest first)
  qualityLeads.sort((a, b) => b.leadScore - a.leadScore);

  // Log statistics
  const stats = {
    total: leads.length,
    shown: qualityLeads.length,
    filtered: leads.length - qualityLeads.length,
    topLeads: qualityLeads.filter(l => l.leadScore >= 85).length,
    goodLeads: qualityLeads.filter(l => l.leadScore >= 70 && l.leadScore < 85).length
  };

  console.log(`[Lead Scoring] Total: ${stats.total}, Shown: ${stats.shown} (${stats.topLeads} top, ${stats.goodLeads} good), Filtered: ${stats.filtered}`);

  return qualityLeads;
}

// For testing
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 Testing Lead Scoring System\n');
  console.log('=' .repeat(60));

  // Test case 1: Perfect onboarding role
  console.log('\n📊 Test 1: HR Administrator at large company (5000+ employees)');
  const score1 = calculateLeadScore({
    title: 'HR Administrator',
    role_bucket: 'hr',
    email_status: 'verified',
    linkedin_url: 'https://linkedin.com/in/someone',
    email: 'test@company.com'
  }, 5000);
  console.log(`Score: ${score1}/100 (Expected: 85-95)`);
  console.log(`Category: ${getScoreCategory(score1).label}`);

  // Test case 2: Talent Acquisition (should score low)
  console.log('\n📊 Test 2: Talent Acquisition Manager (should be filtered)');
  const score2 = calculateLeadScore({
    title: 'Talent Acquisition Manager',
    role_bucket: 'hr',
    email_status: 'pattern',
    linkedin_url: null,
    email: 'test@company.com'
  }, 5000);
  console.log(`Score: ${score2}/100 (Expected: <70, will be filtered)`);
  console.log(`Category: ${getScoreCategory(score2).label}`);
  console.log(`Will show to user: ${score2 >= 70 ? 'YES' : 'NO ❌'}`);

  // Test case 3: HR Manager at small company
  console.log('\n📊 Test 3: HR Manager at small company (200 employees)');
  const score3 = calculateLeadScore({
    title: 'HR Manager',
    role_bucket: 'hr',
    email_status: 'verified',
    linkedin_url: 'https://linkedin.com/in/someone',
    email: 'test@company.com',
    phone: '+971...'
  }, 200);
  console.log(`Score: ${score3}/100 (Expected: 90+)`);
  console.log(`Category: ${getScoreCategory(score3).label}`);

  // Test case 4: Payroll Specialist (perfect match)
  console.log('\n📊 Test 4: Payroll Specialist (perfect onboarding role)');
  const score4 = calculateLeadScore({
    title: 'Payroll Specialist',
    role_bucket: 'hr',
    email_status: 'verified',
    linkedin_url: 'https://linkedin.com/in/someone',
    email: 'test@company.com',
    phone: '+971...'
  }, 1000);
  console.log(`Score: ${score4}/100 (Expected: 95+)`);
  console.log(`Category: ${getScoreCategory(score4).label}`);

  // Test case 5: Director at large company (too senior)
  console.log('\n📊 Test 5: HR Director at large company (too senior for operational)');
  const score5 = calculateLeadScore({
    title: 'HR Director',
    role_bucket: 'hr',
    email_status: 'verified',
    linkedin_url: 'https://linkedin.com/in/someone',
    email: 'test@company.com'
  }, 8000);
  console.log(`Score: ${score5}/100 (Expected: 55-65, might be filtered)`);
  console.log(`Category: ${getScoreCategory(score5).label}`);
  console.log(`Will show to user: ${score5 >= 70 ? 'YES' : 'NO ❌'}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Lead scoring system initialized successfully!\n');
}
