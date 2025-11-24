// routes/auth.js
// JWT-based authentication for dashboard and API access

import express from 'express';
import { signJwt, verifyJwt, getJwtFromRequest, setSessionCookie, clearSessionCookie } from '../utils/jwt.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token in httpOnly cookie
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  const ADMIN_USERNAME = process.env.UPR_ADMIN_USER || process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.UPR_ADMIN_PASS || process.env.ADMIN_PASSWORD;

  // SECURITY: Fail if credentials are not configured via environment variables
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error('[AUTH] CRITICAL: Admin credentials not configured in environment variables');
    return res.status(500).json({ ok: false, error: 'Authentication not configured' });
  }

  console.log(`[AUTH] Login attempt for user: ${username}`);

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // Generate JWT token with user info
    const token = signJwt({
      sub: username,
      role: 'admin',
      iat: Math.floor(Date.now() / 1000)
    }, '168h'); // 7 days

    // Set httpOnly cookie for security (prevents XSS attacks)
    setSessionCookie(res, token, 168); // 168 hours = 7 days

    console.log(`[AUTH] Login successful for user: ${username}, JWT token set in upr_jwt cookie`);
    return res.json({ ok: true, user: { username, role: 'admin' } });
  }

  console.log(`[AUTH] Login failed for user: ${username}`);
  res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

/**
 * POST /api/auth/logout
 * Clear authentication cookie
 */
router.post('/logout', (req, res) => {
  const token = getJwtFromRequest(req);
  if (token) {
    console.log(`[AUTH] User logged out`);
  }

  // Clear the JWT cookie
  clearSessionCookie(res);

  res.json({ ok: true });
});

/**
 * GET /api/auth/verify
 * Verify if current session is authenticated
 */
router.get('/verify', (req, res) => {
  const token = getJwtFromRequest(req);

  if (!token) {
    return res.status(401).json({ ok: false, authenticated: false });
  }

  const decoded = verifyJwt(token);

  if (decoded) {
    return res.json({
      ok: true,
      authenticated: true,
      user: {
        username: decoded.sub,
        role: decoded.role
      }
    });
  }

  res.status(401).json({ ok: false, authenticated: false });
});

/**
 * GET /api/auth/me
 * Get current authenticated user info
 */
router.get('/me', (req, res) => {
  const token = getJwtFromRequest(req);

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const decoded = verifyJwt(token);

  if (decoded) {
    return res.json({
      ok: true,
      user: {
        username: decoded.sub,
        role: decoded.role
      }
    });
  }

  res.status(401).json({ ok: false, error: 'Invalid token' });
});

export default router;
