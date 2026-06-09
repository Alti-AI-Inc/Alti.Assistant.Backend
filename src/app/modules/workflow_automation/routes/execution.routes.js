import express from 'express';
import { executionController } from '../controllers/execution.controller.js';
import auth from '../../../middlewares/auth/auth.js';

const router = express.Router();

// Utility to wrap async controller functions for error handling.
// This ensures that any errors (rejected promises) from async controllers
// are caught and passed to Express's error handling middleware, preventing
// unhandled promise rejections from crashing the application.
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Connection health monitoring routes
router.get(
  '/connections/health',
  auth(),
  catchAsync(executionController.getConnectionHealthController)
);
router.post(
  '/connections/refresh',
  auth(),
  catchAsync(executionController.refreshConnectionController)
);

// Workflow execution routes
router.post(
  '/:workflowId/execute',
  auth(),
  catchAsync(executionController.executeWorkflowController)
);
router.get(
  '/:workflowId/executions',
  auth(),
  catchAsync(executionController.getExecutionHistoryController)
);
router.get(
  '/executions/:executionId',
  auth(),
  catchAsync(executionController.getExecutionDetailsController)
);
router.post(
  '/executions/:executionId/cancel',
  auth(),
  catchAsync(executionController.cancelExecutionController)
);
router.post(
  '/executions/:executionId/replay',
  auth(),
  catchAsync(executionController.replayExecutionController)
);

// Human-in-the-loop approvals routes
router.get(
  '/approvals/pending',
  auth(),
  catchAsync(executionController.getPendingApprovalsController)
);
router.post(
  '/approvals/:approvalId/resolve',
  auth(),
  catchAsync(executionController.resolveApprovalController)
);

// Workflow scheduling routes
router.post(
  '/:workflowId/schedule',
  auth(),
  catchAsync(executionController.scheduleWorkflowController)
);
router.post(
  '/:workflowId/unschedule',
  auth(),
  catchAsync(executionController.unscheduleWorkflowController)
);

// Public dynamic webhook trigger route
// This route is intentionally public and does not require authentication.
// The controller `handleWebhookTriggerController` should implement its own
// security measures (e.g., secret validation, signature verification)
// to prevent unauthorized triggers.
router.post(
  '/webhooks/:webhookId',
  catchAsync(executionController.handleWebhookTriggerController)
);

export const executionRoutes = router;