/**
 * @file This file defines the API routes for managing workflows and workspace features for managers.
 * @module routes/workflow.routes
 * @requires express
 * @requires ../controllers/workflow.controller
 * @requires ../controllers/manager.controller
 */
import express from 'express';
import { workflowController } from '../controllers/workflow.controller.js';
import { managerController } from '../controllers/manager.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/role.middleware.js';
import { validateTenant } from '../../../../middlewares/tenant.middleware.js';
import { trackUsage } from '../../../../middlewares/usage.middleware.js';
import { checkPlanLimits } from '../../../../middlewares/plan.middleware.js';

/**
 * Express router to handle workflow-related API requests.
 * @type {express.Router}
 */
const router = express.Router();

// Apply global authentication and tenant validation to all workflow routes
router.use(authenticate);
router.use(validateTenant);

// Workflow Management Routes

/**
 * @swagger
 * /workflows:
 *   post:
 *     summary: Create a new scheduled workflow
 *     description: Creates a new workflow definition, optionally scheduling it for future execution.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - executionPlan
 *               - workflowType
 *               - requiredApps
 *             properties:
 *               title:
 *                 type: string
 *                 description: The title of the workflow.
 *                 example: "Daily Report Generation"
 *               description:
 *                 type: string
 *                 description: A brief description of what the workflow does.
 *                 example: "Generates and sends a daily sales report to the team."
 *               executionPlan:
 *                 type: object
 *                 description: The detailed execution plan for the workflow (e.g., a sequence of tool calls).
 *                 example: { steps: [{ tool: "excel", action: "read", params: { file: "sales.xlsx" } }] }
 *               workflowType:
 *                 type: string
 *                 description: The type of workflow (e.g., 'scheduled', 'manual', 'event-driven').
 *                 enum: [scheduled, manual, event-driven]
 *                 example: "scheduled"
 *               requiredApps:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of application IDs or names required by the workflow.
 *                 example: ["excel", "slack"]
 *               triggerType:
 *                 type: string
 *                 description: The type of trigger for the workflow (e.g., 'schedule', 'manual', 'webhook').
 *                 enum: [schedule, manual, webhook]
 *                 example: "schedule"
 *               scheduleConfig:
 *                 type: object
 *                 description: Configuration for scheduled workflows.
 *                 properties:
 *                   cronExpression:
 *                     type: string
 *                     description: Cron expression for scheduling.
 *                     example: "0 9 * * *"
 *               originalUserInput:
 *                 type: string
 *                 description: The original user input that led to the creation of this workflow.
 *                 example: "Create a daily report workflow for sales data."
 *               conversationId:
 *                 type: string
 *                 description: The ID of the conversation context.
 *                 example: "conv-12345"
 *               conversationContext:
 *                 type: object
 *                 description: Additional context from the conversation.
 *                 example: { user: "John Doe" }
 *     responses:
 *       201:
 *         description: Workflow created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: The ID of the newly created workflow.
 *                   example: "wf-12345"
 *       400:
 *         description: Invalid input.
 *       401:
 *         description: Unauthorized.
 */
router.post(
  '/',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  trackUsage('create_workflow'),
  workflowController.createWorkflowController
);

/**
 * @swagger
 * /workflows:
 *   get:
 *     summary: Get user's workflows with optional filtering
 *     description: Retrieves a list of workflows belonging to the authenticated user, with options to filter by status and paginate results.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, paused, completed, failed]
 *         description: Filter workflows by their status.
 *         example: active
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: The maximum number of workflows to return.
 *         example: 5
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: The number of workflows to skip before starting to return results.
 *         example: 0
 *     responses:
 *       200:
 *         description: A list of workflows.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object # Placeholder for Workflow schema
 *                 properties:
 *                   id: { type: string, example: "wf-12345" }
 *                   title: { type: string, example: "Daily Report Generation" }
 *                   status: { type: string, example: "active" }
 *                   createdAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized.
 */
router.get(
  '/',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  workflowController.getUserWorkflowsController
);

// BUG FIX: Reordered routes to ensure more specific paths are matched before more general ones.
// The route '/executions/:executionId' and '/:workflowId/executions' are more specific
// than '/:workflowId' and must be defined first to prevent '/:workflowId' from
// incorrectly matching 'executions' as a workflowId.

/**
 * @swagger
 * /workflows/{workflowId}/executions:
 *   get:
 *     summary: Get workflow execution history
 *     description: Retrieves a list of past execution records for a specific workflow.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to get executions for.
 *         example: "wf-12345"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: The maximum number of executions to return.
 *         example: 5
 *     responses:
 *       200:
 *         description: A list of workflow executions.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object # Placeholder for WorkflowExecution schema
 *                 properties:
 *                   id: { type: string, example: "exec-67890" }
 *                   workflowId: { type: string, example: "wf-12345" }
 *                   status: { type: string, example: "completed" }
 *                   startTime: { type: string, format: date-time }
 *                   endTime: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Workflow not found.
 */
router.get(
  '/:workflowId/executions',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  workflowController.getWorkflowExecutionsController
);

/**
 * @swagger
 * /executions/{executionId}:
 *   get:
 *     summary: Get execution details by ID
 *     description: Retrieves the detailed status, logs, and results of a specific workflow execution.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: executionId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the execution to retrieve.
 *         example: "exec-67890"
 *     responses:
 *       200:
 *         description: Execution details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object # Placeholder for detailed WorkflowExecution schema
 *               properties:
 *                 id: { type: string, example: "exec-67890" }
 *                 workflowId: { type: string, example: "wf-12345" }
 *                 status: { type: string, example: "completed" }
 *                 startTime: { type: string, format: date-time }
 *                 endTime: { type: string, format: date-time }
 *                 logs: { type: array, items: { type: object } }
 *                 result: { type: object }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Execution not found.
 */
router.get(
  '/executions/:executionId',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  workflowController.getExecutionController
);

/**
 * @swagger
 * /workflows/{workflowId}:
 *   get:
 *     summary: Get workflow details by ID
 *     description: Retrieves the detailed configuration and status of a specific workflow.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to retrieve.
 *         example: "wf-12345"
 *     responses:
 *       200:
 *         description: Workflow details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object # Placeholder for detailed Workflow schema
 *               properties:
 *                 id: { type: string, example: "wf-12345" }
 *                 title: { type: string, example: "Daily Report Generation" }
 *                 description: { type: string, example: "Generates and sends a daily sales report to the team." }
 *                 status: { type: string, example: "active" }
 *                 executionPlan: { type: object }
 *                 createdAt: { type: string, format: date-time }
 *                 updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Workflow not found.
 */
router.get(
  '/:workflowId',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  workflowController.getWorkflowController
);

/**
 * @swagger
 * /workflows/{workflowId}:
 *   put:
 *     summary: Update workflow configuration
 *     description: Updates specific fields of an existing workflow's configuration.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to update.
 *         example: "wf-12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: The new title for the workflow.
 *                 example: "Updated Daily Report"
 *               description:
 *                 type: string
 *                 description: The new description for the workflow.
 *                 example: "Updated description for daily sales report."
 *               scheduleConfig:
 *                 type: object
 *                 description: New schedule configuration.
 *                 properties:
 *                   cronExpression:
 *                     type: string
 *                     description: New cron expression for scheduling.
 *                     example: "0 10 * * *"
 *               triggerType:
 *                 type: string
 *                 description: The new trigger type.
 *                 enum: [schedule, manual, webhook]
 *                 example: "schedule"
 *               status:
 *                 type: string
 *                 description: The new status for the workflow.
 *                 enum: [active, paused, completed, failed]
 *                 example: "active"
 *     responses:
 *       200:
 *         description: Workflow updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object # Placeholder for updated Workflow schema
 *               properties:
 *                 id: { type: string, example: "wf-12345" }
 *                 title: { type: string, example: "Updated Daily Report" }
 *                 status: { type: string, example: "active" }
 *       400:
 *         description: Invalid input.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Workflow not found.
 */
router.put(
  '/:workflowId',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  trackUsage('update_workflow'),
  workflowController.updateWorkflowController
);

/**
 * @swagger
 * /workflows/{workflowId}:
 *   delete:
 *     summary: Delete workflow
 *     description: Deletes a workflow permanently. This action cannot be undone.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to delete.
 *         example: "wf-12345"
 *     responses:
 *       204:
 *         description: Workflow deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Workflow not found.
 */
router.delete(
  '/:workflowId',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  trackUsage('delete_workflow'),
  workflowController.deleteWorkflowController
);

// Workflow Execution Routes

/**
 * @swagger
 * /workflows/{workflowId}/trigger:
 *   post:
 *     summary: Manually trigger workflow execution
 *     description: Initiates an immediate execution of the specified workflow, regardless of its scheduled trigger.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to trigger.
 *         example: "wf-12345"
 *     responses:
 *       202:
 *         description: Workflow execution initiated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 executionId:
 *                   type: string
 *                   description: The ID of the newly created execution.
 *                   example: "exec-67890"
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Workflow not found.
 *       409:
 *         description: Workflow cannot be triggered in its current state.
 */
router.post(
  '/:workflowId/trigger',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  trackUsage('execute_workflow'),
  workflowController.triggerWorkflowController
);

/**
 * @swagger
 * /workflows/{workflowId}/pause:
 *   post:
 *     summary: Pause workflow (stop future scheduled executions)
 *     description: Changes the status of a workflow to 'paused', preventing any future scheduled executions until it is resumed.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to pause.
 *         example: "wf-12345"
 *     responses:
 *       200:
 *         description: Workflow paused successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, example: "wf-12345" }
 *                 status: { type: string, example: "paused" }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Workflow not found.
 *       409:
 *         description: Workflow is already paused or cannot be paused.
 */
router.post(
  '/:workflowId/pause',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  workflowController.pauseWorkflowController
);

/**
 * @swagger
 * /workflows/{workflowId}/resume:
 *   post:
 *     summary: Resume paused workflow
 *     description: Changes the status of a paused workflow back to 'active', allowing future scheduled executions to proceed.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to resume.
 *         example: "wf-12345"
 *     responses:
 *       200:
 *         description: Workflow resumed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, example: "wf-12345" }
 *                 status: { type: string, example: "active" }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Workflow not found.
 *       409:
 *         description: Workflow is not paused or cannot be resumed.
 */
router.post(
  '/:workflowId/resume',
  authorizeRoles('super_admin', 'admin', 'manager', 'user'),
  workflowController.resumeWorkflowController
);

// =================================================================
// Manager Dashboard & Workspace Management Routes
// =================================================================

// NOTE: These routes provide managers with the necessary endpoints to manage their team and view workspace metrics.
// In a larger application, these might exist in a separate `workspace.routes.js` file.

/**
 * @swagger
 * /workspace/metrics:
 *   get:
 *     summary: Get workspace metrics for managers
 *     description: Retrieves key metrics for the current workspace, such as total workflows, executions, and team member count. This endpoint is restricted to managers and admins and does not expose billing information.
 *     tags:
 *       - Workspace Management
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Workspace metrics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalWorkflows:
 *                   type: integer
 *                   example: 50
 *                 totalExecutions:
 *                   type: integer
 *                   example: 1250
 *                 activeMembers:
 *                   type: integer
 *                   example: 8
 *                 planMemberLimit:
 *                   type: integer
 *                   example: 10
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a manager or admin.
 */
router.get(
  '/workspace/metrics',
  authorizeRoles('super_admin', 'admin', 'manager'),
  managerController.getWorkspaceMetricsController
);

/**
 * @swagger
 * /workspace/members:
 *   get:
 *     summary: List all members in the workspace
 *     description: Retrieves a list of all members within the manager's workspace, including their roles.
 *     tags:
 *       - Workspace Management
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: A list of workspace members.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, example: "user-abc-123" }
 *                   name: { type: string, example: "Jane Doe" }
 *                   email: { type: string, example: "jane.doe@example.com" }
 *                   role: { type: string, enum: ['admin', 'manager', 'user'], example: "user" }
 *                   status: { type: string, enum: ['active', 'pending'], example: "active" }
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a manager or admin.
 */
router.get(
  '/workspace/members',
  authorizeRoles('super_admin', 'admin', 'manager'),
  managerController.getTeamMembersController
);

/**
 * @swagger
 * /workspace/members/{memberId}/role:
 *   put:
 *     summary: Update a team member's role
 *     description: Allows a manager or admin to update the role of another member in the workspace. Managers are restricted and cannot promote users to 'admin' or modify other 'admin' or 'manager' roles.
 *     tags:
 *       - Workspace Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the member to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [manager, user]
 *                 description: The new role to assign. Managers can only assign 'user' or 'manager' (to a user).
 *                 example: "user"
 *     responses:
 *       200:
 *         description: Member role updated successfully.
 *       400:
 *         description: Invalid role or member ID provided.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Insufficient permissions to perform this role change.
 *       404:
 *         description: Member not found.
 */
router.put(
  '/workspace/members/:memberId/role',
  authorizeRoles('super_admin', 'admin', 'manager'),
  managerController.updateMemberRoleController
);

/**
 * @swagger
 * /workspace/invitations:
 *   post:
 *     summary: Invite a new member to the workspace
 *     description: Sends an invitation to a new member to join the workspace. This action is checked against the current plan's member limit.
 *     tags:
 *       - Workspace Management
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user to invite.
 *                 example: "new.user@example.com"
 *               role:
 *                 type: string
 *                 enum: [manager, user]
 *                 description: The role to assign to the new member. Managers can only invite 'users' or other 'managers'.
 *                 example: "user"
 *     responses:
 *       201:
 *         description: Invitation sent successfully.
 *       400:
 *         description: Invalid email or role provided.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a manager or admin.
 *       409:
 *         description: User is already a member of the workspace.
 *       422:
 *         description: Unprocessable Entity. The workspace member limit has been reached.
 */
router.post(
  '/workspace/invitations',
  authorizeRoles('super_admin', 'admin', 'manager'),
  checkPlanLimits('team_members'), // Middleware to verify plan limits before proceeding
  managerController.inviteMemberController
);

/**
 * Exports the workflow routes for use by the Express application.
 * @type {express.Router}
 */
export const workflowRoutes = router;