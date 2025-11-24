// routes/enrich/lib/hunter.js

import { verifyEmail } from "./person.js";

// This simulates a professional email finding service like Hunter.io or RocketReach.
// It combines a "known email database" with pattern inference.
const MOCK_FOUND_EMAILS = {
    'bader.alawadhi@adnoc.ae': { name: 'Bader Alawadhi' },
    'yousef.hammadi@adnoc.ae': { name: 'Yousef Hammadi' },
    'mohamed.katheeri@adnoc.ae': { name: 'Mohamed Katheeri' },
};

const MOCK_DOMAIN_PATTERNS = {
    'adnoc.ae': '{first}.{last}@adnoc.ae',
    'microsoft.com': '{first}.{last}@microsoft.com',
    'kbr.com': '{first}.{last}@kbr.com',
    'careem.com': '{first}.{last}@careem.com',
    'emiratesnbd.com': '{f}{last}@emiratesnbd.com',
};

function splitName(name = "") {
    const parts = name.toLowerCase().replace(/[^a-z\s]/g, '').split(' ').filter(Boolean);
    if (parts.length === 0) return { first: '', last: '' };
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts[parts.length - 1] };
}

function applyPattern(person, domain, pattern) {
    const { first, last } = splitName(person.name);
    if (!first || !domain) return null;
    if ((pattern.includes('{last}') || pattern.includes('{l}')) && !last) {
        return null;
    }
    return pattern
        .replace('{first}', first)
        .replace('{last}', last)
        .replace('{f}', first[0])
        .replace('{l}', last ? last[0] : '')
        + `@${domain}`;
}

/**
 * Simulates a call to a professional email finder API.
 * @param {object} person - The person object { name }
 * @param {string} domain - The company domain
 * @returns {Promise<{email: string, status: string}|null>}
 */
export async function findEmailWithHunter(person, domain) {
    console.log(`[hunter] Searching for email for ${person.name} at ${domain}`);
    
    // Step 1: Check our "database" of previously found emails (simulation)
    for (const email in MOCK_FOUND_EMAILS) {
        if (email.endsWith(`@${domain}`)) {
            const foundName = MOCK_FOUND_EMAILS[email].name.toLowerCase();
            const personName = person.name.toLowerCase();
            if (foundName === personName) {
                console.log(`[hunter] Found direct match in DB: ${email}`);
                // We trust our DB, but let's re-verify to ensure it's still active
                const result = await verifyEmail(email);
                if (result.status === 'valid' || result.status === 'accept_all') {
                    return { email, status: result.status };
                }
            }
        }
    }

    // Step 2: If no direct match, use the company's known pattern
    const knownPattern = MOCK_DOMAIN_PATTERNS[domain.toLowerCase()];
    if (knownPattern) {
        const emailGuess = applyPattern(person, domain, knownPattern);
        if (emailGuess) {
            const result = await verifyEmail(emailGuess);
            if (result.status === 'valid' || result.status === 'accept_all') {
                console.log(`[hunter] Success! Found ${result.status} email via pattern: ${emailGuess}`);
                return { email: emailGuess, status: result.status };
            }
        }
    }

    console.log(`[hunter] No definitive email found for ${person.name}.`);
    return null;
}