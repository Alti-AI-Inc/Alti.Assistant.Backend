import cron from 'node-cron';
import { logger } from '../../../shared/logger.js';
import Tenant from '../../modules/tenant/tenant.model.js';
import { sendMailWithNodeMailer } from '../../middlewares/sendEmail/sendMailWithMailGun.js';
import config from '../../../../config/index.js';

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

        if (tenant.ownerId?.email) {
          const firstName = tenant.ownerId.firstName || 'there';
          const tenantName = tenant.name || 'Workspace';
          const used = tenant.usage.apiCallsUsed;
          const limit = tenant.limits.maxApiCalls;
          const upgradeUrl = `${config.client_url || 'https://alti.assistant.ai'}/dashboard/billing`;

          const emailMessage = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; color: #1f2937; margin: 0; padding: 20px; }
                .card { background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); padding: 30px; max-width: 600px; margin: 0 auto; border-top: 4px solid #f59e0b; }
                .header { font-size: 24px; font-weight: 700; color: #d97706; margin-bottom: 20px; }
                .content { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
                .highlight { font-weight: 600; color: #111827; }
                .stats { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 20px 0; font-family: monospace; }
                .cta-btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 15px; text-align: center; }
                .footer { margin-top: 30px; font-size: 14px; color: #6b7280; text-align: center; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="header">⚠️ Alti Workspace API Limit Warning</div>
                <div class="content">
                  <p>Hello <span class="highlight">${firstName}</span>,</p>
                  <p>This is an automated notification that your Alti Workspace, <span class="highlight">${tenantName}</span>, has reached or exceeded <span class="highlight">${percentageUsed}%</span> of its daily API call capacity.</p>
                  
                  <div class="stats">
                    <strong>Workspace:</strong> ${tenantName}<br>
                    <strong>API Usage:</strong> ${used} / ${limit} calls (${percentageUsed}% consumed)
                  </div>

                  <p>To ensure uninterrupted service and prevent any downtime for your automated workflows, agents, or integrations, we recommend upgrading your workspace to a plan with higher limits.</p>
                  
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="${upgradeUrl}" class="cta-btn">Upgrade Workspace Plan</a>
                  </div>
                </div>
                <div class="footer">
                  <p>Thank you for using Alti AI.<br>If you have any questions or require custom enterprise limits, please contact our support team.</p>
                </div>
              </div>
            </body>
            </html>
          `;

          try {
            await sendMailWithNodeMailer({
              sub: `[Action Required] Alti Workspace API Usage Warning - ${percentageUsed}% Limit Reached`,
              message: emailMessage,
              userEmail: tenant.ownerId.email,
            });
            logger.info('Usage warning email sent successfully', {
              tenantId: tenant._id,
              ownerEmail: tenant.ownerId.email,
            });
          } catch (mailError) {
            logger.error('Failed to send usage warning email', {
              tenantId: tenant._id,
              error: mailError.message,
            });
          }
        } else {
          logger.warn('Skipping usage warning email: No owner email found', {
            tenantId: tenant._id,
          });
        }
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
