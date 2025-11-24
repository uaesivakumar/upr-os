/**
 * Sprint 17 P1: API Rate Limiting
 * Protects endpoints from abuse and prevents cost overruns
 */

import rateLimit from 'express-rate-limit';

// ============================================================
// RATE LIMIT CONFIGURATIONS
// ============================================================

/**
 * General API Rate Limit
 * Applies to most endpoints
 * 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  validate: { trustProxy: false }, // Sprint 19: Skip trust proxy validation for Cloud Run
  handler: (req, res) => {
    console.warn('⚠️  Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });

    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Enrichment API Rate Limit
 * More restrictive due to external API costs
 * 20 requests per 15 minutes per IP
 *
 * Limit: 20 requests per window
 */
export const enrichmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    error: 'Too many enrichment requests. This endpoint is rate-limited due to API costs.',
    retryAfter: '15 minutes',
    limit: 20,
    window: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  validate: { trustProxy: false }, // Sprint 19: Skip trust proxy validation for Cloud Run
  handler: (req, res) => {
    console.warn('⚠️  Enrichment rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      user: req.user?.id
    });

    res.status(429).json({
      error: 'Too many enrichment requests. This endpoint is rate-limited due to API costs.',
      retryAfter: '15 minutes',
      limit: 999999,
      window: '15 minutes'
    });
  }
});

/**
 * RADAR API Rate Limit
 * Very restrictive - manual scans only
 * 5 requests per hour per IP
 */
export const radarLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    error: 'Too many RADAR scan requests. RADAR scans are expensive and limited to 5 per hour.',
    retryAfter: '1 hour',
    limit: 5,
    window: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // Sprint 19: Skip trust proxy validation for Cloud Run
  handler: (req, res) => {
    console.error('🚨 RADAR rate limit exceeded', {
      ip: req.ip,
      user: req.user?.id,
      budgetLimitUsd: req.body?.budgetLimitUsd
    });

    res.status(429).json({
      error: 'Too many RADAR scan requests. RADAR scans are expensive and limited to 5 per hour.',
      retryAfter: '1 hour',
      limit: 999999,
      window: '1 hour',
      note: 'Automated daily scans are not affected by this limit.'
    });
  }
});

/**
 * Authentication Rate Limit
 * Prevents brute force attacks
 * 5 login attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many login attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  validate: { trustProxy: false }, // Sprint 19: Skip trust proxy validation for Cloud Run
  handler: (req, res) => {
    console.error('🚨 Auth rate limit exceeded - possible attack', {
      ip: req.ip,
      username: req.body?.username
    });

    res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Agent Hub API Rate Limit (Sprint 30)
 * Per-token rate limiting: 100 requests per 15 minutes
 * Applies to authenticated Agent Hub endpoints
 */
export const agentHubLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per token
  message: {
    error: 'Agent Hub rate limit exceeded. Maximum 100 requests per 15 minutes.',
    retryAfter: '15 minutes',
    limit: 100,
    window: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use token hash as key for per-token rate limiting
  keyGenerator: (req) => {
    // If authenticated, use token hash; otherwise use IP
    return req.user?.token_hash || req.ip;
  },
  validate: { trustProxy: false },
  handler: (req, res) => {
    console.warn('⚠️  Agent Hub rate limit exceeded', {
      ip: req.ip,
      user_id: req.user?.id,
      token_hash: req.user?.token_hash
    });

    res.status(429).json({
      error: 'Agent Hub rate limit exceeded. Maximum 100 requests per 15 minutes.',
      retryAfter: '15 minutes',
      limit: 100,
      window: '15 minutes'
    });
  }
});

/**
 * Agent Hub Unauthenticated Rate Limit (Sprint 30)
 * Per-IP rate limiting for public endpoints: 50 requests per 15 minutes
 */
export const agentHubPublicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window per IP
  message: {
    error: 'Too many requests to Agent Hub. Maximum 50 requests per 15 minutes.',
    retryAfter: '15 minutes',
    limit: 50,
    window: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  handler: (req, res) => {
    console.warn('⚠️  Agent Hub public rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });

    res.status(429).json({
      error: 'Too many requests to Agent Hub. Maximum 50 requests per 15 minutes.',
      retryAfter: '15 minutes',
      limit: 50,
      window: '15 minutes'
    });
  }
});

/**
 * Export all limiters
 */
export default {
  general: generalLimiter,
  enrichment: enrichmentLimiter,
  radar: radarLimiter,
  auth: authLimiter,
  agentHub: agentHubLimiter,
  agentHubPublic: agentHubPublicLimiter
};
