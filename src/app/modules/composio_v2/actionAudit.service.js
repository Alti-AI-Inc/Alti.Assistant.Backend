import ActionAuditLog from './models/actionAuditLog.model.js';
import { logger } from '../../../shared/logger.js';

// In your ActionAuditLog model definition (e.g., actionAuditLog.model.js),
// consider adding the following indexes for optimal query and aggregation performance:

// 1. For `getUserAuditLog` (filtering by userId, optional app/status, sorting by createdAt):
//    db.actionauditlogs.createIndex({ userId: 1, createdAt: -1 });
//    If 'app' is frequently filtered alongside userId:
//    db.actionauditlogs.createIndex({ userId: 1, app: 1, createdAt: -1 });
//    If 'status' is frequently filtered alongside userId:
//    db.actionauditlogs.createIndex({ userId: 1, status: 1, createdAt: -1 });

// 2. For `getUserAnalytics` (all aggregations start with userId and createdAt range):
//    db.actionauditlogs.createIndex({ userId: 1, createdAt: 1 });

/**
 * Action Audit Service
 *
 * Intercepts and logs every Composio tool execution for compliance,
 * debugging, and analytics. Designed to be non-blocking — audit writes
 * are fire-and-forget so they never slow down the main execution path.
 *
 * Also provides analytics aggregations for per-user and per-app insights.
 */

/**
 * @constant {Set<string>} SENSITIVE_KEYS - A set of lowercase strings representing parameter keys
 * that should be redacted from logs to prevent sensitive information leakage.
 */
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'apiKey', 'api_key',
  'authorization', 'auth', 'credential', 'ssn',
  'creditCard', 'credit_card', 'cardNumber', 'card_number',
  'cvv', 'pin', 'accessToken', 'access_token',
  'refreshToken', 'refresh_token',
]);

class ActionAuditService {
  /**
   * Log the start of an action execution.
   * Returns the audit log ID for later update.
   *
   * @async
   * @param {Object} params - The parameters for the action audit log entry.
   * @param {string} params.userId - The ID of the user who initiated the action.
   * @param {string} params.app - The name of the application or integration.
   * @param {string} params.action - The specific action performed within the application.
   * @param {string} [params.toolName] - The human-readable name of the tool. Defaults to `${app}_${action}`.
   * @param {string} [params.toolSlug] - A unique slug for the tool.
   * @param {Object} [params.parameters] - The input parameters provided to the action, will be redacted.
   * @param {Object} [params.context] - Additional context for the action execution.
   * @param {string} [params.context.conversationId] - The ID of the conversation this action belongs to.
   * @param {string} [params.context.executionId] - The ID of the overall execution flow.
   * @param {string} [params.context.workflowType] - The type of workflow (e.g., 'agent', 'manual').
   * @param {number} [params.context.confidence] - The confidence score of the AI classification.
   * @param {string} [params.context.classifiedBy] - The entity that classified the action (e.g., 'ai_classification', 'user').
   * @param {number} [params.context.stepIndex] - The current step index in a multi-step workflow.
   * @param {number} [params.context.totalSteps] - The total number of steps in a multi-step workflow.
   * @param {string} [params.context.stepId] - A unique identifier for the current step.
   * @returns {Promise<string|null>} The audit log entry ID if successful, otherwise `null`.
   */
  async logStart(params) {
    try {
      const entry = await ActionAuditLog.create({
        userId: params.userId,
        app: params.app,
        action: params.action,
        toolName: params.toolName || `${params.app}_${params.action}`,
        toolSlug: params.toolSlug,
        parameters: this._redactSensitive(params.parameters || {}),
        status: 'executing',
        conversationId: params.context?.conversationId,
        executionId: params.context?.executionId,
        workflowType: params.context?.workflowType,
        confidence: params.context?.confidence,
        classifiedBy: params.context?.classifiedBy || 'ai_classification',
        stepIndex: params.context?.stepIndex,
        totalSteps: params.context?.totalSteps,
        stepId: params.context?.stepId,
        redacted: true, // Parameters are always redacted
      });

      return entry._id.toString();
    } catch (error) {
      // Non-blocking: log error but don't throw
      logger.error('ActionAuditService.logStart failed:', error.message);
      return null;
    }
  }

  /**
   * Log the completion of an action execution.
   * This method updates an existing audit log entry identified by `auditLogId`.
   * It includes `userId` in the query to prevent Insecure Direct Object Reference (IDOR) vulnerabilities.
   *
   * @async
   * @param {string} auditLogId - The ID returned by `logStart` for the audit log entry to update.
   * @param {string} userId - The ID of the user who initiated the action. Required for ownership verification.
   * @param {Object} outcome - The outcome details of the action execution.
   * @param {boolean} outcome.success - True if the action completed successfully, false otherwise.
   * @param {Object} [outcome.result] - The result data from the action execution. Will be summarized and redacted.
   * @param {Error} [outcome.error] - The error object if the action failed.
   * @param {string} [outcome.error.message] - The error message.
   * @param {string|number} [outcome.error.code] - The error code or status.
   * @param {number} [outcome.durationMs] - The duration of the action execution in milliseconds.
   * @param {number} [outcome.attempts] - The number of attempts made for the action.
   * @param {boolean} [outcome.retried] - True if the action was retried before completion.
   * @returns {Promise<void>}
   */
  async logComplete(auditLogId, userId, outcome) { // Added userId parameter for ownership verification
    // Ensure both auditLogId and userId are provided to prevent IDOR (Insecure Direct Object Reference)
    // by ensuring the update operation is scoped to the correct user.
    if (!auditLogId || !userId) {
      logger.warn('ActionAuditService.logComplete called with missing auditLogId or userId. Skipping update.');
      return;
    }

    try {
      const update = {
        status: outcome.success ? 'success' : 'failed',
        durationMs: outcome.durationMs || 0,
        attempts: outcome.attempts || 1,
        retried: outcome.retried || false,
      };

      if (outcome.success) {
        // Redact the result to avoid storing sensitive response data
        update.result = this._redactSensitive(
          this._summarizeResult(outcome.result)
        );
      } else {
        update.error = {
          message: outcome.error?.message || 'Unknown error',
          code: outcome.error?.code || outcome.error?.status,
        };
        if (outcome.retried) {
          update.status = 'retried';
        }
      }

      // Include userId in the query to ensure only the owner of the log entry can update it.
      await ActionAuditLog.updateOne({ _id: auditLogId, userId: userId }, { $set: update });
    } catch (error) {
      logger.error('ActionAuditService.logComplete failed:', error.message);
    }
  }

  /**
   * Log a rollback event for an action execution.
   * This method updates an existing audit log entry identified by `auditLogId` to 'rolled_back' status.
   * It includes `userId` in the query to prevent Insecure Direct Object Reference (IDOR) vulnerabilities.
   *
   * @async
   * @param {string} auditLogId - The ID returned by `logStart` for the audit log entry to update.
   * @param {string} userId - The ID of the user who initiated the action. Required for ownership verification.
   * @returns {Promise<void>}
   */
  async logRollback(auditLogId, userId) { // Added userId parameter for ownership verification
    // Ensure both auditLogId and userId are provided to prevent IDOR (Insecure Direct Object Reference)
    // by ensuring the update operation is scoped to the correct user.
    if (!auditLogId || !userId) {
      logger.warn('ActionAuditService.logRollback called with missing auditLogId or userId. Skipping update.');
      return;
    }
    try {
      // Include userId in the query to ensure only the owner of the log entry can update it.
      await ActionAuditLog.updateOne(
        { _id: auditLogId, userId: userId },
        { $set: { status: 'rolled_back' } }
      );
    } catch (error) {
      logger.error('ActionAuditService.logRollback failed:', error.message);
    }
  }

  /**
   * Get paginated audit log entries for a specific user.
   *
   * @async
   * @param {string} userId - The ID of the user whose audit logs are to be retrieved.
   * @param {Object} [filters={}] - Optional filters for the audit log query.
   * @param {string} [filters.app] - Filter logs by a specific application name.
   * @param {string} [filters.status] - Filter logs by a specific status (e.g., 'success', 'failed', 'executing').
   * @param {number} [filters.limit=50] - The maximum number of entries to return (capped at 200).
   * @param {number} [filters.offset=0] - The number of entries to skip for pagination.
   * @param {string} [filters.since] - An ISO date string to retrieve logs created on or after this date.
   * @returns {Promise<Object>} An object containing paginated audit entries and metadata.
   * @returns {boolean} return.success - True if the operation was successful, false otherwise.
   * @returns {Array<Object>} return.entries - An array of audit log entries.
   * @returns {number} return.total - The total number of entries matching the query without pagination.
   * @returns {number} return.limit - The actual limit applied to the query.
   * @returns {number} return.offset - The actual offset applied to the query.
   * @returns {boolean} return.hasMore - True if there are more entries available beyond the current limit/offset.
   * @returns {string} [return.error] - Error message if the operation failed.
   */
  async getUserAuditLog(userId, filters = {}) {
    try {
      const query = { userId };

      if (filters.app) query.app = filters.app;
      if (filters.status) query.status = filters.status;
      if (filters.since) {
        // Attempt to parse the date. If invalid, it will result in an "Invalid Date" object,
        // which MongoDB typically handles by not matching any documents, preventing errors.
        query.createdAt = { $gte: new Date(filters.since) };
      }

      const limit = Math.min(parseInt(filters.limit) || 50, 200);
      const offset = parseInt(filters.offset) || 0;

      const [entries, total] = await Promise.all([
        ActionAuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .lean(),
        ActionAuditLog.countDocuments(query),
      ]);

      return {
        success: true,
        entries,
        total,
        limit,
        offset,
        hasMore: offset + entries.length < total,
      };
    } catch (error) {
      logger.error('ActionAuditService.getUserAuditLog failed:', error.message);
      return { success: false, error: error.message, entries: [], total: 0 };
    }
  }

  /**
   * Get aggregated analytics for a user's action history.
   * Provides insights into status distribution, per-app breakdown, overall performance, and daily trends.
   *
   * @async
   * @param {string} userId - The ID of the user for whom to retrieve analytics.
   * @param {string} [window='7d'] - The time window for analytics (e.g., '24h', '7d', '30d', '1w', '1m').
   * @returns {Promise<Object>} An object containing various analytics summaries.
   * @returns {boolean} return.success - True if the operation was successful, false otherwise.
   * @returns {string} return.window - The time window used for the analytics.
   * @returns {string} return.since - The ISO date string representing the start of the analytics window.
   * @returns {Object} return.performance - Overall performance metrics.
   * @returns {number} return.performance.totalActions - Total number of actions within the window.
   * @returns {number} return.performance.totalRetries - Total number of retried actions.
   * @returns {number} return.performance.avgDurationMs - Average duration of actions in milliseconds.
   * @returns {number} return.performance.p95DurationMs - 95th percentile duration of actions in milliseconds.
   * @returns {number} return.performance.successRate - Overall success rate as a percentage.
   * @returns {Object<string, number>} return.statusDistribution - Count of actions by status (e.g., { success: 10, failed: 2 }).
   * @returns {Array<Object>} return.appBreakdown - Breakdown of actions per application.
   * @returns {string} return.appBreakdown[].app - The application name.
   * @returns {number} return.appBreakdown[].total - Total actions for this app.
   * @returns {number} return.appBreakdown[].successes - Successful actions for this app.
   * @returns {number} return.appBreakdown[].failures - Failed actions for this app.
   * @returns {number} return.appBreakdown[].successRate - Success rate for this app as a percentage.
   * @returns {number} return.appBreakdown[].avgDurationMs - Average duration for this app's actions.
   * @returns {Array<Object>} return.dailyTrend - Daily count of actions and successes.
   * @returns {string} return.dailyTrend[].id - Date in 'YYYY-MM-DD' format.
   * @returns {number} return.dailyTrend[].count - Total actions on this date.
   * @returns {number} return.dailyTrend[].successes - Successful actions on this date.
   * @returns {string} [return.error] - Error message if the operation failed.
   */
  async getUserAnalytics(userId, window = '7d') {
    try {
      const since = this._windowToDate(window);
      const matchStage = {
        userId: userId,
        createdAt: { $gte: since },
      };

      const [statusAgg, appAgg, performanceAgg, dailyAgg] = await Promise.all([
        // Status distribution
        ActionAuditLog.aggregate([
          { $match: matchStage },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),

        // Per-app breakdown
        ActionAuditLog.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: '$app',
              total: { $sum: 1 },
              successes: {
                $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
              },
              failures: {
                $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
              },
              avgDurationMs: { $avg: '$durationMs' },
            },
          },
          { $sort: { total: -1 } },
        ]),

        // Overall performance metrics
        ActionAuditLog.aggregate([
          { $match: { ...matchStage, status: { $in: ['success', 'failed'] } } },
          {
            $group: {
              _id: null,
              totalActions: { $sum: 1 },
              totalRetries: { $sum: { $cond: ['$retried', 1, 0] } },
              avgDurationMs: { $avg: '$durationMs' },
              // $percentile operator requires MongoDB 5.0 or later.
              p95DurationMs: { $percentile: { input: '$durationMs', p: [0.95], method: 'approximate' } },
              successRate: {
                $avg: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
              },
            },
          },
        ]),

        // Daily trend
        ActionAuditLog.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              count: { $sum: 1 },
              successes: {
                $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      const perf = performanceAgg[0] || {};

      return {
        success: true,
        window,
        since: since.toISOString(),
        performance: {
          totalActions: perf.totalActions || 0,
          totalRetries: perf.totalRetries || 0,
          avgDurationMs: Math.round(perf.avgDurationMs || 0),
          p95DurationMs: Math.round(perf.p95DurationMs?.[0] || 0),
          successRate: Math.round((perf.successRate || 0) * 100),
        },
        statusDistribution: statusAgg.reduce((acc, s) => {
          acc[s._id] = s.count;
          return acc;
        }, {}),
        appBreakdown: appAgg.map((a) => ({
          app: a._id,
          total: a.total,
          successes: a.successes,
          failures: a.failures,
          successRate: Math.round((a.successes / a.total) * 100),
          avgDurationMs: Math.round(a.avgDurationMs),
        })),
        dailyTrend: dailyAgg,
      };
    } catch (error) {
      logger.error('ActionAuditService.getUserAnalytics failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Recursively redacts sensitive fields from an object based on `SENSITIVE_KEYS`.
   * If a key matches a sensitive key, its value is replaced with '[REDACTED]'.
   *
   * @private
   * @param {Object|Array|any} obj - The object or array to redact.
   * @returns {Object|Array|any} A new object or array with sensitive fields redacted.
   */
  _redactSensitive(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const redacted = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this._redactSensitive(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  /**
   * Summarizes a result object to avoid storing massive payloads in the audit log.
   * Truncates long strings, and replaces arrays/objects with summary strings.
   *
   * @private
   * @param {Object|any} result - The result object to summarize.
   * @returns {Object|null} A summarized version of the result object, or null if input is null/undefined.
   */
  _summarizeResult(result) {
    if (!result) return null;
    if (typeof result !== 'object') return { value: result };

    // Keep only top-level keys with summarized values
    const summary = {};
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && value.length > 500) {
        summary[key] = value.substring(0, 500) + '...[truncated]';
      } else if (Array.isArray(value)) {
        summary[key] = `[Array: ${value.length} items]`;
      } else if (typeof value === 'object' && value !== null) {
        summary[key] = `[Object: ${Object.keys(value).length} keys]`;
      } else {
        summary[key] = value;
      }
    }
    return summary;
  }

  /**
   * Converts a time window string (e.g., '24h', '7d', '30d', '1w', '1m') into a Date object
   * representing the start of that window relative to the current time.
   * Defaults to 7 days if the format is invalid.
   *
   * @private
   * @param {string} window - The time window string.
   * @returns {Date} A Date object representing the start of the specified window.
   */
  _windowToDate(window) {
    const now = new Date();
    const match = window.match(/^(\d+)([hdwm])$/);
    if (!match) return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Default to 7 days if format is invalid

    const [, amount, unit] = match;
    const multipliers = { h: 3600000, d: 86400000, w: 604800000, m: 2592000000 }; // Milliseconds in hour, day, week, 30-day month
    return new Date(now.getTime() - parseInt(amount) * (multipliers[unit] || 86400000)); // Fallback to 1 day multiplier if unit is unknown
  }
}

/**
 * @type {ActionAuditService}
 * @description An instance of the ActionAuditService, providing methods to log and analyze Composio tool executions.
 */
export const actionAuditService = new ActionAuditService();