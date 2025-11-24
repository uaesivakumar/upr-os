import { URL } from "url";

const COMMON_TLDS = ["com","ai","io","co","ae","net","org"];
const GENERIC_WORDS = new Set(["llc","l.l.c","trading","technical","services","contracting","general","group","holding","capital","consulting","management","fze","fzco","uae","dubai","abudhabi"]);

function normTokens(q){
  return String(q||"")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ") // More robust regex to strip punctuation
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !GENERIC_WORDS.has(t));
}

function buildCandidates(tokens){
  const base = tokens.join("");
  const names = new Set([base]);
  // also try hyphen join for two-word brands (e.g., "firstabu" -> "first-abu")
  if (tokens.length === 2) names.add(tokens.join("-"));

  const out = [];
  for (const name of names){
    for (const tld of COMMON_TLDS){
      out.push(`${name}.${tld}`);
    }
  }
  return Array.from(new Set(out));
}

// Very fast fetch with tight timeouts.
async function tryHead(url){
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), 2000); // <2s budget
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal });
    clearTimeout(id);
    const ok = res.ok || (res.status >= 300 && res.status < 400);
    const html = ok ? (await res.text?.().catch(()=> "")) || "" : "";
    return { ok, status: res.status, html: html.slice(0, 2048) };
  } catch (e) {
    clearTimeout(id);
    if (e.name !== 'AbortError') {
      console.warn(`[domain_infer] Probe failed for ${url}: ${e.message}`);
    }
    return { ok:false, status:0, html:"" };
  }
}

function titleContainsBrand(html, tokens){
  const m = html.match(/<title[^>]*>([^<]{0,160})<\/title>/i);
  const t = (m?.[1] || "").toLowerCase();
  return tokens.length ? tokens.every(tok => t.includes(tok)) : false;
}

export async function inferOfficialDomain(query){
  const tokens = normTokens(query);
  if (!tokens.length) return null;
  const candidates = buildCandidates(tokens);

  // Prefer .com first unless tokens clearly indicate UAE (.ae will still be tried)
  const weighted = candidates.sort((a,b) => {
    const score = d => d.endsWith(".com") ? 3 : d.endsWith(".ae") ? 2 : 1;
    return score(b) - score(a);
  });

  // Probe top 6 only to stay sub-second
  const top = weighted.slice(0, 6);
  for (const host of top){
    const url = `https://${host}/`;
    const r = await tryHead(url);
    if (!r.ok) continue;

    // Confidence from multiple signals
    let conf = 0.5; // reachable
    if (titleContainsBrand(r.html, tokens)) conf += 0.35;
    // brand == SLD (paypal.com) gets +0.15, brand+extra (brandx.com) gets small +0.05
    const sld = host.replace(/^www\./,"").split(".").slice(-2, -1)[0];
    const joined = tokens.join("");
    if (sld === joined) conf += 0.15;
    else if (sld.startsWith(joined)) conf += 0.05;

    if (conf >= 0.8) {
      return { host, url: `https://${host}/`, confidence: conf, tokens };
    }
  }
  return null; // fall back to SERP
}