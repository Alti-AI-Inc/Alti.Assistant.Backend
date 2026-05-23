import express from 'express';

const router = express.Router();

import { composioController } from './composio.controller.js';
import { aiClassificationController } from './aiClassification.controller.js';
import { workflowRoutes } from './routes/workflow.routes.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

// Original composio v2 routes
router.post(
  '/initiate',
  optionalAuth(),
  extractTenantContext,
  composioController.composioInitiateController
);
router.post(
  '/wait-for-connection',
  optionalAuth(),
  extractTenantContext,
  composioController.composioWaitForConnectionController
);

// Conversational Composio routes
router.post(
  '/chat',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  composioController.composioConversationController
);
router.get(
  '/conversation/:conversationId',
  optionalAuth(),
  extractTenantContext,
  composioController.getComposioConversationController
);
router.get(
  '/conversations',
  optionalAuth(),
  extractTenantContext,
  composioController.getUserComposioConversationsController
);

// AI Classification routes
router.post(
  '/classify-and-execute',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  aiClassificationController.classifyAndExecuteController
);
router.get(
  '/supported-apps',
  extractTenantContext,
  aiClassificationController.getSupportedAppsController
);
router.post(
  '/test-classification',
  extractTenantContext,
  aiClassificationController.testClassificationController
);
router.get(
  '/user-connections',
  optionalAuth(),
  extractTenantContext,
  aiClassificationController.getUserConnectionsController
);
router.get(
  '/conversation-history',
  optionalAuth(),
  extractTenantContext,
  aiClassificationController.getConversationHistoryController
);

// Scheduled Workflow routes
router.use('/workflows', workflowRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// Action Audit Log routes
// ─────────────────────────────────────────────────────────────────────────────
import { actionAuditService } from './actionAudit.service.js';

router.get(
  '/audit-log',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      const result = await actionAuditService.getUserAuditLog(userId, {
        app: req.query.app,
        status: req.query.status,
        limit: req.query.limit,
        offset: req.query.offset,
        since: req.query.since,
      });
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get(
  '/audit-analytics',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      const result = await actionAuditService.getUserAnalytics(
        userId,
        req.query.window || '7d'
      );
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export const composioV2Routes = router;
