// utils/aiPersona.js
import { pool } from './db.js';

let cachedPrompt = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // Cache the persona for 10 minutes

const FALLBACK_PROMPT = 'You are a helpful assistant.';

/**
 * Fetches the system prompt for the currently active AI persona from the database.
 * The result is cached in memory for 10 minutes to improve performance.
 * @returns {Promise<string>} The active system prompt.
 */
export async function getActivePersonaPrompt() {
    const now = Date.now();
    if (cachedPrompt && (now - cacheTimestamp < CACHE_TTL_MS)) {
        return cachedPrompt;
    }

    try {
        const { rows } = await pool.query(
            "SELECT system_prompt FROM ai_personas WHERE is_active = TRUE LIMIT 1"
        );

        if (rows.length > 0) {
            console.log('[AIPersona] Fetched and cached active AI persona from database.');
            cachedPrompt = rows[0].system_prompt;
            cacheTimestamp = now;
            return cachedPrompt;
        } else {
            console.warn('[AIPersona] No active persona found in the database. Using fallback prompt.');
            return FALLBACK_PROMPT;
        }
    } catch (e) {
        console.error('[AIPersona] Error fetching persona from database:', e);
        // Return the last known good value if available, otherwise the fallback
        return cachedPrompt || FALLBACK_PROMPT;
    }
}