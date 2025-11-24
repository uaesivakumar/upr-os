// services/neo4jService.js
// Neo4j Knowledge Graph Service

import neo4j from 'neo4j-driver';
import { pool } from '../utils/db.js';

/**
 * Neo4j Knowledge Graph Service
 *
 * Visualize and query company relationships
 */
class Neo4jService {

  constructor() {
    this.driver = null;
    this.initialized = false;
  }

  /**
   * Initialize Neo4j driver
   */
  initialize() {
    if (this.initialized) return;

    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD;

    if (!password) {
      console.warn('[Neo4j] NEO4J_PASSWORD not set. Neo4j features disabled.');
      return;
    }

    this.driver = neo4j.driver(
      uri,
      neo4j.auth.basic(user, password)
    );

    this.initialized = true;
    console.log('[Neo4j] Driver initialized');
  }

  /**
   * Sync Postgres knowledge graph to Neo4j
   */
  async syncToNeo4j() {
    if (!this.initialized) this.initialize();
    if (!this.driver) {
      console.warn('[Neo4j] Skipping sync - driver not initialized');
      return;
    }

    const session = this.driver.session();

    try {
      console.log('[Neo4j] Starting sync from PostgreSQL...');

      // 1. Sync nodes
      const nodes = await pool.query('SELECT * FROM knowledge_graph_nodes');

      for (const node of nodes.rows) {
        await session.run(`
          MERGE (n:${node.node_type.toUpperCase()} {id: $id})
          SET n.name = $name,
              n.entity_id = $entityId,
              n.properties = $properties,
              n.updated_at = datetime()
        `, {
          id: node.id.toString(),
          name: node.name,
          entityId: node.entity_id?.toString(),
          properties: JSON.stringify(node.properties)
        });
      }

      console.log(`[Neo4j] Synced ${nodes.rows.length} nodes`);

      // 2. Sync edges
      const edges = await pool.query('SELECT * FROM knowledge_graph_edges');

      for (const edge of edges.rows) {
        const relationshipType = edge.relationship_type.toUpperCase().replace(/[^A-Z_]/g, '_');

        await session.run(`
          MATCH (source {id: $sourceId})
          MATCH (target {id: $targetId})
          MERGE (source)-[r:${relationshipType}]->(target)
          SET r.confidence = $confidence,
              r.source = $source,
              r.properties = $properties,
              r.updated_at = datetime()
        `, {
          sourceId: edge.source_node_id.toString(),
          targetId: edge.target_node_id.toString(),
          confidence: edge.confidence,
          source: edge.source,
          properties: JSON.stringify(edge.properties)
        });
      }

      console.log(`[Neo4j] Synced ${edges.rows.length} edges`);
      console.log(`[Neo4j] Sync complete!`);

    } catch (error) {
      console.error('[Neo4j] Sync error:', error);
      throw error;

    } finally {
      await session.close();
    }
  }

  /**
   * Find company ecosystem (competitors, partners, technologies)
   */
  async getCompanyEcosystem(companyId) {
    if (!this.initialized) this.initialize();
    if (!this.driver) {
      return this.getEcosystemFallback(companyId);
    }

    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (c:COMPANY {entity_id: $companyId})
        OPTIONAL MATCH (c)-[r1:COMPETES_WITH]->(competitor:COMPANY)
        OPTIONAL MATCH (c)-[r2:PARTNERS_WITH]->(partner:COMPANY)
        OPTIONAL MATCH (c)-[r3:USES_TECHNOLOGY]->(tech:TECHNOLOGY)
        OPTIONAL MATCH (c)-[r4:OPERATES_IN]->(loc:LOCATION)

        RETURN
          c.name as company_name,
          collect(DISTINCT competitor.name) as competitors,
          collect(DISTINCT partner.name) as partners,
          collect(DISTINCT tech.name) as technologies,
          collect(DISTINCT loc.name) as locations
      `, { companyId: companyId.toString() });

      if (result.records.length === 0) {
        return this.getEcosystemFallback(companyId);
      }

      const record = result.records[0];
      return {
        company_name: record.get('company_name'),
        competitors: record.get('competitors').filter(Boolean),
        partners: record.get('partners').filter(Boolean),
        technologies: record.get('technologies').filter(Boolean),
        locations: record.get('locations').filter(Boolean)
      };

    } catch (error) {
      console.error('[Neo4j] Ecosystem query error:', error);
      return this.getEcosystemFallback(companyId);

    } finally {
      await session.close();
    }
  }

  /**
   * Fallback ecosystem query from PostgreSQL
   */
  async getEcosystemFallback(companyId) {
    const result = await pool.query(`
      SELECT
        n1.name as company_name,
        ARRAY_AGG(DISTINCT n2.name) FILTER (WHERE e.relationship_type = 'competes_with') as competitors,
        ARRAY_AGG(DISTINCT n2.name) FILTER (WHERE e.relationship_type = 'partners_with') as partners,
        ARRAY_AGG(DISTINCT n2.name) FILTER (WHERE e.relationship_type = 'uses_technology') as technologies,
        ARRAY_AGG(DISTINCT n2.name) FILTER (WHERE e.relationship_type = 'operates_in') as locations
      FROM knowledge_graph_nodes n1
      LEFT JOIN knowledge_graph_edges e ON e.source_node_id = n1.id
      LEFT JOIN knowledge_graph_nodes n2 ON n2.id = e.target_node_id
      WHERE n1.entity_id = $1 AND n1.node_type = 'company'
      GROUP BY n1.name
    `, [companyId]);

    if (result.rows.length === 0) {
      return {
        company_name: 'Unknown',
        competitors: [],
        partners: [],
        technologies: [],
        locations: []
      };
    }

    return result.rows[0];
  }

  /**
   * Find similar companies (graph-based similarity)
   */
  async findSimilarCompanies(companyId, limit = 10) {
    if (!this.initialized) this.initialize();
    if (!this.driver) {
      return [];
    }

    const session = this.driver.session();

    try {
      // Use node similarity based on shared relationships
      const result = await session.run(`
        MATCH (c1:COMPANY {entity_id: $companyId})-[r1]->(n)
        MATCH (c2:COMPANY)-[r2]->(n)
        WHERE c1 <> c2
        WITH c2, count(DISTINCT n) as shared_nodes
        ORDER BY shared_nodes DESC
        LIMIT $limit

        RETURN
          c2.entity_id as company_id,
          c2.name as name,
          shared_nodes,
          c2.properties as properties
      `, { companyId: companyId.toString(), limit: neo4j.int(limit) });

      return result.records.map(r => ({
        company_id: r.get('company_id'),
        name: r.get('name'),
        shared_nodes: r.get('shared_nodes').toNumber(),
        properties: r.get('properties')
      }));

    } catch (error) {
      console.error('[Neo4j] Similar companies error:', error);
      return [];

    } finally {
      await session.close();
    }
  }

  /**
   * Get graph data for visualization
   */
  async getGraphVisualization(companyId, depth = 2) {
    if (!this.initialized) this.initialize();
    if (!this.driver) {
      return this.getGraphFallback(companyId, depth);
    }

    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH path = (c:COMPANY {entity_id: $companyId})-[*1..${depth}]-(n)
        WITH DISTINCT n, relationships(path) as rels
        RETURN
          collect(DISTINCT {
            id: id(n),
            label: labels(n)[0],
            name: n.name,
            properties: n.properties
          }) as nodes,
          collect(DISTINCT {
            source: id(startNode(rels[0])),
            target: id(endNode(rels[0])),
            type: type(rels[0])
          }) as edges
      `, { companyId: companyId.toString() });

      if (result.records.length === 0) {
        return { nodes: [], edges: [] };
      }

      return {
        nodes: result.records[0].get('nodes'),
        edges: result.records[0].get('edges')
      };

    } catch (error) {
      console.error('[Neo4j] Visualization error:', error);
      return this.getGraphFallback(companyId, depth);

    } finally {
      await session.close();
    }
  }

  /**
   * Fallback graph visualization from PostgreSQL
   */
  async getGraphFallback(companyId, depth) {
    const result = await pool.query(`
      WITH RECURSIVE graph_traverse AS (
        -- Base case: start from company node
        SELECT
          n.id, n.name, n.node_type, n.properties,
          e.target_node_id, e.relationship_type,
          1 as depth
        FROM knowledge_graph_nodes n
        LEFT JOIN knowledge_graph_edges e ON e.source_node_id = n.id
        WHERE n.entity_id = $1 AND n.node_type = 'company'

        UNION

        -- Recursive case: traverse edges
        SELECT
          n.id, n.name, n.node_type, n.properties,
          e.target_node_id, e.relationship_type,
          gt.depth + 1
        FROM graph_traverse gt
        JOIN knowledge_graph_nodes n ON n.id = gt.target_node_id
        LEFT JOIN knowledge_graph_edges e ON e.source_node_id = n.id
        WHERE gt.depth < $2
      )
      SELECT DISTINCT
        id, name, node_type as label, properties
      FROM graph_traverse
    `, [companyId, depth]);

    const nodes = result.rows.map(r => ({
      id: r.id,
      label: r.label.toUpperCase(),
      name: r.name,
      properties: r.properties
    }));

    // Get edges
    const edgesResult = await pool.query(`
      SELECT DISTINCT
        e.source_node_id as source,
        e.target_node_id as target,
        e.relationship_type as type
      FROM knowledge_graph_edges e
      WHERE e.source_node_id IN (${nodes.map(n => n.id).join(',')})
    `);

    const edges = edgesResult.rows.map(r => ({
      source: r.source,
      target: r.target,
      type: r.type
    }));

    return { nodes, edges };
  }

  /**
   * Discover hidden patterns (e.g., hiring from competitors)
   */
  async discoverPatterns(companyId) {
    if (!this.initialized) this.initialize();
    if (!this.driver) {
      return { hiring_patterns: [] };
    }

    const session = this.driver.session();

    try {
      // Find if company is hiring people from specific competitors
      const result = await session.run(`
        MATCH (c:COMPANY {entity_id: $companyId})
        MATCH (c)-[:HIRES]->(person:PERSON)-[:PREVIOUSLY_WORKED_AT]->(previous:COMPANY)
        WITH previous, count(person) as hire_count
        WHERE hire_count >= 2
        RETURN previous.name as company, hire_count
        ORDER BY hire_count DESC
      `, { companyId: companyId.toString() });

      return {
        hiring_patterns: result.records.map(r => ({
          company: r.get('company'),
          count: r.get('hire_count').toNumber()
        }))
      };

    } catch (error) {
      console.error('[Neo4j] Pattern discovery error:', error);
      return { hiring_patterns: [] };

    } finally {
      await session.close();
    }
  }

  async close() {
    if (this.driver) {
      await this.driver.close();
      this.initialized = false;
    }
  }
}

export default new Neo4jService();
