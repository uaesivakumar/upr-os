// utils/vectorSearch.js
import { pool } from './db.js';
import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';

let openaiClient = null;

/**
 * Lazily initializes and returns the OpenAI client.
 * Returns null if the API key is not set or is a dummy value.
 * @returns {OpenAI|null}
 */
function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'dummy') {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generates an embedding for a given text.
 * @param {string} text The text to embed.
 * @returns {Promise<number[]|null>} The embedding vector or null if it fails or the client is unavailable.
 */
async function getEmbedding(text) {
    const openai = getClient();
    if (!openai) {
        console.warn("[vectorSearch] OPENAI_API_KEY not set or is a dummy key. Skipping embedding generation.");
        return null;
    }
    if (!text) return null;
    
    try {
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text.trim(),
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error(`Error generating embedding for: "${text}"`, error);
        return null;
    }
}

/**
 * Finds the most similar company in the knowledge base.
 * @param {string} companyName The name of the company to search for.
 * @param {number} matchThreshold The maximum distance to be considered a match (lower is better).
 * @returns {Promise<object|null>} The best matching company record or null.
 */
export async function findSimilarCompany(companyName, matchThreshold = 0.5) {
    const embedding = await getEmbedding(companyName);
    if (!embedding) return null;

    try {
        const { rows } = await pool.query(
            `SELECT id, name, domain, embedding <-> $1 AS distance
             FROM kb_companies
             WHERE embedding <-> $1 < $2
             ORDER BY embedding <-> $1
             LIMIT 1`,
            [`[${embedding.join(',')}]`, matchThreshold]
        );
        return rows[0] || null;
    } catch (err) {
        console.error("Error in findSimilarCompany:", err);
        return null;
    }
}

/**
 * Finds the closest matching job title from the knowledge base to normalize it.
 * @param {string} title The raw job title (e.g., "Senior Human Resources Biz Partner").
 * @param {number} matchThreshold The maximum distance to be considered a match.
 * @returns {Promise<object|null>} The best matching title record (including normalized_title, function, seniority) or null.
 */
export async function normalizeTitle(title, matchThreshold = 0.6) {
    const embedding = await getEmbedding(title);
    if (!embedding) return null;

    try {
        const { rows } = await pool.query(
            `SELECT id, title, normalized_title, "function", seniority, embedding <-> $1 AS distance
             FROM kb_titles
             WHERE embedding <-> $1 < $2
             ORDER BY embedding <-> $1
             LIMIT 1`,
            [`[${embedding.join(',')}]`, matchThreshold]
        );
        return rows[0] || null;
    } catch (err) {
        console.error("Error in normalizeTitle:", err);
        return null;
    }
}