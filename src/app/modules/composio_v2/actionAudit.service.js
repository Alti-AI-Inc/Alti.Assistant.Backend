import mongoose from 'mongoose';
import ActionAuditLog from './models/actionAuditLog.model.js';
import User from '../auth/auth.model.js'; // FIX: Import User model for role-based access control.
import { usageService } from '../usage/usage.service.js'; // FIX: Import usage service for propagating usage data.
import { logger } from '../../../shared/logger.js';

// In your ActionAuditLog model definition (e.g., actionAuditLog.model.js),
// you must add a `workspaceId` field and update indexes for optimal query performance:
//
// 1. For `getAuditLogs` (filtering by workspaceId, userId, app, status, sorting by createdAt):
//    db.actionauditlogs.createIndex({ workspaceId: 1, userId: 1, createdAt: -1 });
//    db.actionauditlogs.createIndex({ workspaceId: 1, app: 1, createdAt: -1 });
//
// 2. For `getAnalytics` (all aggregations start with workspaceId/userId and createdAt range):
//    db.actionauditlogs.createIndex({ workspaceId: 1, createdAt: 1 });
//    db.actionauditlogs.createIndex({ userId: 1, createdAt: 1 });

// OPTIMIZATION: In your User model definition (e.g., user.model.js), ensure the following
// index exists. Without it, queries for managers viewing their team's activity in
// getAuditLogs and getAnalytics will be very slow and may time out.
//
// 1. To efficiently find all users reporting to a manager:
//    db.users.createIndex({ managerId: 1 });

/**
 * @constant {Set<string>} SENSITIVE_KEYS
 * @description A set of lowercase strings representing parameter keys
 * that should be redacted from logs to prevent sensitive information leakage.
 */
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'apiKey', 'api_key',
  'authorization', 'auth', 'credential', 'ssn',
  'creditCard', 'credit_card', 'cardNumber', 'card_number',
  'cvv', 'pin', 'accessToken', 'access_token',
  'refreshToken', 'refresh_token',
]);

/**
 * @class ActionAuditService
 * @description
 * Intercepts and logs every Composio tool execution for compliance,
 * debugging, and analytics. Designed to be non-blocking — audit writes
 * are fire-and-forget so they never slow down the main execution path.
 *
 * Also provides analytics aggregations for per-user and per-app insights,
 * respecting multi-tenancy and role-based access control.
 */
class ActionAuditService {
  /**
   * Log the start of an action execution.
   * Returns the audit log entry ID for later update.
   *
   * @async
   * @param {object} params - The parameters for the action audit log entry.
   * @param {string} params.userId - The ID of the user who initiated the action.
   * @param {string} params.workspaceId - The ID of the workspace where the action is performed.
   * @param {string} params.app - The name of the application or integration.
   * @param {string} params.action - The specific action performed within the application.
   * @param {string} [params.toolName] - The human-readable name of the tool. Defaults to `${app}_${action}`.
   * @param {string} [params.toolSlug] - A unique slug for the tool.
   * @param {object} [params.parameters] - The input parameters provided to the action, will be redacted.
   * @param {object} [params.context] - Additional context for the action execution.
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
    // FIX: Enforce presence of userId and workspaceId for proper tenancy and ownership.
    if (!params.userId || !params.workspaceId) {
      logger.error('ActionAuditService.logStart called with missing userId or workspaceId.');
      return null;
    }
    try {
      // OPTIMIZATION: Use insertMany with lean: true to bypass expensive Mongoose document hydration
      const [entry] = await ActionAuditLog.insertMany([{
        userId: params.userId,
        workspaceId: params.workspaceId, // FIX: Added workspaceId for multi-tenancy.
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
      }], { lean: true });

      return entry._id.toString();
    } catch (error) {
      // Non-blocking: log error but don't throw
      logger.error('ActionAuditService.logStart failed:', error.message);
      return null;
    }
  }

  /**
   * Log the completion of an action execution.
   * This method updates an existing audit log entry.
   * It includes `userId` and `workspaceId` in the query to prevent IDOR vulnerabilities and enforce tenant boundaries.
   *
   * @async
   * @param {object} context - The context for identifying the log entry.
   * @param {string} context.auditLogId - The ID returned by `logStart`.
   * @param {string} context.userId - The ID of the user who initiated the action.
   * @param {string} context.workspaceId - The ID of the workspace for the action.
   * @param {string} context.app - The name of the application (for usage propagation).
   * @param {object} outcome - The outcome details of the action execution.
   * @param {boolean} outcome.success - True if the action completed successfully, false otherwise.
   * @param {object} [outcome.result] - The result data from the action execution. Will be summarized and redacted.
   * @param {Error} [outcome.error] - The error object if the action failed.
   * @param {number} [outcome.durationMs] - The duration of the action execution in milliseconds.
   * @param {number} [outcome.attempts] - The number of attempts made for the action.
   * @param {boolean} [outcome.retried] - True if the action was retried before completion.
   * @returns {Promise<void>}
   */
  async logComplete({ auditLogId, userId, workspaceId, app }, outcome) {
    // FIX: Enforce presence of auditLogId, userId, and workspaceId to prevent IDOR and ensure tenant isolation.
    if (!auditLogId || !userId || !workspaceId) {
      logger.warn('ActionAuditService.logComplete called with missing auditLogId, userId, or workspaceId. Skipping update.');
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
        update.result = this._redactSensitive(this._summarizeResult(outcome.result));
      } else {
        update.error = {
          message: outcome.error?.message || 'Unknown error',
          code: outcome.error?.code || outcome.error?.status,
        };
        if (outcome.retried) {
          update.status = 'retried';
        }
      }

      // FIX: Added workspaceId to the query to ensure tenant boundary is respected.
      const result = await ActionAuditLog.updateOne(
        { _id: auditLogId, userId: userId, workspaceId: workspaceId },
        { $set: update }
      );

      // FIX: Propagate usage details to the usage service upon successful action completion.
      // This addresses the requirement for usage tracking and limit enforcement.
      if (result.modifiedCount > 0 && outcome.success) {
        // Fire-and-forget call to usage service.
        usageService.recordAction({
          userId,
          workspaceId,
          app,
          durationMs: outcome.durationMs || 0,
        }).catch(err => logger.error(`Failed to propagate usage data for workspace ${workspaceId}:`, err));
      }
    } catch (error) {
      logger.error('ActionAuditService.logComplete failed:', error.message);
    }
  }

  /**
   * Log a rollback event for an action execution.
   * This method updates an existing audit log entry to 'rolled_back' status.
   * It includes `userId` and `workspaceId` in the query to prevent IDOR vulnerabilities.
   *
   * @async
   * @param {object} context - The context for identifying the log entry.
   * @param {string} context.auditLogId - The ID returned by `logStart`.
   * @param {string} context.userId - The ID of the user who initiated the action.
   * @param {string} context.workspaceId - The ID of the workspace for the action.
   * @returns {Promise<void>}
   */
  async logRollback({ auditLogId, userId, workspaceId }) {
    // FIX: Enforce presence of auditLogId, userId, and workspaceId to prevent IDOR and ensure tenant isolation.
    if (!auditLogId || !userId || !workspaceId) {
      logger.warn('ActionAuditService.logRollback called with missing auditLogId, userId, or workspaceId. Skipping update.');
      return;
    }
    try {
      // FIX: Added workspaceId to the query to ensure tenant boundary is respected.
      await ActionAuditLog.updateOne(
        { _id: auditLogId, userId: userId, workspaceId: workspaceId },
        { $set: { status: 'rolled_back' } }
      );
    } catch (error) {
      logger.error('ActionAuditService.logRollback failed:', error.message);
    }
  }

  /**
   * Get paginated audit log entries based on the authenticated user's role and permissions.
   * Enforces tenant boundaries and user hierarchy.
   *
   * **Permissions:**
   * - `user`: Can only view their own logs.
   * - `manager`: Can view their own logs and logs of users they manage within their workspace.
   * - `admin`: Can view all logs within their workspace.
   * - `super_admin`: Can view all logs across all workspaces.
   *
   * @async
   * @param {object} authUser - The authenticated user object from the request context.
   * @param {string} authUser._id - The ID of the authenticated user.
   * @param {string} authUser.workspaceId - The workspace ID of the authenticated user.
   * @param {string} authUser.role - The role of the authenticated user (e.g., 'user', 'manager', 'admin', 'super_admin').
   * @param {object} [filters={}] - Optional filters for the audit log query.
   * @param {string} [filters.userId] - Filter by a specific user ID (subject to permissions).
   * @param {string} [filters.workspaceId] - Filter by a specific workspace ID (super_admin only).
   * @param {string} [filters.app] - Filter logs by a specific application name.
   * @param {string} [filters.status] - Filter logs by a specific status (e.g., 'success', 'failed').
   * @param {number} [filters.limit=50] - The maximum number of entries to return (capped at 200).
   * @param {number} [filters.offset=0] - The number of entries to skip for pagination.
   * @param {string} [filters.since] - An ISO date string to retrieve logs created on or after this date.
   * @returns {Promise<object>} An object containing paginated audit entries and metadata.
   */
  async getAuditLogs(authUser, filters = {}) {
    try {
      const query = {};
      const limit = Math.min(parseInt(filters.limit) || 50, 200);
      const offset = parseInt(filters.offset) || 0;

      // FIX: Build query based on user role to enforce RBAC and tenancy.
      switch (authUser.role) {
        case 'user':
          query.userId = authUser._id;
          break;
        case 'manager': {
          query.workspaceId = authUser.workspaceId;
          // OPTIMIZATION: If a specific user is requested, perform a targeted check
          // instead of fetching all managed users first. This avoids a potentially slow User.find() call.
          if (filters.userId) {
            const targetUserId = new mongoose.Types.ObjectId(filters.userId);
            // A manager can view their own logs.
            if (targetUserId.equals(authUser._id)) {
              query.userId = targetUserId;
            } else {
              // Verify the target user is managed by the authenticated manager within the same workspace.
              const isManaged = await User.findOne({
                _id: targetUserId,
                managerId: authUser._id,
                workspaceId: authUser.workspaceId,
              }).lean();

              if (!isManaged) {
                return { success: false, error: 'Forbidden: You can only view logs for users you manage.', entries: [], total: 0 };
              }
              query.userId = targetUserId;
            }
          } else {
            // If no specific user, fetch all users managed by this manager.
            const managedUsers = await User.find({ managerId: authUser._id }).select('_id').lean();
            const managedUserIds = managedUsers.map(u => u._id);
            managedUserIds.push(authUser._id); // Include manager's own logs
            query.userId = { $in: managedUserIds };
          }
          break;
        }
        case 'admin':
          query.workspaceId = authUser.workspaceId;
          if (filters.userId) {
            const targetUserId = new mongoose.Types.ObjectId(filters.userId);
            // OPTIMIZATION: Verify the user belongs to the admin's workspace to fail fast
            // and avoid querying the large audit log collection unnecessarily.
            const userInWorkspace = await User.findOne({
              _id: targetUserId,
              workspaceId: authUser.workspaceId,
            }).lean();

            if (!userInWorkspace) {
              // User not found in this workspace, return empty result immediately.
              return { success: true, entries: [], total: 0, limit, offset, hasMore: false };
            }
            query.userId = targetUserId;
          }
          break;
        case 'super_admin':
          if (filters.workspaceId) {
            query.workspaceId = new mongoose.Types.ObjectId(filters.workspaceId);
          }
          if (filters.userId) {
            query.userId = new mongoose.Types.ObjectId(filters.userId);
          }
          break;
        default:
          logger.warn(`Unauthorized role trying to access audit logs: ${authUser.role}`);
          return { success: false, error: 'Forbidden', entries: [], total: 0 };
      }

      if (filters.app) query.app = filters.app;
      if (filters.status) query.status = filters.status;
      if (filters.since) {
        query.createdAt = { $gte: new Date(filters.since) };
      }

      // OPTIMIZATION: Run find and count queries in parallel.
      const [entries, total] = await Promise.all([
        ActionAuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .lean(), // OPTIMIZATION: Use .lean() for faster read-only queries.
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
      logger.error('ActionAuditService.getAuditLogs failed:', error.message);
      return { success: false, error: error.message, entries: [], total: 0 };
    }
  }

  /**
   * Get aggregated analytics based on the authenticated user's role and permissions.
   * Provides insights into status distribution, per-app breakdown, overall performance, and daily trends.
   * Enforces tenant boundaries and user hierarchy.
   *
   * **Permissions:**
   * - `user`: Can only view their own analytics.
   * - `manager`: Can view their own analytics and analytics for users they manage within their workspace.
   * - `admin`: Can view analytics for their entire workspace.
   * - `super_admin`: Can view analytics for any workspace.
   *
   * @async
   * @param {object} authUser - The authenticated user object from the request context.
   * @param {string} authUser._id - The ID of the authenticated user.
   * @param {string} authUser.workspaceId - The workspace ID of the authenticated user.
   * @param {string} authUser.role - The role of the authenticated user (e.g., 'user', 'manager', 'admin', 'super_admin').
   * @param {object} [filters={}] - Optional filters for the analytics query.
   * @param {string} [filters.userId] - Filter by a specific user ID (subject to permissions).
   * @param {string} [filters.workspaceId] - Filter by a specific workspace ID (super_admin only).
   * @param {string} [filters.window='7d'] - The time window for analytics (e.g., '24h', '7d', '30d').
   * @returns {Promise<object>} An object containing various analytics summaries.
   */
  async getAnalytics(authUser, filters = {}) {
    try {
      const window = filters.window || '7d';
      const since = this._windowToDate(window);
      const matchStage = {
        createdAt: { $gte: since },
      };

      // FIX: Build match stage based on user role to enforce RBAC and tenancy.
      switch (authUser.role) {
        case 'user':
          matchStage.userId = authUser._id;
          break;
        case 'manager': {
          matchStage.workspaceId = authUser.workspaceId;
          // OPTIMIZATION: If a specific user is requested, perform a targeted check
          // instead of fetching all managed users first. This avoids a potentially slow User.find() call.
          if (filters.userId) {
            const targetUserId = new mongoose.Types.ObjectId(filters.userId);
            // A manager can view their own analytics.
            if (targetUserId.equals(authUser._id)) {
              matchStage.userId = targetUserId;
            } else {
              // Verify the target user is managed by the authenticated manager within the same workspace.
              const isManaged = await User.findOne({
                _id: targetUserId,
                managerId: authUser._id,
                workspaceId: authUser.workspaceId,
              }).lean();

              if (!isManaged) {
                return { success: false, error: 'Forbidden: You can only view analytics for users you manage.' };
              }
              matchStage.userId = targetUserId;
            }
          } else {
            // If no specific user, fetch all users managed by this manager.
            const managedUsers = await User.find({ managerId: authUser._id }).select('_id').lean();
            const managedUserIds = managedUsers.map(u => u._id);
            managedUserIds.push(authUser._id); // Include manager's own analytics
            matchStage.userId = { $in: managedUserIds };
          }
          break;
        }
        case 'admin':
          matchStage.workspaceId = authUser.workspaceId;
          if (filters.userId) {
            const targetUserId = new mongoose.Types.ObjectId(filters.userId);
            // OPTIMIZATION: Verify the user belongs to the admin's workspace to fail fast
            // and avoid running a costly aggregation on an invalid user.
            const userInWorkspace = await User.findOne({
              _id: targetUserId,
              workspaceId: authUser.workspaceId,
            }).lean();

            if (!userInWorkspace) {
              return { success: false, error: 'User not found in this workspace.' };
            }
            matchStage.userId = targetUserId;
          }
          break;
        case 'super_admin':
          if (filters.workspaceId) {
            matchStage.workspaceId = new mongoose.Types.ObjectId(filters.workspaceId);
          }
          if (filters.userId) {
            matchStage.userId = new mongoose.Types.ObjectId(filters.userId);
          }
          break;
        default:
          logger.warn(`Unauthorized role trying to access analytics: ${authUser.role}`);
          return { success: false, error: 'Forbidden' };
      }

      // OPTIMIZATION: Use a single aggregation with $facet to compute multiple analytics in one DB trip.
      const [analyticsResult] = await ActionAuditLog.aggregate([
        { $match: matchStage },
        {
          $facet: {
            statusAgg: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            appAgg: [
              {
                $group: {
                  _id: '$app',
                  total: { $sum: 1 },
                  successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                  failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
                  avgDurationMs: { $avg: '$durationMs' },
                },
              },
              { $sort: { total: -1 } },
            ],
            performanceAgg: [
              { $match: { status: { $in: ['success', 'failed'] } } },
              {
                $group: {
                  _id: null,
                  totalActions: { $sum: 1 },
                  totalRetries: { $sum: { $cond: ['$retried', 1, 0] } },
                  avgDurationMs: { $avg: '$durationMs' },
                  p95DurationMs: { $percentile: { input: '$durationMs', p: [0.95], method: 'approximate' } },
                  successRate: { $avg: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                },
              },
            ],
            dailyAgg: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  count: { $sum: 1 },
                  successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                },
              },
              { $sort: { _id: 1 } },
              { $project: { id: '$_id', count: 1, successes: 1, _id: 0 } },
            ]
          }
        }
      ]);

      const perf = analyticsResult?.performanceAgg?.[0] || {};

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
        statusDistribution: (analyticsResult?.statusAgg || []).reduce((acc, s) => {
          acc[s._id] = s.count;
          return acc;
        }, {}),
        appBreakdown: (analyticsResult?.appAgg || []).map((a) => ({
          app: a._id,
          total: a.total,
          successes: a.successes,
          failures: a.failures,
          successRate: a.total > 0 ? Math.round((a.successes / a.total) * 100) : 0,
          avgDurationMs: Math.round(a.avgDurationMs || 0),
        })),
        dailyTrend: analyticsResult?.dailyAgg || [],
      };
    } catch (error) {
      logger.error('ActionAuditService.getAnalytics failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Recursively redacts sensitive fields from an object based on `SENSITIVE_KEYS`.
   *
   * @private
   * @param {object|Array|any} obj - The object or array to redact.
   * @returns {object|Array|any} A new object or array with sensitive fields redacted.
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
   *
   * @private
   * @param {object|any} result - The result object to summarize.
   * @returns {object|null} A summarized version of the result object.
   */
  _summarizeResult(result) {
    if (result === null || result === undefined) return null;
    if (typeof result !== 'object') return { value: result };

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
   * Converts a time window string into a Date object.
   *
   * @private
   * @param {string} window - The time window string (e.g., '24h', '7d', '30d').
   * @returns {Date} A Date object representing the start of the specified window.
   */
  _windowToDate(window) {
    const now = new Date();
    const match = window.match(/^(\d+)([hdwm])$/);
    if (!match) return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Default to 7 days

    const [, amount, unit] = match;
    const multipliers = { h: 3600000, d: 86400000, w: 604800000, m: 2592000000 };
    return new Date(now.getTime() - parseInt(amount) * (multipliers[unit] || 86400000));
  }
}

/**
 * @type {ActionAuditService}
 * @description An instance of the ActionAuditService, providing methods to log and analyze Composio tool executions.
 */
export const actionAuditService = new ActionAuditService();