import express from 'express';
import auth from '../../../middlewares/auth.js';
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
  getWorkflowStatisticsController
} from '../controllers/workflowStorage.controller.js';
import {
  executeStoredWorkflowController,
  executeBatchStoredWorkflowsController,
  scheduleStoredWorkflowController,
  getStoredWorkflowExecutionHistoryController,
  convertStoredWorkflowToTemplateController
} from '../controllers/workflowExecution.controller.js';

const router = express.Router();

/**
 * @route POST /api/workflow-storage/analyze
 * @desc Analyze user input and store workflow without execution
 * @access Private
 * @body {
 *   userInput: string (required),
 *   title?: string,
 *   description?: string,
 *   conversationId?: string,
 *   conversationContext?: object,
 *   tags?: string[],
 *   category?: string
 * }
 */
router.post('/analyze', auth, analyzeAndStoreWorkflowController);

/**
 * @route GET /api/workflow-storage/workflows
 * @desc Get user's stored workflows with filtering and pagination
 * @access Private
 * @query {
 *   status?: 'draft' | 'ready' | 'archived',
 *   workflowType?: 'single_step' | 'multi_step',
 *   category?: string,
 *   tags?: string or string[],
 *   limit?: number (default: 50),
 *   offset?: number (default: 0),
 *   sortBy?: string (default: 'createdAt'),
 *   sortOrder?: number (default: -1)
 * }
 */
router.get('/workflows', auth, getUserStoredWorkflowsController);

/**
 * @route GET /api/workflow-storage/workflows/executable
 * @desc Get workflows that are ready for execution
 * @access Private
 */
router.get('/workflows/executable', auth, getExecutableWorkflowsController);

/**
 * @route GET /api/workflow-storage/workflows/search
 * @desc Search stored workflows
 * @access Private
 * @query {
 *   searchTerm: string (required),
 *   limit?: number (default: 20),
 *   offset?: number (default: 0)
 * }
 */
router.get('/workflows/search', auth, searchStoredWorkflowsController);

/**
 * @route GET /api/workflow-storage/workflows/statistics
 * @desc Get workflow statistics for the user
 * @access Private
 */
router.get('/workflows/statistics', auth, getWorkflowStatisticsController);

/**
 * @route GET /api/workflow-storage/workflows/:workflowId
 * @desc Get specific stored workflow
 * @access Private
 */
router.get('/workflows/:workflowId', auth, getStoredWorkflowController);

/**
 * @route PUT /api/workflow-storage/workflows/:workflowId
 * @desc Update stored workflow
 * @access Private
 * @body {
 *   title?: string,
 *   description?: string,
 *   tags?: string[],
 *   category?: string,
 *   status?: 'draft' | 'ready' | 'archived'
 * }
 */
router.put('/workflows/:workflowId', auth, updateStoredWorkflowController);

/**
 * @route DELETE /api/workflow-storage/workflows/:workflowId
 * @desc Delete stored workflow
 * @access Private
 */
router.delete('/workflows/:workflowId', auth, deleteStoredWorkflowController);

/**
 * @route POST /api/workflow-storage/workflows/:workflowId/refresh-connections
 * @desc Refresh workflow connections and update status
 * @access Private
 */
router.post('/workflows/:workflowId/refresh-connections', auth, refreshWorkflowConnectionsController);

/**
 * @route POST /api/workflow-storage/workflows/:workflowId/prepare-execution
 * @desc Prepare workflow for execution (returns execution-ready format)
 * @access Private
 */
router.post('/workflows/:workflowId/prepare-execution', auth, prepareWorkflowForExecutionController);

// === WORKFLOW EXECUTION ROUTES ===

/**
 * @route POST /api/workflow-storage/workflows/:workflowId/execute
 * @desc Execute a stored workflow using Composio v2
 * @access Private
 * @body {
 *   triggerSource?: string (default: 'user_click'),
 *   executionMetadata?: object
 * }
 */
router.post('/workflows/:workflowId/execute', auth, executeStoredWorkflowController);

/**
 * @route POST /api/workflow-storage/workflows/execute-batch
 * @desc Execute multiple stored workflows in batch
 * @access Private
 * @body {
 *   workflowIds: string[] (required),
 *   concurrent?: boolean (default: false),
 *   maxConcurrency?: number (default: 3),
 *   continueOnError?: boolean (default: true),
 *   triggerSource?: string (default: 'batch_execution'),
 *   executionMetadata?: object
 * }
 */
router.post('/workflows/execute-batch', auth, executeBatchStoredWorkflowsController);

/**
 * @route POST /api/workflow-storage/workflows/:workflowId/schedule
 * @desc Schedule a stored workflow for recurring execution
 * @access Private
 * @body {
 *   frequency: string (required), // 'daily', 'weekly', 'monthly', 'custom'
 *   cronExpression?: string, // Required for custom frequency
 *   triggerDate?: string, // ISO date string
 *   timezone?: string,
 *   isActive?: boolean (default: true)
 * }
 */
router.post('/workflows/:workflowId/schedule', auth, scheduleStoredWorkflowController);

/**
 * @route GET /api/workflow-storage/workflows/:workflowId/execution-history
 * @desc Get execution history for a stored workflow
 * @access Private
 * @query {
 *   limit?: number (default: 20),
 *   offset?: number (default: 0)
 * }
 */
router.get('/workflows/:workflowId/execution-history', auth, getStoredWorkflowExecutionHistoryController);

/**
 * @route POST /api/workflow-storage/workflows/:workflowId/convert-to-template
 * @desc Convert stored workflow to reusable template
 * @access Private
 * @body {
 *   templateTitle?: string,
 *   templateDescription?: string,
 *   isPublic?: boolean (default: false),
 *   category?: string (default: 'template')
 * }
 */
router.post('/workflows/:workflowId/convert-to-template', auth, convertStoredWorkflowToTemplateController);

export default router;
