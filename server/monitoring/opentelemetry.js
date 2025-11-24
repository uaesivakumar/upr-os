/**
 * OpenTelemetry Configuration - Sprint 20 Task 5
 *
 * Provides distributed tracing and metrics for all SIVA tool executions
 * Exports to Google Cloud Trace and Cloud Monitoring
 *
 * Features:
 * - Automatic instrumentation of HTTP requests
 * - Custom spans for SIVA tool execution
 * - Per-tool latency metrics (p50/p95/p99)
 * - Error rate tracking
 * - Trace correlation across discovery/enrichment pipelines
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { TraceExporter } = require('@google-cloud/opentelemetry-cloud-trace-exporter');
const { MetricExporter } = require('@google-cloud/opentelemetry-cloud-monitoring-exporter');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { trace, metrics, context } = require('@opentelemetry/api');

// Only initialize if in production (Google Cloud Run)
const isProduction = process.env.NODE_ENV === 'production' || process.env.K_SERVICE;

let sdk;
let tracer;
let meter;

/**
 * Initialize OpenTelemetry SDK
 * Call this once at application startup
 */
function initializeOpenTelemetry() {
  if (!isProduction) {
    console.log('[OpenTelemetry] Skipping initialization (not in production)');
    return {
      startSpan: () => ({ end: () => {}, setAttribute: () => {}, setStatus: () => {} }),
      recordMetric: () => {},
      getTracer: () => null,
      getMeter: () => null
    };
  }

  try {
    console.log('[OpenTelemetry] Initializing SDK...');

    // Create resource with service information
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'upr-web-service',
      [SemanticResourceAttributes.SERVICE_VERSION]: '2.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
    });

    // Configure trace exporter (Google Cloud Trace)
    const traceExporter = new TraceExporter();

    // Configure metric exporter (Google Cloud Monitoring)
    const metricExporter = new MetricExporter();

    // Initialize SDK
    sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60000, // Export every 60 seconds
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable noisy instrumentations
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();

    // Get tracer and meter for custom instrumentation
    tracer = trace.getTracer('siva-tools', '2.0.0');
    meter = metrics.getMeter('siva-tools', '2.0.0');

    console.log('[OpenTelemetry] SDK initialized successfully');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('[OpenTelemetry] Shutting down...');
      await sdk.shutdown();
      console.log('[OpenTelemetry] Shutdown complete');
    });

    return {
      startSpan,
      recordMetric,
      getTracer: () => tracer,
      getMeter: () => meter
    };

  } catch (error) {
    console.error('[OpenTelemetry] Initialization failed:', error);
    // Return no-op functions on failure
    return {
      startSpan: () => ({ end: () => {}, setAttribute: () => {}, setStatus: () => {} }),
      recordMetric: () => {},
      getTracer: () => null,
      getMeter: () => null
    };
  }
}

/**
 * Start a custom span for SIVA tool execution
 *
 * @param {string} toolName - Name of the SIVA tool
 * @param {Object} attributes - Additional span attributes
 * @returns {Object} Span object with end() method
 */
function startSpan(toolName, attributes = {}) {
  if (!tracer) {
    return { end: () => {}, setAttribute: () => {}, setStatus: () => {} };
  }

  const span = tracer.startSpan(`siva.tool.${toolName}`, {
    attributes: {
      'siva.tool.name': toolName,
      'siva.tool.layer': attributes.layer || 'unknown',
      'siva.tool.primitive': attributes.primitive || 'unknown',
      'siva.module': attributes.module || 'unknown',
      ...attributes
    }
  });

  return {
    end: () => span.end(),
    setAttribute: (key, value) => span.setAttribute(key, value),
    setStatus: (status) => span.setStatus(status),
    recordException: (error) => span.recordException(error)
  };
}

/**
 * Record a custom metric for SIVA tool execution
 *
 * @param {string} metricName - Name of the metric
 * @param {number} value - Metric value
 * @param {Object} attributes - Metric attributes (for filtering)
 */
function recordMetric(metricName, value, attributes = {}) {
  if (!meter) return;

  try {
    const histogram = meter.createHistogram(metricName, {
      description: `SIVA tool metric: ${metricName}`,
      unit: 'ms'
    });

    histogram.record(value, attributes);
  } catch (error) {
    console.error('[OpenTelemetry] Failed to record metric:', error.message);
  }
}

/**
 * Create instrumentation wrapper for SIVA tools
 * Use this to wrap tool.execute() calls
 *
 * @param {Object} tool - SIVA tool instance
 * @param {string} toolName - Tool name
 * @param {string} layer - Tool layer (foundation/strict/delegated)
 * @param {string} primitive - SIVA primitive name
 * @returns {Object} Instrumented tool
 */
function instrumentTool(tool, toolName, layer, primitive) {
  const originalExecute = tool.execute.bind(tool);

  tool.execute = async function(input, options = {}) {
    const startTime = Date.now();
    const span = startSpan(toolName, {
      layer,
      primitive,
      module: options.module || 'unknown',
      companyId: input.companyId || input.company_id || 'unknown',
      contactId: input.contactId || input.contact_id || 'unknown'
    });

    try {
      // Execute tool
      const result = await originalExecute(input, options);
      const executionTimeMs = Date.now() - startTime;

      // Record success metrics
      span.setAttribute('siva.tool.success', true);
      span.setAttribute('siva.tool.latency_ms', executionTimeMs);

      if (result.score !== undefined) {
        span.setAttribute('siva.tool.score', result.score);
      }
      if (result.confidence !== undefined) {
        span.setAttribute('siva.tool.confidence', result.confidence);
      }
      if (result.tier !== undefined) {
        span.setAttribute('siva.tool.tier', result.tier);
      }

      // Record latency metric
      recordMetric('siva.tool.latency', executionTimeMs, {
        tool: toolName,
        layer,
        success: 'true'
      });

      span.end();
      return result;

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Record failure metrics
      span.setAttribute('siva.tool.success', false);
      span.setAttribute('siva.tool.error', error.message);
      span.setAttribute('siva.tool.latency_ms', executionTimeMs);
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message }); // STATUS_CODE_ERROR

      // Record error metric
      recordMetric('siva.tool.errors', 1, {
        tool: toolName,
        layer,
        error_type: error.name || 'Error'
      });

      span.end();
      throw error;
    }
  };

  return tool;
}

/**
 * Get current trace context for correlation
 * Use this to pass trace context between services
 */
function getTraceContext() {
  if (!isProduction) return null;

  const activeContext = context.active();
  const span = trace.getSpan(activeContext);

  if (!span) return null;

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags
  };
}

module.exports = {
  initializeOpenTelemetry,
  startSpan,
  recordMetric,
  instrumentTool,
  getTraceContext,
  isProduction
};
