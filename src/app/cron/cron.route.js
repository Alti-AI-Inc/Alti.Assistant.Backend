import express from 'express';
import { resetDailyUsage } from './subscription/resetDailyUsage.js';
import { syncStripeSubscriptions } from './subscription/syncStripeSubscriptions.js';
import {
  resetMonthlyTenantUsage,
  cleanupExpiredTrials,
  sendUsageWarnings,
} from './tenant/resetUsage.js';
import { workspaceCleanup } from './docker/workspaceCleanup.js';
import { cleanupOldUsage } from './usage/cleanupOldUsage.js';
import { resetAllUsage } from './usage/resetAllUsage.js';
import { cronAuth } from '../middlewares/cronAuth/cronAuth.js';

const router = express.Router();

// Apply cron authentication to all routes in this router
router.use(cronAuth);

// Subscription cron jobs
router.post('/subscription/reset-daily-usage', resetDailyUsage);
router.post('/subscription/sync-stripe', syncStripeSubscriptions);

// Tenant cron jobs
router.post('/tenant/reset-monthly-usage', resetMonthlyTenantUsage);
router.post('/tenant/cleanup-expired-trials', cleanupExpiredTrials);
router.post('/tenant/send-usage-warnings', sendUsageWarnings);

// Docker workspace cron jobs
router.post('/docker/workspace-cleanup', workspaceCleanup);

// Usage cleanup and reset
router.post('/usage/cleanup-old-usage', cleanupOldUsage);
router.post('/usage/reset-all-usage', resetAllUsage);

export const cronRoutes = router;
