// utils/patternLearner.js

// List of common patterns, ordered by simplicity (simplest first).
// This order is used to break ties if multiple patterns match.
const COMMON_PATTERNS = [
    { id: 'first', template: '{first}' }, // e.g., john@
    { id: 'last', template: '{last}' }, // e.g., doe@
    { id: 'f_last', template: '{f}{last}' }, // e.g., jdoe@
    { id: 'first_l', template: '{first}{l}' }, // e.g., johnd@
    { id: 'first_last', template: '{first}{last}' }, // e.g., johndoe@
    { id: 'first.last', template: '{first}.{last}' }, // e.g., john.doe@
    { id: 'last.first', template: '{last}.{first}' }, // e.g., doe.john@
    { id: 'first-last', template: '{first}-{last}' }, // e.g., john-doe@
    { id: 'last-first', template: '{last}-{first}' }, // e.g., doe-john@
];

/**
 * Splits a full name into its first and last components.
 * Handles single names, multi-part last names, etc.
 * @param {string} fullName - The person's full name.
 * @returns {{first: string, last: string}}
 */
function splitName(fullName) {
    const parts = String(fullName || '').toLowerCase().replace(/[^a-z\s-]/g, '').split(' ').filter(Boolean);
    if (parts.length === 0) return { first: '', last: '' };
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts[parts.length - 1] };
}

/**
 * Applies a pattern template to a name to generate a candidate email local part.
 * @param {string} template - e.g., '{first}.{last}'
 * @param {object} nameParts - { first, last }
 * @returns {string|null} The generated local part, or null if a required name part is missing.
 */
function applyPattern(template, { first, last }) {
    if (!first) return null;
    // If the template requires a last name/initial but it's not available, fail.
    if ((template.includes('{last}') || template.includes('{l}')) && !last) {
        return null;
    }
    return template
        .replace('{first}', first)
        .replace('{last}', last)
        .replace('{f}', first[0] || '')
        .replace('{l}', last[0] || '');
}

/**
 * Given a full name and an email, infers the most likely email pattern.
 * @param {string} fullName - The person's full name, e.g., "Suganya Rajkumar"
 * @param {string} email - The corrected email, e.g., "suganya@motivate.ae"
 * @returns {{pattern: string, confidence: number, domain: string}|null}
 */
export function inferPattern(fullName, email) {
    if (!fullName || !email || !email.includes('@')) {
        return null;
    }

    const emailParts = email.toLowerCase().split('@');
    const localPart = emailParts[0];
    const domain = emailParts[1];

    const nameParts = splitName(fullName);
    if (!nameParts.first) {
        return null;
    }

    const matches = [];
    for (const pattern of COMMON_PATTERNS) {
        const candidate = applyPattern(pattern.template, nameParts);
        if (candidate === localPart) {
            matches.push(pattern);
        }
    }

    if (matches.length === 0) {
        return { pattern: 'no_match', confidence: 0, domain };
    }

    if (matches.length === 1) {
        // Exactly one pattern matched, high confidence.
        return { pattern: matches[0].id, confidence: 0.90, domain };
    }

    // Multiple patterns matched. The COMMON_PATTERNS array is already sorted
    // by simplicity, so the first match in our 'matches' array is the simplest one.
    return { pattern: matches[0].id, confidence: 0.60, domain };
}