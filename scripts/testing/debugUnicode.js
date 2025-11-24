const { SafetyGuardrails } = require('../../server/services/safetyGuardrails');

const safetyGuardrails = new SafetyGuardrails();

const unicodeContent = `Dear أحمد,

مرحبا! I noticed your company's growth in Dubai.

Best regards,
Sivakumar
Emirates NBD`;

console.log('Testing Unicode content:\n');
console.log(unicodeContent);
console.log('\n---\n');

const result = safetyGuardrails.runSafetyChecks(unicodeContent);

console.log('Result:', JSON.stringify(result, null, 2));
console.log('\nPassed:', result.passed);
console.log('Safety Score:', result.overall_safety_score);
