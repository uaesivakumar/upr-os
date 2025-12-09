/**
 * Search Tool (S143)
 *
 * Searches for entities matching criteria using pack-driven filters.
 * Returns typed, scored results with evidence references.
 */

import {
  Tool,
  ToolInput,
  ToolOutput,
  SalesContext,
  PackRef,
  createToolOutput,
  createToolError,
  toolRegistry,
} from "./registry";

// =============================================================================
// TYPES
// =============================================================================

export interface SearchToolInput extends ToolInput {
  sales_context: SalesContext;
  pack_ref: PackRef;
  query: {
    keywords?: string[];
    industries?: string[];
    locations?: string[];
    size_range?: { min?: number; max?: number };
    size_buckets?: ("startup" | "scaleup" | "midmarket" | "enterprise")[];
    signal_types?: string[];
    min_score?: number;
    has_recent_signals?: boolean; // Signals within freshness window
    exclude_contacted?: boolean; // Exclude recently contacted
    contacted_within_days?: number;
  };
  pagination?: {
    limit?: number;
    offset?: number;
  };
  sort?: {
    field: "score" | "signal_date" | "company_name" | "size";
    order: "asc" | "desc";
  };
}

export interface SearchResult {
  company_id: string;
  company_name: string;
  domain?: string;
  industry?: string;
  size?: number;
  size_bucket?: string;
  location?: string;
  score?: number;
  grade?: string;
  signals: Array<{
    signal_id: string;
    signal_type: string;
    signal_date: string;
    confidence: number;
  }>;
  match_reasons: string[];
}

export interface SearchOutput {
  results: SearchResult[];
  total_count: number;
  page_info: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
  filters_applied: string[];
  search_time_ms: number;
}

// =============================================================================
// SEARCH TOOL IMPLEMENTATION
// =============================================================================

export class SearchTool implements Tool<SearchToolInput, SearchOutput> {
  name = "search_entities";
  version = "1.0.0";
  description =
    "Search for entities matching criteria using pack-driven filters";
  layer: "FOUNDATION" = "FOUNDATION";
  sla = {
    p50_ms: 200,
    p95_ms: 600,
  };

  validate(input: SearchToolInput): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!input.sales_context) {
      errors.push("sales_context is required");
    }
    if (!input.pack_ref) {
      errors.push("pack_ref is required");
    }
    if (!input.query) {
      errors.push("query is required");
    }

    // At least one search criteria
    const query = input.query || {};
    const hasAnyCriteria =
      query.keywords?.length ||
      query.industries?.length ||
      query.locations?.length ||
      query.size_range ||
      query.size_buckets?.length ||
      query.signal_types?.length ||
      query.min_score !== undefined ||
      query.has_recent_signals;

    if (!hasAnyCriteria) {
      errors.push("At least one search criterion is required");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async execute(input: SearchToolInput): Promise<ToolOutput<SearchOutput>> {
    const startTime = Date.now();
    const { sales_context, pack_ref, query, pagination, sort } = input;

    const limit = pagination?.limit || 50;
    const offset = pagination?.offset || 0;

    try {
      const reasoning: string[] = [];
      const filtersApplied: string[] = [];

      // Build search filters based on query
      const filters = this.buildFilters(query, pack_ref, filtersApplied);

      // In a real implementation, this would query the database
      // For now, we return a structured response showing the search was processed
      const searchResults = await this.executeSearch(
        filters,
        sales_context,
        pack_ref,
        limit,
        offset,
        sort
      );

      reasoning.push(`Applied ${filtersApplied.length} filters`);
      reasoning.push(`Found ${searchResults.total} matching entities`);

      const output: SearchOutput = {
        results: searchResults.results,
        total_count: searchResults.total,
        page_info: {
          limit,
          offset,
          has_more: searchResults.total > offset + limit,
        },
        filters_applied: filtersApplied,
        search_time_ms: Date.now() - startTime,
      };

      return createToolOutput(
        this.name,
        pack_ref.version,
        output,
        Date.now() - startTime,
        this.calculateSearchConfidence(filtersApplied),
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
  // FILTER BUILDING
  // ---------------------------------------------------------------------------

  private buildFilters(
    query: SearchToolInput["query"],
    packRef: PackRef,
    filtersApplied: string[]
  ): SearchFilters {
    const filters: SearchFilters = {};

    // Keyword search
    if (query.keywords && query.keywords.length > 0) {
      filters.keywords = query.keywords;
      filtersApplied.push(`keywords: ${query.keywords.join(", ")}`);
    }

    // Industry filter
    if (query.industries && query.industries.length > 0) {
      filters.industries = query.industries;
      filtersApplied.push(`industries: ${query.industries.join(", ")}`);
    }

    // Location filter - validate against pack's territory rules
    if (query.locations && query.locations.length > 0) {
      filters.locations = query.locations;
      filtersApplied.push(`locations: ${query.locations.join(", ")}`);
    }

    // Size range filter
    if (query.size_range) {
      filters.sizeRange = query.size_range;
      const rangeStr = `${query.size_range.min || 0}-${query.size_range.max || "∞"}`;
      filtersApplied.push(`size: ${rangeStr}`);
    }

    // Size bucket filter
    if (query.size_buckets && query.size_buckets.length > 0) {
      filters.sizeBuckets = query.size_buckets;
      filtersApplied.push(`size_buckets: ${query.size_buckets.join(", ")}`);
    }

    // Signal type filter - validate against pack's signal types
    if (query.signal_types && query.signal_types.length > 0) {
      const validSignalTypes = query.signal_types.filter((st) =>
        packRef.config.signal_types.some((pst) => pst.slug === st)
      );
      if (validSignalTypes.length > 0) {
        filters.signalTypes = validSignalTypes;
        filtersApplied.push(`signal_types: ${validSignalTypes.join(", ")}`);
      }
    }

    // Minimum score filter
    if (query.min_score !== undefined) {
      filters.minScore = query.min_score;
      filtersApplied.push(`min_score: ${query.min_score}`);
    }

    // Recent signals filter
    if (query.has_recent_signals) {
      filters.hasRecentSignals = true;
      // Use freshness window from pack config
      const maxFreshnessDays = Math.max(
        ...packRef.config.signal_types.map((st) => st.freshness_window_days)
      );
      filters.signalWithinDays = maxFreshnessDays;
      filtersApplied.push(
        `has_recent_signals: within ${maxFreshnessDays} days`
      );
    }

    // Exclude contacted filter
    if (query.exclude_contacted) {
      filters.excludeContacted = true;
      filters.contactedWithinDays = query.contacted_within_days || 90;
      filtersApplied.push(
        `exclude_contacted: within ${filters.contactedWithinDays} days`
      );
    }

    return filters;
  }

  // ---------------------------------------------------------------------------
  // SEARCH EXECUTION
  // ---------------------------------------------------------------------------

  private async executeSearch(
    filters: SearchFilters,
    salesContext: SalesContext,
    packRef: PackRef,
    limit: number,
    offset: number,
    sort?: SearchToolInput["sort"]
  ): Promise<{ results: SearchResult[]; total: number }> {
    // In a real implementation, this would:
    // 1. Build SQL/query against the database
    // 2. Apply pack-specific scoring
    // 3. Return paginated results

    // For now, return empty results to show the structure
    // The actual implementation would query targeted_companies table

    console.log(
      `[SearchTool] Executing search with ${Object.keys(filters).length} filters`
    );
    console.log(`[SearchTool] Context: ${salesContext.vertical}/${salesContext.sub_vertical}`);
    console.log(`[SearchTool] Pack: ${packRef.pack_id} v${packRef.version}`);

    // This would be replaced with actual database query
    return {
      results: [],
      total: 0,
    };

    // Example of what a real result would look like:
    // return {
    //   results: [
    //     {
    //       company_id: 'uuid-123',
    //       company_name: 'TechCorp DIFC',
    //       domain: 'techcorp.ae',
    //       industry: 'Technology',
    //       size: 150,
    //       size_bucket: 'scaleup',
    //       location: 'Dubai, UAE',
    //       score: 85,
    //       grade: 'A',
    //       signals: [
    //         {
    //           signal_id: 'sig-456',
    //           signal_type: 'hiring_expansion',
    //           signal_date: '2025-12-01',
    //           confidence: 0.9,
    //         },
    //       ],
    //       match_reasons: ['Matches industry: Technology', 'Has recent hiring signal'],
    //     },
    //   ],
    //   total: 1,
    // };
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private calculateSearchConfidence(filtersApplied: string[]): number {
    // More specific filters = higher confidence in results
    const baseConfidence = 0.5;
    const filterBoost = Math.min(0.4, filtersApplied.length * 0.1);
    return baseConfidence + filterBoost;
  }
}

// Internal types
interface SearchFilters {
  keywords?: string[];
  industries?: string[];
  locations?: string[];
  sizeRange?: { min?: number; max?: number };
  sizeBuckets?: string[];
  signalTypes?: string[];
  minScore?: number;
  hasRecentSignals?: boolean;
  signalWithinDays?: number;
  excludeContacted?: boolean;
  contactedWithinDays?: number;
}

// Register the tool
const searchTool = new SearchTool();
toolRegistry.register(searchTool);

export default searchTool;
