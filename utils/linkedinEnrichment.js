// utils/linkedinEnrichment.js
// Using native fetch (Node.js 18+)

/**
 * Find LinkedIn company URL for a given company
 * Uses SerpAPI search with fallback to constructed URL
 *
 * @param {string} companyName - Company name
 * @param {string} domain - Company domain (optional)
 * @returns {Promise<string|null>} LinkedIn URL or null if not found
 */
// Known company LinkedIn URLs (fallback for major companies)
const KNOWN_LINKEDIN_URLS = {
  // Consulting & Professional Services
  'capgemini': 'https://www.linkedin.com/company/capgemini',
  'accenture': 'https://www.linkedin.com/company/accenture',
  'deloitte': 'https://www.linkedin.com/company/deloitte',
  'pwc': 'https://www.linkedin.com/company/pwc',
  'kpmg': 'https://www.linkedin.com/company/kpmg',
  'ey': 'https://www.linkedin.com/company/ey',
  'mckinsey': 'https://www.linkedin.com/company/mckinsey',
  'bain': 'https://www.linkedin.com/company/bain-and-company',
  'bcg': 'https://www.linkedin.com/company/boston-consulting-group',

  // Financial Services & Banks
  'jpmorgan': 'https://www.linkedin.com/company/jpmorgan',
  'jpmorganchase': 'https://www.linkedin.com/company/jpmorganchase',
  'goldmansachs': 'https://www.linkedin.com/company/goldman-sachs',
  'morganstanley': 'https://www.linkedin.com/company/morgan-stanley',
  'bankofamerica': 'https://www.linkedin.com/company/bank-of-america',
  'citigroup': 'https://www.linkedin.com/company/citi',
  'citi': 'https://www.linkedin.com/company/citi',
  'wellsfargo': 'https://www.linkedin.com/company/wellsfargo',
  'hsbc': 'https://www.linkedin.com/company/hsbc',
  'barclays': 'https://www.linkedin.com/company/barclays',
  'deutschebank': 'https://www.linkedin.com/company/deutsche-bank',
  'ubs': 'https://www.linkedin.com/company/ubs',
  'creditsuisse': 'https://www.linkedin.com/company/credit-suisse',

  // Technology
  'microsoft': 'https://www.linkedin.com/company/microsoft',
  'google': 'https://www.linkedin.com/company/google',
  'meta': 'https://www.linkedin.com/company/meta',
  'facebook': 'https://www.linkedin.com/company/facebook',
  'amazon': 'https://www.linkedin.com/company/amazon',
  'apple': 'https://www.linkedin.com/company/apple',
  'netflix': 'https://www.linkedin.com/company/netflix',
  'salesforce': 'https://www.linkedin.com/company/salesforce',
  'oracle': 'https://www.linkedin.com/company/oracle',
  'ibm': 'https://www.linkedin.com/company/ibm',

  // Retail & Consumer
  'chanel': 'https://www.linkedin.com/company/chanel',
  'sephora': 'https://www.linkedin.com/company/sephora',
  'dior': 'https://www.linkedin.com/company/dior',
  'beside': 'https://www.linkedin.com/company/besidegroup',
  'besidegroup': 'https://www.linkedin.com/company/besidegroup',
  'keeta': 'https://www.linkedin.com/company/keeta',
};

async function findLinkedInURL(companyName, domain = null) {
  console.log(`[LinkedIn/DEBUG] 🔍 findLinkedInURL() CALLED for: "${companyName}" (domain: ${domain})`);

  if (!companyName) {
    console.warn('[LinkedIn/DEBUG] ❌ No company name provided, returning null');
    return null;
  }

  try {
    // FIRST: Check known company URLs (fastest, most reliable)
    const companyKey = companyName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    console.log(`[LinkedIn/DEBUG] Checking known URLs for key: "${companyKey}"`);
    if (KNOWN_LINKEDIN_URLS[companyKey]) {
      console.log(`[LinkedIn] Using known URL for ${companyName}`);
      console.log(`[LinkedIn/DEBUG] ✅ Known URL found: ${KNOWN_LINKEDIN_URLS[companyKey]}`);
      return KNOWN_LINKEDIN_URLS[companyKey];
    }
    console.log(`[LinkedIn/DEBUG] No known URL found for "${companyKey}"`)

    // SECOND: Try dual-purpose SerpAPI search if API key is available
    // This gets BOTH LinkedIn URL AND email pattern in one query (cost-effective!)
    console.log(`[LinkedIn/DEBUG] SERPAPI_KEY exists: ${!!process.env.SERPAPI_KEY}`);
    if (process.env.SERPAPI_KEY) {
      console.log(`[LinkedIn] Searching for ${companyName} via dual-purpose SerpAPI...`);
      console.log(`[LinkedIn/DEBUG] 🔵 Calling searchLinkedInViaSerpAPI("${companyName}")...`);
      const searchResult = await searchLinkedInViaSerpAPI(companyName);
      console.log(`[LinkedIn/DEBUG] SerpAPI result:`, JSON.stringify(searchResult));
      if (searchResult.linkedinUrl) {
        console.log(`[LinkedIn] ✅ Found via SerpAPI: ${searchResult.linkedinUrl}`);
        // Also log if email pattern was found
        if (searchResult.emailPattern) {
          console.log(`[LinkedIn] 🎁 BONUS: Also discovered email pattern: ${searchResult.emailPattern}`);
        }
        console.log(`[LinkedIn/DEBUG] ✅ Returning LinkedIn URL: ${searchResult.linkedinUrl}`);
        return searchResult.linkedinUrl;
      } else {
        console.log(`[LinkedIn/DEBUG] ❌ No LinkedIn URL found in SerpAPI result`);
      }
    } else {
      console.warn('[LinkedIn] SERPAPI_KEY not configured, using fallback');
      console.log(`[LinkedIn/DEBUG] ⚠️  SERPAPI_KEY is missing or empty`);
    }

    // Fallback: Construct LinkedIn URL from company name
    const constructedUrl = constructLinkedInURL(companyName);
    console.log(`[LinkedIn] Using constructed URL: ${constructedUrl}`);
    return constructedUrl;

  } catch (error) {
    console.error(`[LinkedIn] Error finding URL for ${companyName}:`, error.message);
    // Return constructed URL as last resort
    return constructLinkedInURL(companyName);
  }
}

/**
 * Search for LinkedIn company page AND email patterns via SerpAPI (DUAL-PURPOSE)
 *
 * FIX 5: Modified to get BOTH LinkedIn URL and email patterns in ONE query
 * This saves API costs by combining two searches into one.
 *
 * Query: "email address format for {company} and their linkedin profile"
 * Returns both:
 * - Email pattern sites (AeroLeads, LeadIQ, etc.)
 * - LinkedIn company page
 *
 * @param {string} companyName - Company name to search
 * @returns {Promise<{linkedinUrl: string|null, emailPattern: string|null}>}
 */
async function searchLinkedInViaSerpAPI(companyName) {
  console.log(`[LinkedIn/DEBUG] 🔍 searchLinkedInViaSerpAPI() CALLED for: "${companyName}"`);
  try {
    // Dual-purpose query: Gets BOTH email patterns AND LinkedIn URL
    const query = `email address format for ${companyName} and their linkedin profile`;
    console.log(`[LinkedIn/DEBUG] 📝 Dual-purpose query: "${query}"`);

    const params = new URLSearchParams({
      q: query,
      api_key: process.env.SERPAPI_KEY,
      num: '5', // Increased from 3 to 5 to capture both types of results
      gl: 'ae', // UAE location for relevance
      engine: 'google'
    });

    console.log(`[LinkedIn/DEBUG] 🌐 Fetching from SerpAPI...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://serpapi.com/search?${params}`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[LinkedIn/DEBUG] ❌ SerpAPI HTTP error: ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`[LinkedIn/DEBUG] 📊 SerpAPI response received with ${data.organic_results?.length || 0} results`);
    const results = data.organic_results || [];

    let linkedinUrl = null;
    let emailPattern = null;

    console.log(`[LinkedIn/DEBUG] 🔍 Parsing ${results.length} results for LinkedIn URL and email patterns...`);

    // Parse results to extract BOTH LinkedIn URL and email pattern
    for (const result of results) {
      console.log(`[LinkedIn/DEBUG] Checking result: ${result.link || 'no link'}`);

      // Extract LinkedIn company URL
      if (!linkedinUrl && result.link && result.link.includes('linkedin.com/company/')) {
        linkedinUrl = result.link;
        console.log(`[LinkedIn/SerpAPI] ✅ Found LinkedIn URL: ${linkedinUrl}`);
        console.log(`[LinkedIn/DEBUG] ✅ LinkedIn URL extracted!`);
      }

      // Extract email pattern from pattern discovery sites
      if (!emailPattern && result.link) {
        // Check for email pattern sites (AeroLeads, LeadIQ, RocketReach, etc.)
        const isPatternSite =
          result.link.includes('aeroleads.com') ||
          result.link.includes('leadiq.com') ||
          result.link.includes('rocketreach.co') ||
          result.link.includes('emailformat.com') ||
          result.link.includes('hunter.io');

        if (isPatternSite) {
          console.log(`[LinkedIn/DEBUG] 📧 Found pattern site: ${result.link}`);
          if (result.snippet) {
            // Try to extract email pattern from snippet
            // Common patterns: first.last@, first@, jsmith@, etc.
            const patternMatch = result.snippet.match(/([a-z]+\.?[a-z]+|[a-z]\.?[a-z]+)@/i);
            if (patternMatch) {
              const rawPattern = patternMatch[1];
              // Convert to standard format: {first}.{last}, {f}{last}, etc.
              emailPattern = normalizeEmailPattern(rawPattern);
              console.log(`[LinkedIn/SerpAPI] ✅ Found email pattern: ${emailPattern} (from ${result.link})`);
              console.log(`[LinkedIn/DEBUG] ✅ Email pattern extracted: ${rawPattern} -> ${emailPattern}`);
            }
          }
        }
      }

      // Stop early if we found both
      if (linkedinUrl && emailPattern) {
        console.log(`[LinkedIn/SerpAPI] ✅ Dual-purpose search successful - found both LinkedIn and email pattern!`);
        console.log(`[LinkedIn/DEBUG] ✅ Both found, breaking loop early`);
        break;
      }
    }

    if (!linkedinUrl) {
      console.log(`[LinkedIn/SerpAPI] ⚠️  LinkedIn URL not found in results`);
      console.log(`[LinkedIn/DEBUG] ❌ No LinkedIn URL found after parsing all results`);
    }
    if (!emailPattern) {
      console.log(`[LinkedIn/SerpAPI] ⚠️  Email pattern not found in results`);
      console.log(`[LinkedIn/DEBUG] ❌ No email pattern found after parsing all results`);
    }

    console.log(`[LinkedIn/DEBUG] 📤 Returning result: { linkedinUrl: ${linkedinUrl || 'null'}, emailPattern: ${emailPattern || 'null'} }`);
    return { linkedinUrl, emailPattern };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[LinkedIn/SerpAPI] Timeout after 5s');
    } else if (error.message.includes('429')) {
      console.error('[LinkedIn/SerpAPI] Rate limit exceeded');
    } else {
      console.error('[LinkedIn/SerpAPI] Search failed:', error.message);
    }
    return { linkedinUrl: null, emailPattern: null };
  }
}

/**
 * Helper: Normalize raw email pattern to standard format
 * Examples:
 * - "john.smith" → "{first}.{last}"
 * - "jsmith" → "{f}{last}"
 * - "john" → "{first}"
 */
function normalizeEmailPattern(rawPattern) {
  const lower = rawPattern.toLowerCase();

  // Check for common patterns
  if (lower.match(/^[a-z]+\.[a-z]+$/)) return '{first}.{last}';
  if (lower.match(/^[a-z]\.[a-z]+$/)) return '{f}.{last}';
  if (lower.match(/^[a-z]+\.[a-z]$/)) return '{first}.{l}';
  if (lower.match(/^[a-z][a-z]+$/)) {
    // Could be {f}{last} or {first}{l} - default to {f}{last} as more common
    return '{f}{last}';
  }
  if (lower.match(/^[a-z]+_[a-z]+$/)) return '{first}_{last}';
  if (lower.match(/^[a-z]+-[a-z]+$/)) return '{first}-{last}';
  if (lower.match(/^[a-z]+$/)) return '{first}';

  // Fallback: return as-is
  return rawPattern;
}

/**
 * Construct LinkedIn company URL from company name
 * Uses LinkedIn's slug format conventions
 *
 * @param {string} companyName - Company name
 * @returns {string} Constructed LinkedIn URL
 */
function constructLinkedInURL(companyName) {
  // Remove common corporate suffixes
  let slug = companyName
    .toLowerCase()
    .replace(/\s+(ltd|llc|inc|incorporated|corporation|corp|limited|plc|gmbh|co|company|group|holdings|international|global)\s*\.?$/i, '')
    .trim();

  // Normalize special characters
  slug = slug
    .replace(/&/g, 'and')           // & → and
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/[^a-z0-9-]/g, '')      // remove special chars
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens

  return `https://www.linkedin.com/company/${slug}`;
}

export {
  findLinkedInURL,
  searchLinkedInViaSerpAPI,
  constructLinkedInURL
};
