import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

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
 * @returns {Promise<object>} Log write report
 */
const writeLogEntry = async (logName, severity = 'INFO', payload = {}) => {
  try {
    const projectId = config?.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      // For local development or environments without GCP, log to console and exit gracefully.
      // This prevents errors when GCP is not configured, making the service more resilient.
      logger.warn('GCP Project ID is not configured. Skipping Google Cloud Logging.', { logName, severity, payload });
      return { success: false, reason: 'GCP_PROJECT_ID_MISSING', details: 'GCP Project ID is not configured.' };
    }

    logger.info(`Stackdriver Logging: Streaming entry into project "${projectId}", log "${logName}" [Severity: ${severity}]...`);

    const client = await getAuthenticatedClient();
    const endpoint = 'https://logging.googleapis.com/v2/entries:write';
    const formattedLogName = `projects/${projectId}/logs/${logName}`;

    // GCP Logging API strictly requires all label values to be strings.
    // We promote specific, high-cardinality payload keys to labels for efficient filtering and sanitize them.
    const labels = {
      environment: config?.env || 'development'
    };
    
    const labelKeys = ['workspaceId', 'adminUserId', 'eventType', 'limitType', 'action', 'status', 'plan'];
    for (const key of labelKeys) {
      if (payload.hasOwnProperty(key)) {
        const value = payload[key];
        if (value === null || value === undefined) {
          labels[key] = '';
        } else {
          // Objects in labels are not useful; stringify them if necessary, though primitive values are preferred.
          labels[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
        }
      }
    }

    await client.request({
      url: endpoint,
      method: 'POST',
      data: {
        entries: [
          {
            logName: formattedLogName,
            resource: {
              // Using 'global' is a safe default. If running in a specific GCP environment (e.g., Cloud Run),
              // this could be dynamically set to a more specific resource type for better context.
              type: 'global'
            },
            jsonPayload: payload, // Use the full object as the JSON payload for rich, structured logging.
            severity,
            labels,
            timestamp: new Date().toISOString()
          }
        ]
      }
    });

    return {
      success: true,
      logName: formattedLogName,
      severity,
      payload
    };
  } catch (err) {
    // Log the detailed error but throw a more generic one to the caller.
    logger.error('Stackdriver Logging Error:', {
      message: err.message,
      stack: err.stack,
      response: err.response?.data
    });
    throw new Error(`Cloud Logging failed: ${err.message}`);
  }
};

/**
 * Logs billing and payment method updates for audit trails.
 * 
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} adminUserId - The ID of the admin performing the action
 * @param {string} action - The billing action (e.g., 'payment_method_updated', 'invoice_paid')
 * @param {object} [details] - Additional metadata
 * @returns {Promise<object>} Log write report
 */
const logBillingEvent = async (workspaceId, adminUserId, action, details = {}) => {
  const payload = {
    message: `Billing Event [${action}] by Admin ${adminUserId} for Workspace ${workspaceId}`,
    workspaceId,
    adminUserId,
    action,
    eventType: 'billing',
    details
  };
  return writeLogEntry('alti-billing-audit-log', 'INFO', payload);
};

/**
 * Logs subscription changes (Stripe events, plan upgrades/downgrades).
 * 
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} adminUserId - The ID of the admin or system trigger
 * @param {string} plan - The subscription plan name
 * @param {string} status - The subscription status (e.g., 'active', 'canceled')
 * @param {string} stripeSubscriptionId - Stripe subscription ID
 * @param {object} [details] - Additional metadata (e.g., price, billing cycle)
 * @returns {Promise<object>} Log write report
 */
const logSubscriptionEvent = async (workspaceId, adminUserId, plan, status, stripeSubscriptionId, details = {}) => {
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
  return writeLogEntry('alti-subscription-audit-log', 'NOTICE', payload);
};

/**
 * Logs workspace configuration updates (name, slug, settings).
 * 
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} adminUserId - The ID of the admin performing the update
 * @param {object} [oldData] - Previous configuration state
 * @param {object} [newData] - Updated configuration state
 * @param {object} [details] - Additional metadata
 * @returns {Promise<object>} Log write report
 */
const logWorkspaceUpdateEvent = async (workspaceId, adminUserId, oldData = {}, newData = {}, details = {}) => {
  const payload = {
    message: `Workspace ${workspaceId} configuration updated by Admin ${adminUserId}`,
    workspaceId,
    adminUserId,
    eventType: 'workspace_update',
    change: {
      from: oldData,
      to: newData
    },
    details
  };
  return writeLogEntry('alti-workspace-audit-log', 'INFO', payload);
};

/**
 * Logs workspace limit breaches or warnings (e.g., API limits, member limits).
 * 
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} limitType - The type of limit (e.g., 'member_limit', 'api_usage')
 * @param {number} currentUsage - Current usage value
 * @param {number} maxLimit - Maximum allowed limit
 * @param {object} [details] - Additional metadata
 * @returns {Promise<object>} Log write report
 */
const logLimitBreachEvent = async (workspaceId, limitType, currentUsage, maxLimit, details = {}) => {
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
  return writeLogEntry('alti-limits-audit-log', 'WARNING', payload);
};

export const GcpLoggingService = {
  writeLogEntry,
  logBillingEvent,
  logSubscriptionEvent,
  logWorkspaceUpdateEvent,
  logLimitBreachEvent
};