import ActionAuditLog from './models/actionAuditLog.model.js';
import { logger } from '../../../shared/logger.js';

/**
 * Connection Diagnostics & Rate Limit Prediction Service
 */
class ConnectionDiagnosticsService {
  /**
   * Run full diagnostics for a user's connections.
   * 
   * @param {string} userId
   * @returns {Object} Diagnostics report
   */
  async getConnectionDiagnostics(userId) {
    try {
      const now = new Date();
      const pastHour = new Date(now.getTime() - 60 * 60 * 1000);
      const pastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // 1. Fetch action logs in past 24h
      const matchStage = {
        userId: userId,
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
        ActionAuditLog.aggregate([
          { $match: { userId, createdAt: { $gte: pastHour } } },
          {
            $group: {
              _id: {
                $subtract: [
                  { $minute: '$createdAt' },
                  { $mod: [{ $minute: '$createdAt' }, 10] }
                ]
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id': 1 } }
        ])
      ]);

      const stats = generalStats[0] || { total24h: 0, successes: 0, failures: 0, avgDurationMs: 0 };
      const successRate = stats.total24h > 0 ? (stats.successes / stats.total24h) * 100 : 100;

      // 2. Rate limiting predictive capacity forecast
      // Count actions in the last 1 hour
      const totalPastHour = await ActionAuditLog.countDocuments({
        userId,
        createdAt: { $gte: pastHour }
      });

      // Calculate trend and acceleration
      const buckets = Array(6).fill(0);
      intervalStats.forEach(bucket => {
        const index = Math.floor(bucket._id / 10);
        if (index >= 0 && index < 6) {
          buckets[index] = bucket.count;
        }
      });

      // Let's check if rate is increasing
      const firstHalf = buckets.slice(0, 3).reduce((a, b) => a + b, 0);
      const secondHalf = buckets.slice(3, 6).reduce((a, b) => a + b, 0);
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
   * Run detailed diagnostics for a single connection (by app name).
   * 
   * @param {string} userId
   * @param {string} app
   * @returns {Object} App-specific diagnostics report
   */
  async getSingleConnectionDiagnostics(userId, app) {
    try {
      const now = new Date();
      const pastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const logs = await ActionAuditLog.find({
        userId,
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

export const connectionDiagnosticsService = new ConnectionDiagnosticsService();
