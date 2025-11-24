// routes/enrich/lib/hunterReal.js
// Real Hunter.io Email Finder API Integration

const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const HUNTER_API_URL = 'https://api.hunter.io/v2';

/**
 * Find email using Hunter.io Email Finder API
 * Docs: https://hunter.io/api-documentation/v2#email-finder
 *
 * @param {Object} person - Person object with firstName, lastName, name
 * @param {string} domain - Company domain
 * @returns {Promise<Object>} - { email, confidence, sources, verification, found }
 */
export async function findEmailWithHunterReal(person, domain) {
  if (!HUNTER_API_KEY) {
    console.log('[hunter] HUNTER_API_KEY not configured, skipping');
    return { found: false, reason: 'no_api_key' };
  }

  // Parse name if not already split
  let firstName = person.firstName || person.first_name;
  let lastName = person.lastName || person.last_name;

  if (!firstName && person.name) {
    const nameParts = person.name.trim().split(/\s+/);
    firstName = nameParts[0];
    lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  }

  if (!firstName) {
    return { found: false, reason: 'no_name' };
  }

  try {
    console.log(`[hunter] Searching for ${firstName} ${lastName} at ${domain}`);

    const url = new URL(`${HUNTER_API_URL}/email-finder`);
    url.searchParams.append('domain', domain);
    url.searchParams.append('first_name', firstName);
    if (lastName) url.searchParams.append('last_name', lastName);
    url.searchParams.append('api_key', HUNTER_API_KEY);

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 401) {
        console.error('[hunter] Invalid API key');
        return { found: false, reason: 'invalid_api_key' };
      }
      if (response.status === 429) {
        console.warn('[hunter] Rate limit exceeded');
        return { found: false, reason: 'rate_limit' };
      }
      console.error('[hunter] API error:', response.status);
      return { found: false, reason: 'api_error' };
    }

    const data = await response.json();

    if (!data.data || !data.data.email) {
      console.log('[hunter] No email found');
      return {
        found: false,
        reason: 'not_found',
        pattern: data.data?.pattern || null,  // Hunter still returns pattern even if email not found
        confidence: data.data?.score || 0
      };
    }

    console.log(`[hunter] ✅ Found email: ${data.data.email} (score: ${data.data.score})`);

    return {
      found: true,
      email: data.data.email,
      confidence: data.data.score,  // 0-100
      firstName: data.data.first_name,
      lastName: data.data.last_name,
      position: data.data.position || null,
      pattern: data.data.pattern || null,  // e.g., "{first}.{last}"
      sources: data.data.sources || [],  // Array of sources where email was found
      verification: {
        date: data.data.verification?.date || null,
        status: data.data.verification?.status || 'unknown'  // valid, accept_all, unknown
      },
      // Additional metadata
      department: data.data.department || null,
      seniority: data.data.seniority || null,
      linkedin: data.data.linkedin || null,
      twitter: data.data.twitter || null
    };

  } catch (error) {
    console.error('[hunter] Error:', error.message);
    return { found: false, reason: 'exception', error: error.message };
  }
}

/**
 * Get email pattern for a domain using Hunter.io Domain Search
 * This is useful for bulk enrichment
 *
 * @param {string} domain - Company domain
 * @returns {Promise<Object>} - { pattern, confidence, acceptAll }
 */
export async function getDomainPatternFromHunter(domain) {
  if (!HUNTER_API_KEY) {
    return { found: false, reason: 'no_api_key' };
  }

  try {
    const url = new URL(`${HUNTER_API_URL}/domain-search`);
    url.searchParams.append('domain', domain);
    url.searchParams.append('limit', '10');  // Get 10 emails to infer pattern
    url.searchParams.append('api_key', HUNTER_API_KEY);

    const response = await fetch(url.toString());

    if (!response.ok) {
      return { found: false, reason: 'api_error' };
    }

    const data = await response.json();

    if (!data.data || !data.data.pattern) {
      return { found: false, reason: 'no_pattern' };
    }

    console.log(`[hunter] ✅ Domain pattern for ${domain}: ${data.data.pattern}`);

    return {
      found: true,
      pattern: data.data.pattern,  // e.g., "{first}.{last}"
      organization: data.data.organization,
      emails: data.data.emails.length,
      acceptAll: data.data.accept_all || false,
      // Sample emails for validation
      samples: data.data.emails.slice(0, 5).map(e => ({
        email: e.value,
        firstName: e.first_name,
        lastName: e.last_name,
        confidence: e.confidence
      }))
    };

  } catch (error) {
    console.error('[hunter] Domain search error:', error.message);
    return { found: false, reason: 'exception', error: error.message };
  }
}

/**
 * Verify email using Hunter.io Email Verifier
 * This is more accurate than NeverBounce for professional emails
 *
 * @param {string} email - Email to verify
 * @returns {Promise<Object>} - { status, score, result }
 */
export async function verifyEmailWithHunter(email) {
  if (!HUNTER_API_KEY) {
    return { verified: false, reason: 'no_api_key' };
  }

  try {
    const url = new URL(`${HUNTER_API_URL}/email-verifier`);
    url.searchParams.append('email', email);
    url.searchParams.append('api_key', HUNTER_API_KEY);

    const response = await fetch(url.toString());

    if (!response.ok) {
      return { verified: false, reason: 'api_error' };
    }

    const data = await response.json();

    return {
      verified: true,
      email: data.data.email,
      status: data.data.status,  // valid, invalid, accept_all, unknown, webmail
      score: data.data.score,  // 0-100
      result: data.data.result,  // deliverable, undeliverable, risky, unknown
      regexp: data.data.regexp,  // Does email match regex?
      gibberish: data.data.gibberish,  // Is email gibberish?
      disposable: data.data.disposable,  // Is it a disposable email?
      webmail: data.data.webmail,  // Is it a webmail (gmail, yahoo)?
      mx_records: data.data.mx_records,  // Does domain have MX records?
      smtp_server: data.data.smtp_server,  // Is SMTP server reachable?
      smtp_check: data.data.smtp_check,  // Did SMTP check pass?
      accept_all: data.data.accept_all,  // Is domain catch-all?
      block: data.data.block  // Is email blocked?
    };

  } catch (error) {
    console.error('[hunter] Email verification error:', error.message);
    return { verified: false, reason: 'exception', error: error.message };
  }
}

/**
 * Get Hunter.io account information (usage, limits, etc.)
 */
export async function getHunterAccountInfo() {
  if (!HUNTER_API_KEY) {
    return { error: 'no_api_key' };
  }

  try {
    const url = new URL(`${HUNTER_API_URL}/account`);
    url.searchParams.append('api_key', HUNTER_API_KEY);

    const response = await fetch(url.toString());
    const data = await response.json();

    return {
      email: data.data.email,
      firstName: data.data.first_name,
      lastName: data.data.last_name,
      plan: data.data.plan_name,
      planLevel: data.data.plan_level,
      // Usage limits
      requests: {
        used: data.data.requests.used,
        available: data.data.requests.available,
        limit: data.data.requests.limit
      },
      // Team info
      teamId: data.data.team_id,
      // Dates
      resetDate: data.data.reset_date
    };

  } catch (error) {
    return { error: error.message };
  }
}

export default {
  findEmailWithHunterReal,
  getDomainPatternFromHunter,
  verifyEmailWithHunter,
  getHunterAccountInfo
};
