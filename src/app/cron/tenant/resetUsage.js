import { logger } from '../../../shared/logger.js';
import Tenant from '../../modules/tenant/tenant.model.js';
import { sendMailWithNodeMailer } from '../../middlewares/sendEmail/sendMail.js';
import config from '../../../../config/index.js';

export const resetMonthlyTenantUsage = async (req, res) => {
  try {
    logger.info('Starting monthly tenant usage reset (HTTP trigger)');
    const result = await Tenant.updateMany(
      { deletedAt: null },
      {
        $set: {
          'usage.apiCallsUsed': 0,
          'usage.lastResetAt': new Date(),
        },
      }
    );
    logger.info('Monthly tenant usage reset completed', {
      tenantsUpdated: result.modifiedCount,
    });
    if (res) res.status(200).json({ success: true, message: 'Monthly tenant usage reset completed', count: result.modifiedCount });
  } catch (error) {
    logger.error('Error resetting monthly tenant usage', { error: error.message });
    if (res) res.status(500).json({ success: false, message: error.message });
  }
};

export const cleanupExpiredTrials = async (req, res) => {
  try {
    logger.info('Starting expired trial cleanup (HTTP trigger)');
    const now = new Date();
    const result = await Tenant.updateMany(
      {
        status: 'trial',
        'subscription.trialEndsAt': { $lt: now },
        deletedAt: null,
      },
      {
        $set: { status: 'suspended' },
      }
    );
    logger.info('Expired trial cleanup completed', { tenantsSuspended: result.modifiedCount });
    if (res) res.status(200).json({ success: true, message: 'Expired trial cleanup completed', count: result.modifiedCount });
  } catch (error) {
    logger.error('Error cleaning up expired trials', { error: error.message });
    if (res) res.status(500).json({ success: false, message: error.message });
  }
};

export const sendUsageWarnings = async (req, res) => {
  try {
    logger.info('Starting usage warnings check (HTTP trigger)');
    const tenantsNearLimit = await Tenant.find({
      deletedAt: null,
      status: 'active',
      'limits.maxApiCalls': { $gt: 0 },
      $expr: {
        $gte: [
          '$usage.apiCallsUsed',
          { $multiply: ['$limits.maxApiCalls', 0.8] },
        ],
      },
    }).populate('ownerId', 'email firstName lastName');

    logger.info('Found tenants near API limit', { count: tenantsNearLimit.length });

    for (const tenant of tenantsNearLimit) {
      const percentageUsed = Math.round((tenant.usage.apiCallsUsed / tenant.limits.maxApiCalls) * 100);
      
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
              <div class="header">⚠️ Alti Assistant Workspace API Limit Warning</div>
              <div class="content">
                <p>Hello <span class="highlight">${firstName}</span>,</p>
                <p>This is an automated notification that your Alti Assistant Workspace, <span class="highlight">${tenantName}</span>, has reached or exceeded <span class="highlight">${percentageUsed}%</span> of its daily API call capacity.</p>
                
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
                <p>Thank you for using Alti Assistant.<br>If you have any questions or require custom enterprise limits, please contact our support team.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        try {
          await sendMailWithNodeMailer({
            sub: `[Action Required] Alti Assistant Workspace API Usage Warning - ${percentageUsed}% Limit Reached`,
            message: emailMessage,
            userEmail: tenant.ownerId.email,
          });
          logger.info('Usage warning email sent successfully', { tenantId: tenant._id, ownerEmail: tenant.ownerId.email });
        } catch (mailError) {
          logger.error('Failed to send usage warning email', { tenantId: tenant._id, error: mailError.message });
        }
      }
    }
    logger.info('Usage warnings check completed');
    if (res) res.status(200).json({ success: true, message: 'Usage warnings check completed', count: tenantsNearLimit.length });
  } catch (error) {
    logger.error('Error sending usage warnings', { error: error.message });
    if (res) res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  resetMonthlyTenantUsage,
  cleanupExpiredTrials,
  sendUsageWarnings,
};
