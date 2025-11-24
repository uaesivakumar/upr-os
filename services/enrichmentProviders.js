// services/enrichmentProviders.js
import { ok, bad } from "../utils/respond.js";

const APOLLO_BASE = "https://api.apollo.io/v1";

/**
 * Calls the Apollo API's person enrichment endpoint.
 * @param {string} email - The email address of the lead.
 * @returns {object|null} The enriched person data from Apollo or null if not found/error.
 */
async function enrichWithApollo(email) {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
        console.warn("[Apollo] APOLLO_API_KEY is not set. Skipping enrichment.");
        return null;
    }

    // FIX: Apollo now requires the API key in the header, not as a query parameter.
    const headers = {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
    };

    const params = new URLSearchParams({ email });

    try {
        const res = await fetch(`${APOLLO_BASE}/people/match?${params.toString()}`, {
            method: 'GET', // Match endpoint is a GET request
            headers: headers,
        });

        if (res.status === 404) {
            console.log(`[Apollo] No person found for email: ${email}`);
            return null;
        }

        if (!res.ok) {
            const errorBody = await res.text();
            console.error(`[Apollo] API error: ${res.status}`, errorBody);
            // Attempt to parse the error for a cleaner log
            try {
                const errJson = JSON.parse(errorBody);
                if (errJson.error) throw new Error(errJson.error);
            } catch {
                throw new Error(`Apollo returned status ${res.status}`);
            }
        }

        const json = await res.json();
        const person = json.person;

        if (!person) return null;

        // Map the Apollo person object to our standard lead format
        return {
            name: person.name,
            designation: person.title,
            linkedin_url: person.linkedin_url,
            location: person.city || person.state,
            company_name: person.organization?.name,
        };

    } catch (err) {
        console.error("[Apollo] Error during enrichment:", err);
        return null;
    }
}


/**
 * Orchestrates the enrichment process by calling providers in a sequence.
 * Currently only implements Apollo as per Phase 1.
 * @param {string} email
 * @param {string} name
 * @returns {object} An object containing the enriched data and sources.
 */
export async function runEnrichmentChain(email, name) {
    const sources = [];
    let enrichedData = {};

    // Step 1: Try Apollo
    const apolloResult = await enrichWithApollo(email);
    if (apolloResult) {
        sources.push("Apollo");
        enrichedData = { ...enrichedData, ...apolloResult };
        return { data: enrichedData, sources };
    }
    
    // If no providers return data, throw an error.
    throw new Error("No enrichment provider could find data for this email.");
}