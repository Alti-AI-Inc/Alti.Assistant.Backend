import express from 'express';
import { executionController } from '../controllers/execution.controller.js';
import auth from '../../../middlewares/auth/auth.js';

const router = express.Router();

// Connection health monitoring routes
router.get(
  '/connections/health',
  auth(),
  executionController.getConnectionHealthController
);
router.post(
  '/connections/refresh',
  auth(),
  executionController.refreshConnectionController
);

// Workflow execution routes
router.post(
  '/:workflowId/execute',
  auth(),
  executionController.executeWorkflowController
);
router.get(
  '/:workflowId/executions',
  auth(),
  executionController.getExecutionHistoryController
);
router.get(
  '/executions/:executionId',
  auth(),
  executionController.getExecutionDetailsController
);
router.post(
  '/executions/:executionId/cancel',
  auth(),
  executionController.cancelExecutionController
);

// Workflow scheduling routes
router.post(
  '/:workflowId/schedule',
  auth(),
  executionController.scheduleWorkflowController
);
router.post(
  '/:workflowId/unschedule',
  auth(),
  executionController.unscheduleWorkflowController
);

export const executionRoutes = router;

