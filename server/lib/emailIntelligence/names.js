// server/lib/emailIntelligence/names.js
// Name Normalization and Email Generation Utilities
// Handles name parsing, transliteration, and pattern application

/**
 * Name Processing for Email Generation
 *
 * Goal: Convert names to email-friendly formats
 * Features:
 * - Normalize Unicode characters (é → e, ñ → n)
 * - Handle multi-word names (Mary Jane → maryjane)
 * - Remove special characters
 * - Support pattern templates: {first}, {last}, {f}, {l}
 *
 * Week 1: Basic implementation
 */

/**
 * Normalize name for email use
 * @param {string} name - Name to normalize
 * @returns {string} Normalized name (lowercase, no special chars)
 */
export function normalizeName(name) {
  if (!name) return '';

  return name
    .toLowerCase()
    .normalize('NFD') // Decompose Unicode characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '') // Remove spaces
    .trim();
}

/**
 * Parse full name into first and last name
 * @param {string} fullName - Full name string
 * @returns {Object} {first, last}
 */
export function parseName(fullName) {
  if (!fullName) return { first: '', last: '' };

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return { first: parts[0], last: '' };
  }

  // First word = first name, last word = last name
  const first = parts[0];
  const last = parts[parts.length - 1];

  return {
    first: normalizeName(first),
    last: normalizeName(last)
  };
}

/**
 * Apply pattern template to name
 * @param {string} pattern - Pattern template (e.g., '{first}.{last}')
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @returns {string} Generated email prefix
 */
export function applyPattern(pattern, firstName, lastName) {
  if (!pattern || !firstName) return '';

  const normalized = {
    first: normalizeName(firstName),
    last: normalizeName(lastName),
    f: normalizeName(firstName).charAt(0),
    l: normalizeName(lastName).charAt(0)
  };

  return pattern
    .replace('{first}', normalized.first)
    .replace('{last}', normalized.last)
    .replace('{f}', normalized.f)
    .replace('{l}', normalized.l);
}

/**
 * Generate email from pattern and domain
 * @param {string} pattern - Pattern template
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @param {string} domain - Email domain
 * @returns {string} Full email address
 */
export function generateEmail(pattern, firstName, lastName, domain) {
  const prefix = applyPattern(pattern, firstName, lastName);
  if (!prefix || !domain) return null;

  return `${prefix}@${domain}`;
}

/**
 * Generate multiple emails from pattern list
 * @param {Array<string>} patterns - List of patterns
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @param {string} domain - Email domain
 * @returns {Array<string>} List of generated emails
 */
export function generateEmailsFromPatterns(patterns, firstName, lastName, domain) {
  return patterns
    .map(pattern => generateEmail(pattern, firstName, lastName, domain))
    .filter(email => email !== null);
}

/**
 * Infer pattern from example email
 * @param {string} email - Example email address
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @returns {string|null} Inferred pattern or null
 */
export function inferPattern(email, firstName, lastName) {
  if (!email || !firstName) return null;

  const [prefix] = email.split('@');
  if (!prefix) return null;

  const normalized = {
    first: normalizeName(firstName),
    last: normalizeName(lastName),
    f: normalizeName(firstName).charAt(0),
    l: normalizeName(lastName).charAt(0)
  };

  // Test common patterns
  const patterns = [
    { template: '{first}.{last}', regex: new RegExp(`^${normalized.first}\\.${normalized.last}$`) },
    { template: '{first}{l}', regex: new RegExp(`^${normalized.first}${normalized.l}$`) },
    { template: '{f}{last}', regex: new RegExp(`^${normalized.f}${normalized.last}$`) },
    { template: '{first}_{last}', regex: new RegExp(`^${normalized.first}_${normalized.last}$`) },
    { template: '{first}{last}', regex: new RegExp(`^${normalized.first}${normalized.last}$`) },
    { template: '{last}.{first}', regex: new RegExp(`^${normalized.last}\\.${normalized.first}$`) },
    { template: '{first}', regex: new RegExp(`^${normalized.first}$`) }
  ];

  for (const { template, regex } of patterns) {
    if (regex.test(prefix)) {
      return template;
    }
  }

  console.log('[names] Could not infer pattern for:', email, 'with name:', firstName, lastName);
  return null;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid format
 */
export function isValidEmailFormat(email) {
  if (!email) return false;

  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Get all supported patterns
 * @returns {Array<string>} List of pattern templates
 */
export function getSupportedPatterns() {
  return [
    '{first}.{last}',
    '{first}{l}',
    '{f}{last}',
    '{first}_{last}',
    '{first}{last}',
    '{last}.{first}',
    '{f}.{last}'
  ];
}

/**
 * Pick diverse names from lead list
 * @param {Array<Object>} leads - List of leads with names
 * @param {number} count - Number of names to pick
 * @returns {Array<Object>} Diverse subset of leads
 */
export function pickDiverse(leads, count) {
  if (!leads || leads.length === 0) return [];
  if (leads.length <= count) return leads;

  // Simple strategy: pick evenly distributed leads
  const step = Math.floor(leads.length / count);
  const picked = [];

  for (let i = 0; i < count; i++) {
    const index = Math.min(i * step, leads.length - 1);
    picked.push(leads[index]);
  }

  return picked;
}

export default {
  normalizeName,
  parseName,
  applyPattern,
  generateEmail,
  generateEmailsFromPatterns,
  inferPattern,
  isValidEmailFormat,
  getSupportedPatterns,
  pickDiverse
};
