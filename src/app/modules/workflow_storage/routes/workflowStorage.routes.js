import express from 'express';
import auth from '../../../middlewares/auth/auth.js';
import {
  analyzeAndStoreWorkflowController,
  getUserStoredWorkflowsController,
  getStoredWorkflowController,
  updateStoredWorkflowController,
  deleteStoredWorkflowController,
  searchStoredWorkflowsController,
  getExecutableWorkflowsController,
  refreshWorkflowConnectionsController,
  prepareWorkflowForExecutionController,
  getWorkflowStatisticsController,
} from '../controllers/workflowStorage.controller.js';
import {
  executeStoredWorkflowController,
  executeBatchStoredWorkflowsController,
  scheduleStoredWorkflowController,
  getStoredWorkflowExecutionHistoryController,
  convertStoredWorkflowToTemplateController,
} from '../controllers/workflowExecution.controller.js';

/**
 * @typedef {import('express').Router} Router
 */

/**
 * Express router for handling workflow storage and execution related API routes.
 * This router groups endpoints for creating, retrieving, updating, deleting,
 * searching, and executing user-defined workflows.
 * @type {Router}
 */
const router = express.Router();

/**
 * @swagger
 * /api/workflow-storage/analyze:
 *   post:
 *     summary: Analyze user input and store workflow without execution
 *     description: Analyzes provided natural language user input to generate and store a workflow definition. The generated workflow is not executed immediately upon storage.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userInput
 *             properties:
 *               userInput:
 *                 type: string
 *                 description: The natural language input from the user to be analyzed for workflow creation.
 *                 example: "Create a workflow to send an email to John Doe with the subject 'Meeting Reminder' and body 'Don't forget our meeting tomorrow.'"
 *               title:
 *                 type: string
 *                 description: An optional title for the stored workflow.
 *                 example: "Email Meeting Reminder"
 *               description:
 *                 type: string
 *                 description: An optional detailed description for the workflow.
 *                 example: "A workflow to remind John Doe about an upcoming meeting."
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of the conversation context from which the workflow was generated.
 *                 example: "conv_12345"
 *               conversationContext:
 *                 type: object
 *                 description: Optional object containing additional context from the conversation.
 *                 example: { "userPreferences": { "emailFormat": "html" } }
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional list of tags to categorize the workflow.
 *                 example: ["email", "reminder", "automation"]
 *               category:
 *                 type: string
 *                 description: Optional category for the workflow (e.g., 'communication', 'productivity').
 *                 example: "communication"
 *     responses:
 *       201:
 *         description: Workflow analyzed and stored successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow analyzed and stored successfully."
 *                 workflowId:
 *                   type: string
 *                   description: The ID of the newly created workflow.
 *                   example: "654321098765432109876543"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/analyze', auth, analyzeAndStoreWorkflowController);

/**
 * @swagger
 * /api/workflow-storage/workflows:
 *   get:
 *     summary: Get user's stored workflows
 *     description: Retrieves a list of workflows stored by the authenticated user, with options for filtering and pagination.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, ready, archived]
 *         description: Filter workflows by their current status.
 *         example: ready
 *       - in: query
 *         name: workflowType
 *         schema:
 *           type: string
 *           enum: [single_step, multi_step]
 *         description: Filter workflows by their type (single-step or multi-step).
 *         example: multi_step
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter workflows by a specific category.
 *         example: communication
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *           style: form
 *           explode: false
 *         description: Filter workflows by one or more tags (comma-separated for multiple tags).
 *         example: "email,automation"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 50
 *         description: Maximum number of workflows to return.
 *         example: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of workflows to skip before starting to collect the result set.
 *         example: 0
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort the workflows by.
 *         example: updatedAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: integer
 *           enum: [1, -1]
 *           default: -1
 *         description: Sort order (1 for ascending, -1 for descending).
 *         example: -1
 *     responses:
 *       200:
 *         description: A list of stored workflows.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflows retrieved successfully."
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Placeholder for Workflow schema
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       title:
 *                         type: string
 *                         example: "My First Workflow"
 *                       status:
 *                         type: string
 *                         enum: [draft, ready, archived]
 *                         example: "ready"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:00:00Z"
 *                 totalCount:
 *                   type: integer
 *                   description: Total number of workflows matching the criteria.
 *                   example: 100
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/workflows', auth, getUserStoredWorkflowsController);

/**
 * @swagger
 * /api/workflow-storage/workflows/executable:
 *   get:
 *     summary: Get executable workflows
 *     description: Retrieves a list of workflows that are marked as 'ready' and can be executed by the authenticated user.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of executable workflows.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Executable workflows retrieved successfully."
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Placeholder for Workflow schema
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       title:
 *                         type: string
 *                         example: "My Executable Workflow"
 *                       status:
 *                         type: string
 *                         enum: [draft, ready, archived]
 *                         example: "ready"
 *                       isExecutable:
 *                         type: boolean
 *                         example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/workflows/executable', auth, getExecutableWorkflowsController);

/**
 * @swagger
 * /api/workflow-storage/workflows/search:
 *   get:
 *     summary: Search stored workflows
 *     description: Searches through the authenticated user's stored workflows based on a provided search term, with pagination.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         required: true
 *         description: The term to search for within workflow titles, descriptions, or tags.
 *         example: "email reminder"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *         description: Maximum number of search results to return.
 *         example: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of search results to skip before starting to collect the result set.
 *         example: 0
 *     responses:
 *       200:
 *         description: A list of workflows matching the search term.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflows found successfully."
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Placeholder for Workflow schema
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       title:
 *                         type: string
 *                         example: "Send Email Reminder"
 *                       description:
 *                         type: string
 *                         example: "Workflow to send a reminder email."
 *                 totalCount:
 *                   type: integer
 *                   description: Total number of workflows matching the search term.
 *                   example: 5
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/workflows/search', auth, searchStoredWorkflowsController);

/**
 * @swagger
 * /api/workflow-storage/workflows/statistics:
 *   get:
 *     summary: Get workflow statistics
 *     description: Retrieves various statistics related to the authenticated user's workflows, such as counts by status, category, or execution history.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workflow statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow statistics retrieved successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalWorkflows:
 *                       type: integer
 *                       example: 15
 *                       description: Total number of workflows owned by the user.
 *                     statusCounts:
 *                       type: object
 *                       properties:
 *                         draft:
 *                           type: integer
 *                           example: 5
 *                         ready:
 *                           type: integer
 *                           example: 8
 *                         archived:
 *                           type: integer
 *                           example: 2
 *                       description: Counts of workflows by their status.
 *                     categoryCounts:
 *                       type: object
 *                       properties:
 *                         communication:
 *                           type: integer
 *                           example: 7
 *                         productivity:
 *                           type: integer
 *                           example: 5
 *                       description: Counts of workflows by category.
 *                     lastExecuted:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: "2023-10-26T14:30:00Z"
 *                       description: Timestamp of the last workflow execution.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/workflows/statistics', auth, getWorkflowStatisticsController);

/**
 * @swagger
 * /api/workflow-storage/workflows/{workflowId}:
 *   get:
 *     summary: Get a specific stored workflow
 *     description: Retrieves the detailed information for a single workflow identified by its ID, owned by the authenticated user.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the workflow to retrieve.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Workflow details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow retrieved successfully."
 *                 data:
 *                   type: object # Placeholder for full Workflow schema
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     title:
 *                       type: string
 *                       example: "My Detailed Workflow"
 *                     description:
 *                       type: string
 *                       example: "This workflow performs a series of actions."
 *                     status:
 *                       type: string
 *                       enum: [draft, ready, archived]
 *                       example: "ready"
 *                     steps:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           stepId:
 *                             type: string
 *                             example: "step_1"
 *                           action:
 *                             type: string
 *                             example: "sendEmail"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/workflows/:workflowId', auth, getStoredWorkflowController);

/**
 * @swagger
 * /api/workflow-storage/workflows/{workflowId}:
 *   put:
 *     summary: Update a stored workflow
 *     description: Updates the details of an existing workflow identified by its ID. Only the fields provided in the request body will be updated.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the workflow to update.
 *         example: "654321098765432109876543"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: New title for the workflow.
 *                 example: "Updated Workflow Title"
 *               description:
 *                 type: string
 *                 description: New detailed description for the workflow.
 *                 example: "This workflow now includes additional steps."
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: New list of tags to categorize the workflow.
 *                 example: ["updated", "tag"]
 *               category:
 *                 type: string
 *                 description: New category for the workflow.
 *                 example: "management"
 *               status:
 *                 type: string
 *                 enum: [draft, ready, archived]
 *                 description: New status for the workflow.
 *                 example: "ready"
 *     responses:
 *       200:
 *         description: Workflow updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow updated successfully."
 *                 data:
 *                   type: object # Placeholder for updated Workflow schema
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     title:
 *                       type: string
 *                       example: "Updated Workflow Title"
 *                     status:
 *                       type: string
 *                       example: "ready"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/workflows/:workflowId', auth, updateStoredWorkflowController);

/**
 * @swagger
 * /api/workflow-storage/workflows/{workflowId}:
 *   delete:
 *     summary: Delete a stored workflow
 *     description: Deletes a workflow identified by its ID from the user's storage. This action is irreversible.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the workflow to delete.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Workflow deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow deleted successfully."
 *                 data:
 *                   type: object # Placeholder for deleted Workflow confirmation
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "654321098765432109876543"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete('/workflows/:workflowId', auth, deleteStoredWorkflowController);

/**
 * @swagger
 * /api/workflow-storage/workflows/{workflowId}/refresh-connections:
 *   post:
 *     summary: Refresh workflow connections
 *     description: Refreshes the connections and dependencies for a specified workflow, updating its status based on connection validity.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the workflow whose connections are to be refreshed.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Workflow connections refreshed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow connections refreshed and status updated."
 *                 data:
 *                   type: object # Placeholder for updated Workflow schema
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     status:
 *                       type: string
 *                       enum: [draft, ready, archived]
 *                       example: "ready"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/workflows/:workflowId/refresh-connections',
  auth,
  refreshWorkflowConnectionsController
);

/**
 * @swagger
 * /api/workflow-storage/workflows/{workflowId}/prepare-execution:
 *   post:
 *     summary: Prepare workflow for execution
 *     description: Processes a stored workflow and returns it in an execution-ready format, without actually executing it. This might involve resolving dynamic values or compiling steps.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the workflow to prepare for execution.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Workflow prepared for execution successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow prepared for execution."
 *                 data:
 *                   type: object # Placeholder for execution-ready workflow structure
 *                   properties:
 *                     workflowId:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     executableSteps:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           action:
 *                             type: string
 *                             example: "sendEmail"
 *                           parameters:
 *                             type: object
 *                             example: { "to": "test@example.com" }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/workflows/:workflowId/prepare-execution',
  auth,
  prepareWorkflowForExecutionController
);

// === WORKFLOW EXECUTION ROUTES ===

/**
 * @swagger
 * /api/workflow-storage/workflows/{workflowId}/execute:
 *   post:
 *     summary: Execute a stored workflow
 *     description: Initiates the execution of a specific stored workflow using the Composio v2 engine.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the workflow to execute.
 *         example: "654321098765432109876543"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               triggerSource:
 *                 type: string
 *                 description: The source that triggered the workflow execution.
 *                 default: user_click
 *                 example: "api_call"
 *               executionMetadata:
 *                 type: object
 *                 description: Optional metadata to be associated with this specific execution.
 *                 example: { "userId": "user_abc", "environment": "production" }
 *     responses:
 *       202:
 *         description: Workflow execution initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow execution initiated."
 *                 executionId:
 *                   type: string
 *                   description: The ID of the initiated workflow execution.
 *                   example: "exec_1234567890"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/workflows/:workflowId/execute',
  auth,
  executeStoredWorkflowController
);

/**
 * @swagger
 * /api/workflow-storage/workflows/execute-batch:
 *   post:
 *     summary: Execute multiple stored workflows in batch
 *     description: Initiates the execution of multiple stored workflows simultaneously or sequentially based on configuration.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workflowIds
 *             properties:
 *               workflowIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of unique identifiers for the workflows to be executed.
 *                 example: ["654321098765432109876543", "654321098765432109876544"]
 *               concurrent:
 *                 type: boolean
 *                 description: If true, workflows will be executed concurrently up to maxConcurrency. If false, they will be executed sequentially.
 *                 default: false
 *                 example: true
 *               maxConcurrency:
 *                 type: integer
 *                 description: The maximum number of workflows to execute concurrently if 'concurrent' is true.
 *                 default: 3
 *                 minimum: 1
 *                 example: 5
 *               continueOnError:
 *                 type: boolean
 *                 description: If true, batch execution continues even if one workflow fails. If false, the entire batch stops on the first failure.
 *                 default: true
 *                 example: false
 *               triggerSource:
 *                 type: string
 *                 description: The source that triggered the batch workflow execution.
 *                 default: batch_execution
 *                 example: "scheduled_batch"
 *               executionMetadata:
 *                 type: object
 *                 description: Optional metadata to be associated with this batch execution.
 *                 example: { "batchName": "Daily Reports", "initiatedBy": "admin" }
 *     responses:
 *       202:
 *         description: Batch workflow execution initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Batch workflow execution initiated."
 *                 batchExecutionId:
 *                   type: string
 *                   description: The ID of the initiated batch execution.
 *                   example: "batch_exec_0987654321"
 *                 initiatedWorkflows:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       workflowId:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       executionId:
 *                         type: string
 *                         example: "exec_1234567890"
 *                       status:
 *                         type: string
 *                         example: "initiated"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/workflows/execute-batch',
  auth,
  executeBatchStoredWorkflowsController
);

/**
 * @swagger
 * /api/workflow-storage/workflows/{workflowId}/schedule:
 *   post:
 *     summary: Schedule a stored workflow
 *     description: Schedules a specific stored workflow for recurring execution based on a defined frequency or cron expression.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the workflow to schedule.
 *         example: "654321098765432109876543"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - frequency
 *             properties:
 *               frequency:
 *                 type: string
 *                 enum: [daily, weekly, monthly, custom]
 *                 description: The recurrence frequency for the workflow.
 *                 example: "weekly"
 *               cronExpression:
 *                 type: string
 *                 description: A cron expression for custom scheduling. Required if frequency is 'custom'.
 *                 example: "0 0 * * 1" # Every Monday at midnight
 *               triggerDate:
 *                 type: string
 *                 format: date-time
 *                 description: An ISO date string specifying the initial trigger date/time.
 *                 example: "2024-01-01T09:00:00Z"
 *               timezone:
 *                 type: string
 *                 description: The timezone for the schedule (e.g., 'America/New_York').
 *                 example: "America/Los_Angeles"
 *               isActive:
 *                 type: boolean
 *                 description: Whether the schedule should be active immediately.
 *                 default: true
 *                 example: true
 *     responses:
 *       201:
 *         description: Workflow scheduled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow scheduled successfully."
 *                 scheduleId:
 *                   type: string
 *                   description: The ID of the newly created schedule.
 *                   example: "sched_abc123"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/workflows/:workflowId/schedule',
  auth,
  scheduleStoredWorkflowController
);

/**
 * @swagger
 * /api/workflow-storage/workflows/{workflowId}/execution-history:
 *   get:
 *     summary: Get execution history for a stored workflow
 *     description: Retrieves a paginated list of past execution records for a specific stored workflow.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the workflow to retrieve execution history for.
 *         example: "654321098765432109876543"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *         description: Maximum number of execution records to return.
 *         example: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of execution records to skip before starting to collect the result set.
 *         example: 0
 *     responses:
 *       200:
 *         description: Execution history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Execution history retrieved successfully."
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Placeholder for WorkflowExecution schema
 *                     properties:
 *                       executionId:
 *                         type: string
 *                         example: "exec_1234567890"
 *                       workflowId:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       status:
 *                         type: string
 *                         enum: [pending, running, completed, failed, cancelled]
 *                         example: "completed"
 *                       startTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:05:00Z"
 *                       endTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:05:30Z"
 *                 totalCount:
 *                   type: integer
 *                   description: Total number of execution records for the workflow.
 *                   example: 50
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/workflows/:workflowId/execution-history',
  auth,
  getStoredWorkflowExecutionHistoryController
);

/**
 * @swagger
 * /api/workflow-storage/workflows/{workflowId}/convert-to-template:
 *   post:
 *     summary: Convert stored workflow to reusable template
 *     description: Converts an existing stored workflow into a reusable template, which can then be used by other users (if public) or the same user to create new workflows.
 *     tags:
 *       - Workflow Storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the workflow to convert into a template.
 *         example: "654321098765432109876543"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               templateTitle:
 *                 type: string
 *                 description: An optional title for the new template. If not provided, the workflow's title might be used.
 *                 example: "Email Reminder Template"
 *               templateDescription:
 *                 type: string
 *                 description: An optional description for the new template.
 *                 example: "A template for sending automated email reminders."
 *               isPublic:
 *                 type: boolean
 *                 description: If true, the template will be publicly accessible. If false, it will be private to the user/organization.
 *                 default: false
 *                 example: false
 *               category:
 *                 type: string
 *                 description: An optional category for the template.
 *                 default: template
 *                 example: "communication"
 *     responses:
 *       201:
 *         description: Workflow successfully converted to a template.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow converted to template successfully."
 *                 templateId:
 *                   type: string
 *                   description: The ID of the newly created template.
 *                   example: "tmpl_abc123"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/workflows/:workflowId/convert-to-template',
  auth,
  convertStoredWorkflowToTemplateController
);

export default router;