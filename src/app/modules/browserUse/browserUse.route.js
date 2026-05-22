import express from 'express';
import { BrowserUseController } from './browserUse.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

const router = express.Router();

// Apply auth and tenant context to all browser session routes
router.use(auth());
router.use(extractTenantContext);

router.post('/task', BrowserUseController.runTaskController);
router.get(
  '/status/:sessionId/:taskId',
  BrowserUseController.getTaskStatusController
);

// --- NEW HISTORY ROUTES ---

router.get('/sessions/:userId', BrowserUseController.getUserSessionsController);
router.get(
  '/session/:sessionId/:userId',
  BrowserUseController.getSessionByIdController
);

export const browserUseAiRoutes = router;
