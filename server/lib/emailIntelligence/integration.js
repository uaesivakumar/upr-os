/**
 * EmailPatternEngine v3.0.0 - Integration Wrapper
 *
 * Connects the Bayesian email pattern engine with existing enrichment pipeline.
 * Provides backward-compatible API while using new inference system.
 *
 * @module server/lib/emailIntelligence/integration
 */

import { learnPattern } from './orchestrator.js';
import { initDb } from './db.js';

/**
 * Enhanced email generation with pattern learning
 *
 * Replaces existing enrichWithEmail* functions with Bayesian engine.
 * Backward compatible with existing enrichment pipeline.
 *
 * @param {Object} params - Enrichment parameters
 * @param {string} params.company_name - Company name
 * @param {string} params.domain - Company domain
 * @param {string} [params.sector] - Industry sector
 * @param {string} [params.region] - Geographic region
 * @param {string} [params.company_size] - Company size
 * @param {Array} params.candidates - Lead candidates with {name, title, first_name, last_name}
 * @param {Object} [params.db] - Database connection pool
 * @param {string} [params.serp_suggested_pattern] - Pattern suggested by SERP discovery
 * @param {number} [params.serp_confidence] - SERP confidence score
 * @param {string} [params.serp_source] - SERP source (e.g., 'rocketreach')
 * @returns {Promise<Object>} - Enrichment result with candidates
 */
export async function enrichWithPatternEngine(params) {
  const {
    company_name,
    domain,
    sector,
    region,
    company_size,
    candidates = [],
    db,
    serp_suggested_pattern = null,
    serp_confidence = 0,
    serp_source = null
  } = params;

  console.log(`[Integration] Enriching ${domain} using EmailPatternEngine v3.0.0`);

  // Initialize database for emailIntelligence modules
  if (db) {
    initDb(db);
  }

  try {
    // Step 1: Prepare leads for pattern learning
    const leads = candidates.map(c => {
      // Handle different input formats
      const firstName = c.first_name || c.firstName || c.name?.split(' ')[0] || '';
      const lastName = c.last_name || c.lastName || c.name?.split(' ').slice(1).join(' ') || '';
      const title = c.title || c.job_title || '';

      return {
        first_name: firstName,
        last_name: lastName,
        title
      };
    }).filter(l => l.first_name && l.last_name); // Only valid leads

    console.log(`[Integration] Prepared ${leads.length} leads for pattern learning`);

    // Step 2: Learn pattern using Bayesian engine with SERP hints
    const patternResult = await learnPattern({
      company: company_name,
      domain,
      sector,
      region,
      company_size,
      leads,
      serp_suggested_pattern,
      serp_confidence,
      serp_source
    });

    console.log(`[Integration] Pattern learned: ${patternResult.pattern} (confidence: ${patternResult.confidence.toFixed(2)}, source: ${patternResult.source})`);

    // Step 3: Apply pattern to all candidates
    const enrichedCandidates = candidates.map(candidate => {
      const firstName = candidate.first_name || candidate.firstName || candidate.name?.split(' ')[0] || '';
      const lastName = candidate.last_name || candidate.lastName || candidate.name?.split(' ').slice(1).join(' ') || '';

      if (!firstName || !lastName) {
        return {
          ...candidate,
          email: null,
          email_pattern: null,
          email_confidence: 0,
          email_source: 'invalid_name',
          email_status: 'error'
        };
      }

      const email = applyPattern(firstName, lastName, domain, patternResult.pattern);

      return {
        ...candidate,
        email,
        email_pattern: patternResult.pattern,
        email_confidence: patternResult.confidence,
        email_source: patternResult.source,
        email_status: patternResult.validation?.valid >= 2 ? 'verified' : 'predicted',
        email_validated: patternResult.validation?.valid >= 2
      };
    });

    const validEmails = enrichedCandidates.filter(c => c.email).length;
    console.log(`[Integration] Enriched ${validEmails}/${enrichedCandidates.length} candidates with valid emails`);

    return {
      success: true,
      pattern: patternResult.pattern,
      confidence: patternResult.confidence,
      source: patternResult.source,
      candidates: enrichedCandidates,
      cost: patternResult.cost || 0,
      duration: patternResult.duration || 0,
      validation: patternResult.validation || null,
      // Backward compatibility fields
      email_pattern: patternResult.pattern,
      email_confidence: patternResult.confidence
    };

  } catch (error) {
    console.error('[Integration] Error:', error);

    // Fallback to default pattern on error
    const defaultPattern = '{first}.{last}';
    const enrichedCandidates = candidates.map(candidate => {
      const firstName = candidate.first_name || candidate.firstName || candidate.name?.split(' ')[0] || '';
      const lastName = candidate.last_name || candidate.lastName || candidate.name?.split(' ').slice(1).join(' ') || '';

      if (!firstName || !lastName) {
        return {
          ...candidate,
          email: null,
          email_pattern: null,
          email_confidence: 0,
          email_source: 'error',
          email_status: 'error'
        };
      }

      const email = applyPattern(firstName, lastName, domain, defaultPattern);

      return {
        ...candidate,
        email,
        email_pattern: defaultPattern,
        email_confidence: 0.65,
        email_source: 'fallback',
        email_status: 'predicted'
      };
    });

    return {
      success: false,
      error: error.message,
      pattern: defaultPattern,
      confidence: 0.65,
      source: 'fallback',
      candidates: enrichedCandidates,
      cost: 0,
      duration: 0,
      // Backward compatibility fields
      email_pattern: defaultPattern,
      email_confidence: 0.65
    };
  }
}

/**
 * Apply email pattern to name components
 *
 * @param {string} first - First name
 * @param {string} last - Last name
 * @param {string} domain - Email domain
 * @param {string} pattern - Email pattern template
 * @returns {string|null} - Generated email address
 */
function applyPattern(first, last, domain, pattern) {
  if (!first || !last || !domain || !pattern) return null;

  // Normalize names
  const firstClean = first.trim().toLowerCase();
  const lastClean = last.trim().toLowerCase();

  // Extract components
  const f = firstClean.charAt(0);
  const l = lastClean.charAt(0);

  // CRITICAL: Replace specific patterns BEFORE general patterns
  // Otherwise {last} will break {last.initial}: {last.initial} → smith.initial}
  const localPart = pattern
    .replace('{first.initial}', f)
    .replace('{first_initial}', f)
    .replace('{last.initial}', l)
    .replace('{last_initial}', l)
    .replace('{first}', firstClean)
    .replace('{last}', lastClean)
    .replace('{f}', f)
    .replace('{l}', l)
    .replace('{fl}', f + l)  // Support {fl} pattern
    .replace('{f}{l}', f + l);  // Support {f}{l} pattern

  return `${localPart}@${domain}`;
}

/**
 * Backward-compatible wrapper for routes/enrich/lib/email.js
 * Drop-in replacement for enrichWithEmail()
 *
 * @param {Array} candidates - Lead candidates
 * @param {string} domain - Company domain
 * @param {Object} company - Company metadata
 * @returns {Promise<Array>} - Enriched candidates array
 */
export async function enrichWithEmail(candidates, domain, company = {}) {
  const result = await enrichWithPatternEngine({
    company_name: company.name || domain,
    domain,
    sector: company.industry || company.sector,
    region: company.region || company.location,
    company_size: company.size || company.size_range,
    candidates
  });

  // Return candidates array for backward compatibility
  return result.candidates;
}

/**
 * Backward-compatible wrapper for routes/enrich/lib/emailEnhancedOptimized.js
 * Drop-in replacement for enrichWithEmailEnhancedOptimized()
 *
 * @param {Array} candidates - Lead candidates
 * @param {string} domain - Company domain
 * @param {Object} company - Company metadata
 * @returns {Promise<Object>} - Enrichment result with candidates and metadata
 */
export async function enrichWithEmailEnhancedOptimized(candidates, domain, company = {}) {
  return await enrichWithPatternEngine({
    company_name: company.name || domain,
    domain,
    sector: company.industry || company.sector,
    region: company.region || company.location,
    company_size: company.size || company.size_range,
    candidates
  });
}

export default {
  enrichWithPatternEngine,
  enrichWithEmail,
  enrichWithEmailEnhancedOptimized
};
