// routes/outreach/research.js
import express from "express";
import { ok, bad } from "../../utils/respond.js";
import { conductResearch } from "../../services/researchAgent.js";
import { verifyFacts } from "../../services/factChecker.js";

const router = express.Router();

/**
 * POST /api/outreach/research
 * Kicks off the research and fact-checking process for a company.
 * Body: { companyId: "..." }
 */
router.post("/research", async (req, res) => {
  const { companyId } = req.body;

  if (!companyId) {
    return bad(res, "companyId is required.", 400);
  }

  try {
    // Phase 1: Orchestrate the research and fact-checking agents.
    const rawFacts = await conductResearch(companyId);
    const verifiedFacts = await verifyFacts(rawFacts);

    return ok(res, verifiedFacts);
  } catch (error) {
    console.error("[API /outreach/research] Error:", error);
    return bad(res, "An error occurred during the research process.", 500);
  }
});

export default router;