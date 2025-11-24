// routes/outreach/index.js
import express from "express";
import researchRouter from "./research.js";
import composeRouter from "./compose.js";
import sendRouter from "./send.js";
import broadcastRouter from "./broadcast.js";
// --- NEW: Importing the manual workflow router ---
import manualRouter from "./manual.js";

const router = express.Router();

// Single-lead agentic workflow routes
router.use(researchRouter);
router.use(composeRouter);
router.use(sendRouter);

// Broadcast workflow routes
router.use(broadcastRouter);

// --- NEW: Manual workflow routes ---
router.use(manualRouter);

export default router;