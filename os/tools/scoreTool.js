/**
 * Score Tool (S143)
 *
 * Computes QTLE scores for entities using pack-driven configuration.
 * Deterministic, no LLM calls. Returns typed outputs.
 *
 * Q = Quality (company fit)
 * T = Timing (calendar + signal freshness)
 * L = Likelihood (conversion probability)
 * E = Evidence (signal strength)
 */

import {
  Tool,
  ToolInput,
  ToolOutput,
  SalesContext,
  PackRef,
  EvidenceRef,
  createToolOutput,
  createToolError,
  toolRegistry,
} from "./registry";

// =============================================================================
// TYPES
// =============================================================================

export interface ScoreToolInput extends ToolInput {
  sales_context: SalesContext;
  pack_ref: PackRef;
  evidence_refs?: EvidenceRef[];
  entity_data: {
    company_id?: string;
    company_name: string;
    domain?: string;
    industry?: string;
    size?: number;
    size_bucket?: "startup" | "scaleup" | "midmarket" | "enterprise";
    location?: string;
    year_founded?: number;
    salary_indicators?: {
      salary_level: "low" | "medium" | "high";
      avg_salary?: number;
    };
    uae_signals?: {
      has_ae_domain: boolean;
      has_uae_address: boolean;
      linkedin_location?: string;
    };
    license_type?: "Free Zone" | "Mainland" | "Offshore" | "Unknown";
  };
  signals?: Array<{
    signal_id: string;
    signal_type: string;
    signal_age_days: number;
    source: string;
    confidence: number;
    data?: Record<string, unknown>;
  }>;
  options?: {
    include_breakdown?: boolean;
    score_types?: ("q_score" | "t_score" | "l_score" | "e_score" | "composite")[];
  };
}

export interface ScoreOutput {
  composite_score: number;
  q_score: number;
  t_score: number;
  l_score: number;
  e_score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown?: {
    q_factors: Array<{ factor: string; points: number; reason: string }>;
    t_factors: Array<{ factor: string; multiplier: number; reason: string }>;
    l_factors: Array<{ factor: string; probability: number; reason: string }>;
    e_factors: Array<{ factor: string; strength: number; reason: string }>;
  };
  recommendation: "PRIORITIZE" | "PURSUE" | "MONITOR" | "SKIP";
}

// =============================================================================
// SCORE TOOL IMPLEMENTATION
// =============================================================================

export class ScoreTool implements Tool<ScoreToolInput, ScoreOutput> {
  name = "score_entity";
  version = "1.0.0";
  description = "Compute QTLE scores for an entity using pack-driven configuration";
  layer: "FOUNDATION" = "FOUNDATION";
  sla = {
    p50_ms: 50,
    p95_ms: 150,
  };

  validate(input: ScoreToolInput): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!input.sales_context) {
      errors.push("sales_context is required");
    }
    if (!input.pack_ref) {
      errors.push("pack_ref is required");
    }
    if (!input.entity_data) {
      errors.push("entity_data is required");
    }
    if (!input.entity_data?.company_name) {
      errors.push("entity_data.company_name is required");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async execute(input: ScoreToolInput): Promise<ToolOutput<ScoreOutput>> {
    const startTime = Date.now();
    const { pack_ref, entity_data, signals, options } = input;
    const includeBreakdown = options?.include_breakdown ?? true;

    try {
      const reasoning: string[] = [];

      // Calculate Q-Score (Quality)
      const qResult = this.calculateQScore(entity_data, pack_ref, reasoning);

      // Calculate T-Score (Timing)
      const tResult = this.calculateTScore(signals || [], pack_ref, reasoning);

      // Calculate L-Score (Likelihood)
      const lResult = this.calculateLScore(entity_data, pack_ref, reasoning);

      // Calculate E-Score (Evidence)
      const eResult = this.calculateEScore(
        input.evidence_refs || [],
        signals || [],
        pack_ref,
        reasoning
      );

      // Calculate composite score using pack weights
      const weights = pack_ref.config.scoring_weights;
      const compositeScore = Math.round(
        qResult.score * weights.quality +
          tResult.score * weights.timing +
          lResult.score * weights.likelihood +
          eResult.score * weights.evidence
      );

      // Determine grade
      const grade = this.scoreToGrade(compositeScore);

      // Determine recommendation
      const recommendation = this.scoreToRecommendation(compositeScore, grade);

      const output: ScoreOutput = {
        composite_score: compositeScore,
        q_score: qResult.score,
        t_score: tResult.score,
        l_score: lResult.score,
        e_score: eResult.score,
        grade,
        recommendation,
      };

      if (includeBreakdown) {
        output.breakdown = {
          q_factors: qResult.factors,
          t_factors: tResult.factors,
          l_factors: lResult.factors,
          e_factors: eResult.factors,
        };
      }

      return createToolOutput(
        this.name,
        pack_ref.version,
        output,
        Date.now() - startTime,
        this.calculateConfidence(entity_data, signals || []),
        reasoning
      );
    } catch (error) {
      return createToolError(
        this.name,
        pack_ref.version,
        error instanceof Error ? error.message : "Unknown error",
        Date.now() - startTime
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Q-SCORE (Quality)
  // ---------------------------------------------------------------------------

  private calculateQScore(
    entity: ScoreToolInput["entity_data"],
    packRef: PackRef,
    reasoning: string[]
  ): {
    score: number;
    factors: Array<{ factor: string; points: number; reason: string }>;
  } {
    const factors: Array<{ factor: string; points: number; reason: string }> =
      [];
    let score = 50; // Base score

    // Salary & UAE Presence (max +40)
    if (entity.salary_indicators?.salary_level === "high" && entity.uae_signals?.has_uae_address) {
      score += 40;
      factors.push({
        factor: "Salary & UAE Presence",
        points: 40,
        reason: "High salary level + strong UAE presence",
      });
    } else if (entity.salary_indicators?.salary_level === "medium") {
      score += 20;
      factors.push({
        factor: "Salary Level",
        points: 20,
        reason: "Medium salary level detected",
      });
    }

    // Company Size Sweet Spot (50-500 employees = +20)
    const size = entity.size || 0;
    if (size >= 50 && size <= 500) {
      score += 20;
      factors.push({
        factor: "Company Size",
        points: 20,
        reason: `Sweet spot size (${size} employees)`,
      });
    } else if (size > 500 && size <= 1000) {
      score += 10;
      factors.push({
        factor: "Company Size",
        points: 10,
        reason: `Larger company (${size} employees)`,
      });
    } else if (size < 50 && size > 10) {
      score += 15;
      factors.push({
        factor: "Company Size",
        points: 15,
        reason: `Scale-up size (${size} employees)`,
      });
    }

    // Industry Bonus (+15 for preferred industries)
    const preferredIndustries = ["FinTech", "Technology", "Healthcare", "SaaS"];
    if (entity.industry && preferredIndustries.includes(entity.industry)) {
      score += 15;
      factors.push({
        factor: "Industry",
        points: 15,
        reason: `Preferred industry: ${entity.industry}`,
      });
    }

    // Free Zone Bonus
    if (entity.license_type === "Free Zone") {
      const bonus = Math.round(score * 0.3);
      score += bonus;
      factors.push({
        factor: "Free Zone",
        points: bonus,
        reason: "Free Zone company bonus (×1.3)",
      });
    }

    // Apply edge cases from pack
    for (const edgeCase of packRef.config.edge_cases) {
      if (this.matchesEdgeCase(entity, edgeCase)) {
        if (edgeCase.action === "BOOST" && edgeCase.multiplier) {
          const bonus = Math.round(score * (edgeCase.multiplier - 1));
          score += bonus;
          factors.push({
            factor: `Edge Case: ${edgeCase.type}`,
            points: bonus,
            reason: edgeCase.condition,
          });
        } else if (edgeCase.action === "SKIP") {
          score = Math.round(score * 0.1);
          factors.push({
            factor: `Edge Case: ${edgeCase.type}`,
            points: -score,
            reason: `Auto-skip: ${edgeCase.condition}`,
          });
        }
      }
    }

    // Cap at 100
    score = Math.min(100, Math.max(0, score));

    reasoning.push(`Q-Score: ${score}/100 based on ${factors.length} factors`);

    return { score, factors };
  }

  // ---------------------------------------------------------------------------
  // T-SCORE (Timing)
  // ---------------------------------------------------------------------------

  private calculateTScore(
    signals: ScoreToolInput["signals"],
    packRef: PackRef,
    reasoning: string[]
  ): {
    score: number;
    factors: Array<{ factor: string; multiplier: number; reason: string }>;
  } {
    const factors: Array<{
      factor: string;
      multiplier: number;
      reason: string;
    }> = [];
    let multiplier = 1.0;

    // Calendar-based timing
    const now = new Date();
    const month = now.getMonth() + 1;
    const quarter = Math.ceil(month / 3);

    if (quarter === 1) {
      multiplier *= 1.3;
      factors.push({
        factor: "Calendar",
        multiplier: 1.3,
        reason: "Q1 Budget Season",
      });
    } else if (month >= 7 && month <= 8) {
      multiplier *= 0.7;
      factors.push({
        factor: "Calendar",
        multiplier: 0.7,
        reason: "Summer Slowdown",
      });
    } else if (month === 12) {
      multiplier *= 0.6;
      factors.push({
        factor: "Calendar",
        multiplier: 0.6,
        reason: "Q4 Budget Freeze",
      });
    }

    // Signal freshness
    if (signals && signals.length > 0) {
      const freshestSignal = signals.reduce((fresh, sig) =>
        sig.signal_age_days < fresh.signal_age_days ? sig : fresh
      );

      const signalConfig = packRef.config.signal_types.find(
        (s) => s.slug === freshestSignal.signal_type
      );

      let freshnessMultiplier = 1.0;
      if (freshestSignal.signal_age_days <= 7) {
        freshnessMultiplier = 1.5; // HOT
      } else if (freshestSignal.signal_age_days <= 14) {
        freshnessMultiplier = 1.3; // WARM
      } else if (freshestSignal.signal_age_days <= 30) {
        freshnessMultiplier = 1.1; // RECENT
      } else if (freshestSignal.signal_age_days <= 60) {
        freshnessMultiplier = 1.0; // STANDARD
      } else if (freshestSignal.signal_age_days <= 90) {
        freshnessMultiplier = 0.8; // COOLING
      } else {
        freshnessMultiplier = 0.5; // STALE
      }

      // Apply decay rate from pack config
      if (signalConfig) {
        const weeks = freshestSignal.signal_age_days / 7;
        freshnessMultiplier *= Math.pow(signalConfig.decay_rate, weeks);
      }

      multiplier *= freshnessMultiplier;
      factors.push({
        factor: "Signal Freshness",
        multiplier: freshnessMultiplier,
        reason: `${freshestSignal.signal_type} signal ${freshestSignal.signal_age_days} days old`,
      });
    }

    // Convert multiplier to 0-100 score
    const score = Math.min(100, Math.max(0, Math.round(multiplier * 50)));

    reasoning.push(
      `T-Score: ${score}/100 (multiplier: ${multiplier.toFixed(2)})`
    );

    return { score, factors };
  }

  // ---------------------------------------------------------------------------
  // L-SCORE (Likelihood)
  // ---------------------------------------------------------------------------

  private calculateLScore(
    entity: ScoreToolInput["entity_data"],
    packRef: PackRef,
    reasoning: string[]
  ): {
    score: number;
    factors: Array<{ factor: string; probability: number; reason: string }>;
  } {
    const factors: Array<{
      factor: string;
      probability: number;
      reason: string;
    }> = [];
    let probability = 0.5; // Base probability

    // Size bucket affects likelihood
    switch (entity.size_bucket) {
      case "startup":
        probability += 0.2;
        factors.push({
          factor: "Size Bucket",
          probability: 0.2,
          reason: "Startups have higher conversion likelihood",
        });
        break;
      case "scaleup":
        probability += 0.25;
        factors.push({
          factor: "Size Bucket",
          probability: 0.25,
          reason: "Scale-ups are ideal targets",
        });
        break;
      case "midmarket":
        probability += 0.1;
        factors.push({
          factor: "Size Bucket",
          probability: 0.1,
          reason: "Mid-market has moderate conversion",
        });
        break;
      case "enterprise":
        probability -= 0.1;
        factors.push({
          factor: "Size Bucket",
          probability: -0.1,
          reason: "Enterprise has longer sales cycles",
        });
        break;
    }

    // UAE domain increases likelihood
    if (entity.uae_signals?.has_ae_domain) {
      probability += 0.1;
      factors.push({
        factor: "UAE Domain",
        probability: 0.1,
        reason: ".ae domain indicates strong UAE presence",
      });
    }

    // Recent founding increases likelihood (growth stage)
    if (entity.year_founded && entity.year_founded >= new Date().getFullYear() - 3) {
      probability += 0.1;
      factors.push({
        factor: "Company Age",
        probability: 0.1,
        reason: "Recently founded company in growth phase",
      });
    }

    // Cap probability at 0.95
    probability = Math.min(0.95, Math.max(0.05, probability));

    // Convert to 0-100 score
    const score = Math.round(probability * 100);

    reasoning.push(
      `L-Score: ${score}/100 (probability: ${probability.toFixed(2)})`
    );

    return { score, factors };
  }

  // ---------------------------------------------------------------------------
  // E-SCORE (Evidence)
  // ---------------------------------------------------------------------------

  private calculateEScore(
    evidenceRefs: EvidenceRef[],
    signals: ScoreToolInput["signals"],
    packRef: PackRef,
    reasoning: string[]
  ): {
    score: number;
    factors: Array<{ factor: string; strength: number; reason: string }>;
  } {
    const factors: Array<{
      factor: string;
      strength: number;
      reason: string;
    }> = [];
    let totalStrength = 0;

    // Evidence from signals
    if (signals && signals.length > 0) {
      for (const signal of signals) {
        const signalConfig = packRef.config.signal_types.find(
          (s) => s.slug === signal.signal_type
        );
        const weight = signalConfig?.weight || 0.5;
        const strength = signal.confidence * weight * 100;

        totalStrength += strength;
        factors.push({
          factor: `Signal: ${signal.signal_type}`,
          strength,
          reason: `From ${signal.source} (confidence: ${signal.confidence})`,
        });
      }
    }

    // Evidence from enrichment
    if (evidenceRefs && evidenceRefs.length > 0) {
      for (const evidence of evidenceRefs) {
        const strength = evidence.confidence * 50;
        totalStrength += strength;
        factors.push({
          factor: `Evidence: ${evidence.source}`,
          strength,
          reason: `Direct evidence (confidence: ${evidence.confidence})`,
        });
      }
    }

    // Normalize to 0-100
    const score = Math.min(100, Math.max(0, Math.round(totalStrength)));

    reasoning.push(
      `E-Score: ${score}/100 based on ${factors.length} evidence items`
    );

    return { score, factors };
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private matchesEdgeCase(
    entity: ScoreToolInput["entity_data"],
    edgeCase: PackRef["config"]["edge_cases"][0]
  ): boolean {
    switch (edgeCase.type) {
      case "ENTERPRISE_BRAND":
        const enterpriseBrands = [
          "etihad",
          "emirates",
          "adnoc",
          "emaar",
          "dp world",
        ];
        return enterpriseBrands.some((brand) =>
          entity.company_name.toLowerCase().includes(brand)
        );

      case "GOVERNMENT_SECTOR":
        return entity.industry?.toLowerCase().includes("government") || false;

      case "FREE_ZONE":
        return entity.license_type === "Free Zone";

      case "SMALL_STARTUP":
        return (entity.size || 0) < 10;

      default:
        return false;
    }
  }

  private scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 85) return "A";
    if (score >= 70) return "B";
    if (score >= 55) return "C";
    if (score >= 40) return "D";
    return "F";
  }

  private scoreToRecommendation(
    score: number,
    grade: string
  ): "PRIORITIZE" | "PURSUE" | "MONITOR" | "SKIP" {
    if (grade === "A") return "PRIORITIZE";
    if (grade === "B") return "PURSUE";
    if (grade === "C") return "MONITOR";
    return "SKIP";
  }

  private calculateConfidence(
    entity: ScoreToolInput["entity_data"],
    signals: ScoreToolInput["signals"]
  ): number {
    let confidence = 0.5;

    // More data = higher confidence
    if (entity.size) confidence += 0.1;
    if (entity.industry) confidence += 0.1;
    if (entity.year_founded) confidence += 0.1;
    if (entity.uae_signals?.has_uae_address) confidence += 0.1;
    if (signals && signals.length > 0) confidence += 0.1;

    return Math.min(1.0, confidence);
  }
}

// Register the tool
const scoreTool = new ScoreTool();
toolRegistry.register(scoreTool);

export default scoreTool;
