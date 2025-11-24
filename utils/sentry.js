// Sentry Error Monitoring - Backend
// Add this to the top of server.js: const { initSentry } = require('./utils/sentry');

const Sentry = require("@sentry/node");

/**
 * Initialize Sentry for backend error tracking
 */
function initSentry() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.warn('⚠️  SENTRY_DSN not set - error tracking disabled');
    return null;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',

    // Sample rate for performance monitoring (10%)
    tracesSampleRate: 0.1,

    // Capture console errors
    integrations: [
      new Sentry.Integrations.Console(),
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],

    // Filter out health check noise
    beforeSend(event, hint) {
      // Don't send health check errors
      if (event.request && event.request.url) {
        if (event.request.url.includes('/health') || event.request.url.includes('/ready')) {
          return null;
        }
      }
      return event;
    },
  });

  console.log('✅ Sentry initialized for backend');
  return Sentry;
}

/**
 * Express error handler middleware
 */
function sentryErrorHandler() {
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture 4xx and 5xx errors
      return error.status >= 400;
    },
  });
}

/**
 * Express request handler middleware
 */
function sentryRequestHandler() {
  return Sentry.Handlers.requestHandler();
}

/**
 * Capture exception manually
 */
function captureException(error, context = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: context,
    });
  }
  console.error('Sentry captured exception:', error, context);
}

/**
 * Add user context to errors
 */
function setUser(user) {
  if (process.env.SENTRY_DSN && user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  }
}

module.exports = {
  initSentry,
  sentryErrorHandler,
  sentryRequestHandler,
  captureException,
  setUser,
  Sentry,
};
