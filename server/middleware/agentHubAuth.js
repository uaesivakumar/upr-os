/**
 * Agent Hub Authentication Middleware
 * Sprint 30 - Task 1: JWT Authentication
 *
 * Purpose: Protect Agent Hub API endpoints with JWT authentication
 * Strategy: Bearer token validation with role-based permissions
 *
 * Protected endpoints:
 * - POST /api/agent-hub/v1/execute-tool
 * - POST /api/agent-hub/v1/execute-workflow
 * - POST /api/agent-hub/v1/auth/token (special case)
 *
 * Public endpoints:
 * - GET /api/agent-hub/v1/tools
 * - GET /api/agent-hub/v1/workflows
 * - GET /api/agent-hub/v1/health
 */

import { getJwtFromRequest, verifyJwt } from '../../utils/jwt.js';
import { logger } from '../agent-hub/logger.js';

/**
 * Agent Hub Authentication Middleware
 *
 * Validates JWT token from Authorization header
 * Sets req.user with authenticated user info
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function agentHubAuth(req, res, next) {
  const startTime = Date.now();

  try {
    // Extract JWT from Authorization header
    const token = getJwtFromRequest(req);

    if (!token) {
      logger.warn('Agent Hub auth failed: No token provided', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Provide a valid JWT token in Authorization header.'
        }
      });
    }

    // Verify JWT token
    const payload = verifyJwt(token);

    if (!payload) {
      logger.warn('Agent Hub auth failed: Invalid token', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired JWT token.'
        }
      });
    }

    // Validate token role (must be agent_hub_api or agent_hub_user)
    const validRoles = ['agent_hub_api', 'agent_hub_user', 'admin'];
    if (!validRoles.includes(payload.role)) {
      logger.warn('Agent Hub auth failed: Invalid role', {
        path: req.path,
        method: req.method,
        role: payload.role
      });

      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Token does not have permission to access Agent Hub API.'
        }
      });
    }

    // Set authenticated user on request
    req.user = {
      id: payload.sub,
      role: payload.role,
      permissions: payload.permissions || [],
      token_hash: token.substring(0, 16) // First 16 chars for rate limiting
    };

    const duration = Date.now() - startTime;

    logger.debug('Agent Hub auth successful', {
      user_id: req.user.id,
      role: req.user.role,
      path: req.path,
      duration_ms: duration
    });

    next();

  } catch (error) {
    logger.error('Agent Hub auth error', {
      error: error.message,
      stack: error.stack,
      path: req.path
    });

    return res.status(500).json({
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication error occurred.'
      }
    });
  }
}

/**
 * Optional Authentication Middleware
 *
 * Attempts authentication but doesn't fail if no token
 * Useful for endpoints that have different behavior for authenticated users
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function agentHubAuthOptional(req, res, next) {
  try {
    const token = getJwtFromRequest(req);

    if (token) {
      const payload = verifyJwt(token);

      if (payload) {
        req.user = {
          id: payload.sub,
          role: payload.role,
          permissions: payload.permissions || [],
          token_hash: token.substring(0, 16)
        };

        logger.debug('Agent Hub optional auth successful', {
          user_id: req.user.id,
          path: req.path
        });
      }
    }

    // Continue regardless of auth status
    next();

  } catch (error) {
    logger.error('Agent Hub optional auth error', {
      error: error.message,
      path: req.path
    });

    // Continue even on error
    next();
  }
}

/**
 * Permission Check Middleware Factory
 *
 * Creates middleware that checks for specific permission
 *
 * @param {string} permission - Required permission
 * @returns {function} Middleware function
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.'
        }
      });
    }

    const hasPermission = req.user.permissions.includes(permission) || req.user.role === 'admin';

    if (!hasPermission) {
      logger.warn('Agent Hub permission denied', {
        user_id: req.user.id,
        required_permission: permission,
        user_permissions: req.user.permissions
      });

      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Missing required permission: ${permission}`
        }
      });
    }

    next();
  };
}

export {
  agentHubAuth,
  agentHubAuthOptional,
  requirePermission
};
