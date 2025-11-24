// routes/enrich/lib/email.js
import { verifyEmail } from "./person.js";
import { findEmailWithHunter } from "./hunter.js";
import { getDomainPattern, setDomainPattern } from "../../../utils/patternCache.js";
import { discoverEmailPattern } from "../../../utils/llm.js";

const HIGH_CONFIDENCE_THRESHOLD = 80; // Apply pattern without verification if confidence is >= 80%

const COMMON_PATTERNS = [
    '{first}.{last}', '{f}{last}', '{first}{l}', '{first}',
    '{first}_{last}', '{last}.{first}', '{l}{first}', '{last}',
];

function splitName(name = "") {
    const parts = name.toLowerCase().replace(/[^a-z\s]/g, '').split(' ').filter(Boolean);
    if (parts.length === 0) return { first: '', last: '' };
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts[parts.length - 1] };
}

// [FIXED] This function is now smarter and won't duplicate the @domain.com part.
function applyPattern(person, domain, pattern) {
    const { first, last } = splitName(person.name);
    if (!pattern || !first) return null;
    if ((pattern.includes('{last}') || pattern.includes('{l}')) && !last) return null;
    
    const processedPattern = pattern
        .replace('{first}', first).replace('{last}', last)
        .replace('{f}', first[0]).replace('{l}', last ? last[0] : '');

    // If the pattern from the AI already includes the domain, don't add it again.
    if (processedPattern.includes('@')) {
        return processedPattern;
    }
    
    // Otherwise, append the domain as normal.
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
    return { pattern: sortedPatterns[0][0], confidence: 75 };
}

async function findEmailByPermutation(candidates = [], domain) {
    console.log(`[permute] 🔄 Starting smart permutation for domain: ${domain}`);
    console.log(`[permute] Testing ${COMMON_PATTERNS.length} patterns using ONLY ONE candidate to save credits`);

    // [FIX] Test patterns using ONLY the first valid candidate (not all candidates)
    const testCandidate = candidates.find(c => c.name) || candidates[0];
    if (!testCandidate) {
        console.log(`[permute] ❌ No valid test candidate found`);
        return candidates.map(c => ({ ...c, email_reason: 'permutation_failed' }));
    }

    console.log(`[permute] Using test candidate: ${testCandidate.name}`);
    let successfulPattern = null;
    let testResult = null;
    let patternsTestedCount = 0;

    for (const pattern of COMMON_PATTERNS) {
        const emailGuess = applyPattern(testCandidate, domain, pattern);
        if (!emailGuess) {
            console.log(`[permute]   Pattern "${pattern}" → skipped (couldn't generate email)`);
            continue;
        }

        patternsTestedCount++;
        console.log(`[permute]   Pattern "${pattern}" → Testing: ${emailGuess}`);
        const result = await verifyEmail(emailGuess);
        console.log(`[permute]   Result: ${result.status}`);

        if (result.status === 'valid' || result.status === 'validated' || result.status === 'accept_all') {
            console.log(`[permute] ✅ SUCCESS! Pattern "${pattern}" works for ${domain}`);
            successfulPattern = pattern;
            testResult = result;

            await setDomainPattern({
                domain,
                pattern: successfulPattern,
                source: 'smart_permutation',
                confidence: 0.8,
                status: result.status === 'accept_all' ? 'catch_all' : 'valid'
            });
            console.log(`[permute] 📦 Pattern cached for future use`);
            break; // Stop testing once we find a working pattern
        }
    }

    console.log(`[permute] Tested ${patternsTestedCount} patterns (saved ${(candidates.length - 1) * patternsTestedCount} API calls by testing only 1 candidate)`);

    if (successfulPattern) {
        console.log(`[permute] ✅ Applying successful pattern to all ${candidates.length} candidates WITHOUT further verification`);
        const emailStatusForAll = testResult.status === 'accept_all' ? 'accept_all' : 'patterned';
        return candidates.map(c => ({
            ...c,
            email: applyPattern(c, domain, successfulPattern),
            email_status: emailStatusForAll,
            email_reason: 'smart_permutation'
        }));
    }

    console.log(`[permute] ❌ ALL ${patternsTestedCount} patterns failed. No emails generated.`);
    return candidates.map(c => ({ ...c, email_reason: 'permutation_failed' }));
}

export async function enrichWithEmail(candidates = [], domain, company = {}) {
  console.log(`\n🔍 === EMAIL ENRICHMENT START ===`);
  console.log(`[email] Domain: ${domain}, Company: ${company.name || 'Unknown'}`);
  console.log(`[email] Total candidates: ${candidates.length}`);
  console.log(`[email] Candidates needing emails: ${candidates.filter(c => !c.email).length}`);

  // ========================================
  // STEP 1: CACHE CHECK (0 cost, instant)
  // ========================================
  let domainIntel = await getDomainPattern(domain);
  console.log(`[email] 📦 STEP 1: Cache lookup -`, domainIntel ? `pattern="${domainIntel.pattern}", status="${domainIntel.status}", confidence=${Math.round((domainIntel.confidence || 0) * 100)}%` : 'CACHE MISS');

  // If domain marked as "no_pattern", don't waste time/credits retrying
  if (domainIntel?.status === 'no_pattern') {
    console.log(`[email] ⚠️  Domain ${domain} previously marked as no_pattern. Skipping email generation.`);
    console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
    return candidates.map(c => ({ ...c, email_reason: 'no_pattern_cached' }));
  }

  // If domain marked as "invalid", ignore that cache entry and try again
  if (domainIntel?.status === 'invalid') {
    console.log(`[email] ⚠️  Ignoring known-invalid cached pattern for ${domain}.`);
    domainIntel = null;
  }

  // CACHE HIT: Apply cached pattern immediately
  if (domainIntel?.status === 'catch_all') {
      console.log(`[email] ✅ CACHE HIT: Domain ${domain} is catch-all. Applying pattern to all ${candidates.length} candidates.`);
      const results = candidates.map(c => ({
          ...c,
          email: applyPattern(c, domain, domainIntel.pattern),
          email_status: 'accept_all',
          email_reason: 'cached_catch_all',
          email_pattern_confidence: Math.round((domainIntel.confidence || 0.8) * 100)
      }));
      console.log(`[email] ✅ Generated ${results.filter(r => r.email).length} catch-all emails (0 API calls)`);
      console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
      return results;
  }

  if (domainIntel?.status === 'valid') {
      console.log(`[email] ✅ CACHE HIT: Valid pattern found. Applying to all ${candidates.length} candidates.`);
      const results = candidates.map(c => ({
          ...c,
          email: applyPattern(c, domain, domainIntel.pattern),
          email_status: 'patterned',
          email_reason: 'cached_valid_pattern',
          email_pattern_confidence: Math.round((domainIntel.confidence || 0.8) * 100)
      }));
      console.log(`[email] ✅ Generated ${results.filter(r => r.email).length} emails (0 API calls)`);
      console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
      return results;
  }

  if (domainIntel?.status === 'unverified') {
      console.log(`[email] 📧 CACHE HIT: Unverified pattern found. Applying to all ${candidates.length} candidates.`);
      const results = candidates.map(c => ({
          ...c,
          email: applyPattern(c, domain, domainIntel.pattern),
          email_status: 'unverified',
          email_reason: 'cached_unverified_pattern',
          email_pattern_confidence: Math.round((domainIntel.confidence || 0.75) * 100)
      }));
      console.log(`[email] 📧 Generated ${results.filter(r => r.email).length} UNVERIFIED emails (0 API calls)`);
      console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
      return results;
  }

  // ========================================
  // STEP 2: LLM PATTERN DISCOVERY (1 LLM call + 0-1 NeverBounce call)
  // ========================================
  console.log(`[email] 🤖 STEP 2: LLM Pattern Discovery - Calling AI for ${domain}...`);
  const aiPattern = await discoverEmailPattern(company.name || domain, domain);

  if (aiPattern && aiPattern.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    console.log(`[email] ✅ LLM SUCCESS: Pattern "${aiPattern.pattern}" with ${aiPattern.confidence}% confidence`);

    // For VERY HIGH confidence (>=90%), skip verification entirely
    // This handles large companies (Microsoft, Google, etc.) that block email verification
    if (aiPattern.confidence >= 90) {
      console.log(`[email] ⭐ VERY HIGH confidence (${aiPattern.confidence}%) - Skipping verification for companies that block it`);
      console.log(`[email] ✅ Applying pattern directly to ALL ${candidates.length} candidates.`);

      await setDomainPattern({
        domain,
        pattern: aiPattern.pattern,
        source: 'ai_llm_discovered',
        confidence: aiPattern.confidence / 100,
        status: 'valid'
      });

      const results = candidates.map(c => ({
        ...c,
        email: applyPattern(c, domain, aiPattern.pattern),
        email_status: 'patterned',
        email_reason: 'ai_llm_high_confidence',
        email_pattern_confidence: aiPattern.confidence
      }));

      console.log(`[email] ✅ Generated ${results.filter(r => r.email).length} emails (1 LLM call + 0 NeverBounce calls)`);
      console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
      return results;
    }

    // For HIGH confidence (80-89%), test with NeverBounce
    console.log(`[email] 🧪 Testing pattern with ONE lead via NeverBounce...`);

    const testCandidate = candidates.find(c => c.name) || candidates[0];
    if (!testCandidate) {
      console.log(`[email] ❌ No valid test candidate found`);
    } else {
      const testEmail = applyPattern(testCandidate, domain, aiPattern.pattern);
      console.log(`[email] 🧪 Testing: ${testEmail}`);

      const verificationResult = await verifyEmail(testEmail);
      console.log(`[email] 🧪 NeverBounce result: ${verificationResult.status}`);

      if (verificationResult.status === 'valid' || verificationResult.status === 'validated' || verificationResult.status === 'accept_all') {
        const cacheStatus = verificationResult.status === 'accept_all' ? 'catch_all' : 'valid';
        const emailStatus = verificationResult.status === 'accept_all' ? 'accept_all' : 'patterned';

        console.log(`[email] ✅ LLM pattern VERIFIED! Caching as "${cacheStatus}" and applying to ALL ${candidates.length} candidates.`);

        await setDomainPattern({
          domain,
          pattern: aiPattern.pattern,
          source: 'ai_llm_discovered',
          confidence: aiPattern.confidence / 100,
          status: cacheStatus
        });

        const results = candidates.map(c => ({
          ...c,
          email: applyPattern(c, domain, aiPattern.pattern),
          email_status: emailStatus,
          email_reason: 'ai_llm_discovered',
          email_pattern_confidence: aiPattern.confidence
        }));

        console.log(`[email] ✅ Generated ${results.filter(r => r.email).length} emails (1 LLM call + 1 NeverBounce call)`);
        console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
        return results;
      } else {
        console.log(`[email] ⚠️  LLM pattern REJECTED by NeverBounce (${verificationResult.status}).`);
        console.log(`[email] 📧 But still applying pattern - user should decide! Marking as "unverified".`);

        await setDomainPattern({
          domain,
          pattern: aiPattern.pattern,
          source: 'ai_llm_discovered',
          confidence: aiPattern.confidence / 100,
          status: 'unverified' // New status: pattern exists but not verified
        });

        const results = candidates.map(c => ({
          ...c,
          email: applyPattern(c, domain, aiPattern.pattern),
          email_status: 'unverified',
          email_reason: 'ai_llm_unverified',
          email_pattern_confidence: aiPattern.confidence
        }));

        console.log(`[email] 📧 Generated ${results.filter(r => r.email).length} UNVERIFIED emails (1 LLM call + 1 NeverBounce call)`);
        console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
        return results;
      }
    }
  } else if (aiPattern && aiPattern.confidence >= 70) {
    // For moderate confidence (70-79%), apply pattern without testing
    console.log(`[email] ⚠️  LLM returned MODERATE confidence (${aiPattern.confidence}%). Applying as unverified.`);

    await setDomainPattern({
      domain,
      pattern: aiPattern.pattern,
      source: 'ai_llm_discovered',
      confidence: aiPattern.confidence / 100,
      status: 'unverified'
    });

    const results = candidates.map(c => ({
      ...c,
      email: applyPattern(c, domain, aiPattern.pattern),
      email_status: 'unverified',
      email_reason: 'ai_llm_moderate_confidence',
      email_pattern_confidence: aiPattern.confidence
    }));

    console.log(`[email] 📧 Generated ${results.filter(r => r.email).length} UNVERIFIED emails (1 LLM call, moderate confidence)`);
    console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
    return results;
  } else if (aiPattern) {
    console.log(`[email] ⚠️  LLM returned LOW confidence (${aiPattern.confidence}%). Skipping.`);
  } else {
    console.log(`[email] ❌ LLM pattern discovery failed or returned null.`);
  }

  // ========================================
  // STEP 3: SMART PERMUTATION (max 8 NeverBounce calls)
  // ========================================
  console.log(`[email] 🔄 STEP 3: Smart Permutation - Testing common patterns...`);
  const permutationResult = await findEmailByPermutation(candidates, domain);

  const successCount = permutationResult.filter(r => r.email).length;
  if (successCount > 0) {
    console.log(`[email] ✅ Permutation SUCCESS: ${successCount}/${candidates.length} emails generated`);
    console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
    return permutationResult;
  }

  // ========================================
  // STEP 4: NO PATTERN FOUND - Cache as "no_pattern"
  // ========================================
  console.log(`[email] ❌ STEP 4: All methods failed. Caching domain as "no_pattern" to prevent retries.`);
  await setDomainPattern({
    domain,
    pattern: null,
    source: 'all_methods_failed',
    confidence: 0,
    status: 'no_pattern'
  });

  console.log(`🔍 === EMAIL ENRICHMENT END ===\n`);
  return candidates.map(c => ({ ...c, email_reason: 'all_methods_failed' }));
}

export default { enrichWithEmail };