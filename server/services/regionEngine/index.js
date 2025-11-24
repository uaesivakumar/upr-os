/**
 * Region Engine - Main Export
 * Sprint 71: Region Engine Registry
 * Sprint 72: Geo Granularity & Reachability Layer
 * Sprint 73: Region-Aware Scoring & Timing Packs
 *
 * Unified export for all Region Engine components
 */

// Sprint 71: Core Region Engine
export { regionRegistry, default as RegionRegistry } from './RegionRegistry.js';
export { tenantRegionService, default as TenantRegionService } from './TenantRegionService.js';
export { default as buildRegionPipelineContext } from './RegionPipelineContext.js';
export * from './types.js';

// Sprint 72: Geo Granularity & Reachability
export { territoryService, default as TerritoryService } from './TerritoryService.js';
export { reachabilityFilter, default as ReachabilityFilter } from './ReachabilityFilter.js';
export { geoGranularityResolver, default as GeoGranularityResolver } from './GeoGranularityResolver.js';

// Sprint 73: Region-Aware Scoring & Timing Packs
export { regionScoringService, default as RegionScoringService } from './RegionScoringService.js';
export { timingPackService, default as TimingPackService } from './TimingPackService.js';

// Re-export middleware for convenience
export {
  regionContextMiddleware,
  requireRegion,
  optionalRegion
} from '../../middleware/regionContext.js';
