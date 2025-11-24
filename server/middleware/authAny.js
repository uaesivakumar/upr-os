// server/middleware/authAny.js
// Middleware that accepts multiple authentication methods

import { getJwtFromRequest, verifyJwt } from '../../utils/jwt.js';

/**
 * authAny - Accept authentication from multiple sources
 *
 * Supports:
 * 1. Express session (if configured)
 * 2. JWT from Bearer token in Authorization header
 * 3. JWT from httpOnly cookie (upr_jwt)
 */
export default function authAny(req, res, next) {
  // 1) Cookie-based session (if you ever add express-session again)
  if (req?.session?.user) {
    req.user = req.session.user;
    return next();
  }

  // 2) JWT from Authorization header OR httpOnly cookie
  const token = getJwtFromRequest(req);

  if (token) {
    try {
      const payload = verifyJwt(token);
      if (payload) {
        req.user = {
          id: payload.sub,
          username: payload.sub,
          role: payload.role || 'admin',
          ...payload
        };
        return next();
      }
    } catch (e) {
      console.error('[authAny] JWT verification failed:', e.message);
      // fall through to 401 below
    }
  }

  // 3) Unauthorized
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}
