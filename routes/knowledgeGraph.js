// routes/knowledgeGraph.js
// Knowledge Graph API

import express from 'express';
import neo4jService from '../services/neo4jService.js';

const router = express.Router();

/**
 * POST /api/knowledge-graph/sync
 *
 * Sync PostgreSQL knowledge graph to Neo4j
 */
router.post('/sync', async (req, res) => {
  try {
    await neo4jService.syncToNeo4j();

    res.json({
      ok: true,
      message: 'Knowledge graph synced to Neo4j'
    });

  } catch (error) {
    console.error('[knowledge-graph] Sync error:', error);

    res.status(500).json({
      ok: false,
      error: 'sync_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/knowledge-graph/:companyId/ecosystem
 *
 * Get company ecosystem (competitors, partners, technologies)
 */
router.get('/:companyId/ecosystem', async (req, res) => {
  try {
    const { companyId } = req.params;

    const ecosystem = await neo4jService.getCompanyEcosystem(parseInt(companyId));

    res.json({
      ok: true,
      ecosystem
    });

  } catch (error) {
    console.error('[knowledge-graph] Ecosystem error:', error);

    res.status(500).json({
      ok: false,
      error: 'ecosystem_query_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/knowledge-graph/:companyId/similar
 *
 * Find similar companies
 */
router.get('/:companyId/similar', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { limit } = req.query;

    const similarCompanies = await neo4jService.findSimilarCompanies(
      parseInt(companyId),
      parseInt(limit) || 10
    );

    res.json({
      ok: true,
      similar_companies: similarCompanies
    });

  } catch (error) {
    console.error('[knowledge-graph] Similar companies error:', error);

    res.status(500).json({
      ok: false,
      error: 'similarity_query_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/knowledge-graph/:companyId/visualization
 *
 * Get graph data for visualization
 */
router.get('/:companyId/visualization', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { depth } = req.query;

    const graphData = await neo4jService.getGraphVisualization(
      parseInt(companyId),
      parseInt(depth) || 2
    );

    res.json({
      ok: true,
      ...graphData
    });

  } catch (error) {
    console.error('[knowledge-graph] Visualization error:', error);

    res.status(500).json({
      ok: false,
      error: 'visualization_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/knowledge-graph/:companyId/patterns
 *
 * Discover hidden patterns
 */
router.get('/:companyId/patterns', async (req, res) => {
  try {
    const { companyId } = req.params;

    const patterns = await neo4jService.discoverPatterns(parseInt(companyId));

    res.json({
      ok: true,
      patterns
    });

  } catch (error) {
    console.error('[knowledge-graph] Pattern discovery error:', error);

    res.status(500).json({
      ok: false,
      error: 'pattern_discovery_failed',
      message: error.message
    });
  }
});

export default router;
