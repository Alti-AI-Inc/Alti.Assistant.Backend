import cron from 'node-cron';
import { logger } from '../../../shared/logger.js';
import Tenant from '../../modules/tenant/tenant.model.js';

/**
 * Reset tenant usage counts on the first day of each month
 * Runs at midnight (00:00) on the 1st of every month
 * 
 * Cron schedule: '0 0 1 * *'
 * - Minute: 0
 * - Hour: 0
 * - Day of month: 1
 * - Month: * (every month)
 * - Day of week: * (any day)
 */
export const resetMonthlyTenantUsage = () => {
  // Run at midnight on the 1st of every month
  cron.schedule('0 0 1 * *', async () => {
    try {
      logger.info('Starting monthly tenant usage reset');

      const result = await Tenant.updateMany(
        { deletedAt: null }, // Only active tenants
        {
          $set: {
            'usage.apiCallsUsed': 0,
            'usage.lastResetAt': new Date(),
          },
        }
      );

      logger.info('Monthly tenant usage reset completed', {
        tenantsUpdated: result.modifiedCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error resetting monthly tenant usage', {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  logger.info('Monthly tenant usage reset cron job scheduled');
};

/**
 * Reset tenant usage on demand (for testing or manual reset)
 * @param {string} tenantId - Optional tenant ID to reset specific tenant
 */
export const resetTenantUsageNow = async (tenantId = null) => {
  try {
    logger.info('Starting manual tenant usage reset', { tenantId });

    const query = { deletedAt: null };
    if (tenantId) {
      query._id = tenantId;
    }

    const result = await Tenant.updateMany(query, {
      $set: {
        'usage.apiCallsUsed': 0,
        'usage.lastResetAt': new Date(),
      },
    });

    logger.info('Manual tenant usage reset completed', {
      tenantsUpdated: result.modifiedCount,
      tenantId,
    });

    return {
      success: true,
      tenantsUpdated: result.modifiedCount,
    };
  } catch (error) {
    logger.error('Error in manual tenant usage reset', {
      error: error.message,
      tenantId,
    });
    throw error;
  }
};

/**
 * Clean up expired trial tenants
 * Runs daily at 2 AM
 * Marks trial tenants as 'suspended' if trial period has ended
 */
export const cleanupExpiredTrials = () => {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Starting expired trial cleanup');

      const now = new Date();

      // Find trials that have expired
      const result = await Tenant.updateMany(
        {
          status: 'trial',
          'subscription.trialEndsAt': { $lt: now },
          deletedAt: null,
        },
        {
          $set: {
            status: 'suspended',
          },
        }
      );

      logger.info('Expired trial cleanup completed', {
        tenantsSuspended: result.modifiedCount,
        timestamp: now.toISOString(),
      });
    } catch (error) {
      logger.error('Error cleaning up expired trials', {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  logger.info('Expired trial cleanup cron job scheduled');
};

/**
 * Send usage warning emails when tenants are near limits
 * Runs daily at 10 AM
 */
export const sendUsageWarnings = () => {
  // Run daily at 10 AM
  cron.schedule('0 10 * * *', async () => {
    try {
      logger.info('Starting usage warnings check');

      // Find tenants near their API limit (>80%)
      const tenantsNearLimit = await Tenant.find({
        deletedAt: null,
        status: 'active',
        'limits.maxApiCalls': { $gt: 0 }, // Not unlimited
        $expr: {
          $gte: [
            '$usage.apiCallsUsed',
            { $multiply: ['$limits.maxApiCalls', 0.8] },
          ],
        },
      }).populate('ownerId', 'email firstName lastName');

      logger.info('Found tenants near API limit', {
        count: tenantsNearLimit.length,
      });

      // TODO: Send warning emails to tenant owners
      // This would integrate with your email service
      for (const tenant of tenantsNearLimit) {
        const percentageUsed = Math.round(
          (tenant.usage.apiCallsUsed / tenant.limits.maxApiCalls) * 100
        );

        logger.info('Tenant near API limit', {
          tenantId: tenant._id,
          tenantName: tenant.name,
          percentageUsed,
          owner: tenant.ownerId?.email,
        });

        // TODO: Implement email sending here
        // await sendUsageWarningEmail({
        //   email: tenant.ownerId.email,
        //   tenantName: tenant.name,
        //   percentageUsed,
        //   used: tenant.usage.apiCallsUsed,
        //   limit: tenant.limits.maxApiCalls
        // });
      }

      logger.info('Usage warnings check completed');
    } catch (error) {
      logger.error('Error sending usage warnings', {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  logger.info('Usage warnings cron job scheduled');
};

/**
 * Initialize all tenant-related cron jobs
 */
export const initializeTenantCronJobs = () => {
  logger.info('Initializing tenant cron jobs');

  resetMonthlyTenantUsage();
  cleanupExpiredTrials();
  sendUsageWarnings();

  logger.info('All tenant cron jobs initialized');
};

export default {
  resetMonthlyTenantUsage,
  resetTenantUsageNow,
  cleanupExpiredTrials,
  sendUsageWarnings,
  initializeTenantCronJobs,
};
