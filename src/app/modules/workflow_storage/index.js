/**
 * @module app/modules/workflow_storage
 * @description
 * This module provides functionality to analyze user input using Composio v2's planWorkflow
 * and store the resulting workflows without executing them. Users can then execute these
 * stored workflows later by clicking a button.
 *
 * ### Features:
 * - Analyze user input to create single-step or multi-step workflows
 * - Store workflows with metadata and planning information
 * - Manage workflow status (draft, ready, archived)
 * - Track required app connections and missing connections
 * - Search and filter stored workflows
 * - Prepare workflows for execution in composio v2 format
 * - Execute stored workflows using composio v2 infrastructure
 * - Batch execution and scheduling capabilities
 * - Workflow statistics and analytics
 *
 * @author GitHub Copilot
 * @created August 20, 2025
 */

/**
 * Express router for workflow storage related endpoints.
 * @type {import('express').Router}
 */
import workflowStorageRoutes from './routes/workflowStorage.routes.js';

/**
 * Service for managing the storage and retrieval of workflows.
 * @type {object}
 */
import { workflowStorageService } from './services/workflowStorage.service.js';

/**
 * Service for integrating with the workflow execution engine (e.g., Composio v2).
 * @type {object}
 */
import { workflowExecutionIntegrationService } from './services/workflowExecutionIntegration.service.js';

/**
 * Mongoose model for Stored Workflows.
 * @type {import('mongoose').Model<any>}
 */
import StoredWorkflow from './models/storedWorkflow.model.js';

export {
  workflowStorageRoutes,
  workflowStorageService,
  workflowExecutionIntegrationService,
  StoredWorkflow,
};

/**
 * The consolidated default export of the Workflow Storage module.
 * This object aggregates all the core components of the module for easy access.
 */
export default {
  /**
   * Express router for workflow storage endpoints.
   * @type {import('express').Router}
   */
  routes: workflowStorageRoutes,

  /**
   * Service for managing workflow storage operations.
   * @type {object}
   */
  storageService: workflowStorageService,

  /**
   * Service for integrating with the workflow execution engine.
   * @type {object}
   */
  executionService: workflowExecutionIntegrationService,

  /**
   * Mongoose model for Stored Workflows.
   * @type {import('mongoose').Model<any>}
   */
  model: StoredWorkflow,
};