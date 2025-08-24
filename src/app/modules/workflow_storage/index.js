/**
 * Workflow Storage Module
 * 
 * This module provides functionality to analyze user input using Composio v2's planWorkflow
 * and store the resulting workflows without executing them. Users can then execute these
 * stored workflows later by clicking a button.
 * 
 * Features:
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
 * Author: GitHub Copilot
 * Created: August 20, 2025
 */

import workflowStorageRoutes from './routes/workflowStorage.routes.js';
import { workflowStorageService } from './services/workflowStorage.service.js';
import { workflowExecutionIntegrationService } from './services/workflowExecutionIntegration.service.js';
import StoredWorkflow from './models/storedWorkflow.model.js';

export {
  workflowStorageRoutes,
  workflowStorageService,
  workflowExecutionIntegrationService,
  StoredWorkflow
};

export default {
  routes: workflowStorageRoutes,
  storageService: workflowStorageService,
  executionService: workflowExecutionIntegrationService,
  model: StoredWorkflow
};
