// routes/enrich/lib/emailEnhancedOptimized.js
// OPTIMIZED Email Enrichment with LLM-First Pattern Discovery
// Goal: Minimize API costs by using smart pattern discovery before permutation

import { verifyEmail as verifyWithNeverBounce } from "./person.js";
import { findEmailWithHunterReal, getDomainPatternFromHunter, verifyEmailWithHunter } from "./hunterReal.js";
import { verifyEmailViaSMTP, isCatchAllDomain } from "./smtpProbe.js";
import { getDomainPattern, setDomainPattern } from "../../../utils/patternCache.js";

const HIGH_CONFIDENCE_THRESHOLD = 80;
const HUNTER_CONFIDENCE_THRESHOLD = 70;

// SMART PATTERN LIBRARY (7 most common patterns including Middle East formats)
// These patterns cover ~95% of corporate email formats worldwide
const SMART_PATTERNS = [
  '{first}.{last}',         // 1. Standard: john.smith@company.com (~35%)
  '{first}{l}',             // 2. First + last initial: johnS@company.com (~20% - common in Middle East)
  '{f}{last}',              // 3. Initial first: jsmith@company.com (~20%)
  '{first}_{last}',         // 4. Underscore: john_smith@company.com (~10%)
  '{first}{last}',          // 5. No separator: johnsmith@company.com (~8%)
  '{last}.{first}',         // 6. Reverse: smith.john@company.com (~5%)
  '{f}.{last}'              // 7. Initial dot: j.smith@company.com (~2%)
];

/**
 * LLM EMAIL PATTERN DISCOVERY (Layer 1 - Highest Priority)
 * Uses OpenAI to intelligently discover email patterns for a company
 * Cost: ~$0.001 per request (much cheaper than testing 28 patterns)
 */
async function discoverPatternViaLLM(companyName, domain, companySector = null) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('[llm-pattern] OpenAI API key not configured, skipping LLM discovery');
    return null;
  }

  console.log(`[llm-pattern] Discovering email pattern for ${companyName} (${domain}) via LLM...`);

  try {
    const prompt = `You are researching the corporate email format for ${companyName} (${domain}).
${companySector ? `Industry: ${companySector}` : ''}

Based on your knowledge of this company, what is their actual corporate email pattern?

INSTRUCTIONS:
1. Think about what you know about ${companyName} - their location, industry, region
2. Research if you have any information about their email format from your training data
3. Consider regional conventions (e.g., UAE banks, European tech, US corporations)
4. Provide the ACTUAL pattern they use, not a guess from common patterns

Format your pattern using these placeholders:
- {first} = first name
- {last} = last name
- {f} = first initial
- {l} = last initial

Examples of pattern formats:
- john.smith@company.com = {first}.{last}
- johnS@company.com = {first}{l}
- jsmith@company.com = {f}{last}
- john_smith@company.com = {first}_{last}

ONLY respond with high confidence (80+) if you have actual knowledge about this company's email format.
If you don't have specific information, return confidence below 70.

Respond with ONLY a JSON object:
{
  "pattern": "<the actual pattern format>",
  "confidence": <number 0-100>,
  "reasoning": "<what you know about this specific company's email format, or why you're uncertain>"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',  // Faster, cheaper model
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,  // Lower temperature for more consistent results
        max_tokens: 150
      })
    });

    if (!response.ok) {
      console.warn(`[llm-pattern] OpenAI API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.warn('[llm-pattern] No content in OpenAI response');
      return null;
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[llm-pattern] Could not parse JSON from LLM response');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);

    console.log(`[llm-pattern] ✅ LLM predicted: ${result.pattern} (confidence: ${result.confidence}%)`);
    console.log(`[llm-pattern] Reasoning: ${result.reasoning}`);

    return {
      pattern: result.pattern,
      confidence: result.confidence,
      source: 'llm_discovery',
      reasoning: result.reasoning
    };

  } catch (err) {
    console.error('[llm-pattern] Error:', err.message);
    return null;
  }
}

/**
 * Apply pattern to candidate name
 */
function applyPattern(candidate, domain, pattern) {
  if (!candidate?.name || !pattern) return null;

  // Parse name into components
  const nameParts = candidate.name.trim().split(/\s+/);
  const first = (nameParts[0] || '').toLowerCase().replace(/[^a-z]/g, '');
  const last = (nameParts[nameParts.length - 1] || '').toLowerCase().replace(/[^a-z]/g, '');
  const f = first.charAt(0);
  const l = last.charAt(0);

  if (!first || !last) return null;

  // Replace pattern placeholders
  let email = pattern
    .replace('{first}', first)
    .replace('{last}', last)
    .replace('{f}', f)
    .replace('{l}', l);

  return `${email}@${domain}`;
}

/**
 * Multi-validator waterfall (NeverBounce → Hunter → SMTP)
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

  // Try Hunter.io verifier
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
    console.log(`[verify-multi] ✅ SMTP: ${smtpResult.status}`);
    return {
      status: smtpResult.status,
      confidence: smtpResult.confidence,
      reason: smtpResult.reason,
      verifier: 'smtp'
    };
  } catch (err) {
    console.error(`[verify-multi] SMTP failed:`, err.message);
  }

  return { status: 'unknown', reason: 'all_verifiers_failed', verifier: 'none' };
}

/**
 * Infer pattern from Apollo email samples
 */
function inferPatternFromSamples(samples = [], domain) {
  if (!samples.length || !domain) return null;

  const patternCounts = new Map();

  for (const sample of samples) {
    if (!sample.email || !sample.name) continue;
    if (sample.email.includes('email_not_unlocked')) continue;
    if (!sample.email.endsWith(`@${domain}`)) continue;

    const emailLocalPart = sample.email.split('@')[0];

    for (const pattern of SMART_PATTERNS) {
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
 * OPTIMIZED Smart Permutation (ONLY 6 patterns, test on first candidate only)
 */
async function findEmailByPermutation(candidates = [], domain) {
  if (!candidates.length) return [];

  console.log(`[permute] Testing 6 smart patterns on first candidate only...`);

  const firstCandidate = candidates[0];
  let successfulPattern = null;
  let verificationResult = null;

  // Test patterns ONLY on first candidate
  for (const pattern of SMART_PATTERNS) {
    const emailGuess = applyPattern(firstCandidate, domain, pattern);
    if (!emailGuess) continue;

    const result = await verifyEmailMulti(emailGuess);

    if (result.status === 'valid' || result.status === 'accept_all') {
      console.log(`[permute] ✅ Pattern validated: '${pattern}' for ${domain}`);
      successfulPattern = pattern;
      verificationResult = result;

      // Cache the discovered pattern
      await setDomainPattern({
        domain,
        pattern: successfulPattern,
        source: 'smart_permutation',
        confidence: result.confidence ? result.confidence / 100 : 0.85,
        status: result.status === 'accept_all' ? 'catch_all' : 'valid'
      });

      break;  // STOP after first valid pattern
    }
  }

  if (!successfulPattern) {
    console.log('[permute] ❌ No valid pattern found in 6 smart patterns');
    return candidates.map(c => ({ ...c, email_reason: 'permutation_failed' }));
  }

  // Apply validated pattern to ALL candidates
  console.log(`[permute] ✅ Applying validated pattern to all ${candidates.length} candidates`);
  return candidates.map((c, idx) => ({
    ...c,
    email: applyPattern(c, domain, successfulPattern),
    email_status: idx === 0 ? verificationResult.status : 'patterned',
    email_reason: 'smart_permutation',
    email_verifier: idx === 0 ? verificationResult.verifier : 'none'
  }));
}

/**
 * OPTIMIZED EMAIL ENRICHMENT
 *
 * New Layer Priority:
 * 1. LLM Pattern Discovery (cheapest, fastest, ~$0.001)
 * 2. Apollo Sample Inference (free, checks if Apollo returned real emails)
 * 3. Cached Domain Patterns (free, instant)
 * 4. Smart Permutation (6 patterns on 1 lead only, then apply to all)
 */
export async function enrichWithEmailEnhancedOptimized(candidates = [], domain, company = {}) {
  console.log(`[email-optimized] Starting OPTIMIZED enrichment for ${candidates.length} candidates at ${domain}`);

  if (!candidates.length || !domain) {
    return candidates;
  }

  // LAYER 1: LLM Pattern Discovery (FIRST PRIORITY)
  const llmPattern = await discoverPatternViaLLM(company.name, domain, company.sector);

  if (llmPattern && llmPattern.confidence >= 70) {
    console.log(`[email-optimized] ✅ Using LLM-discovered pattern: ${llmPattern.pattern} (${llmPattern.confidence}%)`);

    // Test pattern with one verification
    const testCandidate = candidates[0];
    const testEmail = applyPattern(testCandidate, domain, llmPattern.pattern);

    if (testEmail) {
      const verificationResult = await verifyEmailMulti(testEmail);

      if (verificationResult.status === 'valid' || verificationResult.status === 'accept_all') {
        console.log(`[email-optimized] ✅ LLM pattern validated! Applying to all candidates.`);

        // Cache the pattern
        await setDomainPattern({
          domain,
          pattern: llmPattern.pattern,
          source: 'llm_discovery',
          confidence: llmPattern.confidence / 100,
          status: verificationResult.status === 'accept_all' ? 'catch_all' : 'valid'
        });

        // Apply to all candidates
        return candidates.map((c, idx) => ({
          ...c,
          email: applyPattern(c, domain, llmPattern.pattern),
          email_status: idx === 0 ? verificationResult.status : 'patterned',
          email_reason: 'llm_discovery',
          email_pattern_confidence: llmPattern.confidence
        }));
      } else {
        console.log(`[email-optimized] LLM pattern did not validate, trying other methods...`);
      }
    }
  }

  // LAYER 2: Check if Apollo returned real email samples
  const samples = candidates.filter(c =>
    c.email &&
    !c.email.includes("email_not_unlocked") &&
    c.email.endsWith(`@${domain}`)
  );

  if (samples.length >= 2) {
    console.log(`[email-optimized] Layer 2: Found ${samples.length} real Apollo email samples`);
    const inferred = inferPatternFromSamples(samples, domain);

    if (inferred && inferred.confidence >= 70) {
      console.log(`[email-optimized] ✅ Inferred pattern from Apollo: ${inferred.pattern} (${inferred.confidence}%)`);

      // Cache the pattern
      await setDomainPattern({
        domain,
        pattern: inferred.pattern,
        source: 'apollo_samples',
        confidence: inferred.confidence / 100,
        status: 'valid'
      });

      // Apply to all candidates
      return candidates.map(c => ({
        ...c,
        email: c.email || applyPattern(c, domain, inferred.pattern),
        email_status: c.email ? 'apollo_provided' : 'patterned',
        email_reason: 'apollo_samples',
        email_pattern_confidence: inferred.confidence
      }));
    }
  }

  // LAYER 3: Check cached domain pattern
  let domainIntel = await getDomainPattern(domain);

  if (domainIntel?.status === 'invalid') {
    console.log(`[email-optimized] Ignoring known-invalid cached pattern`);
    domainIntel = null;
  }

  if (domainIntel && domainIntel.confidence >= 0.7) {
    console.log(`[email-optimized] Layer 3: Using cached pattern: ${domainIntel.pattern}`);

    return candidates.map(c => ({
      ...c,
      email: applyPattern(c, domain, domainIntel.pattern),
      email_status: domainIntel.status === 'catch_all' ? 'accept_all' : 'patterned',
      email_reason: 'cached_pattern',
      email_pattern_confidence: Math.round(domainIntel.confidence * 100)
    }));
  }

  // LAYER 4: Smart Permutation (6 patterns, test on first candidate only)
  console.log(`[email-optimized] Layer 4: Trying smart permutation (6 patterns)...`);
  return await findEmailByPermutation(candidates, domain);
}

export default { enrichWithEmailEnhancedOptimized, verifyEmailMulti };
