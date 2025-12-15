// server/db.js
// Re-exports the main db pool from utils/db.js for ES module compatibility
import pkg from "pg";
const { Pool } = pkg;

/**
 * Parse DATABASE_URL to handle both standard and Unix socket formats
 * Supports:
 * - Standard: postgresql://user:pass@host:port/database
 * - Unix socket: postgresql://user:pass@/database?host=/cloudsql/instance
 */
function parseDatabaseUrl(url) {
  if (!url) {
    console.error('[server/db.js] DATABASE_URL is not set');
    throw new Error('DATABASE_URL is not set');
  }

  // Check if it's a Unix socket format (Cloud SQL)
  // Format: postgresql://user:pass@/database?host=/cloudsql/instance
  const unixSocketMatch = url.match(/postgresql:\/\/([^:]+):([^@]+)@\/([^?]+)\?host=(.+)/);

  if (unixSocketMatch) {
    console.log('[server/db.js] Using Unix socket connection (Cloud SQL)');
    return {
      user: unixSocketMatch[1],
      password: decodeURIComponent(unixSocketMatch[2]),
      database: unixSocketMatch[3],
      host: unixSocketMatch[4],
      isUnixSocket: true,
    };
  }

  // Try standard format: postgresql://user:pass@host:port/database
  const standardMatch = url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)(\?.*)?$/);

  if (standardMatch) {
    const [, user, password, host, port, database] = standardMatch;
    console.log(`[server/db.js] Using standard connection to ${host}:${port}`);
    return {
      user: decodeURIComponent(user),
      password: decodeURIComponent(password),
      host,
      port: parseInt(port),
      database,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      isUnixSocket: false,
    };
  }

  // Fallback: try connectionString directly
  console.log('[server/db.js] Using connectionString directly');
  return { connectionString: url, isUnixSocket: false };
}

const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL);

const poolConfig = {
  ...dbConfig,
  max: 10,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
};

// Remove the isUnixSocket flag from pool config
delete poolConfig.isUnixSocket;

const pool = new Pool(poolConfig);

pool.on('connect', () => console.log('[server/db.js] Database client connected'));
pool.on('error', (err) => console.error('[server/db.js] Database error:', err.message));

export default pool;
