#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'UprApp2025!Pass31cd5b023e349c88',
  ssl: {
    rejectUnauthorized: false
  }
});

async function getTenant() {
  const client = await pool.connect();

  try {
    // Get or create a test tenant
    let result = await client.query(`
      SELECT id, name FROM tenants
      WHERE name LIKE '%test%' OR name LIKE '%smoke%'
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      console.log('Found existing test tenant:');
      console.log('  ID:', result.rows[0].id);
      console.log('  Name:', result.rows[0].name);
      console.log(result.rows[0].id);
      return result.rows[0].id;
    }

    // If no test tenant exists, get any tenant
    result = await client.query(`
      SELECT id, name FROM tenants LIMIT 1
    `);

    if (result.rows.length > 0) {
      console.log('Using existing tenant:');
      console.log('  ID:', result.rows[0].id);
      console.log('  Name:', result.rows[0].name);
      console.log(result.rows[0].id);
      return result.rows[0].id;
    }

    // Create a new test tenant
    result = await client.query(`
      INSERT INTO tenants (name, slug, email)
      VALUES ('Sprint 19 Test Tenant', 'sprint19-test', 'test@sprint19.local')
      RETURNING id, name
    `);

    console.log('Created new test tenant:');
    console.log('  ID:', result.rows[0].id);
    console.log('  Name:', result.rows[0].name);
    console.log(result.rows[0].id);
    return result.rows[0].id;

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

getTenant();
