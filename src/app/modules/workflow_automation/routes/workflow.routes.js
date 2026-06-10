import express from 'express';
import { workflowController } from '../controllers/workflow.controller.js';
import auth from '../../../middlewares/auth/auth.js';
import optionalAuth from '../../../middlewares/auth/optionalAuth.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Workflow Automation
 *   description: API for managing user workflows and automation processes.
 */

// Workflow management routes

/**
 * @swagger
 * /api/v1/workflows:
 *   get:
 *     summary: Get all workflows for the authenticated user
 *     tags: [Workflow Automation]
 *     description: Retrieve a list of all workflows associated with the currently authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of user workflows.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Workflow'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/', auth(), workflowController.getUserWorkflowsController);

// Visual Layout Compilation & Validation routes (placed before /:workflowId to prevent route parameter collision)

/**
 * @swagger
 * /api/v1/workflows/layout/validate:
 *   post:
 *     summary: Validate a workflow's visual layout
 *     tags: [Workflow Automation]
 *     description: Validates the structural integrity and correctness of a workflow's visual layout definition.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               layout:
 *                 type: object
 *                 description: The visual layout definition of the workflow.
 *                 example: { "nodes": [], "edges": [] }
 *     responses:
 *       200:
 *         description: Layout validated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isValid:
 *                   type: boolean
 *                   description: Indicates if the layout is valid.
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: A list of validation errors, if any.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/layout/validate',
  auth(),
  workflowController.validateWorkflowLayoutController
);

/**
 * @swagger
 * /api/v1/workflows/layout/compile:
 *   post:
 *     summary: Compile a workflow's visual layout
 *     tags: [Workflow Automation]
 *     description: Compiles a workflow's visual layout into an executable format, ready for deployment or execution.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               layout:
 *                 type: object
 *                 description: The visual layout definition of the workflow.
 *                 example: { "nodes": [], "edges": [] }
 *     responses:
 *       200:
 *         description: Layout compiled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 compiledCode:
 *                   type: string
 *                   description: The compiled executable code or representation of the workflow.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/layout/compile',
  auth(),
  workflowController.compileWorkflowLayoutController
);

// Template routes (placed before /:workflowId to prevent route parameter collision)

/**
 * @swagger
 * /api/v1/workflows/templates/list:
 *   get:
 *     summary: Get a list of available workflow templates
 *     tags: [Workflow Automation]
 *     description: Retrieve a list of pre-defined workflow templates that users can use as a starting point. Authentication is optional.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of workflow templates.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WorkflowTemplate'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/templates/list',
  optionalAuth(),
  workflowController.getWorkflowTemplatesController
);

/**
 * @swagger
 * /api/v1/workflows/templates/{templateId}/create:
 *   post:
 *     summary: Create a new workflow from a specified template
 *     tags: [Workflow Automation]
 *     description: Creates a new workflow instance based on an existing template, copying its structure and initial configuration.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow template to use.
 *     responses:
 *       201:
 *         description: Workflow created successfully from template.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Workflow'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/templates/:templateId/create',
  auth(),
  workflowController.createFromTemplateController
);

/**
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   get:
 *     summary: Get details of a specific workflow
 *     tags: [Workflow Automation]
 *     description: Retrieve the full details of a single workflow by its ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to retrieve.
 *     responses:
 *       200:
 *         description: Workflow details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Workflow'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:workflowId', auth(), workflowController.getWorkflowController);

/**
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   put:
 *     summary: Update an existing workflow
 *     tags: [Workflow Automation]
 *     description: Update the details of a specific workflow identified by its ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WorkflowUpdate'
 *     responses:
 *       200:
 *         description: Workflow updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Workflow'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/:workflowId', auth(), workflowController.updateWorkflowController);

/**
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   delete:
 *     summary: Delete a specific workflow
 *     tags: [Workflow Automation]
 *     description: Deletes a workflow identified by its ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to delete.
 *     responses:
 *       204:
 *         description: Workflow deleted successfully.
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete(
  '/:workflowId',
  auth(),
  workflowController.deleteWorkflowController
);

/**
 * @swagger
 * /api/v1/workflows/{workflowId}/status:
 *   patch:
 *     summary: Toggle the active status of a workflow
 *     tags: [Workflow Automation]
 *     description: Activates or deactivates a workflow, controlling whether it can be executed.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow to update its status.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *                 description: The new active status for the workflow (true for active, false for inactive).
 *                 example: true
 *     responses:
 *       200:
 *         description: Workflow status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Workflow'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch(
  '/:workflowId/status',
  auth(),
  workflowController.toggleWorkflowStatusController
);

/**
 * @typedef {object} Workflow
 * @property {string} _id - The unique identifier for the workflow.
 * @property {string} name - The name of the workflow.
 * @property {string} description - A brief description of the workflow.
 * @property {string} userId - The ID of the user who owns this workflow.
 * @property {object} layout - The visual layout definition of the workflow (e.g., nodes, edges).
 * @property {boolean} isActive - Whether the workflow is currently active and runnable.
 * @property {string} createdAt - The date and time when the workflow was created.
 * @property {string} updatedAt - The date and time when the workflow was last updated.
 */

/**
 * @typedef {object} WorkflowUpdate
 * @property {string} [name] - The new name of the workflow.
 * @property {string} [description] - A new description for the workflow.
 * @property {object} [layout] - The new visual layout definition of the workflow.
 * @property {boolean} [isActive] - The new active status for the workflow.
 */

/**
 * @typedef {object} WorkflowTemplate
 * @property {string} _id - The unique identifier for the template.
 * @property {string} name - The name of the template.
 * @property {string} description - A brief description of what the template does.
 * @property {object} defaultLayout - The default visual layout for workflows created from this template.
 * @property {string} category - The category of the template (e.g., "Marketing", "Sales", "Utility").
 * @property {string} createdAt - The date and time when the template was created.
 * @property {string} updatedAt - The date and time when the template was last updated.
 */

/**
 * @global
 * @typedef {object} UnauthorizedError
 * @property {string} message - Error message, e.g., "Unauthorized"
 */

/**
 * @global
 * @typedef {object} BadRequestError
 * @property {string} message - Error message, e.g., "Bad Request" or specific validation error.
 */

/**
 * @global
 * @typedef {object} NotFoundError
 * @property {string} message - Error message, e.g., "Workflow not found"
 */

/**
 * @global
 * @typedef {object} InternalServerError
 * @property {string} message - Error message, e.g., "Internal Server Error"
 */

/**
 * Workflow routes for the API.
 * @type {express.Router}
 */
export const workflowRoutes = router;