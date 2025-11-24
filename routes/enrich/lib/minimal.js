// routes/enrich/lib/minimal.js
import { URL } from "url";
import { normalizeCompanyUrl } from "./http.js";

export function minimalCompanyFromDomain(domain, title) {
  const href = normalizeCompanyUrl(domain);
  if (!href) return null;
  
  const u = new URL(href);
  const host = u.hostname.replace(/^www\./, "");
  // Title often looks like "Dell Official Site | Computers, Monitors ..."
  const pretty = (title && title.split("|")[0].trim()) || host.split(".")[0];

  return {
    name: pretty.charAt(0).toUpperCase() + pretty.slice(1).replace(/-/g, ' '),
    website_url: `https://${host}/`,
    domain: host,
    notes: "Auto-created from official domain (LLM enrichment pending).",
    // Set other fields to null to maintain a consistent object shape
    linkedin_url: null,
    global_hq: null,
    uae_locations: null,
    industry: null,
    size: null,
  };
}