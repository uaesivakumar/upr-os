// ml/knowledgeGraph.js
// Knowledge Graph Builder
//
// Constructs semantic relationships between entities

import { pool } from '../utils/db.js';
import nlpService from './nlpService.js';

/**
 * Knowledge Graph Builder
 *
 * Constructs semantic relationships between entities
 */
class KnowledgeGraphBuilder {

  /**
   * Build graph from company data
   */
  async buildGraph(companyId) {
    console.log(`[KnowledgeGraph] Building graph for company ${companyId}`);

    try {
      // 1. Create company node
      const company = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);

      if (company.rows.length === 0) {
        throw new Error(`Company ${companyId} not found`);
      }

      const companyNode = await this.createNode('company', companyId, company.rows[0].name);

      // 2. Extract entities from knowledge base
      const chunks = await pool.query(`
        SELECT content FROM kb_chunks WHERE company_id = $1 LIMIT 10
      `, [companyId]);

      for (const chunk of chunks.rows) {
        const entities = await nlpService.extractEntities(chunk.content);

        // Create nodes and edges for each entity
        for (const tech of entities.technologies || []) {
          const techNode = await this.findOrCreateNode('technology', null, tech);
          if (techNode) {
            await this.createEdge(companyNode, techNode, 'uses_technology', 0.7);
          }
        }

        for (const location of entities.locations || []) {
          const locNode = await this.findOrCreateNode('location', null, location);
          if (locNode) {
            await this.createEdge(companyNode, locNode, 'operates_in', 0.8);
          }
        }

        for (const event of entities.events || []) {
          const eventNode = await this.findOrCreateNode('event', null, event);
          if (eventNode) {
            await this.createEdge(companyNode, eventNode, 'participated_in', 0.6);
          }
        }
      }

      console.log(`[KnowledgeGraph] ✅ Graph built for company ${companyId}`);

      return companyNode;

    } catch (error) {
      console.error('[KnowledgeGraph] Error building graph:', error);
      throw error;
    }
  }

  async createNode(nodeType, entityId, name, properties = {}) {
    try {
      const result = await pool.query(`
        INSERT INTO knowledge_graph_nodes (node_type, entity_id, name, properties)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [nodeType, entityId, name, JSON.stringify(properties)]);

      return result.rows[0]?.id;
    } catch (error) {
      console.error('[KnowledgeGraph] Error creating node:', error);
      return null;
    }
  }

  async findOrCreateNode(nodeType, entityId, name, properties = {}) {
    try {
      // Try to find existing node
      let result = await pool.query(`
        SELECT id FROM knowledge_graph_nodes
        WHERE node_type = $1 AND LOWER(name) = LOWER($2)
      `, [nodeType, name]);

      if (result.rows.length > 0) {
        return result.rows[0].id;
      }

      // Create new node
      return this.createNode(nodeType, entityId, name, properties);
    } catch (error) {
      console.error('[KnowledgeGraph] Error finding/creating node:', error);
      return null;
    }
  }

  async createEdge(sourceNodeId, targetNodeId, relationshipType, confidence = 0.8, source = 'ml_inferred') {
    if (!sourceNodeId || !targetNodeId) {
      return null;
    }

    try {
      await pool.query(`
        INSERT INTO knowledge_graph_edges (source_node_id, target_node_id, relationship_type, confidence, source)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [sourceNodeId, targetNodeId, relationshipType, confidence, source]);
    } catch (error) {
      console.error('[KnowledgeGraph] Error creating edge:', error);
    }
  }

  /**
   * Find similar companies using graph structure
   */
  async findSimilarCompanies(companyId, limit = 5) {
    try {
      // Find companies with overlapping technologies/locations
      const result = await pool.query(`
        WITH company_connections AS (
          SELECT
            target_node_id as node_id
          FROM knowledge_graph_edges e
          JOIN knowledge_graph_nodes n ON n.id = e.source_node_id
          WHERE n.entity_id = $1 AND n.node_type = 'company'
        )
        SELECT DISTINCT
          n.entity_id as similar_company_id,
          n.name as company_name,
          COUNT(*) as shared_connections
        FROM knowledge_graph_edges e
        JOIN knowledge_graph_nodes n ON n.id = e.source_node_id
        WHERE
          e.target_node_id IN (SELECT node_id FROM company_connections)
          AND n.node_type = 'company'
          AND n.entity_id != $1
          AND n.entity_id IS NOT NULL
        GROUP BY n.entity_id, n.name
        ORDER BY shared_connections DESC
        LIMIT $2
      `, [companyId, limit]);

      return result.rows;
    } catch (error) {
      console.error('[KnowledgeGraph] Error finding similar companies:', error);
      return [];
    }
  }

  /**
   * Get company's technology stack
   */
  async getCompanyTechnologies(companyId) {
    try {
      const result = await pool.query(`
        SELECT
          t.name as technology,
          e.confidence
        FROM knowledge_graph_nodes c
        JOIN knowledge_graph_edges e ON e.source_node_id = c.id
        JOIN knowledge_graph_nodes t ON t.id = e.target_node_id
        WHERE
          c.entity_id = $1
          AND c.node_type = 'company'
          AND t.node_type = 'technology'
          AND e.relationship_type = 'uses_technology'
        ORDER BY e.confidence DESC
      `, [companyId]);

      return result.rows;
    } catch (error) {
      console.error('[KnowledgeGraph] Error getting technologies:', error);
      return [];
    }
  }

  /**
   * Get company's locations
   */
  async getCompanyLocations(companyId) {
    try {
      const result = await pool.query(`
        SELECT
          l.name as location,
          e.confidence
        FROM knowledge_graph_nodes c
        JOIN knowledge_graph_edges e ON e.source_node_id = c.id
        JOIN knowledge_graph_nodes l ON l.id = e.target_node_id
        WHERE
          c.entity_id = $1
          AND c.node_type = 'company'
          AND l.node_type = 'location'
          AND e.relationship_type = 'operates_in'
        ORDER BY e.confidence DESC
      `, [companyId]);

      return result.rows;
    } catch (error) {
      console.error('[KnowledgeGraph] Error getting locations:', error);
      return [];
    }
  }
}

export default new KnowledgeGraphBuilder();
