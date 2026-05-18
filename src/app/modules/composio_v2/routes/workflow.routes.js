import express from 'express';
import { workflowController } from '../controllers/workflow.controller.js';

const router = express.Router();

// Workflow Management Routes

/**
 * @route   POST /workflows
 * @desc    Create a new scheduled workflow
 * @access  Private
 * @body    {title, description, executionPlan, workflowType, requiredApps, triggerType?, scheduleConfig?, originalUserInput?, conversationId?, conversationContext?}
 */
router.post('/', workflowController.createWorkflowController);

/**
 * @route   GET /workflows
 * @desc    Get user's workflows with optional filtering
 * @access  Private
 * @query   status?, limit?, offset?
 */
router.get('/', workflowController.getUserWorkflowsController);

/**
 * @route   GET /workflows/:workflowId
 * @desc    Get workflow details by ID
 * @access  Private
 * @params  workflowId
 */
router.get('/:workflowId', workflowController.getWorkflowController);

/**
 * @route   PUT /workflows/:workflowId
 * @desc    Update workflow configuration
 * @access  Private
 * @params  workflowId
 * @body    {title?, description?, scheduleConfig?, triggerType?, status?}
 */
router.put('/:workflowId', workflowController.updateWorkflowController);

/**
 * @route   DELETE /workflows/:workflowId
 * @desc    Delete workflow
 * @access  Private
 * @params  workflowId
 */
router.delete('/:workflowId', workflowController.deleteWorkflowController);

// Workflow Execution Routes

/**
 * @route   POST /workflows/:workflowId/trigger
 * @desc    Manually trigger workflow execution
 * @access  Private
 * @params  workflowId
 */
router.post(
  '/:workflowId/trigger',
  workflowController.triggerWorkflowController
);

/**
 * @route   POST /workflows/:workflowId/pause
 * @desc    Pause workflow (stop future scheduled executions)
 * @access  Private
 * @params  workflowId
 */
router.post('/:workflowId/pause', workflowController.pauseWorkflowController);

/**
 * @route   POST /workflows/:workflowId/resume
 * @desc    Resume paused workflow
 * @access  Private
 * @params  workflowId
 */
router.post('/:workflowId/resume', workflowController.resumeWorkflowController);

/**
 * @route   GET /workflows/:workflowId/executions
 * @desc    Get workflow execution history
 * @access  Private
 * @params  workflowId
 * @query   limit?
 */
router.get(
  '/:workflowId/executions',
  workflowController.getWorkflowExecutionsController
);

// Execution Routes

/**
 * @route   GET /executions/:executionId
 * @desc    Get execution details by ID
 * @access  Private
 * @params  executionId
 */
router.get(
  '/executions/:executionId',
  workflowController.getExecutionController
);

export const workflowRoutes = router;
