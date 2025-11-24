/**
 * Signal Deduplication Service
 * Sprint 19, Task 2: Cross-Source Deduplication
 *
 * Eliminates duplicate signals across different sources using:
 * - Exact matching (company + domain + trigger_type)
 * - Fuzzy company name matching (Levenshtein distance)
 * - URL similarity detection
 * - Description similarity (basic text comparison)
 *
 * Strategy:
 * 1. Create composite deduplication hash for quick lookups
 * 2. Apply fuzzy matching for similar but not identical signals
 * 3. Merge duplicates by keeping highest confidence signal
 * 4. Track duplicate relationships in database
 */

import * as Sentry from '@sentry/node';
import crypto from 'crypto';

class DeduplicationService {
  /**
   * Deduplicate an array of signals
   *
   * @param {Array} signals - Array of signal objects
   * @param {Object} options - Deduplication options
   * @param {number} options.companyMatchThreshold - Fuzzy match threshold (default: 0.8)
   * @param {number} options.descriptionMatchThreshold - Description similarity threshold (default: 0.7)
   * @returns {Object} Deduplication results
   */
  async deduplicateSignals(signals, options = {}) {
    const {
      companyMatchThreshold = 0.8,
      descriptionMatchThreshold = 0.7
    } = options;

    try {
      console.log(`[Deduplication] Processing ${signals.length} signals`);

      // Step 1: Add deduplication hashes to all signals
      const signalsWithHashes = signals.map(signal => ({
        ...signal,
        dedupeHash: this.generateDedupeHash(signal)
      }));

      // Step 2: Group signals by exact hash match
      const hashGroups = this.groupByHash(signalsWithHashes);

      // Step 3: Apply fuzzy matching within and across groups
      const { unique, duplicates } = await this.applyFuzzyMatching(
        hashGroups,
        companyMatchThreshold,
        descriptionMatchThreshold
      );

      // Step 4: Merge metadata from duplicates into unique signals
      const mergedSignals = this.mergeDuplicates(unique, duplicates);

      console.log(`[Deduplication] Results: ${mergedSignals.length} unique, ${duplicates.length} duplicates`);

      return {
        uniqueSignals: mergedSignals,
        duplicateCount: duplicates.length,
        originalCount: signals.length,
        deduplicationRate: (duplicates.length / signals.length * 100).toFixed(1),
        duplicates: duplicates.map(d => ({
          signal: d.signal,
          duplicateOf: d.duplicateOf,
          matchType: d.matchType,
          similarity: d.similarity
        }))
      };

    } catch (error) {
      console.error('[Deduplication] Error:', error);
      Sentry.captureException(error, {
        tags: { service: 'DeduplicationService', operation: 'deduplicateSignals' }
      });
      throw error;
    }
  }

  /**
   * Generate deduplication hash for a signal
   * Uses: normalized company name + domain + trigger type
   */
  generateDedupeHash(signal) {
    const company = this.normalizeCompanyName(signal.company || '');
    const domain = (signal.domain || '').toLowerCase().trim();
    const triggerType = (signal.trigger_type || '').toLowerCase().trim();

    const hashInput = `${company}|${domain}|${triggerType}`;

    return crypto
      .createHash('md5')
      .update(hashInput)
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for shorter hash
  }

  /**
   * Normalize company name for consistent matching
   */
  normalizeCompanyName(name) {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')                  // Normalize whitespace
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // Remove punctuation
      .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co)\b/g, '') // Remove legal suffixes
      .trim();
  }

  /**
   * Group signals by exact hash match
   */
  groupByHash(signals) {
    const groups = new Map();

    signals.forEach(signal => {
      const hash = signal.dedupeHash;
      if (!groups.has(hash)) {
        groups.set(hash, []);
      }
      groups.get(hash).push(signal);
    });

    return groups;
  }

  /**
   * Apply fuzzy matching to identify similar signals
   */
  async applyFuzzyMatching(hashGroups, companyThreshold, descriptionThreshold) {
    const uniqueSignals = [];
    const duplicates = [];
    const processedHashes = new Set();

    // Convert groups to array for easier processing
    const groupsArray = Array.from(hashGroups.values());

    for (let i = 0; i < groupsArray.length; i++) {
      const group = groupsArray[i];

      // Within exact hash match groups, keep signal with highest confidence
      if (group.length > 1) {
        const [best, ...rest] = this.sortByConfidence(group);
        uniqueSignals.push(best);

        rest.forEach(signal => {
          duplicates.push({
            signal,
            duplicateOf: best,
            matchType: 'exact_hash',
            similarity: 1.0
          });
        });

        processedHashes.add(best.dedupeHash);
      } else {
        // Single signal in group - check for fuzzy matches with other groups
        const signal = group[0];

        if (processedHashes.has(signal.dedupeHash)) {
          continue; // Already processed as duplicate
        }

        // Check for fuzzy matches
        let foundMatch = false;

        for (const uniqueSignal of uniqueSignals) {
          const similarity = this.calculateSimilarity(signal, uniqueSignal, {
            companyThreshold,
            descriptionThreshold
          });

          if (similarity.overall >= 0.7) { // Overall similarity threshold
            duplicates.push({
              signal,
              duplicateOf: uniqueSignal,
              matchType: similarity.matchType,
              similarity: similarity.overall
            });
            foundMatch = true;
            break;
          }
        }

        if (!foundMatch) {
          uniqueSignals.push(signal);
          processedHashes.add(signal.dedupeHash);
        }
      }
    }

    return { unique: uniqueSignals, duplicates };
  }

  /**
   * Calculate similarity between two signals
   */
  calculateSimilarity(signal1, signal2, options) {
    const { companyThreshold, descriptionThreshold } = options;

    // 1. Company name similarity
    const companySim = this.calculateStringSimilarity(
      this.normalizeCompanyName(signal1.company || ''),
      this.normalizeCompanyName(signal2.company || '')
    );

    // 2. Domain match (binary)
    const domainMatch = (signal1.domain && signal2.domain &&
      signal1.domain.toLowerCase() === signal2.domain.toLowerCase()) ? 1.0 : 0.0;

    // 3. Trigger type match (binary)
    const triggerMatch = (signal1.trigger_type && signal2.trigger_type &&
      signal1.trigger_type.toLowerCase() === signal2.trigger_type.toLowerCase()) ? 1.0 : 0.0;

    // 4. Description similarity
    const descriptionSim = this.calculateStringSimilarity(
      (signal1.description || '').toLowerCase(),
      (signal2.description || '').toLowerCase()
    );

    // 5. URL similarity
    const urlSim = this.calculateUrlSimilarity(
      signal1.source_url || '',
      signal2.source_url || ''
    );

    // Weighted average
    const overall = (
      companySim * 0.35 +
      domainMatch * 0.25 +
      triggerMatch * 0.20 +
      descriptionSim * 0.15 +
      urlSim * 0.05
    );

    // Determine match type
    let matchType = 'none';
    if (companySim >= companyThreshold && domainMatch === 1.0 && triggerMatch === 1.0) {
      matchType = 'strong_fuzzy';
    } else if (companySim >= companyThreshold) {
      matchType = 'company_fuzzy';
    } else if (descriptionSim >= descriptionThreshold) {
      matchType = 'description_fuzzy';
    } else if (urlSim >= 0.8) {
      matchType = 'url_similar';
    }

    return {
      overall,
      matchType,
      components: {
        company: companySim,
        domain: domainMatch,
        trigger: triggerMatch,
        description: descriptionSim,
        url: urlSim
      }
    };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * Returns value between 0 (completely different) and 1 (identical)
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Levenshtein distance algorithm
   * Measures edit distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate URL similarity
   */
  calculateUrlSimilarity(url1, url2) {
    if (!url1 || !url2) return 0;
    if (url1 === url2) return 1;

    try {
      const u1 = new URL(url1);
      const u2 = new URL(url2);

      // Same domain and path = very similar
      if (u1.hostname === u2.hostname && u1.pathname === u2.pathname) {
        return 0.9; // High similarity (query params might differ)
      }

      // Same domain = moderately similar
      if (u1.hostname === u2.hostname) {
        return 0.6;
      }

      // Different domains = check string similarity
      return this.calculateStringSimilarity(url1, url2) * 0.5;

    } catch (error) {
      // Invalid URLs - fall back to string similarity
      return this.calculateStringSimilarity(url1, url2) * 0.3;
    }
  }

  /**
   * Sort signals by confidence score (highest first)
   */
  sortByConfidence(signals) {
    return signals.sort((a, b) => {
      const confA = a.confidence_score || 0;
      const confB = b.confidence_score || 0;
      return confB - confA;
    });
  }

  /**
   * Merge metadata from duplicates into unique signals
   */
  mergeDuplicates(uniqueSignals, duplicates) {
    const mergedSignals = uniqueSignals.map(signal => ({
      ...signal,
      sourceCount: 1, // Will be updated below
      sources: [signal.source_type || 'unknown'],
      duplicateSignals: []
    }));

    // Map signal IDs to merged signals for quick lookup
    const signalMap = new Map();
    mergedSignals.forEach(signal => {
      signalMap.set(signal.dedupeHash, signal);
    });

    // Add duplicate information to merged signals
    duplicates.forEach(dup => {
      const uniqueSignal = signalMap.get(dup.duplicateOf.dedupeHash);

      if (uniqueSignal) {
        // Increment source count
        uniqueSignal.sourceCount++;

        // Add source type if not already present
        const dupSource = dup.signal.source_type || 'unknown';
        if (!uniqueSignal.sources.includes(dupSource)) {
          uniqueSignal.sources.push(dupSource);
        }

        // Track duplicate signal info
        uniqueSignal.duplicateSignals.push({
          company: dup.signal.company,
          source: dupSource,
          similarity: dup.similarity,
          matchType: dup.matchType
        });

        // Boost confidence if found in multiple sources (multi-source validation bonus)
        if (uniqueSignal.sourceCount >= 2) {
          uniqueSignal.confidence_score = Math.min(
            (uniqueSignal.confidence_score || 0.5) + 0.1,
            1.0
          );
          uniqueSignal.multiSourceValidated = true;
        }
      }
    });

    return mergedSignals;
  }

  /**
   * Find duplicate of a single signal in existing signals
   * Used for real-time deduplication when adding new signals
   */
  async findDuplicate(newSignal, existingSignals, options = {}) {
    const {
      companyThreshold = 0.8,
      descriptionThreshold = 0.7
    } = options;

    const newSignalWithHash = {
      ...newSignal,
      dedupeHash: this.generateDedupeHash(newSignal)
    };

    // Check for exact hash match first
    const exactMatch = existingSignals.find(
      existing => existing.dedupeHash === newSignalWithHash.dedupeHash
    );

    if (exactMatch) {
      return {
        isDuplicate: true,
        duplicateOf: exactMatch,
        matchType: 'exact_hash',
        similarity: 1.0
      };
    }

    // Check for fuzzy match
    for (const existing of existingSignals) {
      const similarity = this.calculateSimilarity(newSignalWithHash, existing, {
        companyThreshold,
        descriptionThreshold
      });

      if (similarity.overall >= 0.7) {
        return {
          isDuplicate: true,
          duplicateOf: existing,
          matchType: similarity.matchType,
          similarity: similarity.overall
        };
      }
    }

    return {
      isDuplicate: false,
      duplicateOf: null,
      matchType: 'none',
      similarity: 0
    };
  }
}

// Export singleton instance
export default new DeduplicationService();
