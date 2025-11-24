const { Pool } = require('pg');

// Parse DATABASE_URL to handle both standard and Unix socket formats
function parseDatabaseUrl(url) {
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  // Check if it's a Unix socket format (Cloud SQL)
  // Format: postgresql://user:pass@/database?host=/cloudsql/instance
  const unixSocketMatch = url.match(/postgresql:\/\/([^:]+):([^@]+)@\/([^?]+)\?host=(.+)/);

  if (unixSocketMatch) {
    return {
      user: unixSocketMatch[1],
      password: unixSocketMatch[2],
      database: unixSocketMatch[3],
      host: unixSocketMatch[4],
      isUnixSocket: true,
    };
  }

  // Standard format - use connectionString
  return { connectionString: url, isUnixSocket: false };
}

const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL);

const poolConfig = {
  ...dbConfig,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // Increased for VPC connector latency
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // Unix sockets don't use SSL, standard connections do
  ssl: dbConfig.isUnixSocket ? false : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false)
};

// Remove the isUnixSocket flag from pool config
delete poolConfig.isUnixSocket;

const pool = new Pool(poolConfig);

pool.on('connect', () => console.log('📊 Database client connected'));
pool.on('error', (err) => console.error('💥 Database error:', err));

async function query(text, params, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const start = Date.now();
      const result = await pool.query(text, params);
      const duration = Date.now() - start;

      if (duration > 1000) {
        console.warn(`⚠️  Slow query (${duration}ms)`);
      }

      return result;

    } catch (error) {
      lastError = error;
      console.error(`❌ Query error (attempt ${attempt}/${retries}):`, error.message);

      if (error.code === '42601' || error.code === '42P01') {
        throw error;
      }

      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getClient() {
  return await pool.connect();
}

async function end() {
  await pool.end();
}

module.exports = { query, transaction, getClient, end, pool };
