#!/usr/bin/env node
/**
 * MCP Server CLI Entry Point
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Initialize and start MCP server for Claude Desktop
 * Usage: node server/agent-hub/mcp-server-cli.js
 *
 * Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string for agent_decisions logging
 * - SENTRY_DSN: Sentry DSN for error tracking
 * - LOG_LEVEL: Winston log level (default: info)
 *
 * Reference: Agent Hub Architecture §7 - MCP Server Integration
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { MCPServer } = require('./MCPServer');
const { ToolRegistry } = require('./ToolRegistry');
const { RequestRouter } = require('./RequestRouter');
const { TOOL_CONFIGS } = require('./config/tool-registry-config');
const { logger } = require('./logger');
const Sentry = require('@sentry/node');

/**
 * Initialize Sentry error tracking
 */
function initializeSentry() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
      beforeSend(event) {
        // Filter out MCP protocol errors that are handled gracefully
        if (event.exception?.values?.[0]?.value?.includes('Circuit breaker')) {
          return null; // Don't send circuit breaker errors to Sentry
        }
        return event;
      }
    });
    logger.info('Sentry initialized for MCP server');
  } else {
    logger.warn('SENTRY_DSN not set, error tracking disabled');
  }
}

/**
 * Main initialization function
 */
async function main() {
  try {
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('SIVA Agent Hub - MCP Server');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('Starting MCP server for Claude Desktop integration...');

    // Initialize Sentry
    initializeSentry();

    // ═══════════════════════════════════════════════════════════
    // STEP 1: Initialize Tool Registry
    // ═══════════════════════════════════════════════════════════
    logger.info('Step 1: Initializing Tool Registry...');
    const registry = new ToolRegistry();

    // Register all SIVA tools
    for (const config of TOOL_CONFIGS) {
      await registry.register(config);
    }

    logger.info(`✅ Tool Registry initialized with ${TOOL_CONFIGS.length} tools`);

    // Start health checks (optional for MCP mode - can disable to reduce overhead)
    if (process.env.ENABLE_HEALTH_CHECKS !== 'false') {
      registry.startHealthChecks();
      logger.info('✅ Periodic health checks enabled (60s interval)');
    } else {
      logger.info('⏸️  Health checks disabled for MCP mode');
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 2: Initialize Request Router
    // ═══════════════════════════════════════════════════════════
    logger.info('Step 2: Initializing Request Router...');
    const router = new RequestRouter(registry, null); // No workflow engine for basic MCP mode
    logger.info('✅ Request Router initialized');

    // ═══════════════════════════════════════════════════════════
    // STEP 3: Initialize MCP Server
    // ═══════════════════════════════════════════════════════════
    logger.info('Step 3: Initializing MCP Server...');
    const mcpServer = new MCPServer(registry, router);
    await mcpServer.initialize();
    logger.info('✅ MCP Server initialized and listening on stdio');

    // ═══════════════════════════════════════════════════════════
    // READY
    // ═══════════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('✅ SIVA Agent Hub MCP Server running');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('MCP Tools Available:');
    logger.info('  - evaluate_company_quality');
    logger.info('  - select_contact_tier');
    logger.info('  - calculate_timing_score');
    logger.info('  - match_banking_products');
    logger.info('');
    logger.info('Waiting for MCP requests from Claude Desktop...');

    // ═══════════════════════════════════════════════════════════
    // GRACEFUL SHUTDOWN HANDLERS
    // ═══════════════════════════════════════════════════════════
    process.on('SIGINT', async () => {
      logger.info('');
      logger.info('Received SIGINT, shutting down gracefully...');
      await shutdown(registry, mcpServer);
    });

    process.on('SIGTERM', async () => {
      logger.info('');
      logger.info('Received SIGTERM, shutting down gracefully...');
      await shutdown(registry, mcpServer);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack
      });
      Sentry.captureException(error);
      // Don't exit - MCP server should stay running
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', {
        reason: reason,
        promise: promise
      });
      Sentry.captureException(reason);
      // Don't exit - MCP server should stay running
    });

  } catch (error) {
    logger.error('❌ MCP Server initialization failed', {
      error: error.message,
      stack: error.stack
    });
    Sentry.captureException(error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(registry, mcpServer) {
  try {
    logger.info('Shutting down...');

    if (registry) {
      registry.stopHealthChecks();
      registry.shutdown();
    }

    if (mcpServer) {
      await mcpServer.shutdown();
    }

    // Flush Sentry events
    await Sentry.close(2000);

    logger.info('✅ Shutdown complete');
    process.exit(0);

  } catch (error) {
    logger.error('Error during shutdown', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the server
main();
