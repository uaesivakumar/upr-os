/**
 * Enterprise Admin Operations - Main Router
 *
 * S265: Enterprise Admin Operations
 *
 * Core Principles:
 * - Enterprise Admin manages execution, not policy
 * - Enterprise Admin cannot change the system's brain
 * - Coaching > monitoring
 * - Teams are implicit (sub_vertical_id), not configurable
 * - Everything is scoped to ONE enterprise
 *
 * API Structure:
 * - /api/os/enterprise-admin/users/* - User management
 * - /api/os/enterprise-admin/teams/* - Team views (read-only)
 * - /api/os/enterprise-admin/coaching/* - Coaching & performance
 */

import { Router } from 'express';
import usersRouter from './users.js';
import teamsRouter from './teams.js';
import coachingRouter from './coaching.js';

const router = Router();

// Mount sub-routers
router.use('/users', usersRouter);
router.use('/teams', teamsRouter);
router.use('/coaching', coachingRouter);

// Health check
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    message: 'Enterprise Admin Operations is operational.',
    timestamp: new Date().toISOString(),
  });
});

export default router;
