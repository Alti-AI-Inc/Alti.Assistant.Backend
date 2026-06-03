/**
 * Sentry Error Tracking Initialization
 *
 * Initializes Sentry for production error tracking and performance monitoring.
 * Only activates when SENTRY_DSN is set in environment variables.
 *
 * @see https://docs.sentry.io/platforms/node/
 */

let Sentry = null;

export async function initSentry(app) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.info('[Sentry] SENTRY_DSN not set — error tracking disabled.');
    return;
  }

  try {
    Sentry = await import('@sentry/node');

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.npm_package_version || 'unknown',

      // Performance monitoring — sample 10% of transactions in production
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Only send errors in production/staging
      enabled: process.env.NODE_ENV !== 'test',

      // Scrub sensitive data
      beforeSend(event) {
        // Remove any API keys or tokens that may have leaked into error messages
        if (event.message) {
          event.message = event.message.replace(
            /(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*\S+/gi,
            '[REDACTED]'
          );
        }
        return event;
      },

      // Ignore common non-actionable errors
      ignoreErrors: [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'socket hang up',
        'Request aborted',
      ],
    });

    // Express integration — must be the FIRST middleware
    if (app) {
      Sentry.setupExpressErrorHandler(app);
    }

    console.info('[Sentry] ✅ Error tracking initialized.');
  } catch (err) {
    console.warn(`[Sentry] ⚠️ Failed to initialize: ${err.message}. Continuing without error tracking.`);
    Sentry = null;
  }
}

/**
 * Capture an exception in Sentry (no-op if Sentry is not initialized)
 */
export function captureException(error, context = {}) {
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  }
}

/**
 * Capture a message in Sentry (no-op if Sentry is not initialized)
 */
export function captureMessage(message, level = 'info') {
  if (Sentry) {
    Sentry.captureMessage(message, level);
  }
}

/**
 * Flush Sentry events before shutdown
 */
export async function flushSentry(timeout = 2000) {
  if (Sentry) {
    await Sentry.close(timeout);
  }
}

export default { initSentry, captureException, captureMessage, flushSentry };
