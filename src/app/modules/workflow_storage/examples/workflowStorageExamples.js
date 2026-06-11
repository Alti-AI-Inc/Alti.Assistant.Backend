/**
 * @file Provides example usage of the Workflow Storage Module.
 * @module workflowStorageExamples
 *
 * @description This file demonstrates how to use the workflow storage module
 * to analyze user input, store workflows, manage them, and prepare them for execution.
 * It serves as a practical guide for developers integrating with the `workflowStorageService`.
 */

import { workflowStorageService } from './services/workflowStorage.service.js';

/**
 * Demonstrates analyzing and storing a simple, single-step automation workflow.
 * This example simulates a user request to receive daily GitHub notifications via email.
 * The function calls the `analyzeAndStoreWorkflow` service method and logs the result.
 *
 * @async
 * @function exampleSimpleWorkflow
 * @returns {Promise<object|undefined>} A promise that resolves with the result object from the service,
 * or undefined if an error occurs. The result object indicates success or failure and contains
 * the stored workflow's data.
 */
export const exampleSimpleWorkflow = async () => {
  try {
    console.log('=== Example 1: Simple Workflow Storage ===');

    const result = await workflowStorageService.analyzeAndStoreWorkflow({
      userInput: 'Send me an email every morning with my GitHub notifications',
      userId: 'user123',
      title: 'Daily GitHub Notifications',
      description: 'Automated morning email with GitHub notifications',
      tags: ['daily', 'github', 'email', 'notifications'],
      category: 'automation',
    });

    if (result.success) {
      console.log('✅ Workflow stored successfully:');
      console.log(`- Workflow ID: ${result.data.workflowId}`);
      console.log(`- Type: ${result.data.workflowType}`);
      console.log(`- Status: ${result.data.status}`);
      console.log(`- Required Apps: ${result.data.requiredApps.join(', ')}`);
      console.log(`- Total Steps: ${result.data.totalSteps}`);
      console.log(`- Executable: ${result.data.isExecutable}`);

      if (result.data.missingConnections.length > 0) {
        console.log(
          `- Missing Connections: ${result.data.missingConnections.join(', ')}`
        );
      }
    } else {
      console.log('❌ Failed to store workflow:', result.error);
    }

    return result;
  } catch (error) {
    console.error('Error in exampleSimpleWorkflow:', error);
  }
};

/**
 * Demonstrates analyzing and storing a complex, multi-step workflow involving multiple applications.
 * This example simulates a user request to integrate GitHub, Slack, and Trello.
 * It also shows how to pass conversation context to the analysis service.
 *
 * @async
 * @function exampleComplexWorkflow
 * @returns {Promise<object|undefined>} A promise that resolves with the result object from the service,
 * or undefined if an error occurs. The result object indicates success or failure and contains
 * the stored workflow's data, including planning metadata.
 */
export const exampleComplexWorkflow = async () => {
  try {
    console.log('\n=== Example 2: Complex Multi-Step Workflow ===');

    const result = await workflowStorageService.analyzeAndStoreWorkflow({
      userInput:
        'When I create a new GitHub issue, send a Slack message to the team and add it to my Trello board',
      userId: 'user456',
      title: 'GitHub Issue to Team Notification',
      description:
        'Automatically notify team and track issues in Trello when GitHub issues are created',
      tags: ['github', 'slack', 'trello', 'automation', 'team'],
      category: 'integration',
      conversationContext: {
        history: [
          {
            role: 'user',
            content: 'I want to automate my project management workflow',
          },
          {
            role: 'assistant',
            content:
              'I can help you create automated workflows. What specific actions would you like to automate?',
          },
        ],
      },
    });

    if (result.success) {
      console.log('✅ Complex workflow stored successfully:');
      console.log(`- Workflow ID: ${result.data.workflowId}`);
      console.log(`- Type: ${result.data.workflowType}`);
      console.log(`- Status: ${result.data.status}`);
      console.log(`- Required Apps: ${result.data.requiredApps.join(', ')}`);
      console.log(`- Total Steps: ${result.data.totalSteps}`);
      console.log(`- Executable: ${result.data.isExecutable}`);

      if (result.data.planningMetadata) {
        console.log(
          `- Planning Confidence: ${result.data.planningMetadata.confidence}`
        );
        console.log(`- Reasoning: ${result.data.planningMetadata.reasoning}`);
      }
    } else {
      console.log('❌ Failed to store complex workflow:', result.error);
    }

    return result;
  } catch (error) {
    console.error('Error in exampleComplexWorkflow:', error);
  }
};

/**
 * Demonstrates various management functions for a user's stored workflows.
 * This includes:
 * - Fetching all workflows for a user with pagination and sorting.
 * - Fetching only workflows that are ready for execution.
 * - Searching for workflows based on a query string.
 * - Retrieving aggregate statistics about a user's workflows.
 *
 * @async
 * @function exampleWorkflowManagement
 * @param {string} [userId='user123'] - The ID of the user whose workflows are being managed.
 * This demonstrates the multi-tenant nature of the service, where all operations are scoped to a specific user.
 * @returns {Promise<object|undefined>} A promise that resolves with an object containing the results
 * of all management operations (allWorkflows, executableWorkflows, searchResults, stats),
 * or undefined if an error occurs.
 */
export const exampleWorkflowManagement = async (userId = 'user123') => {
  try {
    console.log('\n=== Example 3: Workflow Management ===');

    // Get all workflows for user
    const allWorkflows = await workflowStorageService.getUserStoredWorkflows(
      userId,
      {
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: -1,
      }
    );

    if (allWorkflows.success) {
      console.log(`📋 Found ${allWorkflows.data.workflows.length} workflows:`);
      allWorkflows.data.workflows.forEach((workflow, index) => {
        console.log(
          `  ${index + 1}. ${workflow.title} (${workflow.workflowType}, ${workflow.status})`
        );
      });
    }

    // Get only executable workflows
    const executableWorkflows =
      await workflowStorageService.getExecutableWorkflows(userId);

    if (executableWorkflows.success) {
      console.log(
        `\n⚡ ${executableWorkflows.data.count} executable workflows:`
      );
      executableWorkflows.data.workflows.forEach((workflow, index) => {
        console.log(`  ${index + 1}. ${workflow.title} - Ready to execute`);
      });
    }

    // Search workflows
    const searchResults = await workflowStorageService.searchStoredWorkflows(
      userId,
      'github',
      {
        limit: 5,
      }
    );

    if (searchResults.success) {
      console.log(
        `\n🔍 Search results for "github" (${searchResults.data.resultCount} found):`
      );
      searchResults.data.workflows.forEach((workflow, index) => {
        console.log(`  ${index + 1}. ${workflow.title}`);
      });
    }

    // Get statistics
    const stats = await workflowStorageService.getWorkflowStatistics(userId);

    if (stats.success) {
      console.log('\n📊 Workflow Statistics:');
      console.log(`- Total Workflows: ${stats.data.totalWorkflows}`);
      console.log(
        `- Ready: ${stats.data.readyWorkflows}, Draft: ${stats.data.draftWorkflows}`
      );
      console.log(
        `- Single-step: ${stats.data.singleStepWorkflows}, Multi-step: ${stats.data.multiStepWorkflows}`
      );
      console.log(`- Total Executions: ${stats.data.totalExecutions}`);
      console.log(`- Average Steps: ${stats.data.averageSteps.toFixed(1)}`);
    }

    return {
      allWorkflows,
      executableWorkflows,
      searchResults,
      stats,
    };
  } catch (error) {
    console.error('Error in exampleWorkflowManagement:', error);
  }
};

/**
 * Demonstrates the process of preparing a stored workflow for execution.
 * It fetches a specific workflow, checks if it's executable, and if not, attempts to
 * refresh its connections. Finally, it calls the service to get the data payload
 * required for execution by another system (e.g., Composio v2).
 *
 * @async
 * @function exampleWorkflowExecution
 * @param {string} workflowId - The ID of the workflow to prepare for execution.
 * @param {string} [userId='user123'] - The ID of the user who owns the workflow.
 * This ensures that a user can only access their own workflows.
 * @returns {Promise<object|undefined>} A promise that resolves with the execution data from the service,
 * or undefined if the workflow is not found or an error occurs.
 */
export const exampleWorkflowExecution = async (
  workflowId,
  userId = 'user123'
) => {
  try {
    console.log('\n=== Example 4: Workflow Execution Preparation ===');

    // Get workflow details
    const workflow = await workflowStorageService.getStoredWorkflow(
      workflowId,
      userId
    );

    if (!workflow.success) {
      console.log('❌ Workflow not found');
      return;
    }

    console.log(`📄 Workflow: ${workflow.data.title}`);
    console.log(`- Type: ${workflow.data.workflowType}`);
    console.log(`- Status: ${workflow.data.status}`);
    console.log(`- Is Executable: ${workflow.data.isExecutable}`);

    if (!workflow.data.isExecutable) {
      console.log(
        `- Missing Connections: ${workflow.data.missingConnections.join(', ')}`
      );

      // Try to refresh connections
      console.log('\n🔄 Refreshing connections...');
      const refreshResult =
        await workflowStorageService.refreshWorkflowConnections(
          workflowId,
          userId
        );

      if (refreshResult.success) {
        console.log(
          `✅ Connections refreshed. New status: ${refreshResult.data.status}`
        );
        console.log(`- Is Executable: ${refreshResult.data.isExecutable}`);

        if (refreshResult.data.missingConnections.length > 0) {
          console.log(
            `- Still missing: ${refreshResult.data.missingConnections.join(', ')}`
          );
          return;
        }
      }
    }

    // Prepare for execution
    console.log('\n⚙️ Preparing for execution...');
    const executionData =
      await workflowStorageService.prepareWorkflowForExecution(
        workflowId,
        userId
      );

    if (executionData.success) {
      console.log('✅ Workflow prepared for execution:');
      console.log(`- Title: ${executionData.data.title}`);
      console.log(`- Type: ${executionData.data.workflowType}`);
      console.log(
        `- Required Apps: ${executionData.data.requiredApps.join(', ')}`
      );
      console.log(
        `- Execution Plan: ${executionData.data.executionPlan.length} steps`
      );
      console.log('\n🚀 Ready to pass to Composio v2 for execution!');

      // This execution data can now be passed to composio_v2 workflow service
      // Example: await composio_v2_workflowService.createWorkflow(executionData.data);
    } else {
      console.log('❌ Failed to prepare workflow:', executionData.error);
    }

    return executionData;
  } catch (error) {
    console.error('Error in exampleWorkflowExecution:', error);
  }
};

/**
 * Demonstrates how to update the metadata of an existing stored workflow.
 * This function updates properties like title, description, tags, and category.
 *
 * @async
 * @function exampleWorkflowUpdate
 * @param {string} workflowId - The ID of the workflow to update.
 * @param {string} [userId='user123'] - The ID of the user who owns the workflow, ensuring proper authorization.
 * @returns {Promise<object|undefined>} A promise that resolves with the result of the update operation,
 * containing the updated workflow data, or undefined if an error occurs.
 */
export const exampleWorkflowUpdate = async (workflowId, userId = 'user123') => {
  try {
    console.log('\n=== Example 5: Workflow Update ===');

    const updateResult = await workflowStorageService.updateStoredWorkflow(
      workflowId,
      userId,
      {
        title: 'Updated Workflow Title',
        description: 'This workflow has been updated with new metadata',
        tags: ['updated', 'modified', 'automation'],
        category: 'productivity',
        status: 'ready',
      }
    );

    if (updateResult.success) {
      console.log('✅ Workflow updated successfully:');
      console.log(`- New Title: ${updateResult.data.title}`);
      console.log(`- New Description: ${updateResult.data.description}`);
      console.log(`- New Tags: ${updateResult.data.tags.join(', ')}`);
      console.log(`- New Category: ${updateResult.data.category}`);
    } else {
      console.log('❌ Failed to update workflow:', updateResult.error);
    }

    return updateResult;
  } catch (error) {
    console.error('Error in exampleWorkflowUpdate:', error);
  }
};

/**
 * A main function to execute all other example functions in a logical sequence.
 * This provides a comprehensive demonstration of the workflow storage module's lifecycle,
 * from creation and management to preparation for execution and updating.
 *
 * @async
 * @function runAllExamples
 * @returns {Promise<void>} A promise that resolves when all examples have completed.
 */
export const runAllExamples = async () => {
  console.log('🚀 Running Workflow Storage Module Examples...\n');

  try {
    // Example 1: Store simple workflow
    const simpleWorkflow = await exampleSimpleWorkflow();

    // Example 2: Store complex workflow
    const complexWorkflow = await exampleComplexWorkflow();

    // Example 3: Manage workflows
    await exampleWorkflowManagement('user123');

    // Example 4: Prepare for execution (if we have a stored workflow)
    if (simpleWorkflow?.success) {
      await exampleWorkflowExecution(simpleWorkflow.data.workflowId, 'user123');

      // Example 5: Update workflow
      await exampleWorkflowUpdate(simpleWorkflow.data.workflowId, 'user123');
    }

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
};

// Uncomment to run examples:
// runAllExamples();