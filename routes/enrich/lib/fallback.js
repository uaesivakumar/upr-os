// routes/enrich/lib/fallback.js
import { normalizeCompanyUrl } from './http.js';

export function minimalCompanyFromDomain(domain, title) {
  if (!domain) return null;
  
  // Use the URL object for robust parsing
  let host;
  try {
    const fullUrl = normalizeCompanyUrl(domain);
    host = new URL(fullUrl).hostname;
  } catch {
    return null;
  }
  
  const nameGuess = (title && title.split(/\\||\\-|\\–/)[0].trim()) || host.replace(/^www\\./, '').split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return {
    name: nameGuess,
    website_url: `https://${host.replace(/^www\./, '')}`, // Use a clean root domain for the website_url
    domain: host.replace(/^www\./, ''),
    linkedin_url: null,
    global_hq: null,
    uae_locations: "Unknown", // Be explicit that we don't know
    industry: null,
    size: null,
    notes: "Auto-created from domain (LLM analysis failed).",
  };
}