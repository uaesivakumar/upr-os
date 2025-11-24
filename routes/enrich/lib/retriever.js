// routes/enrich/lib/retriever.js
import { URL } from "url";

const SERPAPI_KEY = process.env.SERPAPI_KEY;

let DAILY_START = Date.now();
let DAILY_COUNT = 0;
const DAY_MS = 86_400_000;

export function serpBudgetOk(maxPerDay = Number(process.env.SERPAPI_DAILY_BUDGET || 80)){
  const now = Date.now();
  if (now - DAILY_START > DAY_MS) { DAILY_START = now; DAILY_COUNT = 0; }
  return DAILY_COUNT < maxPerDay;
}
export function noteSerpUse(){ DAILY_COUNT += 1; }

export async function searchSerpApi(query, { local = false } = {}) {
  if (!SERPAPI_KEY) {
    console.warn("[retriever] SERPAPI_KEY is not set. Retrieval will be skipped.");
    return [];
  }
  if (!serpBudgetOk()) {
    console.warn("[retriever] Daily SerpAPI budget reached — skipping call.");
    return [];
  }
  const params = new URLSearchParams({
    q: query,
    api_key: SERPAPI_KEY,
    engine: 'google',
    gl: 'ae',
    hl: 'en',
    num: '20',
    device: 'desktop',
    filter: '1',          // remove near-duplicates
    ...(local ? { location: 'United Arab Emirates' } : {})
  });
  try {
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    noteSerpUse();
    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[retriever] SerpApi ${res.status}: ${errorBody}`);
      return [];
    }
    const json = await res.json();
    return json.organic_results || [];
  } catch (e) {
    console.error("[retriever] SerpApi network error:", e);
    return [];
  }
}