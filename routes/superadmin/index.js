/**
 * Super Admin Command Center - Main Router
 *
 * S264: Super Admin Command Center
 *
 * This router aggregates all Super Admin APIs.
 * All routes require SUPER_ADMIN role.
 *
 * API Structure:
 * - /api/os/superadmin/enterprises/health - Enterprise health intelligence
 * - /api/os/superadmin/demos/* - Demo management
 * - /api/os/superadmin/personas/* - Persona authority
 * - /api/os/superadmin/product/friction - Product friction signals
 * - /api/os/superadmin/drill-down/* - Audited drill-down (requires intent)
 */

import { Router } from 'express';
import intelligenceRouter from './intelligence.js';
import personasRouter from './personas.js';
import demosRouter from './demos.js';
import drillDownRouter from './drill-down.js';

const router = Router();

// Mount sub-routers
router.use('/', intelligenceRouter);           // /enterprises/health, /product/friction
router.use('/personas', personasRouter);       // /personas/*
router.use('/demos', demosRouter);             // /demos/*
router.use('/drill-down', drillDownRouter);    // /drill-down/*

// Health check for Super Admin API
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    message: 'Super Admin Command Center is operational.',
    timestamp: new Date().toISOString(),
  });
});

export default router;
