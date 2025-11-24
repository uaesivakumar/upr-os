/**
 * Database connection helper for emailIntelligence modules
 *
 * Provides access to the PostgreSQL connection pool without circular dependencies.
 * This allows emailIntelligence modules to share database access.
 */

import pool from '../../../utils/db.js';

let dbInstance = pool;

/**
 * Initialize database instance (for testing)
 * @param {Object} db - PostgreSQL connection pool
 */
export function initDb(db) {
  dbInstance = db;
  console.log('[EmailIntelligence] Database initialized');
}

/**
 * Get database instance
 *
 * @returns {Object} - PostgreSQL connection pool
 */
export function getDb() {
  return dbInstance;
}

/**
 * Execute query with error handling
 *
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
export async function query(text, params) {
  try {
    return await dbInstance.query(text, params);
  } catch (error) {
    console.error('[DB] Query error:', error.message);
    throw error;
  }
}

export default {
  initDb,
  getDb,
  query
};
