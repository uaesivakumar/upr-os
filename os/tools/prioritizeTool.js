/**
 * Prioritize Tool (S143)
 *
 * Ranks and prioritizes entities for outreach using pack-driven rules.
 * Deterministic ranking based on QTLE scores, timing, and edge cases.
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

export interface PrioritizeToolInput extends ToolInput {
  sales_context: SalesContext;
  pack_ref: PackRef;
  evidence_refs?: EvidenceRef[];
  entities: Array<{
    company_id: string;
    company_name: string;
    domain?: string;
    industry?: string;
    size?: number;
    size_bucket?: "startup" | "scaleup" | "midmarket" | "enterprise";
    location?: string;
    q_score?: number;
    t_score?: number;
    l_score?: number;
    e_score?: number;
    composite_score?: number;
    signals?: Array<{
      signal_id: string;
      signal_type: string;
      signal_age_days: number;
      confidence: number;
    }>;
    last_contact_date?: string;
    contact_attempts?: number;
  }>;
  options?: {
    limit?: number; // Max entities to return
    include_blocked?: boolean; // Include blocked entities (marked)
    apply_timing?: boolean; // Apply timing adjustments
    daily_capacity?: number; // User's daily outreach capacity
  };
}

export interface PrioritizedEntity {
  company_id: string;
  company_name: string;
  priority_rank: number;
  priority_score: number;
  priority_tier: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "BLOCKED";
  action: "OUTREACH_NOW" | "SCHEDULE" | "MONITOR" | "SKIP" | "BLOCKED";
  reasoning: string[];
  schedule_recommendation?: {
    optimal_date: string;
    optimal_time_slot: string;
    reason: string;
  };
  blocking_reasons?: string[];
  signals_summary: {
    total: number;
    fresh: number; // Within freshness window
    strongest_type: string | null;
  };
}

export interface PrioritizeOutput {
  prioritized: PrioritizedEntity[];
  summary: {
    total_input: number;
    total_output: number;
    blocked_count: number;
    distribution: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      blocked: number;
    };
  };
  daily_plan?: {
    date: string;
    capacity: number;
    assigned: number;
    entities: Array<{
      company_id: string;
      company_name: string;
      time_slot: string;
    }>;
  };
}

// =============================================================================
// PRIORITIZE TOOL IMPLEMENTATION
// =============================================================================

export class PrioritizeTool implements Tool<PrioritizeToolInput, PrioritizeOutput> {
  name = "prioritize_entities";
  version = "1.0.0";
  description = "Rank and prioritize entities for outreach using pack-driven rules";
  layer: "STRICT" = "STRICT";
  sla = {
    p50_ms: 100,
    p95_ms: 300,
  };

  validate(input: PrioritizeToolInput): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!input.sales_context) {
      errors.push("sales_context is required");
    }
    if (!input.pack_ref) {
      errors.push("pack_ref is required");
    }
    if (!input.entities || input.entities.length === 0) {
      errors.push("entities array is required and cannot be empty");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async execute(
    input: PrioritizeToolInput
  ): Promise<ToolOutput<PrioritizeOutput>> {
    const startTime = Date.now();
    const { pack_ref, entities, options } = input;

    const limit = options?.limit || entities.length;
    const includeBlocked = options?.include_blocked ?? false;
    const applyTiming = options?.apply_timing ?? true;
    const dailyCapacity = options?.daily_capacity;

    try {
      const reasoning: string[] = [];

      // Calculate priority for each entity
      const prioritized: PrioritizedEntity[] = [];
      const distribution = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        blocked: 0,
      };

      for (const entity of entities) {
        const result = this.calculatePriority(entity, pack_ref, applyTiming);

        // Skip blocked unless requested
        if (result.priority_tier === "BLOCKED" && !includeBlocked) {
          distribution.blocked++;
          continue;
        }

        prioritized.push(result);

        // Update distribution
        switch (result.priority_tier) {
          case "CRITICAL":
            distribution.critical++;
            break;
          case "HIGH":
            distribution.high++;
            break;
          case "MEDIUM":
            distribution.medium++;
            break;
          case "LOW":
            distribution.low++;
            break;
          case "BLOCKED":
            distribution.blocked++;
            break;
        }
      }

      // Sort by priority score (descending)
      prioritized.sort((a, b) => b.priority_score - a.priority_score);

      // Assign ranks
      prioritized.forEach((p, idx) => {
        p.priority_rank = idx + 1;
      });

      // Apply limit
      const limitedResults = prioritized.slice(0, limit);

      reasoning.push(`Processed ${entities.length} entities`);
      reasoning.push(`Prioritized ${limitedResults.length} entities`);
      reasoning.push(
        `Distribution: ${distribution.critical} critical, ${distribution.high} high, ${distribution.medium} medium, ${distribution.low} low, ${distribution.blocked} blocked`
      );

      const output: PrioritizeOutput = {
        prioritized: limitedResults,
        summary: {
          total_input: entities.length,
          total_output: limitedResults.length,
          blocked_count: distribution.blocked,
          distribution,
        },
      };

      // Generate daily plan if capacity specified
      if (dailyCapacity && dailyCapacity > 0) {
        output.daily_plan = this.generateDailyPlan(
          limitedResults,
          dailyCapacity,
          pack_ref
        );
        reasoning.push(
          `Generated daily plan for ${output.daily_plan.assigned}/${dailyCapacity} capacity`
        );
      }

      return createToolOutput(
        this.name,
        pack_ref.version,
        output,
        Date.now() - startTime,
        0.9,
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
  // PRIORITY CALCULATION
  // ---------------------------------------------------------------------------

  private calculatePriority(
    entity: PrioritizeToolInput["entities"][0],
    packRef: PackRef,
    applyTiming: boolean
  ): PrioritizedEntity {
    const reasoning: string[] = [];
    const blockingReasons: string[] = [];

    // Check for blocking conditions
    const isBlocked = this.checkBlockingConditions(
      entity,
      packRef,
      blockingReasons
    );

    if (isBlocked) {
      return {
        company_id: entity.company_id,
        company_name: entity.company_name,
        priority_rank: 0,
        priority_score: 0,
        priority_tier: "BLOCKED",
        action: "BLOCKED",
        reasoning: blockingReasons,
        blocking_reasons: blockingReasons,
        signals_summary: this.summarizeSignals(entity.signals || [], packRef),
      };
    }

    // Calculate priority score
    let priorityScore =
      entity.composite_score ||
      this.calculateCompositeScore(entity, packRef);

    // Apply timing adjustments
    if (applyTiming) {
      const timingMultiplier = this.calculateTimingMultiplier(entity, packRef);
      priorityScore = Math.round(priorityScore * timingMultiplier);
      reasoning.push(`Timing multiplier: ${timingMultiplier.toFixed(2)}`);
    }

    // Boost for fresh signals
    const signalsSummary = this.summarizeSignals(entity.signals || [], packRef);
    if (signalsSummary.fresh > 0) {
      const signalBoost = Math.min(20, signalsSummary.fresh * 5);
      priorityScore += signalBoost;
      reasoning.push(`Fresh signal boost: +${signalBoost}`);
    }

    // Cap at 100
    priorityScore = Math.min(100, Math.max(0, priorityScore));

    // Determine tier
    const tier = this.scoreToPriorityTier(priorityScore);

    // Determine action
    const action = this.tierToAction(tier, entity);

    reasoning.push(`Base score: ${entity.composite_score || "calculated"}`);
    reasoning.push(`Final priority: ${priorityScore}`);

    const result: PrioritizedEntity = {
      company_id: entity.company_id,
      company_name: entity.company_name,
      priority_rank: 0, // Will be set after sorting
      priority_score: priorityScore,
      priority_tier: tier,
      action,
      reasoning,
      signals_summary: signalsSummary,
    };

    // Add schedule recommendation for non-immediate actions
    if (action === "SCHEDULE" || action === "MONITOR") {
      result.schedule_recommendation = this.generateScheduleRecommendation(
        entity,
        tier,
        packRef
      );
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // BLOCKING CONDITIONS
  // ---------------------------------------------------------------------------

  private checkBlockingConditions(
    entity: PrioritizeToolInput["entities"][0],
    packRef: PackRef,
    blockingReasons: string[]
  ): boolean {
    let isBlocked = false;

    // Check pack edge cases
    for (const edgeCase of packRef.config.edge_cases) {
      if (edgeCase.action === "BLOCK" || edgeCase.action === "SKIP") {
        if (this.matchesEdgeCase(entity, edgeCase)) {
          blockingReasons.push(`${edgeCase.type}: ${edgeCase.condition}`);
          if (edgeCase.severity === "CRITICAL") {
            isBlocked = true;
          }
        }
      }
    }

    // Check contact embargo (90-day rule)
    if (entity.last_contact_date) {
      const lastContact = new Date(entity.last_contact_date);
      const daysSinceContact = Math.floor(
        (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceContact < 90) {
        blockingReasons.push(
          `Recent contact: ${daysSinceContact} days ago (90-day embargo)`
        );
        isBlocked = true;
      }
    }

    // Check excessive contact attempts
    if (entity.contact_attempts && entity.contact_attempts >= 3) {
      blockingReasons.push(
        `Excessive attempts: ${entity.contact_attempts} attempts with no response`
      );
      isBlocked = true;
    }

    return isBlocked;
  }

  private matchesEdgeCase(
    entity: PrioritizeToolInput["entities"][0],
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

      case "SIZE_TOO_LARGE":
        return (entity.size || 0) > 1000;

      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // SCORING HELPERS
  // ---------------------------------------------------------------------------

  private calculateCompositeScore(
    entity: PrioritizeToolInput["entities"][0],
    packRef: PackRef
  ): number {
    const weights = packRef.config.scoring_weights;

    const q = entity.q_score || 50;
    const t = entity.t_score || 50;
    const l = entity.l_score || 50;
    const e = entity.e_score || 50;

    return Math.round(
      q * weights.quality +
        t * weights.timing +
        l * weights.likelihood +
        e * weights.evidence
    );
  }

  private calculateTimingMultiplier(
    entity: PrioritizeToolInput["entities"][0],
    packRef: PackRef
  ): number {
    let multiplier = 1.0;

    // Calendar-based timing
    const now = new Date();
    const month = now.getMonth() + 1;

    if (month >= 1 && month <= 2) {
      multiplier *= 1.3; // Q1 budget season
    } else if (month >= 7 && month <= 8) {
      multiplier *= 0.7; // Summer slowdown
    } else if (month === 12) {
      multiplier *= 0.6; // Budget freeze
    }

    // Signal freshness boost
    if (entity.signals && entity.signals.length > 0) {
      const freshest = entity.signals.reduce((f, s) =>
        s.signal_age_days < f.signal_age_days ? s : f
      );

      if (freshest.signal_age_days <= 7) {
        multiplier *= 1.3; // HOT
      } else if (freshest.signal_age_days <= 14) {
        multiplier *= 1.2; // WARM
      } else if (freshest.signal_age_days <= 30) {
        multiplier *= 1.1; // RECENT
      }
    }

    return multiplier;
  }

  private summarizeSignals(
    signals: NonNullable<PrioritizeToolInput["entities"][0]["signals"]>,
    packRef: PackRef
  ): PrioritizedEntity["signals_summary"] {
    if (!signals || signals.length === 0) {
      return { total: 0, fresh: 0, strongest_type: null };
    }

    let freshCount = 0;
    let strongestType: string | null = null;
    let highestConfidence = 0;

    for (const signal of signals) {
      // Check freshness against pack config
      const signalConfig = packRef.config.signal_types.find(
        (st) => st.slug === signal.signal_type
      );
      const freshnessWindow = signalConfig?.freshness_window_days || 30;

      if (signal.signal_age_days <= freshnessWindow) {
        freshCount++;
      }

      if (signal.confidence > highestConfidence) {
        highestConfidence = signal.confidence;
        strongestType = signal.signal_type;
      }
    }

    return {
      total: signals.length,
      fresh: freshCount,
      strongest_type: strongestType,
    };
  }

  // ---------------------------------------------------------------------------
  // TIER & ACTION MAPPING
  // ---------------------------------------------------------------------------

  private scoreToPriorityTier(
    score: number
  ): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "BLOCKED" {
    if (score >= 85) return "CRITICAL";
    if (score >= 70) return "HIGH";
    if (score >= 50) return "MEDIUM";
    return "LOW";
  }

  private tierToAction(
    tier: PrioritizedEntity["priority_tier"],
    entity: PrioritizeToolInput["entities"][0]
  ): PrioritizedEntity["action"] {
    if (tier === "BLOCKED") return "BLOCKED";
    if (tier === "CRITICAL") return "OUTREACH_NOW";
    if (tier === "HIGH") return "SCHEDULE";
    if (tier === "MEDIUM") return "MONITOR";
    return "SKIP";
  }

  // ---------------------------------------------------------------------------
  // SCHEDULING
  // ---------------------------------------------------------------------------

  private generateScheduleRecommendation(
    entity: PrioritizeToolInput["entities"][0],
    tier: PrioritizedEntity["priority_tier"],
    packRef: PackRef
  ): PrioritizedEntity["schedule_recommendation"] {
    const now = new Date();

    // Calculate optimal date based on tier
    let daysUntilOptimal = 0;
    let reason = "";

    switch (tier) {
      case "HIGH":
        daysUntilOptimal = 1;
        reason = "High priority - schedule within 24 hours";
        break;
      case "MEDIUM":
        daysUntilOptimal = 3;
        reason = "Medium priority - schedule within 3 days";
        break;
      default:
        daysUntilOptimal = 7;
        reason = "Low priority - schedule next week";
    }

    const optimalDate = new Date(
      now.getTime() + daysUntilOptimal * 24 * 60 * 60 * 1000
    );

    // Skip weekends
    while (optimalDate.getDay() === 0 || optimalDate.getDay() === 6) {
      optimalDate.setDate(optimalDate.getDate() + 1);
    }

    // Optimal time slot (mid-morning UAE time)
    const timeSlot = "10:00-11:00 GST";

    return {
      optimal_date: optimalDate.toISOString().split("T")[0],
      optimal_time_slot: timeSlot,
      reason,
    };
  }

  private generateDailyPlan(
    prioritized: PrioritizedEntity[],
    capacity: number,
    packRef: PackRef
  ): PrioritizeOutput["daily_plan"] {
    const today = new Date().toISOString().split("T")[0];

    // Select top entities for today based on capacity
    const forToday = prioritized
      .filter((p) => p.action === "OUTREACH_NOW" || p.action === "SCHEDULE")
      .slice(0, capacity);

    // Assign time slots
    const timeSlots = [
      "09:00-10:00",
      "10:00-11:00",
      "11:00-12:00",
      "14:00-15:00",
      "15:00-16:00",
    ];

    const entities = forToday.map((p, idx) => ({
      company_id: p.company_id,
      company_name: p.company_name,
      time_slot: timeSlots[idx % timeSlots.length],
    }));

    return {
      date: today,
      capacity,
      assigned: entities.length,
      entities,
    };
  }
}

// Register the tool
const prioritizeTool = new PrioritizeTool();
toolRegistry.register(prioritizeTool);

export default prioritizeTool;
