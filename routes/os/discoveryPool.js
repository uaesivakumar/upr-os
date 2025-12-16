/**
 * Discovery Pool API Routes - S121.5
 *
 * REST API for SIVA and SaaS to consume discovery pool.
 * OS exposes read-only endpoints for SIVA reasoning.
 *
 * ARCHITECTURE:
 * - OS-OWNED: All CRUD, crawling, assignment
 * - SIVA: Read-only access via these endpoints
 * - SaaS: User-facing endpoints for viewing assigned leads
 */

import express from 'express';
import { DiscoveryPoolService } from '../../services/discovery/DiscoveryPoolService.js';
import { DiscoveryCrawlerService } from '../../services/discovery/DiscoveryCrawlerService.js';
import { LeadAssignmentService } from '../../services/discovery/LeadAssignmentService.js';
import { TerritoryMappingService } from '../../services/discovery/TerritoryMappingService.js';

const router = express.Router();
const poolService = new DiscoveryPoolService();
const crawlerService = new DiscoveryCrawlerService();
const assignmentService = new LeadAssignmentService();
const territoryService = new TerritoryMappingService();

/**
 * GET /api/os/discovery-pool
 * Query discovery pool with filters (for SIVA)
 */
router.get('/', async (req, res) => {
  try {
    const {
      tenant_id,
      user_id,
      vertical_id,
      sub_vertical_id,
      region_code,
      min_score,
      freshness_days,
      edge_case_type,
      exclude_assigned,
      limit,
      offset
    } = req.query;

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'tenant_id is required'
      });
    }

    // Get user's territory values if filtering by territory
    let territories = [];
    if (user_id) {
      territories = await territoryService.getTerritoryValues(tenant_id, user_id);
    }

    const results = await poolService.queryPool({
      tenantId: tenant_id,
      verticalId: vertical_id,
      subVerticalId: sub_vertical_id,
      territories: territories.length > 0 ? territories : null,
      minScore: min_score ? parseInt(min_score) : null,
      freshnessDays: freshness_days ? parseInt(freshness_days) : null,
      edgeCaseType: edge_case_type,
      excludeAssignedToUser: exclude_assigned === 'true' ? user_id : null,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });

    res.json({
      success: true,
      data: results,
      meta: {
        count: results.length,
        filters: {
          tenant_id,
          user_id,
          vertical_id,
          sub_vertical_id,
          territories: territories.length > 0 ? territories : 'all',
          min_score,
          freshness_days,
          edge_case_type,
          exclude_assigned
        }
      }
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/discovery-pool/:id
 * Get single company from pool
 */
router.get('/:id', async (req, res) => {
  try {
    const company = await poolService.getById(req.params.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found in pool'
      });
    }

    res.json({
      success: true,
      data: company
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/discovery-pool/stats
 * Get pool statistics for tenant
 */
router.get('/stats/:tenant_id', async (req, res) => {
  try {
    const stats = await poolService.getPoolStats(req.params.tenant_id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/crawl
 * Trigger crawler for tenant (admin/scheduled job)
 */
router.post('/crawl', async (req, res) => {
  try {
    const { tenant_id, vertical_id, sub_vertical_id, region_code } = req.body;

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'tenant_id is required'
      });
    }

    const result = await crawlerService.runForTenant(tenant_id, {
      verticalId: vertical_id || 'banking',
      subVerticalId: sub_vertical_id || 'employee_banking',
      regionCode: region_code || 'UAE'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Crawl error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/discovery-pool/crawl-history/:tenant_id
 * Get crawl history for tenant
 */
router.get('/crawl-history/:tenant_id', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const history = await crawlerService.getCrawlHistory(req.params.tenant_id, limit);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Lead Assignment Endpoints
// ============================================================================

/**
 * POST /api/os/discovery-pool/assign
 * Soft assign lead to user (auto-assign on view)
 */
router.post('/assign', async (req, res) => {
  try {
    const { pool_id, tenant_id, user_id } = req.body;

    if (!pool_id || !tenant_id || !user_id) {
      return res.status(400).json({
        success: false,
        error: 'pool_id, tenant_id, and user_id are required'
      });
    }

    const result = await assignmentService.softAssign(pool_id, tenant_id, user_id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Assignment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/claim
 * Hard claim lead (user explicitly claims)
 */
router.post('/claim', async (req, res) => {
  try {
    const { pool_id, tenant_id, user_id } = req.body;

    if (!pool_id || !tenant_id || !user_id) {
      return res.status(400).json({
        success: false,
        error: 'pool_id, tenant_id, and user_id are required'
      });
    }

    const result = await assignmentService.claimLead(pool_id, tenant_id, user_id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Claim error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/contact
 * Mark lead as contacted
 */
router.post('/contact', async (req, res) => {
  try {
    const { pool_id, tenant_id, user_id, channel } = req.body;

    if (!pool_id || !tenant_id || !user_id) {
      return res.status(400).json({
        success: false,
        error: 'pool_id, tenant_id, and user_id are required'
      });
    }

    const result = await assignmentService.markContacted(
      pool_id,
      tenant_id,
      user_id,
      channel || 'email'
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Contact error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/convert
 * Mark lead as converted
 */
router.post('/convert', async (req, res) => {
  try {
    const { pool_id, tenant_id, user_id } = req.body;

    if (!pool_id || !tenant_id || !user_id) {
      return res.status(400).json({
        success: false,
        error: 'pool_id, tenant_id, and user_id are required'
      });
    }

    const result = await assignmentService.markConverted(pool_id, tenant_id, user_id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Convert error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/release
 * Release lead (manual or auto)
 */
router.post('/release', async (req, res) => {
  try {
    const { pool_id, tenant_id, user_id, reason } = req.body;

    if (!pool_id || !tenant_id || !user_id) {
      return res.status(400).json({
        success: false,
        error: 'pool_id, tenant_id, and user_id are required'
      });
    }

    const result = await assignmentService.releaseLead(
      pool_id,
      tenant_id,
      user_id,
      reason || 'manual'
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Release error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/discovery-pool/user-assignments/:tenant_id/:user_id
 * Get user's assigned leads
 */
router.get('/user-assignments/:tenant_id/:user_id', async (req, res) => {
  try {
    const { tenant_id, user_id } = req.params;
    const { status, limit, offset } = req.query;

    const assignments = await assignmentService.getUserAssignments(tenant_id, user_id, {
      status: status ? status.split(',') : null,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });

    res.json({
      success: true,
      data: assignments,
      meta: {
        count: assignments.length
      }
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/discovery-pool/user-stats/:tenant_id/:user_id
 * Get user's lead statistics
 */
router.get('/user-stats/:tenant_id/:user_id', async (req, res) => {
  try {
    const stats = await assignmentService.getUserStats(
      req.params.tenant_id,
      req.params.user_id
    );

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/discovery-pool/tenant-stats/:tenant_id
 * Get tenant-wide lead statistics
 */
router.get('/tenant-stats/:tenant_id', async (req, res) => {
  try {
    const stats = await assignmentService.getTenantStats(req.params.tenant_id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/add-note
 * Add note to lead assignment
 */
router.post('/add-note', async (req, res) => {
  try {
    const { pool_id, tenant_id, user_id, note } = req.body;

    if (!pool_id || !tenant_id || !user_id || !note) {
      return res.status(400).json({
        success: false,
        error: 'pool_id, tenant_id, user_id, and note are required'
      });
    }

    const result = await assignmentService.addNote(pool_id, tenant_id, user_id, note);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Territory Endpoints
// ============================================================================

/**
 * GET /api/os/discovery-pool/territories/:tenant_id/:user_id
 * Get user's territories
 */
router.get('/territories/:tenant_id/:user_id', async (req, res) => {
  try {
    const territories = await territoryService.getUserTerritories(
      req.params.tenant_id,
      req.params.user_id
    );

    res.json({
      success: true,
      data: territories
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/territories
 * Assign territory to user
 */
router.post('/territories', async (req, res) => {
  try {
    const { tenant_id, user_id, territory_type, territory_value, priority } = req.body;

    if (!tenant_id || !user_id || !territory_type || !territory_value) {
      return res.status(400).json({
        success: false,
        error: 'tenant_id, user_id, territory_type, and territory_value are required'
      });
    }

    const result = await territoryService.assignTerritory(tenant_id, user_id, {
      type: territory_type,
      value: territory_value,
      priority: priority || 1
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/os/discovery-pool/territories
 * Remove territory from user
 */
router.delete('/territories', async (req, res) => {
  try {
    const { tenant_id, user_id, territory_type, territory_value } = req.body;

    if (!tenant_id || !user_id || !territory_type || !territory_value) {
      return res.status(400).json({
        success: false,
        error: 'tenant_id, user_id, territory_type, and territory_value are required'
      });
    }

    const result = await territoryService.removeTerritory(
      tenant_id,
      user_id,
      territory_type,
      territory_value
    );

    res.json({
      success: result,
      message: result ? 'Territory removed' : 'Territory not found'
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/discovery-pool/territory-stats/:tenant_id
 * Get territory coverage stats
 */
router.get('/territory-stats/:tenant_id', async (req, res) => {
  try {
    const stats = await territoryService.getTerritoryStats(req.params.tenant_id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/setup-uae-territories
 * Setup default UAE territories for tenant
 */
router.post('/setup-uae-territories', async (req, res) => {
  try {
    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'tenant_id is required'
      });
    }

    const result = await territoryService.setupDefaultUAETerritories(tenant_id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Maintenance Endpoints
// ============================================================================

/**
 * POST /api/os/discovery-pool/maintenance/mark-stale
 * Mark stale companies in pool
 */
router.post('/maintenance/mark-stale', async (req, res) => {
  try {
    const count = await poolService.markStaleCompanies();

    res.json({
      success: true,
      data: {
        markedStale: count
      }
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/maintenance/release-abandoned
 * Release abandoned assignments
 */
router.post('/maintenance/release-abandoned', async (req, res) => {
  try {
    const count = await assignmentService.releaseAbandonedAssignments();

    res.json({
      success: true,
      data: {
        released: count
      }
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/discovery-pool/maintenance/cleanup-expired
 * Delete expired companies from pool
 */
router.post('/maintenance/cleanup-expired', async (req, res) => {
  try {
    const daysOld = req.body.days_old ? parseInt(req.body.days_old) : 30;
    const count = await poolService.deleteExpired(daysOld);

    res.json({
      success: true,
      data: {
        deleted: count
      }
    });
  } catch (error) {
    console.error('[DiscoveryPool API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
