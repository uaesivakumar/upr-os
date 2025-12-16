/**
 * Discovery Services Index
 * S121: Intelligent Discovery Pool Architecture
 *
 * OS-OWNED: All discovery infrastructure
 * - Pool management and deduplication
 * - Background crawling
 * - Lead assignment and collision prevention
 * - Territory mapping and distribution
 */

export { DiscoveryPoolService } from './DiscoveryPoolService.js';
export { DiscoveryCrawlerService } from './DiscoveryCrawlerService.js';
export { LeadAssignmentService } from './LeadAssignmentService.js';
export { TerritoryMappingService } from './TerritoryMappingService.js';
