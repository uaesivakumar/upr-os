/**
 * MCP Provider Adapter
 * Sprint 50: API Provider Management
 *
 * Adapter for integrating MCP (Model Context Protocol) based tools
 * with the provider registry system. This enables using MCP scrapers
 * like SalesNav MCP as enrichment providers.
 *
 * Key Features:
 * - Bridge between MCP tools and provider registry
 * - Standardized response format
 * - Health check integration
 * - Rate limiting support
 */

import { spawn } from 'child_process';
import path from 'path';

// MCP Server registry
const MCP_SERVERS = {
  'salesnav_mcp': {
    command: 'node',
    args: ['server/mcp/salesnav-server.js'],
    capabilities: ['salesnav_search', 'lead_lists', 'company_insights', 'contact_lookup'],
    description: 'Sales Navigator MCP scraper for LinkedIn data'
  },
  'linkedin_scraper': {
    command: 'node',
    args: ['server/mcp/linkedin-server.js'],
    capabilities: ['profile_scraping', 'company_scraping', 'job_scraping'],
    description: 'LinkedIn profile and company data scraper'
  }
};

/**
 * MCP Client for communicating with MCP servers
 */
class MCPClient {
  constructor(serverConfig) {
    this.config = serverConfig;
    this.process = null;
    this.messageQueue = new Map();
    this.messageId = 0;
  }

  /**
   * Start the MCP server process
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const { command, args, env = {} } = this.config;

      this.process = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.on('error', (err) => {
        console.error('[MCP] Process error:', err);
        reject(err);
      });

      this.process.stdout.on('data', (data) => {
        this.handleMessage(data.toString());
      });

      this.process.stderr.on('data', (data) => {
        console.error('[MCP] stderr:', data.toString());
      });

      // Wait for initialization
      setTimeout(() => resolve(), 1000);
    });
  }

  /**
   * Send a message to the MCP server
   */
  async sendMessage(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }) + '\n';

      const timeout = setTimeout(() => {
        this.messageQueue.delete(id);
        reject(new Error('MCP request timeout'));
      }, 30000);

      this.messageQueue.set(id, { resolve, reject, timeout });

      this.process.stdin.write(message);
    });
  }

  /**
   * Handle incoming messages from MCP server
   */
  handleMessage(data) {
    try {
      const lines = data.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const message = JSON.parse(line);
        if (message.id && this.messageQueue.has(message.id)) {
          const { resolve, reject, timeout } = this.messageQueue.get(message.id);
          clearTimeout(timeout);
          this.messageQueue.delete(message.id);

          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result);
          }
        }
      }
    } catch (err) {
      console.error('[MCP] Error parsing message:', err);
    }
  }

  /**
   * Call an MCP tool
   */
  async callTool(name, args = {}) {
    return this.sendMessage('tools/call', { name, arguments: args });
  }

  /**
   * List available tools
   */
  async listTools() {
    return this.sendMessage('tools/list');
  }

  /**
   * Disconnect from MCP server
   */
  disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

// Connection pool for MCP clients
const mcpClients = new Map();

/**
 * Get or create an MCP client for a server
 */
async function getMCPClient(serverSlug) {
  if (mcpClients.has(serverSlug)) {
    return mcpClients.get(serverSlug);
  }

  const config = MCP_SERVERS[serverSlug];
  if (!config) {
    throw new Error(`Unknown MCP server: ${serverSlug}`);
  }

  const client = new MCPClient(config);
  await client.connect();
  mcpClients.set(serverSlug, client);

  return client;
}

/**
 * Execute an MCP provider for enrichment
 *
 * @param {Object} provider - Provider object from registry
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Enrichment result
 */
async function executeMCPProvider(provider, context) {
  const { entity, operation = 'enrich' } = context;

  const client = await getMCPClient(provider.slug);

  // Map operation to MCP tool calls
  let result = {};

  switch (operation) {
    case 'company_enrichment':
      result = await enrichCompanyViaMCP(client, entity);
      break;

    case 'contact_lookup':
      result = await lookupContactViaMCP(client, entity);
      break;

    case 'salesnav_search':
      result = await searchSalesNavViaMCP(client, entity);
      break;

    default:
      throw new Error(`Unsupported MCP operation: ${operation}`);
  }

  return result;
}

/**
 * Enrich company data via MCP
 */
async function enrichCompanyViaMCP(client, entity) {
  const { domain, name, linkedin_url } = entity;

  const enriched = {
    source: 'mcp',
    timestamp: new Date().toISOString(),
    data: {}
  };

  // Try company lookup
  if (linkedin_url) {
    try {
      const companyData = await client.callTool('scrape_company', {
        url: linkedin_url
      });

      if (companyData) {
        enriched.data = {
          ...enriched.data,
          company_name: companyData.name,
          industry: companyData.industry,
          employee_count: companyData.size,
          headquarters: companyData.headquarters,
          founded: companyData.founded,
          description: companyData.description,
          specialties: companyData.specialties,
          website: companyData.website
        };
      }
    } catch (err) {
      console.error('[MCP] Company scrape error:', err);
    }
  }

  // Try domain lookup if available
  if (domain && !enriched.data.company_name) {
    try {
      const domainData = await client.callTool('lookup_domain', {
        domain
      });

      if (domainData) {
        enriched.data = {
          ...enriched.data,
          ...domainData
        };
      }
    } catch (err) {
      console.error('[MCP] Domain lookup error:', err);
    }
  }

  return enriched;
}

/**
 * Lookup contact via MCP
 */
async function lookupContactViaMCP(client, entity) {
  const { email, name, linkedin_url, company } = entity;

  const result = {
    source: 'mcp',
    timestamp: new Date().toISOString(),
    data: {}
  };

  // LinkedIn profile scrape
  if (linkedin_url) {
    try {
      const profileData = await client.callTool('scrape_profile', {
        url: linkedin_url
      });

      if (profileData) {
        result.data = {
          full_name: profileData.name,
          headline: profileData.headline,
          current_title: profileData.title,
          current_company: profileData.company,
          location: profileData.location,
          connections: profileData.connections,
          summary: profileData.summary,
          experience: profileData.experience,
          education: profileData.education,
          skills: profileData.skills
        };
      }
    } catch (err) {
      console.error('[MCP] Profile scrape error:', err);
    }
  }

  // SalesNav search if no LinkedIn URL
  if (!linkedin_url && (name || email)) {
    try {
      const searchResults = await client.callTool('search_leads', {
        name,
        company,
        email
      });

      if (searchResults?.leads?.length > 0) {
        const lead = searchResults.leads[0];
        result.data = {
          full_name: lead.name,
          current_title: lead.title,
          current_company: lead.company,
          linkedin_url: lead.profileUrl,
          location: lead.location
        };
      }
    } catch (err) {
      console.error('[MCP] Lead search error:', err);
    }
  }

  return result;
}

/**
 * Search SalesNav via MCP
 */
async function searchSalesNavViaMCP(client, query) {
  const {
    keywords,
    title,
    company,
    industry,
    location,
    connectionDegree,
    limit = 25
  } = query;

  try {
    const searchResults = await client.callTool('advanced_search', {
      keywords,
      titleFilter: title,
      companyFilter: company,
      industryFilter: industry,
      locationFilter: location,
      connectionDegreeFilter: connectionDegree,
      limit
    });

    return {
      source: 'salesnav_mcp',
      timestamp: new Date().toISOString(),
      results: searchResults?.leads || [],
      total: searchResults?.total || 0,
      hasMore: searchResults?.hasMore || false
    };
  } catch (err) {
    console.error('[MCP] SalesNav search error:', err);
    throw err;
  }
}

/**
 * Check MCP server health
 */
async function checkMCPHealth(serverSlug) {
  try {
    const client = await getMCPClient(serverSlug);
    const tools = await client.listTools();

    return {
      status: 'healthy',
      availableTools: tools?.tools?.length || 0,
      serverSlug
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      error: err.message,
      serverSlug
    };
  }
}

/**
 * Get available MCP servers
 */
function getAvailableMCPServers() {
  return Object.entries(MCP_SERVERS).map(([slug, config]) => ({
    slug,
    description: config.description,
    capabilities: config.capabilities
  }));
}

/**
 * Create provider executor for use with fallback chain
 */
function createMCPProviderExecutor(operation) {
  return async (provider, context) => {
    if (provider.provider_type !== 'mcp') {
      throw new Error(`Provider ${provider.slug} is not an MCP provider`);
    }

    return executeMCPProvider(provider, {
      ...context,
      operation
    });
  };
}

// Cleanup on process exit
process.on('exit', () => {
  for (const [, client] of mcpClients) {
    client.disconnect();
  }
});

export {
  executeMCPProvider,
  checkMCPHealth,
  getAvailableMCPServers,
  createMCPProviderExecutor,
  getMCPClient,
  MCP_SERVERS
};
