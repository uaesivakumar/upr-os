/**
 * API Response Caching Middleware
 * S151: Performance & Caching
 *
 * In-memory cache with TTL for frequently accessed data:
 * - Vertical configs (5 min TTL)
 * - Signal types (5 min TTL)
 * - Scoring templates (5 min TTL)
 * - Provider configs (2 min TTL)
 *
 * Redis-compatible interface for future scaling.
 */

// Simple in-memory cache store
const cacheStore = new Map();

// Cache statistics for monitoring
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  evictions: 0,
};

// Default TTL values (in milliseconds)
const DEFAULT_TTL = {
  verticalConfig: 5 * 60 * 1000,    // 5 minutes
  signalTypes: 5 * 60 * 1000,       // 5 minutes
  scoringTemplates: 5 * 60 * 1000,  // 5 minutes
  providerConfig: 2 * 60 * 1000,    // 2 minutes
  entityData: 60 * 1000,            // 1 minute
  default: 3 * 60 * 1000,           // 3 minutes
};

// Maximum cache size (entries)
const MAX_CACHE_SIZE = 1000;

/**
 * Cache entry structure
 */
class CacheEntry {
  constructor(value, ttl) {
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = Date.now() + ttl;
    this.hits = 0;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  touch() {
    this.hits++;
    return this.value;
  }
}

/**
 * Generate cache key from request
 */
export function generateCacheKey(req, prefix = '') {
  const parts = [
    prefix || req.method,
    req.originalUrl || req.url,
  ];

  // Include relevant query params
  if (req.query && Object.keys(req.query).length > 0) {
    const sortedQuery = Object.keys(req.query)
      .sort()
      .map(k => `${k}=${req.query[k]}`)
      .join('&');
    parts.push(sortedQuery);
  }

  return parts.join(':');
}

/**
 * Get value from cache
 */
export function cacheGet(key) {
  const entry = cacheStore.get(key);

  if (!entry) {
    stats.misses++;
    return null;
  }

  if (entry.isExpired()) {
    cacheStore.delete(key);
    stats.misses++;
    stats.evictions++;
    return null;
  }

  stats.hits++;
  return entry.touch();
}

/**
 * Set value in cache
 */
export function cacheSet(key, value, ttl = DEFAULT_TTL.default) {
  // Evict oldest entries if cache is full
  if (cacheStore.size >= MAX_CACHE_SIZE) {
    evictOldestEntries(Math.floor(MAX_CACHE_SIZE * 0.1));
  }

  const entry = new CacheEntry(value, ttl);
  cacheStore.set(key, entry);
  stats.sets++;
  return true;
}

/**
 * Delete value from cache
 */
export function cacheDelete(key) {
  const deleted = cacheStore.delete(key);
  if (deleted) stats.deletes++;
  return deleted;
}

/**
 * Delete entries matching pattern
 */
export function cacheDeletePattern(pattern) {
  const regex = new RegExp(pattern);
  let deleted = 0;

  for (const key of cacheStore.keys()) {
    if (regex.test(key)) {
      cacheStore.delete(key);
      deleted++;
    }
  }

  stats.deletes += deleted;
  return deleted;
}

/**
 * Clear entire cache
 */
export function cacheClear() {
  const size = cacheStore.size;
  cacheStore.clear();
  return size;
}

/**
 * Get cache statistics
 */
export function cacheStats() {
  return {
    ...stats,
    size: cacheStore.size,
    maxSize: MAX_CACHE_SIZE,
    hitRate: stats.hits + stats.misses > 0
      ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2) + '%'
      : '0%',
  };
}

/**
 * Evict oldest entries
 */
function evictOldestEntries(count) {
  const entries = Array.from(cacheStore.entries())
    .sort((a, b) => a[1].createdAt - b[1].createdAt)
    .slice(0, count);

  for (const [key] of entries) {
    cacheStore.delete(key);
    stats.evictions++;
  }
}

/**
 * Clean expired entries (run periodically)
 */
export function cleanExpiredEntries() {
  let cleaned = 0;

  for (const [key, entry] of cacheStore.entries()) {
    if (entry.isExpired()) {
      cacheStore.delete(key);
      cleaned++;
    }
  }

  stats.evictions += cleaned;
  return cleaned;
}

// Run cleanup every minute
setInterval(cleanExpiredEntries, 60 * 1000);

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

/**
 * Cache middleware factory
 *
 * @param {object} options
 * @param {number} options.ttl - TTL in milliseconds
 * @param {string} options.keyPrefix - Cache key prefix
 * @param {function} options.keyGenerator - Custom key generator
 * @param {array} options.methods - HTTP methods to cache (default: ['GET'])
 * @param {function} options.condition - Condition function to determine if response should be cached
 */
export function cacheMiddleware(options = {}) {
  const {
    ttl = DEFAULT_TTL.default,
    keyPrefix = '',
    keyGenerator = generateCacheKey,
    methods = ['GET'],
    condition = () => true,
  } = options;

  return (req, res, next) => {
    // Only cache specified methods
    if (!methods.includes(req.method)) {
      return next();
    }

    const cacheKey = keyGenerator(req, keyPrefix);
    const cached = cacheGet(cacheKey);

    if (cached) {
      // Return cached response
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Key', cacheKey);
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = (data) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300 && condition(req, res, data)) {
        cacheSet(cacheKey, data, ttl);
        res.set('X-Cache', 'MISS');
      }
      res.set('X-Cache-Key', cacheKey);
      return originalJson(data);
    };

    next();
  };
}

/**
 * Vertical config cache middleware
 * Caches GET /api/os/verticals/:slug and /api/os/verticals/:slug/config
 */
export function verticalConfigCache() {
  return cacheMiddleware({
    ttl: DEFAULT_TTL.verticalConfig,
    keyPrefix: 'vertical',
    condition: (req, res, data) => data?.success === true,
  });
}

/**
 * Signal types cache middleware
 */
export function signalTypesCache() {
  return cacheMiddleware({
    ttl: DEFAULT_TTL.signalTypes,
    keyPrefix: 'signals',
    condition: (req, res, data) => data?.success === true,
  });
}

/**
 * Scoring templates cache middleware
 */
export function scoringTemplatesCache() {
  return cacheMiddleware({
    ttl: DEFAULT_TTL.scoringTemplates,
    keyPrefix: 'scoring',
    condition: (req, res, data) => data?.success === true,
  });
}

/**
 * Provider config cache middleware
 */
export function providerConfigCache() {
  return cacheMiddleware({
    ttl: DEFAULT_TTL.providerConfig,
    keyPrefix: 'provider',
    condition: (req, res, data) => data?.success === true,
  });
}

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate vertical cache when config is updated
 */
export function invalidateVerticalCache(verticalSlug) {
  const deleted = cacheDeletePattern(`vertical:.*${verticalSlug}.*`);
  console.log(`[Cache] Invalidated ${deleted} entries for vertical: ${verticalSlug}`);
  return deleted;
}

/**
 * Invalidate all vertical caches
 */
export function invalidateAllVerticalCaches() {
  const deleted = cacheDeletePattern('vertical:.*');
  console.log(`[Cache] Invalidated ${deleted} vertical cache entries`);
  return deleted;
}

/**
 * Invalidate provider cache
 */
export function invalidateProviderCache(providerId) {
  const deleted = cacheDeletePattern(`provider:.*${providerId}.*`);
  console.log(`[Cache] Invalidated ${deleted} entries for provider: ${providerId}`);
  return deleted;
}

// ============================================================================
// CACHE STATS ENDPOINT HELPER
// ============================================================================

/**
 * Express route handler for cache stats
 */
export function cacheStatsHandler(req, res) {
  res.json({
    success: true,
    data: cacheStats(),
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheClear,
  cacheStats,
  cacheMiddleware,
  verticalConfigCache,
  signalTypesCache,
  scoringTemplatesCache,
  providerConfigCache,
  invalidateVerticalCache,
  invalidateAllVerticalCaches,
  invalidateProviderCache,
  cacheStatsHandler,
  DEFAULT_TTL,
};
