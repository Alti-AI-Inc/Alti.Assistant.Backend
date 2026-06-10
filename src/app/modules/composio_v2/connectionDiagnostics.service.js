/**
 * @file This service provides comprehensive connection diagnostics and rate limit prediction
 *       for user interactions with various applications, based on `ActionAuditLog` data.
 *       It aggregates performance metrics, identifies error trends, and forecasts
 *       potential rate limit breaches.
 *
 * Database Indexing Recommendations for ActionAuditLog model:
 * To significantly optimize database query performance in this service,
 * consider adding the following indexes to your ActionAuditLog Mongoose schema:
 *
 * 1. For general user-specific time-series queries (e.g., in getConnectionDiagnostics):
 *    schema.index({ userId: 1, createdAt: 1 });
 *    This index will accelerate queries filtering by `userId` and `createdAt` range.
 *
 * 2. For specific app diagnostics (e.g., in getSingleConnectionDiagnostics),
 *    which filters by `userId`, `app`, and sorts by `createdAt` descending:
 *    schema.index({ userId: 1, app: 1, createdAt: -1 });
 *    This compound index will efficiently cover the filtering and sorting for this specific query.
 *
 * 3. To further optimize error statistics queries that also filter by `status`:
 *    schema.index({ userId: 1, createdAt: 1, status: 1 });
 *    This index will improve performance for aggregations involving `userId`, `createdAt`, and `status`.
 */
import ActionAuditLog from './models/actionAuditLog.model.js';
import { logger } from '../../../shared/logger.js';

/**
 * Connection Diagnostics & Rate Limit Prediction Service
 *
 * This service provides methods to analyze user connection performance,
 * identify issues, and predict potential rate limiting based on historical
 * `ActionAuditLog` data.
 */
class ConnectionDiagnosticsService {
  /**
   * Runs a full diagnostic report for a user's connections across all applications.
   * Supports workspace-level diagnostics by accepting an array of user IDs.
   * It aggregates general performance statistics, app-specific health, error distributions,
   * and forecasts rate limit usage based on recent activity trends.
   *
   * @param {string|string[]} userId The ID of the user or an array of user IDs (e.g., workspace members) for whom to run diagnostics.
   * @returns {Promise<Object>} A promise that resolves to a comprehensive diagnostics report.
   * @property {boolean} success - Indicates if the diagnostics report was generated successfully.
   * @property {Object} diagnostics - The main diagnostics object.
   * @property {string} diagnostics.status - Overall health status ('healthy', 'warning', 'critical').
   * @property {string[]} diagnostics.warnings - A list of warning messages if any issues are detected.
   * @property {Object} diagnostics.performanceSummary - Summary of overall performance.
   * @property {number} diagnostics.performanceSummary.totalActions24h - Total actions in the last 24 hours.
   * @property {number} diagnostics.performanceSummary.successRate24h - Success rate percentage in the last 24 hours.
   * @property {number} diagnostics.performanceSummary.avgLatencyMs - Average latency in milliseconds for actions in the last 24 hours.
   * @property {Object} diagnostics.rateLimiting - Information regarding rate limit usage and prediction.
   * @property {number} diagnostics.rateLimiting.hourlyLimit - The defined hourly action limit.
   * @property {number} diagnostics.rateLimiting.dailyLimit - The defined daily action limit.
   * @property {number} diagnostics.rateLimiting.currentHourCount - Total actions in the current hour.
   * @property {number} diagnostics.rateLimiting.hourlyUsagePercent - Percentage of hourly limit used.
   * @property {number} diagnostics.rateLimiting.dailyUsagePercent - Percentage of daily limit used.
   * @property {Object} diagnostics.rateLimiting.forecast - Predicted future rate limit usage.
   * @property {number} diagnostics.rateLimiting.forecast.predictedNextHourCount - Predicted actions in the next hour.
   * @property {number} diagnostics.rateLimiting.forecast.predictedUsagePercent - Predicted percentage of hourly limit to be used in the next hour.
   * @property {number} diagnostics.rateLimiting.forecast.accelerationFactor - Factor indicating acceleration/deceleration of activity.
   * @property {Array<Object>} diagnostics.appDiagnostics - An array of diagnostic reports for each connected application.
   * @property {string} diagnostics.appDiagnostics[].app - The name of the application.
   * @property {number} diagnostics.appDiagnostics[].totalActions24h - Total actions for this app in the last 24 hours.
   * @property {number} diagnostics.appDiagnostics[].successRate - Success rate percentage for this app.
   * @property {number} diagnostics.appDiagnostics[].avgLatencyMs - Average latency in milliseconds for this app.
   * @property {string} diagnostics.appDiagnostics[].status - Health status for this specific app ('healthy', 'degraded').
   * @property {Array<Object>} diagnostics.errorDistribution - A list of top error messages and their counts across all apps.
   * @property {string} diagnostics.errorDistribution[].app - The application associated with the error.
   * @property {string} diagnostics.errorDistribution[].error - The error message.
   * @property {number} diagnostics.errorDistribution[].count - The number of occurrences of this error.
   * @throws {Error} If an error occurs during the aggregation or processing of diagnostics.
   */
  async getConnectionDiagnostics(userId) {
    try {
      const now = new Date();
      const pastHour = new Date(now.getTime() - 60 * 60 * 1000);
      const pastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // 1. Fetch action logs in past 24h (supports single user or array of workspace users)
      const matchStage = {
        userId: Array.isArray(userId) ? { $in: userId } : userId,
        createdAt: { $gte: pastDay }
      };

      const [generalStats, appStats, errorStats, intervalStats] = await Promise.all([
        // General action stats
        ActionAuditLog.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              total24h: { $sum: 1 },
              successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
              failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
              totalDurationMs: { $sum: '$durationMs' },
              avgDurationMs: { $avg: '$durationMs' }
            }
          }
        ]),

        // Stats grouped by app
        ActionAuditLog.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: '$app',
              total: { $sum: 1 },
              successes: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
              failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
              avgDurationMs: { $avg: '$durationMs' }
            }
          }
        ]),

        // Error distributions
        ActionAuditLog.aggregate([
          { $match: { ...matchStage, status: 'failed' } },
          {
            $group: {
              _id: { app: '$app', errorMsg: '$error.message' },
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),

        // 10-minute intervals over the past hour for trend analysis
        // Fix: Group by actual 10-minute timestamp intervals, not just the minute component,
        // to correctly represent trends within the past hour.
        ActionAuditLog.aggregate([
          { 
            $match: { 
              userId: Array.isArray(userId) ? { $in: userId } : userId, 
              createdAt: { $gte: pastHour } 
            } 
          },
          {
            $group: {
              _id: {
                // Convert createdAt to milliseconds, then truncate to the nearest 10-minute interval start
                $subtract: [
                  { $toLong: '$createdAt' },
                  { $mod: [{ $toLong: '$createdAt' }, 10 * 60 * 1000] } // 10 minutes in milliseconds
                ]
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id': 1 } } // Sort by interval start timestamp
        ])
      ]);

      const stats = generalStats[0] || { total24h: 0, successes: 0, failures: 0, avgDurationMs: 0 };
      const successRate = stats.total24h > 0 ? (stats.successes / stats.total24h) * 100 : 100;

      // 2. Rate limiting predictive capacity forecast
      // Count actions in the last 1 hour
      const totalPastHour = await ActionAuditLog.countDocuments({
        userId: Array.isArray(userId) ? { $in: userId } : userId,
        createdAt: { $gte: pastHour }
      });

      // Calculate trend and acceleration
      const buckets = Array(6).fill(0); // Represents 6 x 10-minute intervals over the past hour
      const intervalMs = 10 * 60 * 1000; // 10 minutes in milliseconds
      const pastHourMs = pastHour.getTime(); // Start timestamp of the 1-hour window

      // Map aggregation results to the correct bucket index based on their timestamp
      intervalStats.forEach(bucket => {
        // bucket._id is the start timestamp (milliseconds) of the 10-minute interval
        const diffMs = bucket._id - pastHourMs;
        const index = Math.floor(diffMs / intervalMs);
        if (index >= 0 && index < 6) { // Ensure index is within the 0-5 range for the 6 buckets
          buckets[index] = bucket.count;
        }
      });

      // Let's check if rate is increasing
      const firstHalf = buckets.slice(0, 3).reduce((a, b) => a + b, 0); // First 30 minutes
      const secondHalf = buckets.slice(3, 6).reduce((a, b) => a + b, 0); // Last 30 minutes
      let accelerationFactor = 0;
      if (firstHalf > 0) {
        accelerationFactor = (secondHalf - firstHalf) / firstHalf;
      }

      // Predicted actions next hour based on current velocity and acceleration
      const predictedNextHour = Math.max(0, Math.round(totalPastHour * (1 + Math.max(-0.5, Math.min(2, accelerationFactor)))));

      // Quotas (standard soft limits)
      const HOURLY_LIMIT = 120;
      const DAILY_LIMIT = 1000;

      const hourlyQuotaUsedPercent = (totalPastHour / HOURLY_LIMIT) * 100;
      const dailyQuotaUsedPercent = (stats.total24h / DAILY_LIMIT) * 100;
      const predictedQuotaUsedPercent = (predictedNextHour / HOURLY_LIMIT) * 100;

      let status = 'healthy';
      const warnings = [];

      if (hourlyQuotaUsedPercent >= 80 || dailyQuotaUsedPercent >= 80) {
        status = 'critical';
        warnings.push('Active API usage has reached critical quota levels. Impending rate limits expected.');
      } else if (predictedQuotaUsedPercent >= 75) {
        status = 'warning';
        warnings.push('Accelerating tool executions are projected to breach hourly quotas soon.');
      } else if (successRate < 70 && stats.total24h > 5) {
        status = 'warning';
        warnings.push('High failure rates detected on current tool connections.');
      }

      // Build error distribution list
      const errorDistribution = errorStats.map(e => ({
        app: e._id.app,
        error: e._id.errorMsg || 'Unknown connection error',
        count: e.count
      }));

      // App health profiles
      const appDiagnostics = appStats.map(app => {
        const rate = app.total > 0 ? (app.successes / app.total) * 100 : 100;
        let appStatus = 'healthy';
        if (rate < 70 && app.total > 2) {
          appStatus = 'degraded';
        }
        return {
          app: app._id,
          totalActions24h: app.total,
          successRate: Math.round(rate),
          avgLatencyMs: Math.round(app.avgDurationMs),
          status: appStatus
        };
      });

      return {
        success: true,
        diagnostics: {
          status,
          warnings,
          performanceSummary: {
            totalActions24h: stats.total24h,
            successRate24h: Math.round(successRate),
            avgLatencyMs: Math.round(stats.avgDurationMs)
          },
          rateLimiting: {
            hourlyLimit: HOURLY_LIMIT,
            dailyLimit: DAILY_LIMIT,
            currentHourCount: totalPastHour,
            hourlyUsagePercent: Math.round(hourlyQuotaUsedPercent),
            dailyUsagePercent: Math.round(dailyQuotaUsedPercent),
            forecast: {
              predictedNextHourCount: predictedNextHour,
              predictedUsagePercent: Math.round(predictedQuotaUsedPercent),
              accelerationFactor: parseFloat(accelerationFactor.toFixed(2))
            }
          },
          appDiagnostics,
          errorDistribution
        }
      };
    } catch (error) {
      logger.error('ConnectionDiagnosticsService.getConnectionDiagnostics failed:', error);
      throw error;
    }
  }

  /**
   * Runs detailed diagnostics for a specific application connection for a given user or workspace.
   * It fetches recent logs, calculates app-specific performance metrics,
   * identifies top errors, and provides recommendations.
   *
   * @param {string|string[]} userId The ID of the user or an array of user IDs.
   * @param {string} app The name of the application to diagnose.
   * @returns {Promise<Object>} A promise that resolves to an app-specific diagnostics report.
   * @property {boolean} success - Indicates if the diagnostics report was generated successfully.
   * @property {string} app - The name of the application diagnosed.
   * @property {Object} diagnostics - The app-specific diagnostics object.
   * @property {string} diagnostics.status - Health status for this specific app ('healthy', 'degraded').
   * @property {number} diagnostics.successRate - Success rate percentage for this app in the last 24 hours.
   * @property {number} diagnostics.totalActions24h - Total actions for this app in the last 24 hours.
   * @property {number} diagnostics.avgLatencyMs - Average latency in milliseconds for this app.
   * @property {number} diagnostics.failures - Total failures for this app in the last 24 hours.
   * @property {Array<Object>} diagnostics.topErrors - A list of top error messages and their counts for this app.
   * @property {string} diagnostics.topErrors[].message - The error message.
   * @property {number} diagnostics.topErrors[].count - The number of occurrences of this error.
   * @property {string[]} diagnostics.recommendations - A list of recommendations based on the diagnostics.
   * @throws {Error} If an error occurs during the fetching or processing of app-specific diagnostics.
   */
  async getSingleConnectionDiagnostics(userId, app) {
    try {
      const now = new Date();
      const pastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const logs = await ActionAuditLog.find({
        userId: Array.isArray(userId) ? { $in: userId } : userId,
        app,
        createdAt: { $gte: pastDay }
      }).sort({ createdAt: -1 }).limit(100).lean();

      const total = logs.length;
      const successes = logs.filter(l => l.status === 'success').length;
      const failures = logs.filter(l => l.status === 'failed').length;
      const successRate = total > 0 ? (successes / total) * 100 : 100;
      
      const totalDuration = logs.reduce((sum, l) => sum + (l.durationMs || 0), 0);
      const avgDuration = total > 0 ? totalDuration / total : 0;

      // Group failures by error message
      const errorMap = {};
      logs.forEach(l => {
        if (l.status === 'failed' && l.error?.message) {
          errorMap[l.error.message] = (errorMap[l.error.message] || 0) + 1;
        }
      });
      const topErrors = Object.entries(errorMap).map(([message, count]) => ({
        message,
        count
      })).sort((a, b) => b.count - a.count);

      let status = 'healthy';
      const recommendations = [];

      if (successRate < 70 && total > 3) {
        status = 'degraded';
        recommendations.push('Connection is displaying high failure rates. Trigger connection recovery to re-verify OAuth tokens.');
      }
      
      const slowRuns = logs.filter(l => l.durationMs > 5000).length;
      if (slowRuns > total * 0.3 && total > 3) {
        recommendations.push('High latency (latency > 5000ms) detected on 30% of requests. Investigate third-party service latency.');
      }

      if (recommendations.length === 0) {
        recommendations.push('No issues detected. Connection is operating cleanly.');
      }

      return {
        success: true,
        app,
        diagnostics: {
          status,
          successRate: Math.round(successRate),
          totalActions24h: total,
          avgLatencyMs: Math.round(avgDuration),
          failures: failures,
          topErrors,
          recommendations
        }
      };
    } catch (error) {
      logger.error(`ConnectionDiagnosticsService.getSingleConnectionDiagnostics failed for app ${app}:`, error);
      throw error;
    }
  }
}

/**
 * An instance of the ConnectionDiagnosticsService, providing methods to analyze
 * and report on user connection health and potential rate limiting issues.
 * @type {ConnectionDiagnosticsService}
 */
export const connectionDiagnosticsService = new ConnectionDiagnosticsService();