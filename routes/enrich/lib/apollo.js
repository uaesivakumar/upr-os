// routes/enrich/lib/apollo.js

const APOLLO_BASE = "https://api.apollo.io/v1";

function apolloHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": process.env.APOLLO_API_KEY || "",
  };
}

async function apolloPOST(path, body) {
  if (!process.env.APOLLO_API_KEY) {
    console.warn("[apollo] APOLLO_API_KEY is not set. Apollo requests will be skipped.");
    return null;
  }
  try {
    const res = await fetch(`${APOLLO_BASE}${path}`, {
      method: "POST",
      headers: apolloHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[apollo] API error on ${path}: ${res.status} ${res.statusText}`, errorBody);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`[apollo] Network error on ${path}:`, e.message);
    return null;
  }
}

export async function apolloOrgEnrich(domain) {
    if (!domain) return null;
    const body = { domain: domain };
    const data = await apolloPOST("/organizations/enrich", body);
    const org = data?.organization;
    if (!org) return null;

    return {
        name: org.name,
        domain: org.primary_domain,
        website_url: org.website_url,
        linkedin_url: org.linkedin_url,
        industry: org.industry,
        size: org.estimated_num_employees,
        location: org.raw_address,
    };
}


/**
 * Fetches leads from Apollo using COMPANY NAME (not domain)
 *
 * CRITICAL: Apollo queries by company name to find employees regardless of domain variants
 * Example: "Khansaheb" finds employees at both @khansaheb.com and @khansaheb.ae
 *
 * @param {object} options - { name, domain, strategy }
 */
export async function enrichWithApollo({ name, domain, strategy = 'wide_net' }) {
  const started = Date.now();

  // FIX 3 & 7: Allow domain-only searches
  if (!name && !domain) {
    return { ok: false, results: [], provider: "apollo", error: "missing_company_name_and_domain" };
  }

  const OPERATIONAL_TITLES = ["human resources", "hr", "payroll", "generalist", "specialist", "admin", "office manager", "assistant", "finance", "accountant"];
  const LEADERSHIP_TITLES = ["vp", "vice president", "director", "head", "chro", "cfo", "coo", "manager"];

  // Build query body based on strategy
  const body = {
    per_page: 100,  // Increased from 25 to get more names for pattern validation
  };

  // FIX 3 & 7: Support different search strategies
  switch (strategy) {
    case 'no_location':
      // Search by name WITHOUT location filter (global search)
      body.q_organization_name = name;
      body.person_titles = [...OPERATIONAL_TITLES, ...LEADERSHIP_TITLES];
      console.log(`[apollo] Strategy: No location filter for "${name}"`);
      break;

    case 'domain_only':
      // Search by domain instead of name
      if (domain) {
        body.q_organization_domains = [domain];
        body.person_locations = ["United Arab Emirates"];
        body.person_titles = [...OPERATIONAL_TITLES, ...LEADERSHIP_TITLES];
        console.log(`[apollo] Strategy: Domain-only search for "${domain}"`);
      } else {
        console.warn(`[apollo] domain_only strategy requires domain, falling back to name`);
        body.q_organization_name = name;
        body.person_locations = ["United Arab Emirates"];
        body.person_titles = [...OPERATIONAL_TITLES, ...LEADERSHIP_TITLES];
      }
      break;

    case 'leadership':
      // Original leadership strategy
      body.q_organization_name = name;
      body.person_locations = ["United Arab Emirates"];
      body.person_titles = LEADERSHIP_TITLES;
      console.log(`[apollo] Strategy: Leadership for "${name}"`);
      break;

    case 'wide_net':
    default:
      // Original wide net strategy (default)
      body.q_organization_name = name;
      body.person_locations = ["United Arab Emirates"];
      body.person_titles = [...OPERATIONAL_TITLES, ...LEADERSHIP_TITLES];
      console.log(`[apollo] Strategy: Wide net for "${name}"`);
      break;
  }

  console.log(`[apollo] Full query:`, JSON.stringify(body, null, 2));
  const data = await apolloPOST("/mixed_people/search", body);
  const rawPeople = data?.people || [];

  // ⚠️ IMPORTANT: Apollo is a LEAD SOURCE ONLY. Email intelligence is the PRIMARY email source.
  // Do NOT return emails from Apollo - let the email intelligence system handle all email generation.
  const results = rawPeople.map(p => ({
      first_name: p.first_name || "",
      last_name: p.last_name || "",
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      title: p.title,
      job_title: p.title,  // Alias for compatibility
      designation: p.title,
      linkedin_url: p.linkedin_url,
      location: p.present_raw_address,
      // NO EMAIL FIELDS - Email intelligence is the PRIMARY system
  }));

  const ms = Date.now() - started;

  // FIX 5: Diagnostic logging for LinkedIn URLs
  const linkedinStats = {
    total: results.length,
    with_linkedin: results.filter(r => r.linkedin_url).length,
    without_linkedin: results.filter(r => !r.linkedin_url).length
  };
  console.log(`[apollo] Found ${results.length} employees for "${name}" in ${ms}ms`);
  console.log(`[apollo] 🔗 LinkedIn URL stats:`, JSON.stringify(linkedinStats));
  if (linkedinStats.with_linkedin > 0) {
    console.log(`[apollo] ✅ Sample LinkedIn URLs:`, results.filter(r => r.linkedin_url).slice(0, 3).map(r => `${r.name}: ${r.linkedin_url}`));
  } else {
    console.log(`[apollo] ⚠️  WARNING: Apollo returned NO LinkedIn URLs for "${name}"`);
  }

  return { ok: true, results, provider: "apollo", ms };
}