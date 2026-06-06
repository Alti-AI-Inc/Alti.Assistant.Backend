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

      // Scrub sensitive data from all event fields
      beforeSend(event) {
        const redactSecrets = (str) => {
          if (typeof str !== 'string') return str;
          return str
            .replace(/(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*\S+/gi, '[REDACTED]')
            .replace(/Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi, 'Bearer [REDACTED]')
            .replace(/eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g, '[REDACTED_JWT]')
            .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, '[REDACTED_MONGODB_URI]')
            .replace(/sk_live_[A-Za-z0-9]{20,}/g, '[REDACTED_STRIPE_KEY]')
            .replace(/sk_test_[A-Za-z0-9]{20,}/g, '[REDACTED_STRIPE_KEY]');
        };

        // Scrub event message
        if (event.message) {
          event.message = redactSecrets(event.message);
        }

        // Scrub extra context
        if (event.extra) {
          for (const key of Object.keys(event.extra)) {
            if (typeof event.extra[key] === 'string') {
              event.extra[key] = redactSecrets(event.extra[key]);
            }
          }
        }

        // Scrub exception frames
        if (event.exception?.values) {
          for (const exc of event.exception.values) {
            if (exc.value) exc.value = redactSecrets(exc.value);
          }
        }

        // Scrub breadcrumbs
        if (event.breadcrumbs) {
          for (const crumb of event.breadcrumbs) {
            if (crumb.message) crumb.message = redactSecrets(crumb.message);
            if (crumb.data) {
              for (const key of Object.keys(crumb.data)) {
                if (typeof crumb.data[key] === 'string') {
                  crumb.data[key] = redactSecrets(crumb.data[key]);
                }
              }
            }
          }
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
