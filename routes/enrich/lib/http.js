// routes/enrich/lib/http.js
import { URL } from "url";

// --- Tunables ---
const MAX_REDIRECTS = 8;
const FETCH_TIMEOUT_MS = 8000;

// A realistic browser UA helps with some CDNs
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:118.0) Gecko/20100101 Firefox/118.0",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-AE,en;q=0.9,en-US;q=0.8",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

// Brand aliases to short-circuit “wrong root” issues for big enterprises
const BRAND_ALIASES = new Map([
  // name cue (lowercase) -> canonical domain
  ["dell technologies", "https://www.delltechnologies.com/"],
  ["dell", "https://www.dell.com/"],
  ["bp", "https://www.bp.com/"],
  // add more as you discover them
]);

export function normalizeCompanyUrl(input) {
  if (!input) return null;
  let href = String(input).trim();

  // If we detect a brand alias key, prefer that canonical
  const key = href.toLowerCase();
  if (BRAND_ALIASES.has(key)) return BRAND_ALIASES.get(key);

  // Allow bare hosts
  if (!/^https?:\/\//i.test(href)) href = "https://" + href;

  try {
    const u = new URL(href);

    // Always upgrade to https
    if (u.protocol !== "https:") u.protocol = "https:";

    // Prefer www. (many CDNs 301 -> www.)
    if (!u.hostname.startsWith("www.") && u.hostname.split(".").length >= 2) {
      u.hostname = "www." + u.hostname;
    }

    // Strip hash; keep path as-is
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function withTimeout(signal, ms = FETCH_TIMEOUT_MS) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  // chain aborts if parent signal aborts
  if (signal) signal.addEventListener("abort", () => ac.abort(), { once: true });
  return { signal: ac.signal, cancel: () => clearTimeout(id) };
}

async function fetchOnce(url, method = "GET", baseSignal) {
  const { signal, cancel } = withTimeout(baseSignal, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: DEFAULT_HEADERS,
      redirect: "manual", // we’ll handle 3xx ourselves
      signal,
    });
    return res;
  } finally {
    cancel();
  }
}

/**
 * Follow redirects manually to avoid infinite locale/CDN loops.
 * - Caps redirects
 * - Tracks visited URLs to break cycles
 * - Upgrades http->https
 */
export async function fetchUrlMeta(rawUrl) {
  let current = normalizeCompanyUrl(rawUrl);
  if (!current) throw new Error("Bad URL");

  const visited = new Set();
  let status = 0;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (visited.has(current)) throw new Error("redirect loop detected");
    visited.add(current);

    // Try HEAD first (cheap).
    let res = await fetchOnce(current, "HEAD");
    status = res.status;

    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("redirect with no location");
      const next = new URL(loc, current);
      if (next.protocol !== "https:") next.protocol = "https:";
      current = next.toString();
      continue; // next hop
    }

    // Some CDNs block HEAD — try GET if HEAD wasn't successful
    if (!res.ok) {
      res = await fetchOnce(current, "GET");
      status = res.status;
    }
    
    // Handle redirects found via GET
    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("redirect with no location");
      const next = new URL(loc, current);
      if (next.protocol !== "https:") next.protocol = "https:";
      current = next.toString();
      continue;
    }

    // Success path
    let title = null;
    if (res.ok && res.headers.get("content-type")?.includes("text/html")) {
      try {
        const html = await res.text();
        const m = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
        title = m ? m[1].trim() : null;
      } catch { /* ignore HTML parse errors */ }
    }

    return {
      ok: res.ok,
      finalUrl: res.url || current,
      status,
      title,
      via: "manual",
    };
  }

  throw new Error("redirect count exceeded");
}