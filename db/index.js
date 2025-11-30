/**
 * Database Module - ESM Wrapper
 * Provides ES module exports for database operations.
 *
 * This module wraps the CommonJS db module from utils/db.js
 * for use with ES module services (S50+).
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the CommonJS module
const db = require('../utils/db.js');

// Re-export as named exports for ESM consumers
export const query = db.query;
export const transaction = db.transaction;
export const getClient = db.getClient;
export const end = db.end;
export const pool = db.pool;

// Helper function to get pool for connection management
export function getPool() {
  return db.pool;
}

// Default export for compatibility
export default {
  query,
  transaction,
  getClient,
  end,
  pool,
  getPool
};
