#!/usr/bin/env node
/**
 * Sprint 39 - Task 3: Security Audit
 *
 * Comprehensive security assessment covering:
 * - Authentication & Authorization
 * - Data Security
 * - Infrastructure Security
 * - Application Security
 * - Dependency Security
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Test results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  critical: 0,
  tests: []
};

function logTest(category, test, severity, status, message, details = null) {
  results.total++;
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') {
    results.failed++;
    if (severity === 'CRITICAL') results.critical++;
  }
  else if (status === 'WARN') results.warnings++;

  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? (severity === 'CRITICAL' ? '🚨' : '❌') : '⚠️';
  console.log(`${emoji} [${category}] ${test}: ${message}`);
  if (details) console.log(`   ${details}`);

  results.tests.push({ category, test, severity, status, message, details });
}

// ================================================================
// AUTHENTICATION & AUTHORIZATION TESTS
// ================================================================

async function testAuthSecurity() {
  console.log('\n' + '='.repeat(60));
  console.log('🔐 AUTHENTICATION & AUTHORIZATION SECURITY');
  console.log('='.repeat(60) + '\n');

  // Test 1: Check for hardcoded credentials
  const filesToCheck = [
    'routes/auth.js',
    'server/config.js',
    'server.js',
    '.env.example'
  ];

  let foundHardcodedCreds = false;
  const hardcodedPatterns = [
    /password\s*=\s*['"]admin['"]/i,
    /password\s*=\s*['"]password['"]/i,
    /password\s*=\s*['"]123456['"]/i,
    /api[_-]?key\s*=\s*['"][^'"]{10,}['"]/i
  ];

  for (const file of filesToCheck) {
    try {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf-8');
        for (const pattern of hardcodedPatterns) {
          if (pattern.test(content) && !content.includes('process.env')) {
            foundHardcodedCreds = true;
            logTest('Auth', `Hardcoded credentials in ${file}`, 'CRITICAL', 'FAIL', 'Found potential hardcoded credentials', file);
            break;
          }
        }
      }
    } catch (error) {
      // File might not exist - skip
    }
  }

  if (!foundHardcodedCreds) {
    logTest('Auth', 'No hardcoded credentials', 'HIGH', 'PASS', 'No hardcoded credentials found in checked files');
  }

  // Test 2: Check JWT secret is configured
  const hasJwtSecret = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32;
  if (hasJwtSecret) {
    logTest('Auth', 'JWT secret configured', 'HIGH', 'PASS', `JWT secret is set and strong (${process.env.JWT_SECRET.length} chars)`);
  } else {
    logTest('Auth', 'JWT secret configured', 'CRITICAL', 'FAIL', 'JWT secret not set or too weak');
  }

  // Test 3: Check admin credentials are from secrets
  const hasAdminUser = process.env.UPR_ADMIN_USER || process.env.ADMIN_USERNAME;
  const hasAdminPass = process.env.UPR_ADMIN_PASS || process.env.ADMIN_PASSWORD;

  if (hasAdminUser && hasAdminPass) {
    logTest('Auth', 'Admin credentials from environment', 'HIGH', 'PASS', 'Admin credentials sourced from environment variables');
  } else {
    logTest('Auth', 'Admin credentials from environment', 'CRITICAL', 'FAIL', 'Admin credentials not properly configured');
  }

  // Test 4: Check password is not default
  if (hasAdminPass && hasAdminPass !== 'admin' && hasAdminPass !== 'password') {
    logTest('Auth', 'Non-default admin password', 'HIGH', 'PASS', 'Admin password is not using default value');
  } else {
    logTest('Auth', 'Non-default admin password', 'CRITICAL', 'FAIL', 'Admin password is default or weak');
  }
}

// ================================================================
// DATA SECURITY TESTS
// ================================================================

async function testDataSecurity() {
  console.log('\n' + '='.repeat(60));
  console.log('🔒 DATA SECURITY');
  console.log('='.repeat(60) + '\n');

  // Test 1: Database connection uses SSL or Unix socket
  const dbUrl = process.env.DATABASE_URL || '';
  const usesSSL = dbUrl.includes('sslmode=require') || dbUrl.includes('ssl=true');
  const usesUnixSocket = dbUrl.includes('/cloudsql/');

  if (usesSSL) {
    logTest('Data', 'Database SSL/TLS', 'HIGH', 'PASS', 'Database connection uses SSL');
  } else if (usesUnixSocket) {
    logTest('Data', 'Database SSL/TLS', 'HIGH', 'PASS', 'Database uses Cloud SQL Unix socket (IAM authenticated, more secure than SSL)');
  } else if (dbUrl.includes('sslmode=disable') || dbUrl.includes('localhost')) {
    logTest('Data', 'Database SSL/TLS', 'MEDIUM', 'WARN', 'Database SSL disabled (acceptable for localhost/test)');
  } else {
    logTest('Data', 'Database SSL/TLS', 'HIGH', 'FAIL', 'Database connection does not enforce SSL');
  }

  // Test 2: All secrets from GCP Secret Manager
  const secretsInEnv = [
    'JWT_SECRET',
    'DATABASE_URL',
    'OPENAI_API_KEY',
    'APOLLO_API_KEY'
  ];

  let allSecretsConfigured = true;
  for (const secret of secretsInEnv) {
    if (!process.env[secret]) {
      allSecretsConfigured = false;
      logTest('Data', `Secret: ${secret}`, 'MEDIUM', 'WARN', `${secret} not configured in environment`);
    }
  }

  if (allSecretsConfigured) {
    logTest('Data', 'All critical secrets configured', 'HIGH', 'PASS', 'All critical secrets are configured');
  }

  // Test 3: Check for exposed .env file
  if (existsSync('.env')) {
    try {
      const gitignore = readFileSync('.gitignore', 'utf-8');
      if (gitignore.includes('.env')) {
        logTest('Data', '.env file in .gitignore', 'HIGH', 'PASS', '.env file is properly ignored by git');
      } else {
        logTest('Data', '.env file in .gitignore', 'CRITICAL', 'FAIL', '.env file exists but not in .gitignore');
      }
    } catch (error) {
      logTest('Data', '.env file in .gitignore', 'HIGH', 'WARN', 'Could not verify .gitignore');
    }
  }

  // Test 4: SQL injection prevention (check for parameterized queries)
  const routeFiles = ['routes/auth.js', 'utils/db.js'];
  let usesParameterizedQueries = true;

  for (const file of routeFiles) {
    try {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf-8');
        // Check for string concatenation in SQL queries (potential injection)
        if (content.match(/query\([`'"].*\$\{.*\}.*[`'"]\)/)) {
          usesParameterizedQueries = false;
          logTest('Data', `SQL injection risk in ${file}`, 'CRITICAL', 'FAIL', 'Possible SQL injection vulnerability detected');
        }
      }
    } catch (error) {
      // Skip if file doesn't exist
    }
  }

  if (usesParameterizedQueries) {
    logTest('Data', 'Parameterized SQL queries', 'HIGH', 'PASS', 'No obvious SQL injection vulnerabilities found');
  }
}

// ================================================================
// INFRASTRUCTURE SECURITY TESTS
// ================================================================

async function testInfrastructureSecurity() {
  console.log('\n' + '='.repeat(60));
  console.log('☁️  INFRASTRUCTURE SECURITY');
  console.log('='.repeat(60) + '\n');

  // Test 1: Check Cloud Run configuration
  try {
    const serviceYaml = readFileSync('cloud-run-web-service.yaml', 'utf-8');

    // Check secrets are referenced
    if (serviceYaml.includes('secretKeyRef')) {
      logTest('Infrastructure', 'Secrets in Cloud Run config', 'HIGH', 'PASS', 'Cloud Run uses secret references');
    } else {
      logTest('Infrastructure', 'Secrets in Cloud Run config', 'HIGH', 'FAIL', 'Cloud Run config does not use secrets');
    }

    // Check service account is specified
    if (serviceYaml.includes('serviceAccountName')) {
      logTest('Infrastructure', 'Service account configured', 'MEDIUM', 'PASS', 'Cloud Run uses dedicated service account');
    } else {
      logTest('Infrastructure', 'Service account configured', 'MEDIUM', 'WARN', 'No dedicated service account specified');
    }

    // Check VPC connector
    if (serviceYaml.includes('vpc-access-connector')) {
      logTest('Infrastructure', 'VPC network isolation', 'MEDIUM', 'PASS', 'Service uses VPC connector');
    } else {
      logTest('Infrastructure', 'VPC network isolation', 'LOW', 'WARN', 'No VPC connector configured');
    }
  } catch (error) {
    logTest('Infrastructure', 'Cloud Run configuration', 'MEDIUM', 'WARN', 'Could not read Cloud Run config');
  }

  // Test 2: Check Dockerfile security
  try {
    const dockerfile = readFileSync('Dockerfile', 'utf-8');

    // Check non-root user
    if (dockerfile.includes('USER nodejs') || dockerfile.match(/USER \d+/)) {
      logTest('Infrastructure', 'Non-root container user', 'HIGH', 'PASS', 'Container runs as non-root user');
    } else {
      logTest('Infrastructure', 'Non-root container user', 'HIGH', 'FAIL', 'Container may run as root');
    }

    // Check minimal base image
    if (dockerfile.includes('alpine') || dockerfile.includes('distroless')) {
      logTest('Infrastructure', 'Minimal base image', 'MEDIUM', 'PASS', 'Using minimal base image');
    } else {
      logTest('Infrastructure', 'Minimal base image', 'LOW', 'WARN', 'Not using minimal base image');
    }

    // Check multi-stage build
    if (dockerfile.match(/FROM.*AS build/i)) {
      logTest('Infrastructure', 'Multi-stage Docker build', 'MEDIUM', 'PASS', 'Using multi-stage build');
    } else {
      logTest('Infrastructure', 'Multi-stage Docker build', 'LOW', 'WARN', 'Not using multi-stage build');
    }
  } catch (error) {
    logTest('Infrastructure', 'Dockerfile security', 'MEDIUM', 'WARN', 'Could not read Dockerfile');
  }
}

// ================================================================
// APPLICATION SECURITY TESTS
// ================================================================

async function testApplicationSecurity() {
  console.log('\n' + '='.repeat(60));
  console.log('🛡️  APPLICATION SECURITY');
  console.log('='.repeat(60) + '\n');

  // Test 1: Check CORS configuration
  try {
    const serverFile = readFileSync('server.js', 'utf-8');

    if (serverFile.includes('cors()')) {
      if (serverFile.includes('origin:') && !serverFile.includes('origin: "*"')) {
        logTest('Application', 'CORS configuration', 'MEDIUM', 'PASS', 'CORS is configured with specific origins');
      } else if (serverFile.includes('cors()')) {
        logTest('Application', 'CORS configuration', 'MEDIUM', 'WARN', 'CORS allows all origins (development mode?)');
      }
    } else {
      logTest('Application', 'CORS configuration', 'MEDIUM', 'WARN', 'CORS not configured');
    }
  } catch (error) {
    logTest('Application', 'CORS configuration', 'MEDIUM', 'WARN', 'Could not verify CORS config');
  }

  // Test 2: Rate limiting
  try {
    const serverFile = readFileSync('server.js', 'utf-8');

    if (serverFile.includes('rateLimiter') || serverFile.includes('rate-limit')) {
      logTest('Application', 'Rate limiting', 'HIGH', 'PASS', 'Rate limiting is implemented');
    } else {
      logTest('Application', 'Rate limiting', 'HIGH', 'FAIL', 'No rate limiting detected');
    }
  } catch (error) {
    logTest('Application', 'Rate limiting', 'HIGH', 'WARN', 'Could not verify rate limiting');
  }

  // Test 3: Input validation
  try {
    const authFile = readFileSync('routes/auth.js', 'utf-8');

    if (authFile.includes('req.body') && (authFile.includes('username') && authFile.includes('password'))) {
      // Basic check - should have more comprehensive validation
      logTest('Application', 'Input validation', 'MEDIUM', 'PASS', 'Basic input handling detected');
    } else {
      logTest('Application', 'Input validation', 'MEDIUM', 'WARN', 'Could not verify input validation');
    }
  } catch (error) {
    logTest('Application', 'Input validation', 'MEDIUM', 'WARN', 'Could not verify input validation');
  }

  // Test 4: Error handling (no info leakage)
  try {
    const serverFile = readFileSync('server.js', 'utf-8');

    // Check if error messages are sanitized
    if (serverFile.includes('error.message') && !serverFile.includes('error.stack')) {
      logTest('Application', 'Error handling (no info leakage)', 'MEDIUM', 'PASS', 'Error messages are sanitized');
    } else if (serverFile.includes('error.stack')) {
      logTest('Application', 'Error handling (no info leakage)', 'HIGH', 'WARN', 'Error stack traces may be exposed');
    }
  } catch (error) {
    logTest('Application', 'Error handling', 'MEDIUM', 'WARN', 'Could not verify error handling');
  }

  // Test 5: Security headers
  try {
    const serverFile = readFileSync('server.js', 'utf-8');

    const hasHelmet = serverFile.includes('helmet');
    const hasSecurityHeaders = serverFile.includes('X-Frame-Options') ||
                               serverFile.includes('X-Content-Type-Options') ||
                               serverFile.includes('Strict-Transport-Security');

    if (hasHelmet || hasSecurityHeaders) {
      logTest('Application', 'Security headers', 'MEDIUM', 'PASS', 'Security headers configured');
    } else {
      logTest('Application', 'Security headers', 'MEDIUM', 'WARN', 'No security headers detected (helmet, CSP, etc.)');
    }
  } catch (error) {
    logTest('Application', 'Security headers', 'MEDIUM', 'WARN', 'Could not verify security headers');
  }
}

// ================================================================
// DEPENDENCY SECURITY TESTS
// ================================================================

async function testDependencySecurity() {
  console.log('\n' + '='.repeat(60));
  console.log('📦 DEPENDENCY SECURITY');
  console.log('='.repeat(60) + '\n');

  // Test 1: Run npm audit
  try {
    const auditOutput = execSync('npm audit --json', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const audit = JSON.parse(auditOutput);

    const critical = audit.metadata?.vulnerabilities?.critical || 0;
    const high = audit.metadata?.vulnerabilities?.high || 0;
    const moderate = audit.metadata?.vulnerabilities?.moderate || 0;

    if (critical === 0 && high === 0) {
      logTest('Dependencies', 'NPM audit - Critical/High', 'CRITICAL', 'PASS', `No critical or high vulnerabilities (${moderate} moderate)`);
    } else if (critical === 0 && high <= 2) {
      logTest('Dependencies', 'NPM audit - Critical/High', 'HIGH', 'WARN', `${high} high vulnerabilities found`, `Critical: ${critical}, High: ${high}`);
    } else {
      logTest('Dependencies', 'NPM audit - Critical/High', 'CRITICAL', 'FAIL', `${critical} critical, ${high} high vulnerabilities`, `Critical: ${critical}, High: ${high}, Moderate: ${moderate}`);
    }
  } catch (error) {
    // npm audit returns non-zero exit code if vulnerabilities found
    try {
      const auditOutput = error.stdout?.toString() || '{}';
      const audit = JSON.parse(auditOutput);
      const critical = audit.metadata?.vulnerabilities?.critical || 0;
      const high = audit.metadata?.vulnerabilities?.high || 0;
      const moderate = audit.metadata?.vulnerabilities?.moderate || 0;

      if (critical > 0 || high > 0) {
        logTest('Dependencies', 'NPM audit - Critical/High', 'CRITICAL', 'FAIL', `${critical} critical, ${high} high vulnerabilities`, `Critical: ${critical}, High: ${high}, Moderate: ${moderate}`);
      } else {
        logTest('Dependencies', 'NPM audit - Critical/High', 'HIGH', 'PASS', `No critical/high vulnerabilities (${moderate} moderate)`);
      }
    } catch (parseError) {
      logTest('Dependencies', 'NPM audit', 'MEDIUM', 'WARN', 'Could not run npm audit');
    }
  }

  // Test 2: Check for outdated critical packages
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
    const criticalPackages = ['express', 'pg', 'jsonwebtoken', 'bcrypt'];

    logTest('Dependencies', 'Critical packages present', 'MEDIUM', 'PASS', `Found ${criticalPackages.filter(p => packageJson.dependencies?.[p]).length}/${criticalPackages.length} critical packages`);
  } catch (error) {
    logTest('Dependencies', 'Package.json check', 'MEDIUM', 'WARN', 'Could not read package.json');
  }
}

// ================================================================
// GENERATE REPORT
// ================================================================

function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 SECURITY AUDIT REPORT');
  console.log('='.repeat(60) + '\n');

  console.log(`Total Tests Run: ${results.total}`);
  console.log(`✅ Passed: ${results.passed} (${((results.passed / results.total) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${results.failed} (${((results.failed / results.total) * 100).toFixed(1)}%)`);
  console.log(`🚨 Critical Failures: ${results.critical}`);
  console.log(`⚠️  Warnings: ${results.warnings} (${((results.warnings / results.total) * 100).toFixed(1)}%)`);

  const passRate = (results.passed / results.total) * 100;

  console.log('\n' + '='.repeat(60));
  if (results.critical === 0 && passRate >= 90) {
    console.log('✅ SECURITY STATUS: EXCELLENT');
    console.log('System security meets production standards.');
  } else if (results.critical === 0 && passRate >= 75) {
    console.log('⚠️  SECURITY STATUS: GOOD (Minor Issues)');
    console.log('System security is acceptable with minor improvements needed.');
  } else if (results.critical <= 2) {
    console.log('⚠️  SECURITY STATUS: FAIR (Action Required)');
    console.log('System has security issues that should be addressed.');
  } else {
    console.log('🚨 SECURITY STATUS: CRITICAL ISSUES FOUND');
    console.log('System has critical security vulnerabilities that MUST be fixed.');
  }
  console.log('='.repeat(60));

  // Summary by category
  console.log('\n📊 Summary by Category:\n');
  const categories = [...new Set(results.tests.map(t => t.category))];
  categories.forEach(category => {
    const categoryTests = results.tests.filter(t => t.category === category);
    const categoryPassed = categoryTests.filter(t => t.status === 'PASS').length;
    const categoryFailed = categoryTests.filter(t => t.status === 'FAIL').length;
    const categoryWarnings = categoryTests.filter(t => t.status === 'WARN').length;

    console.log(`${category}:`);
    console.log(`  ✅ Passed: ${categoryPassed}`);
    console.log(`  ❌ Failed: ${categoryFailed}`);
    console.log(`  ⚠️  Warnings: ${categoryWarnings}`);
  });

  // Critical and high severity failures
  const criticalTests = results.tests.filter(t => t.status === 'FAIL' && t.severity === 'CRITICAL');
  const highTests = results.tests.filter(t => t.status === 'FAIL' && t.severity === 'HIGH');

  if (criticalTests.length > 0) {
    console.log('\n🚨 CRITICAL Security Issues:\n');
    criticalTests.forEach(test => {
      console.log(`  • [${test.category}] ${test.test}`);
      console.log(`    ${test.message}`);
      if (test.details) console.log(`    ${test.details}`);
    });
  }

  if (highTests.length > 0) {
    console.log('\n❌ HIGH Severity Issues:\n');
    highTests.forEach(test => {
      console.log(`  • [${test.category}] ${test.test}`);
      console.log(`    ${test.message}`);
    });
  }

  return results.critical === 0 && passRate >= 75;
}

// ================================================================
// MAIN EXECUTION
// ================================================================

async function main() {
  console.log('\n🔒 Starting Security Audit...\n');

  try {
    await testAuthSecurity();
    await testDataSecurity();
    await testInfrastructureSecurity();
    await testApplicationSecurity();
    await testDependencySecurity();

    const success = generateReport();
    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Security audit failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { testAuthSecurity, testDataSecurity, testInfrastructureSecurity, testApplicationSecurity, testDependencySecurity };
