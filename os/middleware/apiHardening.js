/**
 * API Hardening Middleware (S146)
 *
 * Provides:
 * - Rate limiting per endpoint
 * - Authentication verification
 * - Typed error envelopes (never raw model text)
 * - Correlation IDs for debugging
 * - Structured error logging
 */

import { Request, Response, NextFunction, RequestHandler } from "express";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

export interface OSRequest extends Request {
  correlationId: string;
  startTime: number;
  authContext?: {
    authenticated: boolean;
    api_key_id?: string;
    tenant_id?: string;
    scopes?: string[];
  };
}

export interface OSErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    correlation_id: string;
    endpoint: string;
    timestamp: string;
    execution_time_ms?: number;
  };
}

export interface OSSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta: {
    correlation_id: string;
    endpoint: string;
    timestamp: string;
    execution_time_ms: number;
  };
}

export type OSResponse<T = unknown> = OSSuccessResponse<T> | OSErrorResponse;

// =============================================================================
// ERROR CODES
// =============================================================================

export const OS_ERROR_CODES = {
  // Authentication errors (401)
  AUTH_MISSING: "OS_AUTH_MISSING",
  AUTH_INVALID: "OS_AUTH_INVALID",
  AUTH_EXPIRED: "OS_AUTH_EXPIRED",

  // Authorization errors (403)
  FORBIDDEN: "OS_FORBIDDEN",
  SCOPE_DENIED: "OS_SCOPE_DENIED",

  // Validation errors (400)
  VALIDATION_FAILED: "OS_VALIDATION_FAILED",
  INVALID_INPUT: "OS_INVALID_INPUT",
  MISSING_REQUIRED: "OS_MISSING_REQUIRED",

  // Not found errors (404)
  NOT_FOUND: "OS_NOT_FOUND",
  ENTITY_NOT_FOUND: "OS_ENTITY_NOT_FOUND",
  PACK_NOT_FOUND: "OS_PACK_NOT_FOUND",

  // Rate limiting errors (429)
  RATE_LIMITED: "OS_RATE_LIMITED",

  // Internal errors (500)
  INTERNAL_ERROR: "OS_INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "OS_SERVICE_UNAVAILABLE",
  TOOL_ERROR: "OS_TOOL_ERROR",
} as const;

// =============================================================================
// RATE LIMITER
// =============================================================================

interface RateLimitConfig {
  windowMs: number; // Time window in ms
  maxRequests: number; // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Global default
  default: { windowMs: 60000, maxRequests: 100 },

  // Per-endpoint limits
  "/api/os/score": { windowMs: 60000, maxRequests: 200 },
  "/api/os/search": { windowMs: 60000, maxRequests: 100 },
  "/api/os/prioritize": { windowMs: 60000, maxRequests: 50 },
  "/api/os/pipeline": { windowMs: 60000, maxRequests: 30 },
  "/api/os/llm": { windowMs: 60000, maxRequests: 50 },

  // Admin endpoints (lower limits)
  "/api/os/config": { windowMs: 60000, maxRequests: 20 },
  "/api/os/packs": { windowMs: 60000, maxRequests: 20 },
};

/**
 * Get rate limit key for request
 */
function getRateLimitKey(req: OSRequest): string {
  const identifier =
    req.authContext?.api_key_id ||
    req.ip ||
    req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
    "anonymous";
  return `${identifier}:${req.path}`;
}

/**
 * Check rate limit for request
 */
function checkRateLimit(
  req: OSRequest
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = getRateLimitKey(req);
  const config =
    DEFAULT_RATE_LIMITS[req.path] || DEFAULT_RATE_LIMITS.default;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Create new entry or reset if window expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: entry.count <= config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

// =============================================================================
// MIDDLEWARE: Correlation ID
// =============================================================================

export function correlationIdMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const osReq = req as OSRequest;

    // Get or generate correlation ID
    osReq.correlationId =
      (req.headers["x-correlation-id"] as string) ||
      (req.headers["x-request-id"] as string) ||
      uuidv4();

    // Set start time
    osReq.startTime = Date.now();

    // Add to response headers
    res.setHeader("X-Correlation-ID", osReq.correlationId);

    next();
  };
}

// =============================================================================
// MIDDLEWARE: Rate Limiting
// =============================================================================

export function rateLimitMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const osReq = req as OSRequest;
    const { allowed, remaining, resetAt } = checkRateLimit(osReq);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000).toString());

    if (!allowed) {
      const error = createOSError(
        OS_ERROR_CODES.RATE_LIMITED,
        "Rate limit exceeded. Please slow down.",
        osReq,
        { retry_after_ms: resetAt - Date.now() }
      );
      return res.status(429).json(error);
    }

    next();
  };
}

// =============================================================================
// MIDDLEWARE: Authentication
// =============================================================================

export function authMiddleware(options?: {
  required?: boolean;
  scopes?: string[];
}): RequestHandler {
  const { required = true, scopes = [] } = options || {};

  return async (req: Request, res: Response, next: NextFunction) => {
    const osReq = req as OSRequest;

    // Extract API key from headers
    const apiKey =
      req.headers["x-api-key"] ||
      req.headers.authorization?.replace("Bearer ", "");

    // Initialize auth context
    osReq.authContext = {
      authenticated: false,
    };

    if (apiKey) {
      // Validate API key (simplified - would check against DB in production)
      const isValid = await validateApiKey(apiKey as string);

      if (isValid) {
        osReq.authContext = {
          authenticated: true,
          api_key_id: apiKey as string,
          tenant_id: extractTenantId(apiKey as string),
          scopes: ["read", "write"], // Would come from DB
        };
      }
    }

    // Check if auth is required
    if (required && !osReq.authContext.authenticated) {
      const error = createOSError(
        OS_ERROR_CODES.AUTH_MISSING,
        "Authentication required. Provide X-API-Key header.",
        osReq
      );
      return res.status(401).json(error);
    }

    // Check scopes
    if (scopes.length > 0 && osReq.authContext.authenticated) {
      const hasRequiredScopes = scopes.every((scope) =>
        osReq.authContext?.scopes?.includes(scope)
      );

      if (!hasRequiredScopes) {
        const error = createOSError(
          OS_ERROR_CODES.SCOPE_DENIED,
          `Missing required scopes: ${scopes.join(", ")}`,
          osReq
        );
        return res.status(403).json(error);
      }
    }

    next();
  };
}

/**
 * Validate API key (simplified)
 */
async function validateApiKey(apiKey: string): Promise<boolean> {
  // In production, this would validate against database
  // For now, accept any non-empty key that starts with 'os_'
  return apiKey.startsWith("os_") && apiKey.length > 10;
}

/**
 * Extract tenant ID from API key (simplified)
 */
function extractTenantId(apiKey: string): string | undefined {
  // In production, this would look up tenant from API key
  // For now, extract from key format: os_tenant123_xxx
  const match = apiKey.match(/^os_([^_]+)_/);
  return match ? match[1] : undefined;
}

// =============================================================================
// RESPONSE HELPERS
// =============================================================================

/**
 * Create typed error response
 */
export function createOSError(
  code: string,
  message: string,
  req: OSRequest,
  details?: Record<string, unknown>
): OSErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      correlation_id: req.correlationId,
      endpoint: req.path,
      timestamp: new Date().toISOString(),
      execution_time_ms: req.startTime ? Date.now() - req.startTime : undefined,
    },
  };
}

/**
 * Create typed success response
 */
export function createOSSuccess<T>(data: T, req: OSRequest): OSSuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      correlation_id: req.correlationId,
      endpoint: req.path,
      timestamp: new Date().toISOString(),
      execution_time_ms: Date.now() - req.startTime,
    },
  };
}

// =============================================================================
// MIDDLEWARE: Error Handler
// =============================================================================

export function errorHandlerMiddleware(): (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    const osReq = req as OSRequest;

    // Log error with correlation ID
    console.error(`[OS:Error] ${osReq.correlationId}`, {
      error: err.message,
      stack: err.stack,
      endpoint: req.path,
      method: req.method,
      correlation_id: osReq.correlationId,
    });

    // Determine status code
    let statusCode = 500;
    let errorCode = OS_ERROR_CODES.INTERNAL_ERROR;

    if (err.message.includes("not found")) {
      statusCode = 404;
      errorCode = OS_ERROR_CODES.NOT_FOUND;
    } else if (err.message.includes("validation")) {
      statusCode = 400;
      errorCode = OS_ERROR_CODES.VALIDATION_FAILED;
    }

    const error = createOSError(errorCode, err.message, osReq);
    res.status(statusCode).json(error);
  };
}

// =============================================================================
// MIDDLEWARE: Request Logger
// =============================================================================

export function requestLoggerMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const osReq = req as OSRequest;

    // Log on response finish
    res.on("finish", () => {
      const duration = Date.now() - osReq.startTime;
      const logLevel = res.statusCode >= 400 ? "warn" : "info";

      const logData = {
        correlation_id: osReq.correlationId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        tenant_id: osReq.authContext?.tenant_id,
      };

      if (logLevel === "warn") {
        console.warn(`[OS:Request]`, logData);
      } else {
        console.log(`[OS:Request]`, logData);
      }
    });

    next();
  };
}

// =============================================================================
// COMBINED MIDDLEWARE
// =============================================================================

/**
 * Apply all OS API hardening middleware
 */
export function applyOSMiddleware(app: any): void {
  // Apply in order
  app.use("/api/os", correlationIdMiddleware());
  app.use("/api/os", requestLoggerMiddleware());
  app.use("/api/os", rateLimitMiddleware());

  // Auth middleware is applied per-route based on requirements
}

// =============================================================================
// EXPORTS
// =============================================================================

export const apiHardening = {
  correlationIdMiddleware,
  rateLimitMiddleware,
  authMiddleware,
  errorHandlerMiddleware,
  requestLoggerMiddleware,
  createOSError,
  createOSSuccess,
  applyOSMiddleware,
  OS_ERROR_CODES,
};

export default apiHardening;
