import ActionAuditLog from './models/actionAuditLog.model.js';
import { logger } from '../../../shared/logger.js';

/**
 * Action Audit Service
 * 
 * Intercepts and logs every Composio tool execution for compliance,
 * debugging, and analytics. Designed to be non-blocking — audit writes
 * are fire-and-forget so they never slow down the main execution path.
 * 
 * Also provides analytics aggregations for per-user and per-app insights.
 */

// Sensitive parameter keys to redact from logs
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
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.app
   * @param {string} params.action
   * @param {Object} [params.parameters]
   * @param {Object} [params.context] - Additional context (conversationId, executionId, etc.)
   * @returns {string|null} The audit log entry ID
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
   * 
   * @param {string} auditLogId - The ID returned by logStart
   * @param {Object} outcome
   * @param {boolean} outcome.success
   * @param {Object} [outcome.result]
   * @param {Error} [outcome.error]
   * @param {number} [outcome.durationMs]
   * @param {number} [outcome.attempts]
   * @param {boolean} [outcome.retried]
   */
  async logComplete(auditLogId, outcome) {
    if (!auditLogId) return;

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

      await ActionAuditLog.updateOne({ _id: auditLogId }, { $set: update });
    } catch (error) {
      logger.error('ActionAuditService.logComplete failed:', error.message);
    }
  }

  /**
   * Log a rollback event.
   */
  async logRollback(auditLogId) {
    if (!auditLogId) return;
    try {
      await ActionAuditLog.updateOne(
        { _id: auditLogId },
        { $set: { status: 'rolled_back' } }
      );
    } catch (error) {
      logger.error('ActionAuditService.logRollback failed:', error.message);
    }
  }

  /**
   * Get audit log entries for a user.
   * 
   * @param {string} userId
   * @param {Object} [filters]
   * @param {string} [filters.app]
   * @param {string} [filters.status]
   * @param {number} [filters.limit=50]
   * @param {number} [filters.offset=0]
   * @param {string} [filters.since] - ISO date string
   * @returns {Object} Paginated audit entries
   */
  async getUserAuditLog(userId, filters = {}) {
    try {
      const query = { userId };

      if (filters.app) query.app = filters.app;
      if (filters.status) query.status = filters.status;
      if (filters.since) {
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
   * 
   * @param {string} userId
   * @param {string} [window='7d'] - Time window
   * @returns {Object} Analytics summary
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
   * Redact sensitive fields from an object.
   * @private
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
   * Summarize a result object to avoid storing massive payloads.
   * @private
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
   * Convert a window string to a Date.
   * @private
   */
  _windowToDate(window) {
    const now = new Date();
    const match = window.match(/^(\d+)([hdwm])$/);
    if (!match) return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [, amount, unit] = match;
    const multipliers = { h: 3600000, d: 86400000, w: 604800000, m: 2592000000 };
    return new Date(now.getTime() - parseInt(amount) * (multipliers[unit] || 86400000));
  }
}

export const actionAuditService = new ActionAuditService();
