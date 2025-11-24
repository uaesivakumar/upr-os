// routes/enrich/lib/person.js

const HR_RX = /(human\s*resources|hr|talent|recruit(ing|er)?|people ops?|people\s*(and)?\s*culture|payroll)/i;

// EXCLUSION PATTERNS - These roles should be filtered OUT entirely
const EXCLUDED_ROLES_RX = /\b(aftersales?|after[\s-]sales?|customer\s*service|client\s*service|retail|sales|business\s*development|marketing|product\s*manager|engineering|software|developer|analyst(?!\s*(hr|people))|data\s*scientist|designer|creative|content|social\s*media)\b/i;

// IT admin roles that should be EXCLUDED (Database Admin, System Admin, etc.)
const IT_ADMIN_RX = /\b(database|system|network|server|it|information\s+technology|infrastructure|security|cloud|devops|technical)\s+(admin|administrator)/i;

// Actual office/business admin roles
const ADMIN_RX = /\b(admin(?:istration)?(?:\s+(?:manager|officer|assistant|coordinator|specialist))?|office\s*manager|operations?\s+(?:manager|officer)|general\s*affairs|facilities)\b/i;

const FIN_RX = /\b(finance|account(s|ing)?|payroll|fp&a)\b/i;

export function roleBucket(title = "") {
  const t = (title || "").toLowerCase();

  // FIRST: Exclude non-HR business roles (Aftersales, Customer Service, Retail, Sales, etc.)
  if (EXCLUDED_ROLES_RX.test(t)) {
    return "excluded";
  }

  // SECOND: Exclude IT admin roles (Database Administrator, System Admin, etc.)
  if (IT_ADMIN_RX.test(t)) {
    return "other";
  }

  // THEN: Check for actual business roles we want
  if (HR_RX.test(t)) return "hr";
  if (ADMIN_RX.test(t)) return "admin";
  if (FIN_RX.test(t)) return "finance";
  return "other";
}

export function bucketSeniority(title = "") {
  const t = String(title).toLowerCase();
  if (/\b(c(h|e|f|i|o|t)o|chief)\b/i.test(t)) return 'c-level';
  if (/\b(svp|vp|vice president)\b/i.test(t)) return 'vp';
  if (/\b(director)\b/i.test(t)) return 'director';
  if (/\b(head)\b/i.test(t)) return 'head';
  if (/\b(manager|lead|supervisor)\b/i.test(t)) return 'manager';
  if (/\b(sr\.?|senior)\b/i.test(t)) return 'senior';
  if (/\b(specialist|executive|officer|coordinator|analyst|associate)\b/i.test(t)) return 'specialist';
  if (/\b(intern|junior|assistant)\b/i.test(t)) return 'junior';
  return "staff"; // Fallback for everything else
}

// --- LEAD CONVERSION SCORING LOGIC ---

/**
 * Calculate lead conversion likelihood score (0-100)
 *
 * ONBOARDING-FOCUSED Formula:
 * - Role Relevance: 40 points (onboarding/admin > HR management > general HR > recruitment)
 * - Seniority Match: 25 points (company-size dependent)
 * - Email Verification: 15 points
 * - LinkedIn: 10 points
 * - Data Completeness: 10 points
 *
 * BUSINESS CONTEXT:
 * User is POC for account opening services when companies hire new employees.
 * TARGET: People who ONBOARD and SET UP new employees (not recruiters).
 * HIGH VALUE: HR Admin, Payroll, Onboarding, Office Admin
 * LOW VALUE: Talent Acquisition, Recruiters (they hire but don't onboard)
 *
 * FILTERING: Leads scoring below 70% are NOT shown to users.
 *
 * @returns {{score: number, reasons: string[]}}
 */
export function calculateLeadScore(lead = {}, company = {}) {
    const reasons = [];
    let score = 0;

    const title = (lead.title || lead.designation || '').toLowerCase();
    const roleBucketValue = lead.role_bucket || roleBucket(lead.designation || lead.title);

    // Get company size for seniority scoring
    const companySize = company.employeeCount || company.size || 1000;

    // 1. ROLE RELEVANCE (40 points) - MOST IMPORTANT
    // Perfect match: Onboarding/Admin/Payroll roles (people who SET UP new employees)
    const onboardingKeywords = /onboarding|employee onboarding|new hire|hr admin|hr administrator|hr operations|payroll|compensation|benefits admin|office admin|admin assistant|executive assistant|benefits administrator|hr coordinator/i;

    // Strong match: General HR management
    const hrManagementKeywords = /hr manager|hr generalist|human resources manager|hr business partner|hrbp|employee relations|people manager|people operations/i;

    // Poor match: Talent Acquisition (they recruit, don't onboard)
    const recruitmentKeywords = /talent acquisition|recruiter|recruitment|talent scout|sourcer|recruiting|talent partner/i;

    let roleScore = 0;
    let roleLabel = '';

    if (onboardingKeywords.test(title)) {
        roleScore = 40;
        roleLabel = 'Onboarding/Admin role (Perfect match)';
    } else if (hrManagementKeywords.test(title)) {
        roleScore = 35;
        roleLabel = 'HR Management (Strong match)';
    } else if (roleBucketValue === 'hr') {
        roleScore = 20;
        roleLabel = 'General HR role';
    } else if (recruitmentKeywords.test(title)) {
        roleScore = 10;
        roleLabel = 'Recruitment role (Low priority)';
    } else if (roleBucketValue === 'finance' || /finance|accounting|payroll/i.test(title)) {
        roleScore = 25;
        roleLabel = 'Finance/Payroll role';
    } else if (roleBucketValue === 'admin') {
        roleScore = 20;
        roleLabel = 'Admin role';
    } else {
        roleScore = 5;
        roleLabel = 'Other role';
    }

    score += roleScore;
    reasons.push(roleLabel);

    // 2. SENIORITY MATCH (25 points) - Company-size dependent
    // Large companies: Too-senior people don't handle operational tasks
    // Small companies: Everyone does everything
    const seniority = lead.seniority || bucketSeniority(lead.designation || lead.title);

    let seniorityScore = 15; // Default
    let seniorityLabel = 'Unknown seniority';

    // Detect if executive/director level
    const isExecutive = /c-level/i.test(seniority) || /chief|cxo|president|vp/i.test(title);
    const isDirector = /director/i.test(seniority) || /director/i.test(title);
    const isManager = /manager/i.test(seniority) || /manager|lead/i.test(title);
    const isSpecialist = /specialist|coordinator|administrator|generalist|assistant|executive|officer/i.test(title);

    if (companySize >= 5000) {
        // Large company: Mid-level is best
        if (isManager || isSpecialist) {
            seniorityScore = 25;
            seniorityLabel = 'Manager/Specialist (Perfect for large company)';
        } else if (isDirector) {
            seniorityScore = 5;
            seniorityLabel = 'Director (Too senior for operational)';
        } else if (isExecutive) {
            seniorityScore = 0;
            seniorityLabel = 'Executive (Too senior)';
        } else {
            seniorityScore = 15;
            seniorityLabel = 'Staff level';
        }
    } else if (companySize >= 500) {
        // Medium company: Avoid only C-suite
        if (isManager || isSpecialist) {
            seniorityScore = 25;
            seniorityLabel = 'Manager/Specialist (Perfect)';
        } else if (isDirector) {
            seniorityScore = 10;
            seniorityLabel = 'Director (Acceptable)';
        } else if (isExecutive) {
            seniorityScore = 0;
            seniorityLabel = 'Executive (Too senior)';
        } else {
            seniorityScore = 20;
            seniorityLabel = 'Staff level';
        }
    } else {
        // Small company: All levels are hands-on
        seniorityScore = 25;
        seniorityLabel = 'Operational level';
    }

    score += seniorityScore;
    reasons.push(seniorityLabel);

    // 3. EMAIL VERIFICATION (15 points)
    const emailStatus = (lead.email_status || '').toLowerCase();
    let emailScore = 5;
    let emailLabel = 'Email available';

    if (emailStatus === 'validated' || emailStatus === 'valid' || emailStatus === 'verified') {
        emailScore = 15;
        emailLabel = 'Email verified';
    } else if (emailStatus === 'pattern' || emailStatus === 'patterned') {
        emailScore = 10;
        emailLabel = 'Pattern-based email';
    } else if (emailStatus === 'accept_all') {
        emailScore = 8;
        emailLabel = 'Catch-all domain';
    }

    score += emailScore;
    reasons.push(emailLabel);

    // 4. LINKEDIN AVAILABILITY (10 points)
    const linkedinUrl = lead.linkedin_url || lead.linkedinUrl;
    if (linkedinUrl && typeof linkedinUrl === 'string' && linkedinUrl.includes('linkedin.com')) {
        score += 7;
        reasons.push('LinkedIn profile found');
    } else {
        reasons.push('No LinkedIn');
    }

    // 5. DATA COMPLETENESS (10 points)
    let completenessScore = 0;
    if (lead.email) completenessScore += 3;
    if (linkedinUrl) completenessScore += 3;
    if (lead.designation || lead.title) completenessScore += 2;
    if (lead.phone) completenessScore += 2;

    score += completenessScore;
    if (completenessScore >= 8) {
        reasons.push('Complete data');
    } else {
        reasons.push('Partial data');
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    return { score: finalScore, reasons };
}

/**
 * This function is preserved for compatibility but now uses the new scoring engine.
 * @returns {number} Score between 0 and 1.
 */
export function calculatePreviewScore(lead = {}, company = {}) {
    const { score } = calculateLeadScore(lead, company);
    return score / 100;
}


export function finalizeScore(previewScore = 0.5, emailStatus) {
    let finalScore = previewScore;
    if (emailStatus === "validated" || emailStatus === "validated_user") {
        finalScore += 0.1;
    } else if (emailStatus === "accept_all") {
        finalScore += 0.02;
    }
    return Math.min(0.98, finalScore);
}

// --- EMAIL VERIFICATION LOGIC --- //

function mapNeverBounce(code) {
  switch (String(code).toLowerCase()) {
    case "valid": return { status: "validated" };
    case "catchall": case "accept_all": return { status: "accept_all" };
    case "unknown": return { status: "unknown" };
    case "invalid": return { status: "invalid" };
    case "disposable": return { status: "invalid", reason: "disposable" };
    case "do_not_mail": return { status: "invalid", reason: "do_not_mail" };
    default: return { status: "unknown" };
  }
}

function mapZeroBounce(code) {
  switch (String(code).toLowerCase()) {
    case "valid": return { status: "validated" };
    case "catch-all": case "unknown": case "accept_all": return { status: "accept_all" };
    case "invalid": return { status: "invalid" };
    default: return { status: "unknown" };
  }
}

export async function verifyEmail(email) {
  console.log(`[NeverBounce] 🔍 Testing email: ${email}`);

  if (process.env.NEVERBOUNCE_API_KEY) {
    try {
      const requestBody = {
        key: process.env.NEVERBOUNCE_API_KEY,
        email,
        address_info: 0,
        credits_info: 0
      };
      console.log(`[NeverBounce] 📤 Request body:`, JSON.stringify({ ...requestBody, key: '[REDACTED]' }));

      const resp = await fetch("https://api.neverbounce.com/v4/single/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      console.log(`[NeverBounce] 📥 HTTP Status: ${resp.status} ${resp.statusText}`);

      const data = await resp.json();
      console.log(`[NeverBounce] 📥 Response data:`, JSON.stringify(data));

      const rawResult = data?.result || data?.verification?.result;
      console.log(`[NeverBounce] 📊 Raw result code: "${rawResult}"`);

      const mappedResult = mapNeverBounce(rawResult);
      console.log(`[NeverBounce] ✅ Mapped to:`, JSON.stringify(mappedResult));

      return mappedResult;
    } catch (error) {
      console.error(`[NeverBounce] ❌ Error:`, error.message);
      return { status: "unknown", reason: "neverbounce_error" };
    }
  }

  if (process.env.ZEROBOUNCE_API_KEY) {
    try {
      const url = new URL("https://api.zerobounce.net/v2/validate");
      url.searchParams.set("api_key", process.env.ZEROBOUNCE_API_KEY);
      url.searchParams.set("email", email);
      const resp = await fetch(url.toString());
      const data = await resp.json();
      return mapZeroBounce(data?.status);
    } catch {
      return { status: "unknown", reason: "zerobounce_error" };
    }
  }

  console.log(`[NeverBounce] ⚠️  No verifier configured, testing with regex`);
  if (!/^\S+@\S+\.\S+$/.test(email)) return { status: "invalid", reason: "regex" };
  return { status: "unknown", reason: "no_verifier_configured" };
}


export default {
  roleBucket,
  bucketSeniority,
  calculateLeadScore,
  calculatePreviewScore,
  finalizeScore,
  verifyEmail,
};