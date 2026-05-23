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

// ─────────────────────────────────────────────────────────────────────────────
// App Discovery & Integration Recommendation routes
// ─────────────────────────────────────────────────────────────────────────────
import { appDiscoveryService } from './appDiscovery.service.js';

router.get(
  '/recommendations',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await appDiscoveryService.getRecommendations(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post(
  '/recommendations/dismiss',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const { appName } = req.body;
      if (!appName) {
        return res.status(400).json({ success: false, message: 'appName is required' });
      }
      const result = await appDiscoveryService.dismissRecommendation(appName);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Event Trigger routes
// ─────────────────────────────────────────────────────────────────────────────
import { eventTriggerService } from './eventTrigger.service.js';

router.post(
  '/triggers',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const { appName, eventName, dispatchType, targetId, paramMapping } = req.body;
      if (!appName || !eventName || !dispatchType || !targetId) {
        return res.status(400).json({ success: false, message: 'appName, eventName, dispatchType, and targetId are required' });
      }
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await eventTriggerService.registerTrigger(
        userId,
        appName,
        eventName,
        dispatchType,
        targetId,
        paramMapping
      );
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Public webhook receiver (can bypass standard user auth depending on the webhook secret, or support optional auth)
router.post(
  '/webhooks/receive',
  async (req, res) => {
    try {
      const { appName, eventName, payload } = req.body;
      if (!appName || !eventName || !payload) {
        return res.status(400).json({ success: false, message: 'appName, eventName, and payload are required' });
      }
      const result = await eventTriggerService.receiveWebhookEvent(appName, eventName, payload);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Connection Auto-Recovery routes
// ─────────────────────────────────────────────────────────────────────────────
import { connectionRecoveryService } from './connectionRecovery.service.js';

router.post(
  '/connections/:connectionId/recover',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post(
  '/connections/heartbeat',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await connectionRecoveryService.runHeartbeatRecovery(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Connection Diagnostics & Rate-Limit Forecasting routes
// ─────────────────────────────────────────────────────────────────────────────
import { connectionDiagnosticsService } from './connectionDiagnostics.service.js';

router.get(
  '/connections/diagnostics',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await connectionDiagnosticsService.getConnectionDiagnostics(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get(
  '/connections/:appName/diagnostics',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const { appName } = req.params;
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await connectionDiagnosticsService.getSingleConnectionDiagnostics(userId, appName);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Pattern Intelligence Agent routes
// ─────────────────────────────────────────────────────────────────────────────
import { workflowIntelligenceService } from './workflowIntelligence.service.js';

router.get(
  '/intelligence/patterns',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await workflowIntelligenceService.getWorkflowPatterns(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post(
  '/intelligence/analyze',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await workflowIntelligenceService.analyzeWorkflowPatterns(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post(
  '/intelligence/patterns/:patternId/dismiss',
  optionalAuth(),
  extractTenantContext,
  async (req, res) => {
    try {
      const { patternId } = req.params;
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await workflowIntelligenceService.dismissPattern(patternId, userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export const composioV2Routes = router;
