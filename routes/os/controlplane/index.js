/**
 * OS Control Plane Routes
 *
 * Authoritative runtime configuration endpoints.
 *
 * Routes:
 * - GET  /api/os/resolve-config      - Resolve workspace configuration
 * - POST /api/os/envelope            - Generate sealed SIVA envelope
 * - POST /api/os/authorize-capability - Pre-SIVA capability authorization guard (S229)
 */

import express from 'express';
import resolveConfigRouter from './resolveConfig.js';
import envelopeRouter from './envelope.js';
import authorizeCapabilityRouter from './authorizeCapability.js';

const router = express.Router();

// Mount routes
router.use('/resolve-config', resolveConfigRouter);
router.use('/envelope', envelopeRouter);
router.use('/authorize-capability', authorizeCapabilityRouter);  // S229: Capability Authorization

export default router;
