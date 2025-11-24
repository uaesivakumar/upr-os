/**
 * Direct test of CompanyQualityTool to debug validation
 */

const CompanyQualityTool = require('../../server/siva-tools/CompanyQualityToolStandalone.js');

const tool = new CompanyQualityTool();

const testInput = {
  company_name: 'Emirates NBD',
  domain: 'emiratesnbd.com',
  industry: 'Banking',
  uae_signals: {
    has_ae_domain: false,
    has_uae_address: true,
    linkedin_location: 'Unknown'
  },
  size_bucket: 'enterprise',
  size: 5000,
  salary_indicators: {
    salary_level: 'high',
    avg_salary: 15000
  },
  license_type: 'Mainland'
};

console.log('Testing CompanyQualityTool with input:');
console.log(JSON.stringify(testInput, null, 2));
console.log('\n---\n');

tool.execute(testInput)
  .then(result => {
    console.log('✅ SUCCESS! Tool executed:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('❌ ERROR:');
    console.error(error.message);
    if (error.errors) {
      console.error('\nValidation errors:');
      console.error(JSON.stringify(error.errors, null, 2));
    }
  });
