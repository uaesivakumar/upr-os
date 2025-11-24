// routes/enrich/lib/geo.js

/**
 * GEO helpers for UAE:
 * - isUAE(locationLike)
 * - emirateFromLocation(locationLike)
 * - tagEmirate(record)              // mutates and returns record
 * - enrichWithGeo(records[])        // batch tag
 */

const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Fujairah",
  "Ras Al Khaimah",
  "Umm Al Quwain",
];

const CITY_TO_EMIRATE = new Map([
  ["abu dhabi", "Abu Dhabi"],
  ["al ain", "Abu Dhabi"],
  ["mussafah", "Abu Dhabi"],
  ["dubai", "Dubai"],
  ["jlt", "Dubai"],
  ["jumeirah", "Dubai"],
  ["business bay", "Dubai"],
  ["internet city", "Dubai"],
  ["sharjah", "Sharjah"],
  ["ajman", "Ajman"],
  ["fujairah", "Fujairah"],
  ["rak", "Ras Al Khaimah"],
  ["ras al khaimah", "Ras Al Khaimah"],
  ["umm al quwain", "Umm Al Quwain"],
  ["uaq", "Umm Al Quwain"],
]);

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isUAE(locationLike) {
  const s = norm(locationLike);
  if (!s) return false;
  return (
    /\buae\b/.test(s) ||
    /\bunited arab emirates\b/.test(s) ||
    EMIRATES.some((e) => new RegExp(`\\b${norm(e)}\\b`).test(s)) ||
    Array.from(CITY_TO_EMIRATE.keys()).some((k) => new RegExp(`\\b${k}\\b`).test(s))
  );
}

export function emirateFromLocation(locationLike) {
  const s = norm(locationLike);
  if (!s) return null;

  for (const e of EMIRATES) {
    if (new RegExp(`\\b${norm(e)}\\b`).test(s)) return e;
  }

  for (const [k, e] of CITY_TO_EMIRATE.entries()) {
    if (new RegExp(`\\b${k}\\b`).test(s)) return e;
  }

  if (/\buae\b/.test(s) || /\bunited arab emirates\b/.test(s)) return null;

  return null;
}

/**
 * [MODIFIED] Mutates the record to ensure both the full location string and the
 * parsed emirate are available for the frontend.
 */
export function tagEmirate(record) {
  if (!record || typeof record !== 'object') return record;
  
  const loc = record.location || [record.city, record.region, record.state, record.country].filter(Boolean).join(", ");
  
  // We parse the emirate for filtering, but keep the original location for display
  const parsedEmirate = emirateFromLocation(loc);
  
  // Ensure the record has both fields for the frontend to use
  record.location = loc; // The full string from the source (e.g., "Dubai, United Arab Emirates")
  record.emirate = parsedEmirate; // The parsed canonical emirate (e.g., "Dubai"), or null
  
  return record;
}

/**
 * Batch helper used by the enrichment pipeline.
 */
export async function enrichWithGeo(records = []) {
  if (!Array.isArray(records)) return [];
  return records.map((r) => tagEmirate({ ...r }));
}

export default {
  isUAE,
  emirateFromLocation,
  tagEmirate,
  enrichWithGeo,
};