import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// A list of keys whose values will be redacted in logs to prevent leaking sensitive information.
// This list should be maintained and expanded as new sensitive fields are introduced.
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'apiKey', 'secret', 'clientSecret', 'credentials',
  'cardNumber', 'cvc', 'cvv', 'cardExpiry', 'authorization', 'cookie'
]);
const REDACTION_TEXT = '[REDACTED]';

/**
 * Recursively traverses an object and redacts values for keys matching the SENSITIVE_KEYS list.
 * This is a critical security measure to prevent sensitive data from being written to logs.
 * @param {any} data - The data to sanitize (object, array, or primitive).
 * @returns {any} The sanitized data.
 */
const sanitizeData = (data) => {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  // Create a new object to avoid mutating the original payload.
  const sanitized = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = REDACTION_TEXT;
      } else {
        sanitized[key] = sanitizeData(data[key]);
      }
    }
  }
  return sanitized;
};

// Use a single, memoized promise for the authenticated client to avoid re-authentication on every call.
let clientPromise = null;
const getAuthenticatedClient = () => {
  if (!clientPromise) {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/logging.write']
    });
    clientPromise = auth.getClient();
  }
  return clientPromise;
};

/**
 * Writes a structured log entry directly to Google Cloud Logging using jsonPayload.
 * This approach is preferred over textPayload for rich, queryable logs.
 *
 * @param {string} logName - Name of the log container (e.g. "alti-activity-log")
 * @param {string} severity - Logging severity: 'DEFAULT', 'DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL'
 * @param {object} payload - The structured data object to be logged. Must be JSON-serializable.
 * @param {string} [traceId] - Optional trace ID for correlating logs across services.
 * @returns {Promise<object>} Log write report
 */
const writeLogEntry = async (logName, severity = 'INFO', payload = {}, traceId) => {
  try {
    const projectId = config?.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      // For local development or environments without GCP, log to console and exit gracefully.
      // This prevents errors when GCP is not configured, making the service more resilient.
      logger.warn('GCP Project ID is not configured. Skipping Google Cloud Logging.', { logName, severity, payload, traceId });
      return { success: false, reason: 'GCP_PROJECT_ID_MISSING', details: 'GCP Project ID is not configured.' };
    }

    logger.info(`Stackdriver Logging: Streaming entry into project "${projectId}", log "${logName}" [Severity: ${severity}]...`);

    // Sanitize the payload to remove any sensitive information before logging.
    const sanitizedPayload = sanitizeData(payload);

    const client = await getAuthenticatedClient();
    const endpoint = 'https://logging.googleapis.com/v2/entries:write';
    const formattedLogName = `projects/${projectId}/logs/${logName}`;

    // GCP Logging API strictly requires all label values to be strings.
    // We promote specific, high-cardinality payload keys to labels for efficient filtering and sanitize them.
    const labels = {
      environment: config?.env || 'development'
    };

    const labelKeys = ['workspaceId', 'adminUserId', 'eventType', 'limitType', 'action', 'status', 'plan', 'entityId'];
    for (const key of labelKeys) {
      if (sanitizedPayload.hasOwnProperty(key)) {
        const value = sanitizedPayload[key];
        if (value !== null && value !== undefined) {
          // Sanitize label values to meet GCP requirements (letters, numbers, underscores, hyphens).
          // This prevents API errors from invalid characters in label values.
          labels[key] = String(value).replace(/[^\w-]/g, '_').substring(0, 1024);
        }
      }
    }

    const logEntry = {
      logName: formattedLogName,
      resource: {
        // Use a configurable resource type for better context in different GCP environments (e.g., Cloud Run, GKE).
        // 'gce_instance' or 'cloud_run_revision' are more specific and useful than 'global'.
        type: config?.google?.gcp_logging_resource_type || 'global',
        labels: config?.google?.gcp_logging_resource_labels || {}
      },
      jsonPayload: sanitizedPayload,
      severity,
      labels,
      timestamp: new Date().toISOString()
    };

    // If a traceId is provided, link this log entry to a specific trace for better observability.
    if (traceId) {
      logEntry.trace = `projects/${projectId}/traces/${traceId}`;
    }

    // The GCP API supports batching multiple entries in a single request for higher throughput.
    // For high-volume logging, consider implementing a queue to batch entries before sending.
    await client.request({
      url: endpoint,
      method: 'POST',
      data: {
        entries: [logEntry]
      }
    });

    return {
      success: true,
      logName: formattedLogName,
      severity,
      payload: sanitizedPayload // Return the sanitized payload
    };
  } catch (err) {
    const errorMessage = err.response?.data?.error?.message || err.message;
    logger.error('Stackdriver Logging Error:', {
      message: errorMessage,
      stack: err.stack,
      response: err.response?.data
    });
    // Propagate a clear error message to the caller.
    throw new Error(`Cloud Logging failed: ${errorMessage}`);
  }
};

/**
 * Logs billing and payment method updates for audit trails.
 *
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} adminUserId - The ID of the admin performing the action
 * @param {string} action - The billing action (e.g., 'payment_method_updated', 'invoice_paid')
 * @param {object} [details] - Additional metadata (e.g., invoiceId, last4 of a card). Ensure this is sanitized.
 * @param {string} [traceId] - Optional trace ID for log correlation.
 * @returns {Promise<object>} Log write report
 */
const logBillingEvent = async (workspaceId, adminUserId, action, details = {}, traceId) => {
  const payload = {
    message: `Billing Event [${action}] by Admin ${adminUserId} for Workspace ${workspaceId}`,
    workspaceId,
    adminUserId,
    action,
    eventType: 'billing',
    details
  };
  return writeLogEntry('alti-billing-audit-log', 'INFO', payload, traceId);
};

/**
 * Logs subscription changes (Stripe events, plan upgrades/downgrades).
 *
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} adminUserId - The ID of the admin or 'system' for automated events
 * @param {string} plan - The subscription plan name
 * @param {string} status - The subscription status (e.g., 'active', 'canceled')
 * @param {string} stripeSubscriptionId - Stripe subscription ID
 * @param {object} [details] - Additional metadata (e.g., price, billing cycle)
 * @param {string} [traceId] - Optional trace ID for log correlation.
 * @returns {Promise<object>} Log write report
 */
const logSubscriptionEvent = async (workspaceId, adminUserId, plan, status, stripeSubscriptionId, details = {}, traceId) => {
  const payload = {
    message: `Subscription updated to plan "${plan}" (Status: ${status}) for Workspace ${workspaceId}`,
    workspaceId,
    adminUserId,
    plan,
    status,
    stripeSubscriptionId,
    eventType: 'subscription',
    details
  };
  return writeLogEntry('alti-subscription-audit-log', 'NOTICE', payload, traceId);
};

/**
 * Logs workspace configuration updates (name, slug, settings).
 *
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} adminUserId - The ID of the admin performing the update
 * @param {object} [oldData] - Previous configuration state
 * @param {object} [newData] - Updated configuration state
 * @param {object} [details] - Additional metadata
 * @param {string} [traceId] - Optional trace ID for log correlation.
 * @returns {Promise<object>} Log write report
 */
const logWorkspaceUpdateEvent = async (workspaceId, adminUserId, oldData = {}, newData = {}, details = {}, traceId) => {
  // Generate a more descriptive message by summarizing the changes.
  const changes = Object.keys(newData).filter(key => newData[key] !== oldData[key]);
  const changeSummary = changes.length > 0 ? `fields changed: ${changes.join(', ')}` : 'no fields changed';

  const payload = {
    message: `Workspace ${workspaceId} configuration updated by Admin ${adminUserId} (${changeSummary})`,
    workspaceId,
    adminUserId,
    eventType: 'workspace_update',
    change: {
      from: oldData,
      to: newData
    },
    details
  };
  return writeLogEntry('alti-workspace-audit-log', 'INFO', payload, traceId);
};

/**
 * Logs workspace limit breaches or warnings (e.g., API limits, member limits).
 *
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} limitType - The type of limit (e.g., 'member_limit', 'api_usage')
 * @param {number} currentUsage - Current usage value
 * @param {number} maxLimit - Maximum allowed limit
 * @param {object} [details] - Additional metadata
 * @param {string} [traceId] - Optional trace ID for log correlation.
 * @returns {Promise<object>} Log write report
 */
const logLimitBreachEvent = async (workspaceId, limitType, currentUsage, maxLimit, details = {}, traceId) => {
  const payload = {
    message: `Workspace ${workspaceId} breached limit for ${limitType} (${currentUsage}/${maxLimit})`,
    workspaceId,
    limitType,
    eventType: 'limit_breach',
    usage: {
      current: currentUsage,
      limit: maxLimit
    },
    details
  };
  return writeLogEntry('alti-limits-audit-log', 'WARNING', payload, traceId);
};

/**
 * Logs security-sensitive events for auditing and threat detection.
 *
 * @param {string} adminUserId - The user associated with the event.
 * @param {string} action - The security action (e.g., 'login_failed', 'password_reset', 'permissions_changed').
 * @param {string} status - The outcome of the action ('success', 'failure').
 * @param {object} [details] - Additional context (e.g., source IP, workspaceId, targetUserId).
 * @param {string} [traceId] - Optional trace ID for log correlation.
 * @returns {Promise<object>} Log write report
 */
const logSecurityEvent = async (adminUserId, action, status, details = {}, traceId) => {
  const payload = {
    message: `Security Event: User ${adminUserId} performed action [${action}] with status [${status}]`,
    adminUserId,
    action,
    status,
    eventType: 'security',
    details
  };
  // Security events are high-importance and should be logged with a higher severity.
  const severity = status === 'failure' ? 'ERROR' : 'NOTICE';
  return writeLogEntry('alti-security-audit-log', severity, payload, traceId);
};


export const GcpLoggingService = {
  writeLogEntry,
  logBillingEvent,
  logSubscriptionEvent,
  logWorkspaceUpdateEvent,
  logLimitBreachEvent,
  logSecurityEvent
};