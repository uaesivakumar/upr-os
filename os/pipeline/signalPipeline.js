/**
 * Signal Pipeline v2 (S145)
 *
 * Processes raw signals through the intelligence pipeline:
 * Signal → Evidence Item → Object Intelligence
 *
 * Features:
 * - Deduplication (company_id + signal_type + time window)
 * - Freshness scoring centralized
 * - Source ranking
 * - Evidence linking
 */

import { SalesContext, PackRef, EvidenceRef } from "../tools/registry";
import { packLoader } from "../packs/packLoader";

// =============================================================================
// TYPES
// =============================================================================

export interface RawSignal {
  signal_id?: string;
  company_id: string;
  company_name: string;
  domain?: string;
  signal_type: string;
  signal_source: string;
  signal_date: string;
  confidence: number;
  raw_data: Record<string, unknown>;
  metadata?: {
    source_url?: string;
    extraction_method?: string;
    raw_text?: string;
  };
}

export interface ProcessedSignal {
  signal_id: string;
  company_id: string;
  company_name: string;
  domain?: string;
  signal_type: string;
  signal_source: string;
  signal_date: string;
  signal_age_days: number;
  confidence: number;
  freshness_score: number;
  freshness_tier: "HOT" | "WARM" | "RECENT" | "STANDARD" | "COOLING" | "STALE";
  source_rank: number;
  is_duplicate: boolean;
  duplicate_of?: string;
  evidence_items: EvidenceItem[];
  processed_at: string;
}

export interface EvidenceItem {
  evidence_id: string;
  signal_id: string;
  evidence_type: string;
  source: string;
  confidence: number;
  data: Record<string, unknown>;
  extracted_facts: string[];
  created_at: string;
}

export interface ObjectIntelligence {
  object_id: string;
  object_type: "company" | "contact" | "signal";
  company_id: string;
  company_name: string;
  domain?: string;
  signals: ProcessedSignal[];
  evidence: EvidenceItem[];
  aggregated_score: number;
  signal_summary: {
    total: number;
    fresh: number;
    by_type: Record<string, number>;
    strongest_signal: string | null;
  };
  last_updated: string;
}

export interface PipelineResult {
  success: boolean;
  input_count: number;
  output: {
    processed_signals: ProcessedSignal[];
    evidence_items: EvidenceItem[];
    object_intelligence: ObjectIntelligence[];
    deduplicated_count: number;
    fresh_count: number;
  };
  metrics: {
    processing_time_ms: number;
    dedup_rate: number;
    freshness_distribution: Record<string, number>;
  };
  errors?: string[];
}

// =============================================================================
// DEDUPLICATION
// =============================================================================

interface DedupeKey {
  company_id: string;
  signal_type: string;
  time_window_start: string;
}

const DEDUP_WINDOW_DAYS = 7; // Signals within 7 days are considered duplicates

/**
 * Generate deduplication key for a signal
 */
function generateDedupeKey(signal: RawSignal): string {
  const signalDate = new Date(signal.signal_date);
  // Round to start of window (7-day buckets)
  const windowStart = new Date(signalDate);
  windowStart.setDate(
    windowStart.getDate() - (windowStart.getDate() % DEDUP_WINDOW_DAYS)
  );

  return `${signal.company_id}:${signal.signal_type}:${windowStart.toISOString().split("T")[0]}`;
}

/**
 * Deduplicate signals by company_id + signal_type + time window
 */
function deduplicateSignals(signals: RawSignal[]): {
  unique: RawSignal[];
  duplicates: Array<{ signal: RawSignal; duplicate_of: string }>;
} {
  const seen = new Map<string, RawSignal>();
  const unique: RawSignal[] = [];
  const duplicates: Array<{ signal: RawSignal; duplicate_of: string }> = [];

  // Sort by date (newest first) so we keep the most recent
  const sorted = [...signals].sort(
    (a, b) =>
      new Date(b.signal_date).getTime() - new Date(a.signal_date).getTime()
  );

  for (const signal of sorted) {
    const key = generateDedupeKey(signal);

    if (seen.has(key)) {
      const existingSignal = seen.get(key)!;
      // Keep the one with higher confidence, or more recent if same confidence
      if (signal.confidence > existingSignal.confidence) {
        // Replace existing with this one
        const existingIdx = unique.findIndex(
          (s) => generateDedupeKey(s) === key
        );
        if (existingIdx >= 0) {
          unique.splice(existingIdx, 1);
        }
        unique.push(signal);
        seen.set(key, signal);
        duplicates.push({
          signal: existingSignal,
          duplicate_of: signal.signal_id || key,
        });
      } else {
        duplicates.push({
          signal,
          duplicate_of: existingSignal.signal_id || key,
        });
      }
    } else {
      seen.set(key, signal);
      unique.push(signal);
    }
  }

  return { unique, duplicates };
}

// =============================================================================
// FRESHNESS SCORING
// =============================================================================

interface FreshnessConfig {
  tiers: Record<string, { max_days: number; multiplier: number }>;
}

const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  tiers: {
    hot: { max_days: 7, multiplier: 1.5 },
    warm: { max_days: 14, multiplier: 1.3 },
    recent: { max_days: 30, multiplier: 1.1 },
    standard: { max_days: 60, multiplier: 1.0 },
    cooling: { max_days: 90, multiplier: 0.8 },
    stale: { max_days: 180, multiplier: 0.5 },
  },
};

/**
 * Calculate freshness score and tier for a signal
 */
function calculateFreshness(
  signalDate: string,
  config?: FreshnessConfig
): {
  score: number;
  tier: ProcessedSignal["freshness_tier"];
  age_days: number;
} {
  const tiers = config?.tiers || DEFAULT_FRESHNESS_CONFIG.tiers;
  const now = new Date();
  const signalTime = new Date(signalDate);
  const ageDays = Math.floor(
    (now.getTime() - signalTime.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Determine tier and multiplier
  let tier: ProcessedSignal["freshness_tier"] = "STALE";
  let multiplier = 0.3;

  if (ageDays <= tiers.hot.max_days) {
    tier = "HOT";
    multiplier = tiers.hot.multiplier;
  } else if (ageDays <= tiers.warm.max_days) {
    tier = "WARM";
    multiplier = tiers.warm.multiplier;
  } else if (ageDays <= tiers.recent.max_days) {
    tier = "RECENT";
    multiplier = tiers.recent.multiplier;
  } else if (ageDays <= tiers.standard.max_days) {
    tier = "STANDARD";
    multiplier = tiers.standard.multiplier;
  } else if (ageDays <= tiers.cooling.max_days) {
    tier = "COOLING";
    multiplier = tiers.cooling.multiplier;
  } else {
    tier = "STALE";
    multiplier = tiers.stale?.multiplier || 0.3;
  }

  // Score is multiplier * 100, capped at 100
  const score = Math.min(100, Math.round(multiplier * 100));

  return { score, tier, age_days: ageDays };
}

// =============================================================================
// SOURCE RANKING
// =============================================================================

const SOURCE_RANKS: Record<string, number> = {
  linkedin: 1,
  apollo: 2,
  clearbit: 3,
  serp: 4,
  news: 5,
  crunchbase: 6,
  pitchbook: 7,
  manual: 10,
  unknown: 99,
};

/**
 * Get source rank (lower is better)
 */
function getSourceRank(source: string): number {
  return SOURCE_RANKS[source.toLowerCase()] || SOURCE_RANKS.unknown;
}

// =============================================================================
// EVIDENCE EXTRACTION
// =============================================================================

/**
 * Extract evidence items from a processed signal
 */
function extractEvidence(signal: RawSignal): EvidenceItem[] {
  const evidenceItems: EvidenceItem[] = [];
  const evidenceId = `ev-${signal.signal_id || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Primary evidence from signal
  evidenceItems.push({
    evidence_id: evidenceId,
    signal_id: signal.signal_id || "",
    evidence_type: signal.signal_type,
    source: signal.signal_source,
    confidence: signal.confidence,
    data: signal.raw_data,
    extracted_facts: extractFacts(signal),
    created_at: new Date().toISOString(),
  });

  return evidenceItems;
}

/**
 * Extract facts from signal data
 */
function extractFacts(signal: RawSignal): string[] {
  const facts: string[] = [];

  switch (signal.signal_type) {
    case "hiring_expansion":
      if (signal.raw_data.job_count) {
        facts.push(`${signal.raw_data.job_count} open positions`);
      }
      if (signal.raw_data.departments) {
        facts.push(
          `Hiring in: ${(signal.raw_data.departments as string[]).join(", ")}`
        );
      }
      break;

    case "headcount_jump":
      if (signal.raw_data.growth_percentage) {
        facts.push(`${signal.raw_data.growth_percentage}% headcount growth`);
      }
      if (signal.raw_data.new_employees) {
        facts.push(`${signal.raw_data.new_employees} new employees`);
      }
      break;

    case "funding_round":
      if (signal.raw_data.amount) {
        facts.push(`Raised ${signal.raw_data.amount}`);
      }
      if (signal.raw_data.round_type) {
        facts.push(`Round: ${signal.raw_data.round_type}`);
      }
      break;

    case "office_opening":
      if (signal.raw_data.location) {
        facts.push(`New office in ${signal.raw_data.location}`);
      }
      break;

    case "market_entry_uae":
      facts.push("Entering UAE market");
      if (signal.raw_data.entity_type) {
        facts.push(`Entity type: ${signal.raw_data.entity_type}`);
      }
      break;
  }

  // Add source URL as fact if available
  if (signal.metadata?.source_url) {
    facts.push(`Source: ${signal.metadata.source_url}`);
  }

  return facts;
}

// =============================================================================
// OBJECT INTELLIGENCE AGGREGATION
// =============================================================================

/**
 * Aggregate signals and evidence into Object Intelligence
 */
function aggregateToObjectIntelligence(
  companyId: string,
  signals: ProcessedSignal[]
): ObjectIntelligence {
  const companySignals = signals.filter((s) => s.company_id === companyId);
  const allEvidence = companySignals.flatMap((s) => s.evidence_items);

  // Group signals by type
  const byType: Record<string, number> = {};
  for (const signal of companySignals) {
    byType[signal.signal_type] = (byType[signal.signal_type] || 0) + 1;
  }

  // Find strongest signal (highest freshness * confidence)
  let strongestSignal: string | null = null;
  let highestScore = 0;
  for (const signal of companySignals) {
    const score = signal.freshness_score * signal.confidence;
    if (score > highestScore) {
      highestScore = score;
      strongestSignal = signal.signal_type;
    }
  }

  // Calculate aggregated score
  const freshSignals = companySignals.filter(
    (s) => s.freshness_tier === "HOT" || s.freshness_tier === "WARM"
  );
  const aggregatedScore = Math.min(
    100,
    Math.round(
      companySignals.reduce((sum, s) => sum + s.freshness_score * s.confidence, 0) /
        Math.max(1, companySignals.length)
    )
  );

  return {
    object_id: `obj-${companyId}`,
    object_type: "company",
    company_id: companyId,
    company_name: companySignals[0]?.company_name || "",
    domain: companySignals[0]?.domain,
    signals: companySignals,
    evidence: allEvidence,
    aggregated_score: aggregatedScore,
    signal_summary: {
      total: companySignals.length,
      fresh: freshSignals.length,
      by_type: byType,
      strongest_signal: strongestSignal,
    },
    last_updated: new Date().toISOString(),
  };
}

// =============================================================================
// MAIN PIPELINE
// =============================================================================

/**
 * Process raw signals through the pipeline
 */
export async function processSignals(
  rawSignals: RawSignal[],
  salesContext: SalesContext,
  packRef?: PackRef
): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    // Load pack if not provided
    let freshnessConfig: FreshnessConfig | undefined;
    if (packRef?.config) {
      // Extract freshness config from pack
      // This would come from pack.qtle_config.t_score.freshness_tiers
    }

    // Step 1: Deduplicate signals
    const { unique, duplicates } = deduplicateSignals(rawSignals);

    // Step 2: Process each unique signal
    const processedSignals: ProcessedSignal[] = [];
    const allEvidence: EvidenceItem[] = [];

    for (const signal of unique) {
      // Calculate freshness
      const freshness = calculateFreshness(signal.signal_date, freshnessConfig);

      // Extract evidence
      const evidence = extractEvidence(signal);
      allEvidence.push(...evidence);

      // Create processed signal
      const processed: ProcessedSignal = {
        signal_id:
          signal.signal_id ||
          `sig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        company_id: signal.company_id,
        company_name: signal.company_name,
        domain: signal.domain,
        signal_type: signal.signal_type,
        signal_source: signal.signal_source,
        signal_date: signal.signal_date,
        signal_age_days: freshness.age_days,
        confidence: signal.confidence,
        freshness_score: freshness.score,
        freshness_tier: freshness.tier,
        source_rank: getSourceRank(signal.signal_source),
        is_duplicate: false,
        evidence_items: evidence,
        processed_at: new Date().toISOString(),
      };

      processedSignals.push(processed);
    }

    // Mark duplicates
    for (const dup of duplicates) {
      const processed: ProcessedSignal = {
        signal_id:
          dup.signal.signal_id ||
          `sig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        company_id: dup.signal.company_id,
        company_name: dup.signal.company_name,
        domain: dup.signal.domain,
        signal_type: dup.signal.signal_type,
        signal_source: dup.signal.signal_source,
        signal_date: dup.signal.signal_date,
        signal_age_days: 0,
        confidence: dup.signal.confidence,
        freshness_score: 0,
        freshness_tier: "STALE",
        source_rank: getSourceRank(dup.signal.signal_source),
        is_duplicate: true,
        duplicate_of: dup.duplicate_of,
        evidence_items: [],
        processed_at: new Date().toISOString(),
      };
      processedSignals.push(processed);
    }

    // Step 3: Aggregate into Object Intelligence
    const companyIds = [...new Set(unique.map((s) => s.company_id))];
    const objectIntelligence: ObjectIntelligence[] = companyIds.map(
      (companyId) =>
        aggregateToObjectIntelligence(
          companyId,
          processedSignals.filter((s) => !s.is_duplicate)
        )
    );

    // Calculate metrics
    const processingTime = Date.now() - startTime;
    const dedupRate =
      rawSignals.length > 0
        ? duplicates.length / rawSignals.length
        : 0;

    const freshnessDistribution: Record<string, number> = {
      HOT: 0,
      WARM: 0,
      RECENT: 0,
      STANDARD: 0,
      COOLING: 0,
      STALE: 0,
    };
    for (const signal of processedSignals.filter((s) => !s.is_duplicate)) {
      freshnessDistribution[signal.freshness_tier]++;
    }

    return {
      success: true,
      input_count: rawSignals.length,
      output: {
        processed_signals: processedSignals,
        evidence_items: allEvidence,
        object_intelligence: objectIntelligence,
        deduplicated_count: duplicates.length,
        fresh_count:
          freshnessDistribution.HOT + freshnessDistribution.WARM,
      },
      metrics: {
        processing_time_ms: processingTime,
        dedup_rate: dedupRate,
        freshness_distribution: freshnessDistribution,
      },
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Unknown error");

    return {
      success: false,
      input_count: rawSignals.length,
      output: {
        processed_signals: [],
        evidence_items: [],
        object_intelligence: [],
        deduplicated_count: 0,
        fresh_count: 0,
      },
      metrics: {
        processing_time_ms: Date.now() - startTime,
        dedup_rate: 0,
        freshness_distribution: {},
      },
      errors,
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const signalPipeline = {
  processSignals,
  deduplicateSignals,
  calculateFreshness,
  getSourceRank,
  extractEvidence,
  aggregateToObjectIntelligence,
};

export default signalPipeline;
