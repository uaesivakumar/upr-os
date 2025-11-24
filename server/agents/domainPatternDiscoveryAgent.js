/**
 * Domain + Pattern Discovery Agent
 * Uses SERP API to find company domain AND email pattern simultaneously
 * Extracts pattern intelligence from RocketReach, LeadIQ, and other sources
 * NO HALLUCINATION - only returns verified data from search results
 *
 * Cost: $0.005 per search (vs $0.039 with Apollo + NeverBounce)
 * 87% cost savings when high-confidence pattern found
 */

import serpTool from '../tools/serp.js';
import { getDb } from '../lib/emailIntelligence/db.js';

/**
 * Discover company domain and email pattern using SERP
 * @param {string} companyName - Company name
 * @param {string} location - Optional location (e.g., "Dubai, UAE")
 * @returns {Promise<{domain: string, pattern: string, confidence: number, source: string, evidence: object}>}
 */
/**
 * Manual domain overrides for known problem companies
 * Use when SERP/Apollo consistently returns wrong domain
 */
const DOMAIN_OVERRIDES = {
  'khansaheb': 'khansaheb.com',           // Not .ae
  'emitac': 'emitac.ae',                  // Not emitachealthcare.com
  'emirates general transport': 'et.ae',  // Not et.gov.ae
  'emirates transport': 'et.ae',          // Not et.gov.ae
  'lulu mea': 'lulumea.com',              // Not ae.lulumea.com
  'lulumea': 'lulumea.com'                // Not ae.lulumea.com
};

export async function discoverDomainAndPattern(companyName, location = null) {
  console.log(`[DomainPatternDiscovery] Starting discovery for: ${companyName}`);

  const startTime = Date.now();

  try {
    // Step 0: Check manual domain overrides first
    const companyKey = companyName.toLowerCase().trim();
    if (DOMAIN_OVERRIDES[companyKey]) {
      const overrideDomain = DOMAIN_OVERRIDES[companyKey];
      console.log(`[DomainPatternDiscovery] ✅ Using manual override: ${overrideDomain}`);
      return {
        domain: overrideDomain,
        pattern: null, // Let Apollo discover pattern
        confidence: 1.0, // High confidence for manual overrides
        source: 'manual_override',
        evidence: { company: companyName, override: overrideDomain },
        processing_time_ms: Date.now() - startTime
      };
    }

    // Step 1: Search for email pattern (includes domain info)
    const searchQuery = location
      ? `email address pattern for employees from ${companyName} ${location}`
      : `email address pattern for employees from ${companyName}`;

    console.log(`[DomainPatternDiscovery] Search query: "${searchQuery}"`);

    const searchResponse = await serpTool.search({
      query: searchQuery,
      location: location || 'United Arab Emirates',
      engine: 'google',
      num: 10
    });

    if (!searchResponse.success || !searchResponse.results || searchResponse.results.length === 0) {
      console.warn(`[DomainPatternDiscovery] No search results for ${companyName}`);
      return {
        domain: null,
        pattern: null,
        confidence: 0,
        source: 'serp_no_results',
        evidence: { query: searchQuery, results: 0 },
        processing_time_ms: Date.now() - startTime
      };
    }

    const searchResults = searchResponse.results;
    console.log(`[DomainPatternDiscovery] Found ${searchResults.length} results`);

    // Step 2: Extract domain and pattern from results
    const discoveries = extractDomainAndPattern(searchResults, companyName);

    if (discoveries.length === 0) {
      console.warn(`[DomainPatternDiscovery] No valid domain/pattern found for ${companyName}`);
      return {
        domain: null,
        pattern: null,
        confidence: 0,
        source: 'serp_no_extraction',
        evidence: { query: searchQuery, results: searchResults.length },
        processing_time_ms: Date.now() - startTime
      };
    }

    // Step 3: Rank discoveries by confidence
    const ranked = rankDiscoveries(discoveries, companyName);
    const topDiscovery = ranked[0];

    console.log(`[DomainPatternDiscovery] Top discovery:`);
    console.log(`  Domain: ${topDiscovery.domain}`);
    console.log(`  Pattern: ${topDiscovery.pattern}`);
    console.log(`  Confidence: ${topDiscovery.confidence.toFixed(2)}`);
    console.log(`  Source: ${topDiscovery.source}`);

    // Step 4: Validate confidence threshold
    if (topDiscovery.confidence < 0.6) {
      console.warn(`[DomainPatternDiscovery] Low confidence (${topDiscovery.confidence.toFixed(2)}) for ${companyName}`);
    }

    return {
      domain: topDiscovery.domain,
      pattern: topDiscovery.pattern,
      confidence: topDiscovery.confidence,
      source: topDiscovery.source,
      alternative_patterns: ranked.slice(1, 3).map(d => ({
        pattern: d.pattern,
        confidence: d.confidence
      })),
      evidence: {
        query: searchQuery,
        top_result: topDiscovery.evidence,
        total_results: searchResults.length
      },
      processing_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`[DomainPatternDiscovery] Error for ${companyName}:`, error);
    return {
      domain: null,
      pattern: null,
      confidence: 0,
      source: 'error',
      evidence: { error: error.message },
      processing_time_ms: Date.now() - startTime
    };
  }
}

/**
 * Extract domain and pattern from SERP results
 */
function extractDomainAndPattern(results, companyName) {
  const discoveries = [];

  for (const result of results) {
    const { title, snippet, link } = result;
    const text = `${title || ''} ${snippet || ''}`.toLowerCase();

    // Pattern 1: RocketReach format
    // "The most common email format is [first].[last] (ex. john.doe@maf.ae)"
    const rocketReachMatch = text.match(/email format is \[?(\w+)\]?\.?\[?(\w+)\]? \(ex\. [^@]+@([a-z0-9.-]+\.[a-z]+)\)/i);
    if (rocketReachMatch) {
      const [, first, last, domain] = rocketReachMatch;
      discoveries.push({
        domain,
        pattern: normalizePattern(`{${first}}.{${last}}`),
        confidence: 0.85, // RocketReach is highly reliable
        source: 'rocketreach',
        source_url: link,
        evidence: {
          matched_text: rocketReachMatch[0],
          source: 'RocketReach',
          url: link
        }
      });
    }

    // Pattern 2: Percentage-based confidence
    // "62.7% of email addresses follow {first}.{last}@maf.ae"
    const percentageMatch = text.match(/(\d+\.?\d*)%[^@]*@([a-z0-9.-]+\.[a-z]+)/i);
    if (percentageMatch) {
      const [, percentage, domain] = percentageMatch;
      const patternMatch = text.match(/\{?(\w+)\}?[\._]?\{?(\w+)\}?@/i);
      if (patternMatch) {
        const [, first, last] = patternMatch;
        discoveries.push({
          domain,
          pattern: normalizePattern(`{${first}}.{${last}}`),
          confidence: parseFloat(percentage) / 100,
          source: 'percentage_based',
          source_url: link,
          evidence: {
            matched_text: percentageMatch[0],
            percentage: parseFloat(percentage),
            url: link
          }
        });
      }
    }

    // Pattern 3: Domain extraction from examples
    // "john.doe@maf.ae" or "firstname.lastname@company.ae"
    const emailExamples = text.match(/[a-z][a-z0-9]*\.?[a-z0-9]+@([a-z0-9.-]+\.[a-z]+)/gi);
    if (emailExamples) {
      const domainPatterns = new Map();

      for (const example of emailExamples) {
        const domain = example.split('@')[1].toLowerCase();
        const localPart = example.split('@')[0].toLowerCase();

        // Improved pattern inference based on structure analysis
        let pattern = '{first}.{last}'; // Default

        if (localPart.includes('.')) {
          const parts = localPart.split('.');
          if (parts.length === 2) {
            // Check if parts are single letters (initials)
            if (parts[0].length === 1 && parts[1].length === 1) {
              pattern = '{f}.{l}'; // f.l@domain.com
            } else if (parts[0].length === 1) {
              pattern = '{f}.{last}'; // f.lastname@domain.com
            } else if (parts[1].length === 1) {
              pattern = '{first}.{l}'; // firstname.l@domain.com or first.lastinitial
            } else {
              pattern = '{first}.{last}'; // firstname.lastname@domain.com
            }
          }
        } else {
          // No dot in local part - analyze length and structure
          const len = localPart.length;

          // Check if it's just initials (2-3 chars)
          if (len === 2) {
            pattern = '{f}{l}'; // fl@domain.com (first initial + last initial)
          } else if (len === 3 && /^[a-z]{2}[a-z]$/.test(localPart)) {
            // Could be initials or short name
            pattern = '{f}{l}'; // Assume initials for very short emails
          } else if (len >= 4 && len <= 12) {
            // Likely first name only or first+initial
            // Check if last char looks like initial
            if (/^[a-z]+[a-z]$/.test(localPart) && len <= 8) {
              pattern = '{first}'; // firstname@domain.com
            } else {
              pattern = '{first}{l}'; // firstname + last initial
            }
          } else if (len <= 10) {
            pattern = '{first}{l}'; // firstname + last initial
          }
        }

        const key = `${domain}||${pattern}`;
        domainPatterns.set(key, (domainPatterns.get(key) || 0) + 1);
      }

      // Use most common domain+pattern combo
      for (const [key, count] of domainPatterns) {
        const [domain, pattern] = key.split('||');
        discoveries.push({
          domain,
          pattern: normalizePattern(pattern),
          confidence: 0.60 + (count * 0.05), // Boost for multiple examples
          source: 'email_example',
          source_url: link,
          evidence: {
            examples: count,
            inferred_pattern: pattern,
            url: link
          }
        });
      }
    }

    // Pattern 4: LeadIQ/SignalHire format
    // "Email format: First.Last@domain.com"
    const leadiqMatch = text.match(/email format:?\s*(\w+)[\._](\w+)@([a-z0-9.-]+\.[a-z]+)/i);
    if (leadiqMatch) {
      const [, first, last, domain] = leadiqMatch;
      discoveries.push({
        domain,
        pattern: normalizePattern(`{${first.toLowerCase()}}.{${last.toLowerCase()}}`),
        confidence: 0.80, // LeadIQ is reliable
        source: 'leadiq',
        source_url: link,
        evidence: {
          matched_text: leadiqMatch[0],
          source: 'LeadIQ/SignalHire',
          url: link
        }
      });
    }

    // Pattern 5: AI Overview or snippet mentions
    // "The email domain is consistently maf.ae"
    const domainMention = text.match(/email domain is (?:consistently |typically )?([a-z0-9.-]+\.[a-z]+)/i);
    if (domainMention) {
      const domain = domainMention[1];
      // Look for pattern in same text
      const patternInText = text.match(/(\w+)\.(\w+)@/);
      if (patternInText) {
        const [, first, last] = patternInText;
        discoveries.push({
          domain,
          pattern: normalizePattern(`{${first}}.{${last}}`),
          confidence: 0.75,
          source: 'ai_overview',
          source_url: link,
          evidence: {
            matched_text: domainMention[0],
            source: 'Google AI Overview',
            url: link
          }
        });
      }
    }

    // Pattern 6: Explicit pattern notation
    // "{first}.{last}@company.ae" or "[first].[last]@domain.com"
    const explicitPattern = text.match(/[\{\[](\w+)[\}\]]\.[\{\[](\w+)[\}\]]@([a-z0-9.-]+\.[a-z]+)/i);
    if (explicitPattern) {
      const [, first, last, domain] = explicitPattern;
      discoveries.push({
        domain,
        pattern: normalizePattern(`{${first}}.{${last}}`),
        confidence: 0.88, // Explicit notation is very reliable
        source: 'explicit_notation',
        source_url: link,
        evidence: {
          matched_text: explicitPattern[0],
          url: link
        }
      });
    }
  }

  return discoveries;
}

/**
 * Rank discoveries by confidence
 */
function rankDiscoveries(discoveries, companyName) {
  // Deduplicate by domain+pattern
  const uniqueMap = new Map();

  for (const d of discoveries) {
    const key = `${d.domain}||${d.pattern}`;
    if (!uniqueMap.has(key) || uniqueMap.get(key).confidence < d.confidence) {
      uniqueMap.set(key, d);
    }
  }

  const unique = Array.from(uniqueMap.values());

  // Boost confidence based on source reliability
  const boosted = unique.map(d => {
    let boostedConfidence = d.confidence;

    // Boost for authoritative sources
    if (d.source === 'rocketreach') boostedConfidence *= 1.1;
    if (d.source === 'explicit_notation') boostedConfidence *= 1.08;
    if (d.source === 'leadiq') boostedConfidence *= 1.05;
    if (d.source === 'percentage_based' && d.confidence > 0.6) boostedConfidence *= 1.08;

    // Removed .ae domain boost to prevent TLD mismatch (khansaheb.ae vs khansaheb.com)
    // Companies often use both .ae and .com - let confidence from source determine winner

    // Cap at 1.0
    boostedConfidence = Math.min(1.0, boostedConfidence);

    return {
      ...d,
      confidence: boostedConfidence,
      original_confidence: d.confidence
    };
  });

  // Sort by confidence descending
  return boosted.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Normalize pattern format for storage
 * Converts various pattern formats to canonical form
 */
function normalizePattern(pattern) {
  return pattern
    .toLowerCase()
    .replace(/first[_-]?name/gi, 'first')
    .replace(/last[_-]?name/gi, 'last')
    .replace(/\[(\w+)\]/g, '{$1}') // [first] -> {first}
    .replace(/_/g, '.') // first_last -> first.last
    .trim();
}

/**
 * Cache discovery result
 */
export async function cacheDiscoveryResult(companyName, result) {
  const db = getDb();

  try {
    await db.query(`
      INSERT INTO domain_pattern_discovery_cache (
        company_name,
        domain,
        pattern,
        confidence,
        source,
        alternative_patterns,
        evidence,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (company_name)
      DO UPDATE SET
        domain = EXCLUDED.domain,
        pattern = EXCLUDED.pattern,
        confidence = EXCLUDED.confidence,
        source = EXCLUDED.source,
        alternative_patterns = EXCLUDED.alternative_patterns,
        evidence = EXCLUDED.evidence,
        updated_at = NOW()
    `, [
      companyName,
      result.domain,
      result.pattern,
      result.confidence,
      result.source,
      JSON.stringify(result.alternative_patterns || []),
      JSON.stringify(result.evidence)
    ]);

    console.log(`[DomainPatternDiscovery] Cached result for ${companyName}`);
  } catch (error) {
    console.error(`[DomainPatternDiscovery] Cache error:`, error);
    // Non-fatal - continue without caching
  }
}

/**
 * Get cached discovery
 */
export async function getCachedDiscovery(companyName) {
  const db = getDb();

  try {
    const result = await db.query(`
      SELECT domain, pattern, confidence, source,
             alternative_patterns, evidence, created_at
      FROM domain_pattern_discovery_cache
      WHERE company_name = $1
        AND created_at > NOW() - INTERVAL '90 days'
    `, [companyName]);

    if (result.rows.length === 0) {
      return null;
    }

    const cached = result.rows[0];
    console.log(`[DomainPatternDiscovery] Cache hit for ${companyName}`);

    return {
      domain: cached.domain,
      pattern: cached.pattern,
      confidence: parseFloat(cached.confidence),
      source: cached.source + '_cached',
      alternative_patterns: cached.alternative_patterns,
      evidence: cached.evidence
    };
  } catch (error) {
    console.error(`[DomainPatternDiscovery] Cache read error:`, error);
    return null;
  }
}
