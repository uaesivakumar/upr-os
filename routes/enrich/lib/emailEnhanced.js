// routes/enrich/lib/emailEnhanced.js
// ENHANCED Email Enrichment System
// Combines: Hunter.io + SMTP Probing + Expanded Patterns + Multi-Validator Waterfall

import { verifyEmail as verifyWithNeverBounce } from "./person.js";
import { findEmailWithHunterReal, getDomainPatternFromHunter, verifyEmailWithHunter } from "./hunterReal.js";
import { verifyEmailViaSMTP, isCatchAllDomain } from "./smtpProbe.js";
import { getDomainPattern, setDomainPattern } from "../../../utils/patternCache.js";

const HIGH_CONFIDENCE_THRESHOLD = 80; // Apply pattern without verification if confidence is >= 80%
const HUNTER_CONFIDENCE_THRESHOLD = 70; // Hunter.io score threshold for trusting results

// EXPANDED PATTERN LIBRARY (8 → 28 patterns)
// Covers ~95% of all corporate email formats
const COMMON_PATTERNS = [
  // Standard patterns (most common - 80%)
  '{first}.{last}',         // john.smith@company.com
  '{f}{last}',              // jsmith@company.com
  '{first}{l}',             // johns@company.com
  '{first}',                // john@company.com

  // Underscore patterns (10%)
  '{first}_{last}',         // john_smith@company.com
  '{f}_{last}',             // j_smith@company.com
  '{first}_{l}',            // john_s@company.com

  // Reverse patterns (5%)
  '{last}.{first}',         // smith.john@company.com
  '{last}{f}',              // smithj@company.com
  '{l}{first}',             // sjohn@company.com
  '{last}',                 // smith@company.com

  // Hyphen patterns (2%)
  '{first}-{last}',         // john-smith@company.com
  '{f}-{last}',             // j-smith@company.com

  // Initial patterns (2%)
  '{f}.{last}',             // j.smith@company.com
  '{first}.{l}',            // john.s@company.com
  '{f}.{l}',                // j.s@company.com

  // Combined patterns (1%)
  '{first}{last}',          // johnsmith@company.com
  '{last}{first}',          // smithjohn@company.com
  '{f}{l}',                 // js@company.com
  '{l}{f}',                 // sj@company.com

  // With numbers (financial/tech companies)
  '{first}.{last}{random1digit}',  // john.smith2@company.com
  '{first}{last}{random2digit}',   // johnsmith42@company.com

  // Special formats (Middle East common)
  '{first}_{last}_ae',      // john_smith_ae@company.com (UAE)
  '{first}.{last}.ae',      // john.smith.ae@company.com

  // Department prefixes (larger orgs)
  'hr.{first}.{last}',      // hr.john.smith@company.com
  'contact.{first}',        // contact.john@company.com

  // Consultant/contractor formats
  '{first}.{last}.ext',     // john.smith.ext@company.com
  '{first}.{last}.c',       // john.smith.c@company.com (contractor)
];

function splitName(name = "") {
  const parts = name.toLowerCase().replace(/[^a-z\s]/g, '').split(' ').filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function applyPattern(person, domain, pattern) {
  const { first, last } = splitName(person.name);
  if (!pattern || !first) return null;
  if ((pattern.includes('{last}') || pattern.includes('{l}')) && !last) return null;

  let processedPattern = pattern
    .replace(/{first}/g, first)
    .replace(/{last}/g, last)
    .replace(/{f}/g, first[0] || '')
    .replace(/{l}/g, last ? last[0] : '');

  // Handle special patterns
  if (pattern.includes('{random1digit}')) {
    processedPattern = processedPattern.replace('{random1digit}', '');  // Try without number first
  }
  if (pattern.includes('{random2digit}')) {
    processedPattern = processedPattern.replace('{random2digit}', '');
  }

  // If pattern already includes @domain, return as-is
  if (processedPattern.includes('@')) {
    return processedPattern;
  }

  // Otherwise, append domain
  if (!domain) return null;
  return processedPattern + `@${domain}`;
}

function inferPatternFromSamples(samples = [], domain) {
  if (!samples.length || !domain) return null;

  const patternCounts = new Map();

  for (const sample of samples) {
    if (!sample.email || !sample.name) continue;

    const emailLocalPart = sample.email.split('@')[0];

    for (const pattern of COMMON_PATTERNS) {
      const generatedLocalPart = applyPattern({ name: sample.name }, '', pattern)?.split('@')[0];
      if (emailLocalPart === generatedLocalPart) {
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
        break;
      }
    }
  }

  if (patternCounts.size === 0) return null;

  const sortedPatterns = [...patternCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topPattern = sortedPatterns[0];

  // Calculate confidence based on consistency
  const confidence = Math.min(95, 60 + (topPattern[1] / samples.length) * 40);

  return {
    pattern: topPattern[0],
    confidence: Math.round(confidence),
    sampleSize: samples.length,
    matchCount: topPattern[1]
  };
}

/**
 * MULTI-VALIDATOR WATERFALL
 * Tries multiple verification methods in order of accuracy/cost
 *
 * Waterfall:
 * 1. NeverBounce (if available) - Fast, paid
 * 2. Hunter.io Verifier (if available) - Accurate, paid
 * 3. SMTP Probing - Most accurate, free, slower
 */
async function verifyEmailMulti(email) {
  console.log(`[verify-multi] Verifying ${email}`);

  // Try NeverBounce first (fastest)
  if (process.env.NEVERBOUNCE_API_KEY) {
    try {
      const nbResult = await verifyWithNeverBounce(email);
      if (nbResult.status !== 'unknown') {
        console.log(`[verify-multi] ✅ NeverBounce: ${nbResult.status}`);
        return {
          ...nbResult,
          verifier: 'neverbounce'
        };
      }
    } catch (err) {
      console.warn(`[verify-multi] NeverBounce failed:`, err.message);
    }
  }

  // Try Hunter.io verifier (most comprehensive)
  if (process.env.HUNTER_API_KEY) {
    try {
      const hunterResult = await verifyEmailWithHunter(email);
      if (hunterResult.verified && hunterResult.score >= 50) {
        const status = hunterResult.result === 'deliverable' ? 'valid' :
                      hunterResult.result === 'undeliverable' ? 'invalid' :
                      hunterResult.accept_all ? 'accept_all' : 'unknown';

        console.log(`[verify-multi] ✅ Hunter.io: ${status} (score: ${hunterResult.score})`);
        return {
          status,
          score: hunterResult.score,
          reason: hunterResult.result,
          verifier: 'hunter'
        };
      }
    } catch (err) {
      console.warn(`[verify-multi] Hunter.io failed:`, err.message);
    }
  }

  // Final fallback: SMTP probing (most accurate, free)
  try {
    const smtpResult = await verifyEmailViaSMTP(email);
    console.log(`[verify-multi] ✅ SMTP: ${smtpResult.status} (confidence: ${smtpResult.confidence}%)`);
    return {
      status: smtpResult.status,
      confidence: smtpResult.confidence,
      reason: smtpResult.reason,
      verifier: 'smtp'
    };
  } catch (err) {
    console.error(`[verify-multi] SMTP failed:`, err.message);
  }

  // If all methods fail
  return {
    status: 'unknown',
    reason: 'all_verifiers_failed',
    verifier: 'none'
  };
}

/**
 * Smart permutation with SMTP verification
 * Tries all patterns and verifies with SMTP
 */
async function findEmailByPermutation(candidates = [], domain) {
  console.log(`[permute] Starting smart permutation for ${candidates.length} candidates`);

  let successfulPattern = null;
  let firstSuccessResult = null;

  for (const candidate of candidates) {
    for (const pattern of COMMON_PATTERNS) {
      const emailGuess = applyPattern(candidate, domain, pattern);
      if (!emailGuess) continue;

      const result = await verifyEmailMulti(emailGuess);

      if (result.status === 'valid' || result.status === 'accept_all') {
        console.log(`[permute] ✅ Discovered pattern '${pattern}' for ${domain}`);
        successfulPattern = pattern;
        firstSuccessResult = {
          ...candidate,
          email: emailGuess,
          email_status: result.status,
          email_reason: 'smart_permutation',
          email_verifier: result.verifier
        };

        await setDomainPattern({
          domain,
          pattern: successfulPattern,
          source: 'smart_permutation',
          confidence: result.confidence ? result.confidence / 100 : 0.85,
          status: result.status === 'accept_all' ? 'catch_all' : 'valid'
        });
        break;
      }
    }
    if (successfulPattern) break;
  }

  if (successfulPattern) {
    return candidates.map(c => {
      if (c.linkedin_url === firstSuccessResult.linkedin_url) {
        return firstSuccessResult;
      }
      return {
        ...c,
        email: applyPattern(c, domain, successfulPattern),
        email_status: 'patterned',
        email_reason: 'smart_permutation'
      };
    });
  }

  return candidates.map(c => ({ ...c, email_reason: 'permutation_failed' }));
}

/**
 * ENHANCED EMAIL ENRICHMENT
 *
 * Enrichment Layers (in order):
 * 1. Hunter.io Email Finder (database of 200M+ emails)
 * 2. Cached domain patterns (from previous enrichments)
 * 3. Sample-based pattern inference (from Apollo data)
 * 4. AI-provided pattern (from company.email_pattern)
 * 5. Smart permutation with SMTP verification
 */
export async function enrichWithEmailEnhanced(candidates = [], domain, company = {}) {
  console.log(`[email-enhanced] Starting enrichment for ${candidates.length} candidates at ${domain}`);

  // LAYER 1: Try Hunter.io Email Finder first (highest accuracy)
  if (process.env.HUNTER_API_KEY && candidates.length <= 10) {  // Only for small batches to save API credits
    console.log(`[email-enhanced] Layer 1: Trying Hunter.io Email Finder`);

    const hunterResults = [];
    for (const candidate of candidates) {
      const hunterResult = await findEmailWithHunterReal(candidate, domain);

      if (hunterResult.found && hunterResult.confidence >= HUNTER_CONFIDENCE_THRESHOLD) {
        hunterResults.push({
          ...candidate,
          email: hunterResult.email,
          email_status: hunterResult.verification.status || 'patterned',
          email_reason: 'hunter_database',
          email_confidence: hunterResult.confidence,
          email_sources: hunterResult.sources,
          email_pattern: hunterResult.pattern
        });
      } else {
        hunterResults.push(candidate);
      }
    }

    // If Hunter found emails for most candidates, return early
    const foundCount = hunterResults.filter(r => r.email).length;
    if (foundCount >= candidates.length * 0.7) {
      console.log(`[email-enhanced] ✅ Hunter.io found ${foundCount}/${candidates.length} emails`);
      return hunterResults;
    }
  }

  // LAYER 2: Check cached domain pattern
  let domainIntel = await getDomainPattern(domain);

  if (domainIntel?.status === 'invalid') {
    console.log(`[email-enhanced] Ignoring known-invalid cached pattern for ${domain}`);
    domainIntel = null;
  }

  if (domainIntel?.status === 'catch_all') {
    console.log(`[email-enhanced] Layer 2: Using cached catch-all pattern`);
    return candidates.map(c => ({
      ...c,
      email: applyPattern(c, domain, domainIntel.pattern),
      email_status: 'accept_all',
      email_reason: 'cached_catch_all',
      email_pattern_confidence: Math.round(domainIntel.confidence * 100)
    }));
  }

  // LAYER 3: Try to infer pattern from samples or use cached/AI pattern
  let discoveredPattern = domainIntel;
  if (discoveredPattern) {
    discoveredPattern.confidence = Math.round(discoveredPattern.confidence * 100);
  } else {
    // Try sample-based inference
    const samples = candidates.filter(c => c.email && !c.email.includes("email_not_unlocked") && c.email.endsWith(`@${domain}`));
    const inferred = inferPatternFromSamples(samples, domain);

    if (inferred) {
      console.log(`[email-enhanced] Layer 3: Inferred pattern ${inferred.pattern} from ${inferred.sampleSize} samples`);
      discoveredPattern = { ...inferred, source: 'inferred_pattern' };
    } else if (company.email_pattern) {
      console.log(`[email-enhanced] Layer 4: Using AI pattern ${company.email_pattern}`);
      discoveredPattern = {
        pattern: company.email_pattern,
        source: 'ai_pattern_found',
        confidence: company.email_confidence || 85
      };
    }
  }

  // If we have a high-confidence pattern, apply it without verification
  if (discoveredPattern) {
    const reliableSources = ['ai_pattern_found', 'manual', 'cached_pattern', 'db_cache', 'smart_permutation', 'hunter_pattern'];

    if (discoveredPattern.confidence >= HIGH_CONFIDENCE_THRESHOLD && reliableSources.includes(discoveredPattern.source)) {
      console.log(`[email-enhanced] ✅ High-confidence pattern (${discoveredPattern.confidence}%) - generating without verification`);
      return candidates.map(c => ({
        ...c,
        email: applyPattern(c, domain, discoveredPattern.pattern),
        email_status: 'patterned',
        email_reason: discoveredPattern.source,
        email_pattern_confidence: discoveredPattern.confidence
      }));
    }

    // Low-confidence pattern - verify with one test email
    console.log(`[email-enhanced] Low-confidence pattern (${discoveredPattern.confidence}%) - testing with verification`);
    const testCandidate = candidates[0] || candidates.find(c => c.name);
    if (testCandidate) {
      const testEmail = applyPattern(testCandidate, domain, discoveredPattern.pattern);
      const verificationResult = await verifyEmailMulti(testEmail);

      if (verificationResult.status === 'accept_all' || verificationResult.status === 'valid') {
        const newStatus = verificationResult.status === 'accept_all' ? 'catch_all' : 'valid';
        console.log(`[email-enhanced] ✅ Pattern verified (${newStatus})`);

        await setDomainPattern({
          domain,
          pattern: discoveredPattern.pattern,
          source: discoveredPattern.source,
          confidence: (discoveredPattern.confidence || 75) / 100,
          status: newStatus
        });

        return candidates.map(c => ({
          ...c,
          email: applyPattern(c, domain, discoveredPattern.pattern),
          email_status: newStatus,
          email_reason: discoveredPattern.source,
          email_pattern_confidence: discoveredPattern.confidence
        }));
      }
    }
  }

  // LAYER 5: Final fallback - smart permutation
  console.log(`[email-enhanced] Layer 5: Falling back to smart permutation`);
  return await findEmailByPermutation(candidates, domain);
}

export default { enrichWithEmailEnhanced, verifyEmailMulti };
