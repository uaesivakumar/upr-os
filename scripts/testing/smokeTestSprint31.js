#!/usr/bin/env node
/**
 * Sprint 31 Smoke Test - Voice Templates & Outreach Generator
 * Tasks 9-10: Smoke Test + Testing Framework
 *
 * Validates all Sprint 31 features are working
 */

const { OutreachGeneratorService } = require('../../server/services/outreachGeneratorService');
const { VoiceTemplateService } = require('../../server/services/voiceTemplateService');
const { Pool } = require('pg');

// Test configuration
const TEST_COMPANY = {
  company_name: 'TechCorp UAE',
  domain: 'techcorp.ae',
  industry: 'Technology',
  size_bucket: 'midsize',
  quality_score: 85
};

const TEST_CONTACT = {
  first_name: 'Ahmed',
  last_name: 'Al-Mansoori',
  title: 'Chief Financial Officer',
  tier: 'STRATEGIC'
};

const TEST_CONTEXT = {
  recommended_products: ['Business Current Account', 'Trade Finance'],
  pain_points: ['cash flow management', 'international payments'],
  timing_score: 78
};

// Test results
let passed = 0;
let failed = 0;
const results = [];

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logTest(name, success, details = '') {
  const status = success ? '✅ PASS' : '❌ FAIL';
  const message = `${status}: ${name}${details ? ' - ' + details : ''}`;
  log(message);
  results.push({ name, success, details });

  if (success) {
    passed++;
  } else {
    failed++;
  }
}

function hasPlaceholders(text) {
  // Check for unsubstituted variables like {variable_name}
  const placeholderRegex = /\{[a-zA-Z_]+\}/g;
  const matches = text.match(placeholderRegex);
  return matches ? matches : [];
}

async function runSmokeTests() {
  log('='.repeat(70));
  log('SPRINT 31 SMOKE TEST - Voice Templates & Outreach Generator');
  log('='.repeat(70));
  log('');

  // Initialize service
  const pool = new Pool({
    host: '34.121.0.240',
    port: 5432,
    database: 'upr_production',
    user: 'upr_app',
    password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
    ssl: false
  });

  const outreachService = new OutreachGeneratorService(pool);
  const templateService = new VoiceTemplateService(pool);

  try {
    // =================================================================
    // TEST 1: Variable Substitution
    // =================================================================
    log('Test 1: Variable Substitution System');
    try {
      const template = 'Hello {first_name} from {company_name}!';
      const variables = { first_name: 'Ahmed', company_name: 'TechCorp' };
      const result = outreachService.substituteVariables(template, variables);

      logTest(
        'Variable Substitution',
        result === 'Hello Ahmed from TechCorp!',
        result
      );
    } catch (error) {
      logTest('Variable Substitution', false, error.message);
    }

    // =================================================================
    // TEST 2: Optional Variables
    // =================================================================
    log('Test 2: Optional Variable Handling');
    try {
      const template = 'Hello {first_name} {?middle_name} {last_name}';
      const variables = { first_name: 'Ahmed', last_name: 'Al-Mansoori' };
      const result = outreachService.substituteVariables(template, variables);

      logTest(
        'Optional Variables',
        result === 'Hello Ahmed  Al-Mansoori',
        result
      );
    } catch (error) {
      logTest('Optional Variables', false, error.message);
    }

    // =================================================================
    // TEST 3: Default Values
    // =================================================================
    log('Test 3: Variable Default Values');
    try {
      const template = 'Meeting at {time|10:00 AM}';
      const variables = {};
      const result = outreachService.substituteVariables(template, variables);

      logTest(
        'Default Values',
        result === 'Meeting at 10:00 AM',
        result
      );
    } catch (error) {
      logTest('Default Values', false, error.message);
    }

    // =================================================================
    // TEST 4: Tone Detection
    // =================================================================
    log('Test 4: Auto Tone Detection');
    try {
      const formalTone = outreachService.detectTone({
        quality_score: 85,
        company_size: 'enterprise',
        contact_tier: 'STRATEGIC'
      });

      const casualTone = outreachService.detectTone({
        quality_score: 50,
        company_size: 'startup',
        license_type: 'Free Zone'
      });

      logTest(
        'Tone Detection',
        formalTone === 'formal' && casualTone === 'casual',
        `Formal: ${formalTone}, Casual: ${casualTone}`
      );
    } catch (error) {
      logTest('Tone Detection', false, error.message);
    }

    // =================================================================
    // TEST 5: Tone Adjustment
    // =================================================================
    log('Test 5: Tone Adjustment Logic');
    try {
      const casual = "I'm excited to connect!";
      const formal = outreachService.adjustTone(casual, 'formal');

      logTest(
        'Tone Adjustment',
        formal.includes('I am'),
        `${casual} → ${formal}`
      );
    } catch (error) {
      logTest('Tone Adjustment', false, error.message);
    }

    // =================================================================
    // TEST 6: Context Enrichment
    // =================================================================
    log('Test 6: Context-Aware Enrichment');
    try {
      const enriched = outreachService.enrichContext({
        industry: 'Technology',
        company_size: 'midsize',
        quality_score: 75
      });

      logTest(
        'Context Enrichment',
        enriched.tone && enriched.pain_point && enriched.benefit,
        `Tone: ${enriched.tone}, Pain: ${enriched.pain_point?.substring(0, 30)}...`
      );
    } catch (error) {
      logTest('Context Enrichment', false, error.message);
    }

    // =================================================================
    // TEST 7: Email Formatting
    // =================================================================
    log('Test 7: Email Message Formatting');
    try {
      const formatted = outreachService.formatEmail(
        'Test Subject',
        'Test Body',
        { sender_name: 'ENBD Team' }
      );

      logTest(
        'Email Formatting',
        formatted.format === 'email' && formatted.subject && formatted.body,
        `Format: ${formatted.format}`
      );
    } catch (error) {
      logTest('Email Formatting', false, error.message);
    }

    // =================================================================
    // TEST 8: LinkedIn Formatting (300 char limit)
    // =================================================================
    log('Test 8: LinkedIn Message Formatting');
    try {
      const longMessage = 'A'.repeat(350);
      const formatted = outreachService.formatLinkedIn(longMessage);

      logTest(
        'LinkedIn Formatting',
        formatted.char_count <= 300 && formatted.body.endsWith('...'),
        `Length: ${formatted.char_count}/300`
      );
    } catch (error) {
      logTest('LinkedIn Formatting', false, error.message);
    }

    // =================================================================
    // TEST 9: Follow-up Formatting
    // =================================================================
    log('Test 9: Follow-up Message Formatting');
    try {
      const formatted = outreachService.formatFollowUp(
        'Follow-up test',
        { previous_message_id: 'msg-123', days_since_last: 7 },
        2
      );

      logTest(
        'Follow-up Formatting',
        formatted.format === 'followup_2' && formatted.metadata.follow_up_number === 2,
        `Format: ${formatted.format}, Number: ${formatted.metadata.follow_up_number}`
      );
    } catch (error) {
      logTest('Follow-up Formatting', false, error.message);
    }

    // =================================================================
    // TEST 10: Quality Score Calculation
    // =================================================================
    log('Test 10: Quality Score Calculation');
    try {
      const score = outreachService.calculateQualityScore({
        variable_coverage: 100,
        context_relevance: 80,
        tone_consistency: 90,
        personalization_level: 85
      });

      logTest(
        'Quality Score',
        score >= 0 && score <= 100,
        `Score: ${score}/100`
      );
    } catch (error) {
      logTest('Quality Score', false, error.message);
    }

    // =================================================================
    // TEST 11: Full Email Generation
    // =================================================================
    log('Test 11: Complete Email Generation');
    try {
      const result = await outreachService.generateOutreach({
        message_type: 'email',
        company: TEST_COMPANY,
        contact: TEST_CONTACT,
        context: TEST_CONTEXT
      });

      const subjectPlaceholders = hasPlaceholders(result.message.subject || '');
      const bodyPlaceholders = hasPlaceholders(result.message.body || '');
      const hasNoPlaceholders = subjectPlaceholders.length === 0 && bodyPlaceholders.length === 0;

      logTest(
        'Email Generation',
        result.success && result.message && result.message.body && hasNoPlaceholders,
        hasNoPlaceholders
          ? `Quality: ${result.message.quality_score}/100`
          : `Placeholders found: ${[...subjectPlaceholders, ...bodyPlaceholders].join(', ')}`
      );

      if (result.success) {
        log(`  Subject: ${result.message.subject}`);
        log(`  Body length: ${result.message.body.length} chars`);
        log(`  Tone: ${result.message.tone}`);
        if (!hasNoPlaceholders) {
          log(`  ⚠️  Unsubstituted variables: ${[...subjectPlaceholders, ...bodyPlaceholders].join(', ')}`);
        }
      }
    } catch (error) {
      console.error('Email Generation Error:', error);
      logTest('Email Generation', false, error.message || error.toString());
    }

    // =================================================================
    // TEST 12: LinkedIn Generation
    // =================================================================
    log('Test 12: LinkedIn Message Generation');
    try {
      const result = await outreachService.generateOutreach({
        message_type: 'linkedin',
        company: TEST_COMPANY,
        contact: TEST_CONTACT,
        context: TEST_CONTEXT
      });

      const bodyPlaceholders = hasPlaceholders(result.message.body || '');
      const hasNoPlaceholders = bodyPlaceholders.length === 0;

      logTest(
        'LinkedIn Generation',
        result.success && result.message.body.length <= 300 && hasNoPlaceholders,
        hasNoPlaceholders
          ? `Length: ${result.message.body.length}/300`
          : `Placeholders found: ${bodyPlaceholders.join(', ')}`
      );
    } catch (error) {
      console.error('LinkedIn Generation Error:', error);
      logTest('LinkedIn Generation', false, error.message || error.toString());
    }

    // =================================================================
    // TEST 13: Follow-up Generation
    // =================================================================
    log('Test 13: Follow-up Message Generation');
    try {
      const result = await outreachService.generateOutreach({
        message_type: 'followup_1',
        company: TEST_COMPANY,
        contact: TEST_CONTACT,
        context: { ...TEST_CONTEXT, new_insight: 'Q1 2025 market trends' }
      });

      const bodyPlaceholders = hasPlaceholders(result.message.body || '');
      const hasNoPlaceholders = bodyPlaceholders.length === 0;

      logTest(
        'Follow-up Generation',
        result.success && result.message.format === 'followup_1' && hasNoPlaceholders,
        hasNoPlaceholders
          ? `Format: ${result.message.format}`
          : `Placeholders found: ${bodyPlaceholders.join(', ')}`
      );
    } catch (error) {
      console.error('Follow-up Generation Error:', error);
      logTest('Follow-up Generation', false, error.message || error.toString());
    }

    // =================================================================
    // TEST 14: Tone Variants
    // =================================================================
    log('Test 14: Multiple Tone Variants');
    try {
      const formal = await outreachService.generateOutreach({
        message_type: 'email',
        company: { ...TEST_COMPANY, quality_score: 95 },
        contact: { ...TEST_CONTACT, tier: 'STRATEGIC' },
        context: TEST_CONTEXT,
        tone: 'formal'
      });

      const casual = await outreachService.generateOutreach({
        message_type: 'email',
        company: { ...TEST_COMPANY, size_bucket: 'startup' },
        contact: TEST_CONTACT,
        context: TEST_CONTEXT,
        tone: 'casual'
      });

      logTest(
        'Tone Variants',
        formal.message.tone === 'formal' && casual.message.tone === 'casual',
        `Formal: ${formal.message.tone}, Casual: ${casual.message.tone}`
      );
    } catch (error) {
      console.error('Tone Variants Error:', error);
      logTest('Tone Variants', false, error.message || error.toString());
    }

    // =================================================================
    // TEST 15: Database Integration
    // =================================================================
    log('Test 15: Database Message Persistence');
    try {
      const result = await outreachService.generateOutreach({
        message_type: 'email',
        company: TEST_COMPANY,
        contact: TEST_CONTACT,
        context: TEST_CONTEXT
      });

      const saved = await templateService.getGeneratedMessage(result.message.message_id);

      logTest(
        'Database Persistence',
        saved && saved.message_id === result.message.message_id,
        `Message ID: ${result.message.message_id}`
      );
    } catch (error) {
      console.error('Database Persistence Error:', error);
      logTest('Database Persistence', false, error.message || error.toString());
    }

  } catch (error) {
    log(`FATAL ERROR: ${error.message}`);
    log(error.stack);
  } finally {
    try {
      await outreachService.close();
    } catch (err) {
      // Already closed
    }
  }

  // Print summary
  log('');
  log('='.repeat(70));
  log('SMOKE TEST SUMMARY');
  log('='.repeat(70));
  log(`Total Tests: ${passed + failed}`);
  log(`Passed: ${passed} ✅`);
  log(`Failed: ${failed} ❌`);
  log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  log('');

  if (failed > 0) {
    log('Failed Tests:');
    results.filter(r => !r.success).forEach(r => {
      log(`  ❌ ${r.name}: ${r.details}`);
    });
    log('');
  }

  if (passed === passed + failed) {
    log('✅ ALL TESTS PASSED - Sprint 31 Voice Templates Ready!');
    process.exit(0);
  } else {
    log('❌ SOME TESTS FAILED - Review errors above');
    process.exit(1);
  }
}

// Run smoke tests
runSmokeTests().catch(error => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});
