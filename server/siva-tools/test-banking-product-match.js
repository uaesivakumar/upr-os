/**
 * Test script for BankingProductMatchTool
 * Run: node server/siva-tools/test-banking-product-match.js
 */

const BankingProductMatchTool = require('./BankingProductMatchToolStandalone');

async function runTests() {
  const tool = new BankingProductMatchTool();

  console.log('='.repeat(80));
  console.log('BANKING PRODUCT MATCH TOOL - TEST SUITE');
  console.log('='.repeat(80));
  console.log('');

  // Test Case 1: Mid-market FinTech company
  console.log('TEST CASE 1: Mid-market FinTech Company');
  console.log('-'.repeat(80));
  try {
    const result1 = await tool.execute({
      company_size: 150,
      industry: 'FinTech',
      signals: ['expansion', 'hiring'],
      uae_employees: 120,
      average_salary_aed: 18000,
      has_free_zone_license: true
    });

    console.log('✅ Input: 150-person FinTech scaleup, AED 18K salary, expansion+hiring signals');
    console.log(`✅ Confidence: ${result1.confidence} (${result1.metadata.confidenceLevel})`);
    console.log(`✅ Products recommended: ${result1.recommended_products.length}`);
    console.log(`✅ Top product: ${result1.recommended_products[0]?.product_name} (fit: ${result1.recommended_products[0]?.fit_score})`);
    console.log(`✅ Latency: ${result1._meta.latency_ms}ms`);
    console.log('');
    console.log('Top 3 Recommendations:');
    result1.recommended_products.slice(0, 3).forEach(product => {
      console.log(`  ${product.priority}. ${product.product_name} - Fit: ${product.fit_score}/100`);
      console.log(`     Category: ${product.product_category}`);
      console.log(`     Benefits: ${product.key_benefits.slice(0, 2).join(', ')}`);
    });
  } catch (error) {
    console.error('❌ Test Case 1 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 2: Small startup
  console.log('TEST CASE 2: Small Startup');
  console.log('-'.repeat(80));
  try {
    const result2 = await tool.execute({
      company_size: 15,
      industry: 'Technology',
      signals: ['funding'],
      uae_employees: 12,
      average_salary_aed: 8000,
      segment: 'startup'
    });

    console.log('✅ Input: 15-person tech startup, AED 8K salary, funding signal');
    console.log(`✅ Confidence: ${result2.confidence} (${result2.metadata.confidenceLevel})`);
    console.log(`✅ Products recommended: ${result2.recommended_products.length}`);
    console.log(`✅ Top product: ${result2.recommended_products[0]?.product_name} (fit: ${result2.recommended_products[0]?.fit_score})`);
    console.log(`✅ Latency: ${result2._meta.latency_ms}ms`);
    console.log('');
    console.log('Top 3 Recommendations:');
    result2.recommended_products.slice(0, 3).forEach(product => {
      console.log(`  ${product.priority}. ${product.product_name} - Fit: ${product.fit_score}/100`);
    });
  } catch (error) {
    console.error('❌ Test Case 2 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 3: Large enterprise
  console.log('TEST CASE 3: Large Enterprise');
  console.log('-'.repeat(80));
  try {
    const result3 = await tool.execute({
      company_size: 3000,
      industry: 'Healthcare',
      signals: [],
      uae_employees: 800,
      average_salary_aed: 25000,
      segment: 'enterprise'
    });

    console.log('✅ Input: 3000-person healthcare enterprise, AED 25K salary, no signals');
    console.log(`✅ Confidence: ${result3.confidence} (${result3.metadata.confidenceLevel})`);
    console.log(`✅ Products recommended: ${result3.recommended_products.length}`);
    console.log(`✅ Top product: ${result3.recommended_products[0]?.product_name} (fit: ${result3.recommended_products[0]?.fit_score})`);
    console.log(`✅ Latency: ${result3._meta.latency_ms}ms`);
  } catch (error) {
    console.error('❌ Test Case 3 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 4: Edge case - Very low salary
  console.log('TEST CASE 4: Edge Case - Very Low Salary');
  console.log('-'.repeat(80));
  try {
    const result4 = await tool.execute({
      company_size: 50,
      industry: 'Retail',
      signals: [],
      uae_employees: 40,
      average_salary_aed: 3000 // Below most minimums
    });

    console.log('✅ Input: 50-person retail, AED 3K salary (very low)');
    console.log(`✅ Confidence: ${result4.confidence} (${result4.metadata.confidenceLevel})`);
    console.log(`✅ Products recommended: ${result4.recommended_products.length}`);
    if (result4.recommended_products.length > 0) {
      console.log(`✅ Top product: ${result4.recommended_products[0]?.product_name} (fit: ${result4.recommended_products[0]?.fit_score})`);
    } else {
      console.log('⚠️ No products matched (expected - salary too low)');
    }
    console.log(`✅ Latency: ${result4._meta.latency_ms}ms`);
  } catch (error) {
    console.error('❌ Test Case 4 FAILED:', error.message);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('TEST SUITE COMPLETE');
  console.log('='.repeat(80));
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
