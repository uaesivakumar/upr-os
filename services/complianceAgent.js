// services/complianceAgent.js

// --- Guardrail Configuration ---

const MAX_WORD_COUNT = 180;
const MAX_LINK_COUNT = 1;

// A list of common spam trigger phrases (in lowercase).
const SPAM_TRIGGER_PHRASES = new Set([
    'act now', 'limited time', 'special promotion', 'free gift', 'guaranteed',
    '100% free', 'click here', 'buy now', 'order now', 'not spam',
    'this is not spam', 'extra income', 'make money', 'cash bonus'
]);


/**
 * Runs final compliance checks on an email before sending. 
 * @param {object} composedEmail - The final composed email object with { finalSubject, finalBody }. 
 * @param {object} lead - The recipient lead object. 
 * @returns {Promise<{isCompliant: boolean, reason?: string}>} 
 */
export async function runComplianceChecks(composedEmail, lead) {
  console.log(`[ComplianceAgent] Running checks for email to: ${lead.email}`);
  const { finalBody } = composedEmail;

  if (!finalBody) {
    return { isCompliant: false, reason: 'Email body is empty.' };
  }

  // 1. Word Count Check
  const wordCount = finalBody.split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_WORD_COUNT) {
    const reason = `Exceeds max word count of ${MAX_WORD_COUNT} (found ${wordCount})`;
    console.warn(`[ComplianceAgent] FAILED: ${reason}`);
    return { isCompliant: false, reason };
  }

  // 2. Link Count Check
  const linkCount = (finalBody.match(/https?:\/\//g) || []).length;
  if (linkCount > MAX_LINK_COUNT) {
    const reason = `Exceeds max link count of ${MAX_LINK_COUNT} (found ${linkCount})`;
    console.warn(`[ComplianceAgent] FAILED: ${reason}`);
    return { isCompliant: false, reason };
  }

  // 3. Spam Phrase Linter 
  const lowerBody = finalBody.toLowerCase();
  for (const phrase of SPAM_TRIGGER_PHRASES) {
    if (lowerBody.includes(phrase)) {
      const reason = `Contains potential spam phrase: "${phrase}"`;
      console.warn(`[ComplianceAgent] FAILED: ${reason}`);
      return { isCompliant: false, reason };
    }
  }

  console.log(`[ComplianceAgent] Checks passed for: ${lead.email}`);
  return { isCompliant: true };
}