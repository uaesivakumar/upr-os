#!/usr/bin/env node
/**
 * Pattern Verification Tool
 *
 * Manually verify and correct wrong patterns based on real email examples
 *
 * Usage: node verify-pattern.js <domain> "<pattern>" "<real_email_examples>"
 * Example: node verify-pattern.js dib.ae "{first}.{last}" "huma.hamid@dib.ae,aslam.valappil@dib.ae"
 */

import pg from 'pg';

const [domain, correctPattern, examples] = process.argv.slice(2);

if (!domain || !correctPattern) {
  console.error('');
  console.error('Pattern Verification Tool');
  console.error('═'.repeat(70));
  console.error('');
  console.error('Usage: node verify-pattern.js <domain> "<pattern>" "<examples>"');
  console.error('');
  console.error('Examples:');
  console.error('  node verify-pattern.js dib.ae "{first}.{last}" "huma.hamid@dib.ae"');
  console.error('  node verify-pattern.js emiratesnbd.com "{first}.{last}" "john.smith@emiratesnbd.com"');
  console.error('');
  console.error('Patterns:');
  console.error('  {first}.{last} - john.smith@company.com');
  console.error('  {first}{l}     - johns@company.com');
  console.error('  {f}{last}      - jsmith@company.com');
  console.error('  {first}        - john@company.com');
  console.error('');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function verifyPattern() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('EmailPatternEngine - Pattern Verification Tool');
  console.log('UPR (Universal People Radar)');
  console.log('═'.repeat(70));
  console.log('');

  try {
    // Get current pattern
    const current = await pool.query(`
      SELECT * FROM email_patterns WHERE domain = $1
    `, [domain]);

    if (current.rows.length === 0) {
      console.error(`❌ Domain not found in database: ${domain}`);
      console.error('');
      console.error('This domain has no pattern yet. It will be learned when first used.');
      console.error('');
      await pool.end();
      process.exit(1);
    }

    const existing = current.rows[0];

    console.log('Current Pattern:');
    console.log(`  Domain: ${existing.domain}`);
    console.log(`  Pattern: ${existing.pattern}`);
    console.log(`  Confidence: ${parseFloat(existing.confidence).toFixed(2)}`);
    console.log(`  Source: ${existing.last_source}`);
    console.log(`  Usage Count: ${existing.usage_count}`);
    console.log(`  Last Updated: ${existing.updated_at}`);
    console.log('');

    if (existing.pattern === correctPattern) {
      console.log('✅ Pattern is already correct!');
      console.log('');

      if (examples) {
        console.log('Verifying with real email examples:');
        const exampleList = examples.split(',').map(e => e.trim());
        exampleList.forEach(email => {
          console.log(`  ✅ ${email}`);
        });
        console.log('');
      }

      await pool.end();
      return;
    }

    console.log(`❌ Current pattern is WRONG!`);
    console.log('');
    console.log(`Correcting: ${existing.pattern} → ${correctPattern}`);
    console.log('');

    if (examples) {
      console.log('Verified with real email examples:');
      const exampleList = examples.split(',').map(e => e.trim());
      exampleList.forEach(email => {
        console.log(`  ✅ ${email}`);
      });
      console.log('');
    }

    // Update pattern
    const result = await pool.query(`
      UPDATE email_patterns
      SET
        pattern = $2,
        confidence = 0.95,
        last_source = 'manual',
        verified_at = NOW(),
        updated_at = NOW()
      WHERE domain = $1
      RETURNING *
    `, [domain, correctPattern]);

    console.log('✅ Pattern corrected successfully!');
    console.log('');

    const updated = result.rows[0];
    console.log('Updated Pattern:');
    console.log(`  Domain: ${updated.domain}`);
    console.log(`  Pattern: ${updated.pattern}`);
    console.log(`  Confidence: ${parseFloat(updated.confidence).toFixed(2)}`);
    console.log(`  Source: ${updated.last_source}`);
    console.log(`  Verified: ${updated.verified_at}`);
    console.log('');

    console.log('═'.repeat(70));
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
  } finally {
    await pool.end();
  }
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set');
  console.error('');
  console.error('Set it first:');
  console.error('  export DATABASE_URL="postgresql://..."');
  console.error('');
  process.exit(1);
}

verifyPattern();
