// utils/jwt.js
import jwt from "jsonwebtoken";

const env = process.env.NODE_ENV || "development";
const JWT_SECRET = process.env.JWT_SECRET;
// Fail fast in prod-like environments if secret is missing to prevent forged tokens
if (!JWT_SECRET && env === "production") {
  throw new Error("JWT_SECRET is required in production for secure authentication");
}

// [FIX] Corrected cookie name to match what is set in server.js
const COOKIE_NAME = "upr_jwt";

export function signJwt(payload, expiresIn = "12h") {
  const secret = JWT_SECRET || "dev_upr_secret"; // dev/test fallback only
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyJwt(token) {
  try {
    const secret = JWT_SECRET || "dev_upr_secret"; // dev/test fallback only
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

/** Read JWT from Authorization: Bearer … header OR from HttpOnly cookie. */
export function getJwtFromRequest(req) {
  const h = req.headers?.authorization || req.headers?.Authorization;
  if (h && typeof h === "string" && h.startsWith("Bearer ")) {
    return h.slice("Bearer ".length).trim();
  }
  // This function now relies on the cookie-parser middleware to be used
  if (req.cookies) {
    const c = req.cookies?.[COOKIE_NAME];
    if (c) return c;
  }
  return null;
}

export function setSessionCookie(res, token, hours = 12) {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: hours * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}
