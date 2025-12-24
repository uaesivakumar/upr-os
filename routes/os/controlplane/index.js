/**
 * OS Control Plane Routes
 *
 * Authoritative runtime configuration endpoints.
 *
 * Routes:
 * - GET  /api/os/resolve-config        - Resolve workspace configuration
 * - GET  /api/os/resolve-persona       - Resolve persona with inheritance (S256)
 * - GET  /api/os/resolve-territory     - Resolve territory with inheritance (S257)
 * - POST /api/os/envelope              - Generate sealed SIVA envelope
 * - GET  /api/os/verify-envelope       - Verify sealed envelope (S258)
 * - POST /api/os/replay                - Deterministic replay with drift detection (S259)
 * - POST /api/os/runtime-gate          - Runtime gate check before SIVA execution (S260)
 * - POST /api/os/authorize-capability  - Pre-SIVA capability authorization guard (S229)
 * - GET  /api/os/routing-decisions     - Routing decision viewer (S232)
 */

import express from 'express';
import resolveConfigRouter from './resolveConfig.js';
import resolvePersonaRouter from './resolvePersona.js';
import resolveTerritoryRouter from './resolveTerritory.js';
import envelopeRouter from './envelope.js';
import verifyEnvelopeRouter from './verifyEnvelope.js';
import replayRouter from './replay.js';
import runtimeGateRouter from './runtimeGate.js';
import authorizeCapabilityRouter from './authorizeCapability.js';
import routingDecisionsRouter from './routingDecisions.js';

const router = express.Router();

// Mount routes
router.use('/resolve-config', resolveConfigRouter);
router.use('/resolve-persona', resolvePersonaRouter);  // S256: Persona Resolution Hard Gate
router.use('/resolve-territory', resolveTerritoryRouter);  // S257: Territory Resolution Hard Gate
router.use('/envelope', envelopeRouter);
router.use('/verify-envelope', verifyEnvelopeRouter);  // S258: Envelope Verification
router.use('/replay', replayRouter);  // S259: Deterministic Replay Hard Gate
router.use('/runtime-gate', runtimeGateRouter);  // S260: Sales-Bench Mandatory Runtime Gate
router.use('/authorize-capability', authorizeCapabilityRouter);  // S229: Capability Authorization
router.use('/routing-decisions', routingDecisionsRouter);  // S232: Model Radar

export default router;
