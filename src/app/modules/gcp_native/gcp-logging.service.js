import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/logging.write']
});

/**
 * Writes a structured log entry directly to Google Cloud Logging (Stackdriver).
 * 
 * @param {string} logName - Name of the log container (e.g. "alti-activity-log")
 * @param {string} message - Content of the log entry text
 * @param {string} [severity] - Logging severity: 'DEFAULT', 'DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL' (default 'INFO')
 * @param {object} [labels] - Key-value pair labels associated with the log entry
 * @returns {Promise<object>} Log write report
 */
const writeLogEntry = async (logName, message, severity = 'INFO', labels = {}) => {
  try {
    const projectId = config?.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Stackdriver Logging: Streaming entry into project "${projectId}", log "${logName}" [Severity: ${severity}]...`);

    const client = await auth.getClient();
    const endpoint = 'https://logging.googleapis.com/v2/entries:write';

    const formattedLogName = `projects/${projectId}/logs/${logName}`;

    // GCP Logging API strictly requires all label values to be strings.
    // We sanitize the labels to prevent 400 Bad Request errors when non-string values are passed.
    const sanitizedLabels = {};
    const rawLabels = {
      environment: config?.env || 'development',
      ...labels
    };

    for (const [key, value] of Object.entries(rawLabels)) {
      if (value === null || value === undefined) {
        sanitizedLabels[key] = '';
      } else if (typeof value === 'object') {
        sanitizedLabels[key] = JSON.stringify(value);
      } else {
        sanitizedLabels[key] = String(value);
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
              type: 'global'
            },
            textPayload: message,
            severity,
            labels: sanitizedLabels,
            timestamp: new Date().toISOString()
          }
        ]
      }
    });

    return {
      success: true,
      logName: formattedLogName,
      severity,
      message,
      labels: sanitizedLabels
    };
  } catch (err) {
    logger.error('Stackdriver Logging Error:', err);
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
  const message = `Billing Event [${action}] by Admin ${adminUserId} for Workspace ${workspaceId}`;
  return writeLogEntry('alti-billing-audit-log', message, 'INFO', {
    workspaceId,
    adminUserId,
    action,
    eventType: 'billing',
    ...details
  });
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
  const message = `Subscription updated to plan "${plan}" (Status: ${status}) for Workspace ${workspaceId}`;
  return writeLogEntry('alti-subscription-audit-log', message, 'NOTICE', {
    workspaceId,
    adminUserId,
    plan,
    status,
    stripeSubscriptionId,
    eventType: 'subscription',
    ...details
  });
};

/**
 * Logs workspace configuration updates (name, slug, settings).
 * 
 * @param {string} workspaceId - The ID of the workspace
 * @param {string} adminUserId - The ID of the admin performing the update
 * @param {object} [oldData] - Previous configuration
 * @param {object} [newData] - Updated configuration
 * @param {object} [details] - Additional metadata
 * @returns {Promise<object>} Log write report
 */
const logWorkspaceUpdateEvent = async (workspaceId, adminUserId, oldData = {}, newData = {}, details = {}) => {
  const message = `Workspace ${workspaceId} configuration updated by Admin ${adminUserId}`;
  return writeLogEntry('alti-workspace-audit-log', message, 'INFO', {
    workspaceId,
    adminUserId,
    oldSlug: oldData.slug || '',
    newSlug: newData.slug || '',
    oldName: oldData.name || '',
    newName: newData.name || '',
    eventType: 'workspace_update',
    ...details
  });
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
  const message = `Workspace ${workspaceId} breached limit for ${limitType} (${currentUsage}/${maxLimit})`;
  return writeLogEntry('alti-limits-audit-log', message, 'WARNING', {
    workspaceId,
    limitType,
    currentUsage: String(currentUsage),
    maxLimit: String(maxLimit),
    eventType: 'limit_breach',
    ...details
  });
};

export const GcpLoggingService = {
  writeLogEntry,
  logBillingEvent,
  logSubscriptionEvent,
  logWorkspaceUpdateEvent,
  logLimitBreachEvent
};