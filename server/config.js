// server/config.js
export const PORT = process.env.PORT || 10000;

// SECURITY: Admin credentials must be set via environment variables (UPR_ADMIN_USER, UPR_ADMIN_PASS)
// No hardcoded fallbacks for security
export const ADMIN_USERNAME = process.env.UPR_ADMIN_USER || process.env.ADMIN_USERNAME;
export const ADMIN_PASSWORD = process.env.UPR_ADMIN_PASS || process.env.ADMIN_PASSWORD;

// Validate credentials are set at startup
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('CRITICAL SECURITY ERROR: Admin credentials not configured!');
  console.error('Set UPR_ADMIN_USER and UPR_ADMIN_PASS environment variables');
  throw new Error('Admin credentials not configured in environment variables');
}
