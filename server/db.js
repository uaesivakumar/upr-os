// server/db.js
import pkg from "pg";
const { Pool } = pkg;
import { URL } from 'url';

// Parse DATABASE_URL manually to avoid pg-connection-string issues
function parseConnectionString(connString) {
  if (!connString) {
    return {
      host: 'localhost',
      port: 5432,
      database: 'postgres'
    };
  }

  try {
    // Parse postgresql://user:password@host:port/database?options
    const match = connString.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/);

    if (!match) {
      throw new Error('Invalid connection string format');
    }

    const [, user, password, host, port, database, queryString] = match;

    const config = {
      user: decodeURIComponent(user),
      password: decodeURIComponent(password),
      host,
      port: parseInt(port),
      database
    };

    // Check SSL mode from query string
    if (!queryString || !queryString.includes('sslmode=disable')) {
      config.ssl = { rejectUnauthorized: false };
    }

    return config;
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error.message);
    return { host: 'localhost', port: 5432, database: 'postgres' };
  }
}

const poolConfig = parseConnectionString(process.env.DATABASE_URL);
const pool = new Pool(poolConfig);

export default pool;
