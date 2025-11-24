/**
 * Database Connection Pool (CommonJS)
 * For use with multi-agent system
 */

const { Pool } = require('pg');

// Parse DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/postgres';

// Parse the connection URL manually using regex
let config;

try {
  // Remove sslmode query parameter if present
  const [mainUrl, queryString] = DATABASE_URL.split('?');

  // Parse URL using regex: postgresql://user:password@host:port/database
  const regex = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = mainUrl.match(regex);

  if (match) {
    config = {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4]),
      database: match[5]
    };

    // Check for SSL mode in query string
    if (queryString && queryString.includes('sslmode=disable')) {
      config.ssl = false;
    } else {
      config.ssl = { rejectUnauthorized: false };
    }
  } else {
    throw new Error('Invalid DATABASE_URL format');
  }
} catch (error) {
  console.error('Error parsing DATABASE_URL:', error.message);
  // Fallback to simple config
  config = {
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    ssl: false
  };
}

const pool = new Pool(config);

module.exports = pool;
