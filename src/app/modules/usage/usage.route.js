import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { usageController } from './usage.controller.js';

const router = express.Router();

router.get(
  '/stats',
  auth(),
  extractTenantContext,
  usageController.getUsageStats
);

export { router as usageRoutes };
