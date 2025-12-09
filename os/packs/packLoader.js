/**
 * Pack Loader (S144)
 *
 * Loads vertical intelligence packs from configuration files.
 * Packs contain all pack-driven configuration for QTLE scoring,
 * signal types, edge cases, and persona rules.
 */

import * as fs from "fs";
import * as path from "path";
import { PackRef, PackConfig } from "../tools/registry";

// =============================================================================
// TYPES
// =============================================================================

export interface VerticalPack {
  pack_id: string;
  version: string;
  vertical: string;
  sub_vertical: string;
  name: string;
  description: string;
  target_entity: string;
  active: boolean;
  signal_types: PackConfig["signal_types"];
  scoring_weights: PackConfig["scoring_weights"];
  qtle_config: QLTEConfig;
  edge_cases: PackConfig["edge_cases"];
  persona_rules: PackConfig["persona_rules"];
  territory_rules: TerritoryRules;
  outreach_channels: OutreachChannel[];
  enrichment_sources: EnrichmentSource[];
}

export interface QLTEConfig {
  q_score: {
    salary_presence_max: number;
    size_sweet_spot_max: number;
    industry_bonus_max: number;
    free_zone_multiplier: number;
    preferred_industries: string[];
    preferred_size_range: { min: number; max: number };
  };
  t_score: {
    calendar_rules: Record<string, { months?: number[]; multiplier: number }>;
    freshness_tiers: Record<string, { max_days: number; multiplier: number }>;
  };
  l_score: {
    size_bucket_modifiers: Record<string, number>;
    uae_domain_boost: number;
    recent_founding_boost: number;
  };
  e_score: {
    signal_weight_multiplier: number;
    evidence_base_confidence: number;
  };
}

export interface TerritoryRules {
  primary_region: string;
  allowed_regions: string[];
  location_keywords: string[];
  required_presence: Record<string, boolean>;
}

export interface OutreachChannel {
  channel: string;
  priority: number;
  rules: string[];
}

export interface EnrichmentSource {
  source: string;
  priority: number;
  type: string;
}

// =============================================================================
// PACK CACHE
// =============================================================================

const packCache: Map<string, VerticalPack> = new Map();
const packLoadTimes: Map<string, number> = new Map();

// =============================================================================
// PACK LOADER
// =============================================================================

/**
 * Load a vertical pack by vertical and sub-vertical
 */
export async function loadPack(
  vertical: string,
  subVertical: string
): Promise<VerticalPack | null> {
  const cacheKey = `${vertical}/${subVertical}`;

  // Check cache first
  if (packCache.has(cacheKey)) {
    return packCache.get(cacheKey)!;
  }

  try {
    // Construct pack path
    const packPath = path.join(
      __dirname,
      vertical,
      `${subVertical.replace(/_/g, "-")}.json`
    );

    // Check if file exists
    if (!fs.existsSync(packPath)) {
      console.warn(`[PackLoader] Pack not found: ${packPath}`);
      return null;
    }

    // Load and parse
    const packData = fs.readFileSync(packPath, "utf-8");
    const pack = JSON.parse(packData) as VerticalPack;

    // Validate pack
    const validation = validatePack(pack);
    if (!validation.valid) {
      console.error(`[PackLoader] Invalid pack: ${validation.errors?.join(", ")}`);
      return null;
    }

    // Cache and return
    packCache.set(cacheKey, pack);
    packLoadTimes.set(cacheKey, Date.now());

    console.log(
      `[PackLoader] Loaded pack: ${pack.pack_id} v${pack.version}`
    );

    return pack;
  } catch (error) {
    console.error(`[PackLoader] Error loading pack:`, error);
    return null;
  }
}

/**
 * Convert a VerticalPack to a PackRef for tool input
 */
export function packToPackRef(pack: VerticalPack): PackRef {
  return {
    pack_id: pack.pack_id,
    version: pack.version,
    config: {
      signal_types: pack.signal_types,
      scoring_weights: pack.scoring_weights,
      edge_cases: pack.edge_cases,
      persona_rules: pack.persona_rules,
    },
  };
}

/**
 * Get pack configuration for a specific aspect
 */
export function getPackConfig<K extends keyof VerticalPack>(
  pack: VerticalPack,
  key: K
): VerticalPack[K] {
  return pack[key];
}

/**
 * Validate pack structure
 */
export function validatePack(
  pack: VerticalPack
): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!pack.pack_id) errors.push("pack_id is required");
  if (!pack.version) errors.push("version is required");
  if (!pack.vertical) errors.push("vertical is required");
  if (!pack.sub_vertical) errors.push("sub_vertical is required");
  if (!pack.signal_types || pack.signal_types.length === 0) {
    errors.push("signal_types is required and cannot be empty");
  }
  if (!pack.scoring_weights) errors.push("scoring_weights is required");
  if (!pack.edge_cases) errors.push("edge_cases is required");

  // Validate scoring weights sum to ~1.0
  if (pack.scoring_weights) {
    const weightSum =
      pack.scoring_weights.quality +
      pack.scoring_weights.timing +
      pack.scoring_weights.likelihood +
      pack.scoring_weights.evidence;

    if (Math.abs(weightSum - 1.0) > 0.01) {
      errors.push(
        `scoring_weights must sum to 1.0, got ${weightSum.toFixed(2)}`
      );
    }
  }

  // Validate signal types
  if (pack.signal_types) {
    for (const st of pack.signal_types) {
      if (!st.slug) errors.push("signal_type.slug is required");
      if (!st.name) errors.push("signal_type.name is required");
      if (st.weight < 0 || st.weight > 1) {
        errors.push(`signal_type.weight must be 0-1, got ${st.weight}`);
      }
      if (st.decay_rate < 0 || st.decay_rate > 1) {
        errors.push(`signal_type.decay_rate must be 0-1, got ${st.decay_rate}`);
      }
    }
  }

  // Validate edge cases
  if (pack.edge_cases) {
    for (const ec of pack.edge_cases) {
      if (!ec.type) errors.push("edge_case.type is required");
      if (!ec.action) errors.push("edge_case.action is required");
      if (!["BLOCK", "WARN", "BOOST", "SKIP"].includes(ec.action)) {
        errors.push(`edge_case.action must be BLOCK/WARN/BOOST/SKIP`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Reload a pack (clear cache and reload)
 */
export async function reloadPack(
  vertical: string,
  subVertical: string
): Promise<VerticalPack | null> {
  const cacheKey = `${vertical}/${subVertical}`;
  packCache.delete(cacheKey);
  packLoadTimes.delete(cacheKey);
  return loadPack(vertical, subVertical);
}

/**
 * List all available packs
 */
export function listAvailablePacks(): Array<{
  vertical: string;
  sub_vertical: string;
  pack_id: string;
}> {
  const packs: Array<{
    vertical: string;
    sub_vertical: string;
    pack_id: string;
  }> = [];

  const packsDir = __dirname;

  try {
    // List vertical directories
    const verticals = fs
      .readdirSync(packsDir)
      .filter((f) => fs.statSync(path.join(packsDir, f)).isDirectory());

    for (const vertical of verticals) {
      const verticalPath = path.join(packsDir, vertical);
      const packFiles = fs
        .readdirSync(verticalPath)
        .filter((f) => f.endsWith(".json"));

      for (const packFile of packFiles) {
        const subVertical = packFile.replace(".json", "").replace(/-/g, "_");
        try {
          const packData = fs.readFileSync(
            path.join(verticalPath, packFile),
            "utf-8"
          );
          const pack = JSON.parse(packData) as VerticalPack;
          packs.push({
            vertical,
            sub_vertical: subVertical,
            pack_id: pack.pack_id,
          });
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch (error) {
    console.error("[PackLoader] Error listing packs:", error);
  }

  return packs;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  loaded: number;
  packs: Array<{ key: string; loaded_at: string }>;
} {
  return {
    loaded: packCache.size,
    packs: Array.from(packLoadTimes.entries()).map(([key, time]) => ({
      key,
      loaded_at: new Date(time).toISOString(),
    })),
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export const packLoader = {
  loadPack,
  packToPackRef,
  getPackConfig,
  validatePack,
  reloadPack,
  listAvailablePacks,
  getCacheStats,
};

export default packLoader;
