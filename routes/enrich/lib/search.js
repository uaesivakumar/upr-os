// routes/enrich/lib/search.js
import { URL } from 'url';
import { normalizeCompanyUrl } from "./http.js";

export function buildSerpQueries(q, domainUrl) {
  const qClean = String(q || "").trim();
  
  if (domainUrl) {
    try {
      const host = new URL(normalizeCompanyUrl(domainUrl)).hostname.replace(/^www\./, "");
      return [
        `"${qClean}" (Middle East OR UAE OR "United Arab Emirates" OR Dubai OR "Abu Dhabi") site:${host}`,
        `(about OR "our offices" OR locations OR contact) site:${host} (Middle East OR UAE OR Dubai OR "Abu Dhabi")`,
        `(about OR leadership OR "who we are") site:${host}`,
      ];
    } catch {
      // Fall through to domainless if URL is invalid
    }
  }

  // Domainless fallback queries
  return [
    `"${qClean}" (company OR corporate) (Middle East OR UAE OR Dubai OR "Abu Dhabi")`,
    `${qClean} official site`,
  ];
}