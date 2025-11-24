// Sentry Initialization - MUST be imported first in server.js
// This file initializes Sentry as early as possible in the application lifecycle

const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://279aa7db288416fb8e3d252ac314e1e3@o4510313810624512.ingest.us.sentry.io/4510313907159040",

  environment: process.env.NODE_ENV || 'production',

  // Sample rate for performance monitoring (10%)
  tracesSampleRate: 0.1,

  // Capture default PII (IP addresses, user info)
  sendDefaultPii: true,

  // Filter out noise
  beforeSend(event, hint) {
    // Don't send health check errors
    if (event.request && event.request.url) {
      if (event.request.url.includes('/health') ||
          event.request.url.includes('/ready')) {
        return null;
      }
    }
    return event;
  },
});

console.log('✅ Sentry initialized');

module.exports = Sentry;
