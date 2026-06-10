import express from 'express';
import { TogetherAiController } from './togeterAi.controller.js';
import { auth } from '../../middlewares/auth.js';

const router = express.Router();

/**
 * @route   POST /api/v1/together-ai/create-img
 * @desc    Generate image using Together AI. Accessible by authenticated users.
 *          Subject to tenant-specific limits unless overridden by Platform Owner.
 */
router.route('/create-img')
  .post(
    auth('super_admin', 'tenant_admin', 'tenant_user'),
    TogetherAiController.TogetherAiImgGeneration
  );

/**
 * @route   GET /api/v1/together-ai/admin/config
 * @desc    Get global Together AI system-wide configurations (Platform Owner only).
 */
/**
 * @route   PATCH /api/v1/together-ai/admin/config
 * @desc    Update global Together AI system-wide configurations (Platform Owner only).
 */
router.route('/admin/config')
  .get(
    auth('super_admin'),
    TogetherAiController.getGlobalConfig
  )
  .patch(
    auth('super_admin'),
    TogetherAiController.updateGlobalConfig
  );

/**
 * @route   GET /api/v1/together-ai/admin/logs
 * @desc    Get global Together AI generation logs and usage statistics (Platform Owner only).
 */
router.route('/admin/logs')
  .get(
    auth('super_admin'),
    TogetherAiController.getGlobalLogs
  );

/**
 * @route   POST /api/v1/together-ai/admin/tenant-override
 * @desc    Override or bypass Together AI limits for a specific tenant (Platform Owner only).
 */
router.route('/admin/tenant-override')
  .post(
    auth('super_admin'),
    TogetherAiController.overrideTenantLimit
  );

export const togetherAiRoutes = router;