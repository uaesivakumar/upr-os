// routes/styleMemory.js
const express = require("express");
const { ok, bad } = require("../utils/respond");
const { adminOnly } = require("../utils/adminOnly");
// --- MODIFIED: Import getStyleContext ---
const { learnFromCorrection, getStyleContext } = require("../services/learningAgent");

const router = express.Router();

// A placeholder UUID for the primary admin user until a full user system is in place.
const DEFAULT_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';

// --- NEW ENDPOINT ---
/**
 * GET /api/style-memory/context
 * Retrieves the learned writing style context for the current user.
 */
router.get("/context", adminOnly, async (req, res) => {
    const userId = req.user?.id || req.user?.sub || DEFAULT_ADMIN_USER_ID;

    try {
        const styleContext = await getStyleContext(userId);

        if (!styleContext) {
            return ok(res, {
                tone_summary: "No style memory has been recorded yet. Edit an AI-generated email to teach the AI your style.",
                example: null,
            });
        }
        
        return ok(res, styleContext);
    } catch (e) {
        console.error(`[API /style-memory/context] Error for user ${userId}:`, e);
        return bad(res, "Failed to retrieve style context.", 500);
    }
});


/**
 * POST /api/style-memory/update
 * Receives an AI draft and a user's correction, then triggers the learning agent.
 * Body: { draft_text: string, corrected_text: string }
 */
router.post("/update", adminOnly, async (req, res) => {
  const { draft_text, corrected_text } = req.body;
  const userId = req.user?.id || req.user?.sub || DEFAULT_ADMIN_USER_ID;

  if (!draft_text || !corrected_text) {
    return bad(res, "Both 'draft_text' and 'corrected_text' are required.", 400);
  }

  try {
    await learnFromCorrection({
      userId,
      draft_text,
      corrected_text,
    });
    return ok(res, { message: "Style memory updated successfully." });
  } catch (e) {
    console.error(`[API /style-memory/update] Error for user ${userId}:`, e);
    return bad(res, "Failed to update style memory.", 500);
  }
});

module.exports = router;