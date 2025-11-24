// services/learningAgent.js
import { pool } from '../utils/db.js';
import { getOpenAICompletion, getEmbedding } from '../utils/llm.js';

/**
 * Uses an LLM to summarize the stylistic difference between two texts.
 */
async function summarizeStyleDifference(draft, corrected) {
  const systemPrompt = `You are a writing coach. You will be shown two versions of a short text, "Before" (AI-generated) and "After" (human-corrected). Your job is to analyze the changes and provide a concise, one-sentence summary of the stylistic preference the user has demonstrated. Focus on tone, phrasing, and structure. For example: "Prefers a more direct and assertive tone," or "Favors shorter sentences and simpler vocabulary." Output a single minified JSON object with one key: "summary".`;
  const userPrompt = `Before:\n"""${draft}"""\n\nAfter:\n"""${corrected}"""\n\nSummarize the stylistic changes in a single sentence.`;
  const completion = await getOpenAICompletion(systemPrompt, userPrompt, 0.5);
  const result = JSON.parse(completion || '{}');
  return result.summary || "No specific style change detected.";
}

/**
 * Uses an LLM to analyze a batch of successful emails and generate an insight.
 */
export async function generatePerformanceInsight(successfulEmails) {
    if (!successfulEmails || successfulEmails.length < 3) {
        throw new Error("Not enough email examples to generate a meaningful insight.");
    }
    const systemPrompt = `You are an expert sales communication analyst. You will be given a set of successful emails that received replies. Your task is to identify a common, non-obvious pattern or principle that contributes to their success. Avoid generic advice. Focus on a specific, actionable insight. For example, "Starting emails with a direct question about a recent company achievement leads to higher engagement." Output a single minified JSON object with one key: "insight_summary".`;
    const emailExamples = successfulEmails.map((email, index) => 
        `--- Email ${index + 1} ---\n"""\n${email.body_html}\n"""`
    ).join('\n\n');
    const userPrompt = `Here are ${successfulEmails.length} successful emails that received replies. Analyze them and generate a single, actionable insight about what makes them effective:\n\n${emailExamples}`;
    const completion = await getOpenAICompletion(systemPrompt, userPrompt, 0.6);
    const result = JSON.parse(completion || '{}');
    if (!result.insight_summary) {
        throw new Error("AI failed to generate a valid insight from the provided emails.");
    }
    return result.insight_summary;
}

/**
 * Averages a new embedding into an existing one.
 */
function averageEmbeddings(existingEmbedding, newEmbedding, existingCount) {
    if (!existingEmbedding || existingCount === 0) return newEmbedding;
    const newTotal = existingCount + 1;
    return existingEmbedding.map((value, i) => (value * existingCount + newEmbedding[i]) / newTotal);
}

/**
 * The main service function to process a user's correction and update their style memory.
 */
export async function learnFromCorrection({ userId, draft_text, corrected_text }) {
  console.log(`[LearningAgent] Starting to learn from correction for user ${userId}`);
  
  // In parallel, get the AI's summary of the style change and the vector embedding of the user's preferred text.
  const [summary, newEmbedding] = await Promise.all([
      summarizeStyleDifference(draft_text, corrected_text),
      getEmbedding(corrected_text)
  ]);

  if (!summary || !newEmbedding) {
    throw new Error("Failed to get summary or embedding from AI.");
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT * FROM user_style_memory WHERE user_id = $1', [userId]);

    const newExample = { draft: draft_text, corrected: corrected_text, summary: summary, created_at: new Date().toISOString() };

    if (existing.length > 0) {
        const memory = existing[0];
        const newCount = (memory.example_count || 0) + 1;
        const updatedEmbedding = averageEmbeddings(memory.style_embedding_v1, newEmbedding, memory.example_count);
        
        // Keep the last 5 examples for context
        const updatedExamples = [ ...(memory.examples || []), newExample ].slice(-5); 
        const updatedToneSummary = summary; // For now, the latest summary is the most relevant.

        await client.query(
            `UPDATE user_style_memory SET 
             tone_summary = $1, 
             style_embedding_v1 = $2, 
             example_count = $3, 
             examples = $4, 
             updated_at = NOW() 
             WHERE user_id = $5`,
            [updatedToneSummary, JSON.stringify(updatedEmbedding), newCount, JSON.stringify(updatedExamples), userId]
        );
    } else {
        await client.query(
            `INSERT INTO user_style_memory (user_id, tone_summary, style_embedding_v1, example_count, examples)
             VALUES ($1, $2, $3, 1, $4)`,
            [userId, summary, JSON.stringify(newEmbedding), JSON.stringify([newExample])]
        );
    }
    await client.query('COMMIT');
    console.log(`[LearningAgent] Successfully updated style memory for user ${userId}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`[LearningAgent] Failed to update style memory for user ${userId}:`, e);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Fetches the learned style context for a given user.
 */
export async function getStyleContext(userId) {
    if (!userId) return null;
    try {
        const { rows } = await pool.query('SELECT tone_summary, examples FROM user_style_memory WHERE user_id = $1', [userId]);
        if (rows.length === 0) return null;
        const record = rows[0];
        const lastExample = record.examples?.[record.examples.length - 1];
        return {
            tone_summary: record.tone_summary,
            example: lastExample,
        };
    } catch (e) {
        console.error(`[LearningAgent] Could not retrieve style context for user ${userId}:`, e);
        return null;
    }
}

/**
 * Fetches the latest active insight from the ai_learning_insights table.
 */
export async function getPerformanceInsight() {
    try {
        const { rows } = await pool.query(
            `SELECT insight_summary FROM ai_learning_insights 
             WHERE is_active = TRUE 
             ORDER BY created_at DESC 
             LIMIT 1`
        );
        return rows[0]?.insight_summary || null;
    } catch (e) {
        console.error('[LearningAgent] Could not retrieve performance insight:', e);
        return null; // Return null on error to not break the chain
    }
}