import express from 'express';
import { executionController } from '../controllers/execution.controller.js';
import auth from '../../../middlewares/auth/auth.js';
import { planLimitMiddleware } from '../../billing/planLimit.middleware.js';

/**
 * @file This file defines the API routes for workflow execution, connection health,
 * human-in-the-loop approvals, workflow scheduling, and webhook triggers.
 * It uses Express Router to manage endpoints and integrates authentication
 * and asynchronous error handling.
 * @module routes/execution.routes
 */

const router = express.Router();

/**
 * Utility to wrap async controller functions for error handling.
 * This ensures that any errors (rejected promises) from async controllers
 * are caught and passed to Express's error handling middleware, preventing
 * unhandled promise rejections from crashing the application.
 *
 * @param {Function} fn An asynchronous controller function.
 * @returns {Function} An Express middleware function that wraps the controller.
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Connection health monitoring routes

/**
 * GET /api/workflow-automation/connections/health
 * @summary Get the health status of all configured external connections.
 * @description Retrieves a detailed health report for all connections used by the workflow automation module.
 * This can be used to verify connectivity and operational status of integrated services.
 * @tags Connection Health
 * @security BearerAuth
 * @returns {object} 200 - An object containing the health status of various connections.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 500 - Internal server error if an unexpected issue occurs.
 */
router.get(
  '/connections/health',
  auth(),
  catchAsync(executionController.getConnectionHealthController)
);

/**
 * POST /api/workflow-automation/connections/refresh
 * @summary Refresh the status of all configured external connections.
 * @description Triggers a refresh operation for all connections, re-evaluating their health and status.
 * This can be useful for re-establishing connections or updating their state without restarting the application.
 * @tags Connection Health
 * @security BearerAuth
 * @returns {object} 200 - An object indicating the refresh operation was initiated successfully.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 500 - Internal server error if an unexpected issue occurs.
 */
router.post(
  '/connections/refresh',
  auth(),
  catchAsync(executionController.refreshConnectionController)
);

// Workflow execution routes

/**
 * POST /api/workflow-automation/{workflowId}/execute
 * @summary Execute a specific workflow.
 * @description Initiates the execution of a workflow identified by `workflowId`.
 * The request body may contain input data required by the workflow.
 * @tags Workflow Execution
 * @security BearerAuth
 * @param {string} workflowId.path.required - The ID of the workflow to execute.
 * @param {object} request.body - Optional input data for the workflow execution.
 * @returns {object} 202 - Accepted, with the ID of the newly created execution.
 * @returns {object} 400 - Bad request if input data is invalid or workflow cannot be executed.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 403 - Forbidden if the user does not have permission to execute this workflow.
 * @returns {object} 404 - Not Found if the workflowId does not exist.
 * @returns {object} 500 - Internal server error if an unexpected issue occurs during execution initiation.
 */
router.post(
  '/:workflowId/execute',
  auth(),
  planLimitMiddleware('workflow'),
  catchAsync(executionController.executeWorkflowController)
);

/**
 * GET /api/workflow-automation/{workflowId}/executions
 * @summary Get the execution history for a specific workflow.
 * @description Retrieves a list of all past and ongoing executions for a given workflow.
 * @tags Workflow Execution
 * @security BearerAuth
 * @param {string} workflowId.path.required - The ID of the workflow.
 * @returns {array<object>} 200 - An array of workflow execution records.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 403 - Forbidden if the user does not have permission to view this workflow's executions.
 * @returns {object} 404 - Not Found if the workflowId does not exist.
 * @returns {object} 500 - Internal server error.
 */
router.get(
  '/:workflowId/executions',
  auth(),
  catchAsync(executionController.getExecutionHistoryController)
);

/**
 * GET /api/workflow-automation/executions/{executionId}
 * @summary Get details of a specific workflow execution.
 * @description Retrieves comprehensive details for a single workflow execution, including its status, logs, and output.
 * @tags Workflow Execution
 * @security BearerAuth
 * @param {string} executionId.path.required - The ID of the workflow execution.
 * @returns {object} 200 - Detailed information about the workflow execution.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 403 - Forbidden if the user does not have permission to view this execution.
 * @returns {object} 404 - Not Found if the executionId does not exist.
 * @returns {object} 500 - Internal server error.
 */
router.get(
  '/executions/:executionId',
  auth(),
  catchAsync(executionController.getExecutionDetailsController)
);

/**
 * POST /api/workflow-automation/executions/{executionId}/cancel
 * @summary Cancel a running workflow execution.
 * @description Attempts to cancel a workflow execution that is currently in progress.
 * The success of cancellation depends on the workflow's current state and design.
 * @tags Workflow Execution
 * @security BearerAuth
 * @param {string} executionId.path.required - The ID of the workflow execution to cancel.
 * @returns {object} 200 - Success message indicating the cancellation request was processed.
 * @returns {object} 400 - Bad request if the execution cannot be cancelled (e.g., already completed or invalid state).
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 403 - Forbidden if the user does not have permission to cancel this execution.
 * @returns {object} 404 - Not Found if the executionId does not exist.
 * @returns {object} 500 - Internal server error.
 */
router.post(
  '/executions/:executionId/cancel',
  auth(),
  catchAsync(executionController.cancelExecutionController)
);

/**
 * POST /api/workflow-automation/executions/{executionId}/replay
 * @summary Replay a specific workflow execution.
 * @description Creates a new workflow execution by replaying a previous one, potentially with modified inputs.
 * This is useful for debugging or re-running failed workflows.
 * @tags Workflow Execution
 * @security BearerAuth
 * @param {string} executionId.path.required - The ID of the workflow execution to replay.
 * @param {object} request.body - Optional new input data to use for the replay.
 * @returns {object} 202 - Accepted, with the ID of the new replayed execution.
 * @returns {object} 400 - Bad request if the execution cannot be replayed or input is invalid.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 403 - Forbidden if the user does not have permission to replay this execution.
 * @returns {object} 404 - Not Found if the executionId does not exist.
 * @returns {object} 500 - Internal server error.
 */
router.post(
  '/executions/:executionId/replay',
  auth(),
  catchAsync(executionController.replayExecutionController)
);

// Human-in-the-loop approvals routes

/**
 * GET /api/workflow-automation/approvals/pending
 * @summary Get all pending human-in-the-loop approvals for the current user.
 * @description Retrieves a list of approval tasks that are awaiting action from the authenticated user.
 * @tags Human-in-the-Loop Approvals
 * @security BearerAuth
 * @returns {array<object>} 200 - An array of pending approval tasks.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 500 - Internal server error.
 */
router.get(
  '/approvals/pending',
  auth(),
  catchAsync(executionController.getPendingApprovalsController)
);

/**
 * POST /api/workflow-automation/approvals/{approvalId}/resolve
 * @summary Resolve a specific human-in-the-loop approval.
 * @description Submits a decision (approve/reject) for a pending approval task.
 * @tags Human-in-the-Loop Approvals
 * @security BearerAuth
 * @param {string} approvalId.path.required - The ID of the approval task to resolve.
 * @param {object} request.body.required - The resolution details.
 * @param {string} request.body.action.required - The action to take ('approve' or 'reject').
 * @param {string} [request.body.comment] - An optional comment for the resolution.
 * @returns {object} 200 - Success message indicating the approval was resolved.
 * @returns {object} 400 - Bad request if the action is invalid or approval is not pending.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 403 - Forbidden if the user does not have permission to resolve this approval.
 * @returns {object} 404 - Not Found if the approvalId does not exist.
 * @returns {object} 500 - Internal server error.
 */
router.post(
  '/approvals/:approvalId/resolve',
  auth(),
  catchAsync(executionController.resolveApprovalController)
);

// Workflow scheduling routes

/**
 * POST /api/workflow-automation/{workflowId}/schedule
 * @summary Schedule a workflow for future execution.
 * @description Configures a workflow to run automatically at specified intervals or times.
 * @tags Workflow Scheduling
 * @security BearerAuth
 * @param {string} workflowId.path.required - The ID of the workflow to schedule.
 * @param {object} request.body.required - Scheduling configuration details (e.g., cron expression, start time).
 * @returns {object} 200 - Success message indicating the workflow was scheduled.
 * @returns {object} 400 - Bad request if scheduling configuration is invalid.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 403 - Forbidden if the user does not have permission to schedule this workflow.
 * @returns {object} 404 - Not Found if the workflowId does not exist.
 * @returns {object} 500 - Internal server error.
 */
router.post(
  '/:workflowId/schedule',
  auth(),
  catchAsync(executionController.scheduleWorkflowController)
);

/**
 * POST /api/workflow-automation/{workflowId}/unschedule
 * @summary Unschedule a previously scheduled workflow.
 * @description Removes any active schedules for a given workflow, preventing future automatic executions.
 * @tags Workflow Scheduling
 * @security BearerAuth
 * @param {string} workflowId.path.required - The ID of the workflow to unschedule.
 * @returns {object} 200 - Success message indicating the workflow was unscheduled.
 * @returns {object} 400 - Bad request if the workflow is not currently scheduled.
 * @returns {object} 401 - Unauthorized if authentication token is missing or invalid.
 * @returns {object} 403 - Forbidden if the user does not have permission to unschedule this workflow.
 * @returns {object} 404 - Not Found if the workflowId does not exist.
 * @returns {object} 500 - Internal server error.
 */
router.post(
  '/:workflowId/unschedule',
  auth(),
  catchAsync(executionController.unscheduleWorkflowController)
);

// Public dynamic webhook trigger route

/**
 * POST /api/workflow-automation/webhooks/{webhookId}
 * @summary Trigger a workflow via a dynamic webhook.
 * @description This public endpoint allows external systems to trigger workflows by sending a POST request
 * to a unique webhook ID. The controller is responsible for implementing security measures
 * (e.g., secret validation, signature verification) to prevent unauthorized triggers.
 * @tags Webhooks
 * @param {string} webhookId.path.required - The unique ID of the webhook configured to trigger a specific workflow.
 * @param {object} request.body - The payload sent by the external system, which will be passed as input to the workflow.
 * @returns {object} 202 - Accepted, indicating the webhook trigger was received and processed.
 * @returns {object} 400 - Bad request if the payload is invalid or webhook is misconfigured.
 * @returns {object} 401 - Unauthorized if webhook security (e.g., signature) fails validation.
 * @returns {object} 404 - Not Found if the webhookId does not exist.
 * @returns {object} 500 - Internal server error if an unexpected issue occurs.
 */
router.post(
  '/webhooks/:webhookId',
  catchAsync(executionController.handleWebhookTriggerController)
);

/**
 * @constant {express.Router} executionRoutes
 * @description The Express router instance containing all workflow automation execution-related API routes.
 */
export const executionRoutes = router;