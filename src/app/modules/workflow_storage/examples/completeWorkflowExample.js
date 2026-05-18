/**
 * Complete Workflow Storage to Execution Example
 *
 * This example demonstrates the full workflow from analyzing user input,
 * storing the workflow, and then executing it using the integration with Composio v2.
 */

import { workflowStorageService } from './services/workflowStorage.service.js';
import { workflowExecutionIntegrationService } from './services/workflowExecutionIntegration.service.js';

/**
 * Complete workflow example: From input to execution
 */
export const completeWorkflowExample = async () => {
  console.log('🚀 Complete Workflow Storage to Execution Example\n');
  console.log('='.repeat(60));

  const userId = 'demo_user_12345';
  let storedWorkflowId = null;

  try {
    // === STEP 1: ANALYZE AND STORE WORKFLOW ===
    console.log('\n📝 Step 1: Analyzing and storing workflow...');

    const storeResult = await workflowStorageService.analyzeAndStoreWorkflow({
      userInput:
        'Send me a weekly email every Monday at 9 AM with a summary of my GitHub repository activity',
      userId,
      title: 'Weekly GitHub Activity Report',
      description:
        'Automated weekly report of GitHub repository activity delivered via email',
      tags: ['weekly', 'github', 'email', 'automation', 'report'],
      category: 'automation',
      conversationContext: {
        history: [
          {
            role: 'user',
            content: 'I want to stay updated on my GitHub activity',
          },
          {
            role: 'assistant',
            content:
              'I can help you create an automated report. What kind of GitHub activity would you like to track?',
          },
        ],
        sessionId: 'demo_session_001',
      },
    });

    if (storeResult.success) {
      storedWorkflowId = storeResult.data.workflowId;
      console.log('✅ Workflow stored successfully!');
      console.log(`   - Workflow ID: ${storedWorkflowId}`);
      console.log(`   - Type: ${storeResult.data.workflowType}`);
      console.log(`   - Status: ${storeResult.data.status}`);
      console.log(
        `   - Required Apps: ${storeResult.data.requiredApps.join(', ')}`
      );
      console.log(`   - Total Steps: ${storeResult.data.totalSteps}`);
      console.log(
        `   - Executable: ${storeResult.data.isExecutable ? 'Yes' : 'No'}`
      );

      if (storeResult.data.missingConnections.length > 0) {
        console.log(
          `   - Missing Connections: ${storeResult.data.missingConnections.join(', ')}`
        );
      }
    } else {
      console.log('❌ Failed to store workflow:', storeResult.error);
      return;
    }

    // === STEP 2: MANAGE WORKFLOW ===
    console.log('\n⚙️ Step 2: Managing stored workflow...');

    // Get workflow details
    const workflowDetails = await workflowStorageService.getStoredWorkflow(
      storedWorkflowId,
      userId
    );
    if (workflowDetails.success) {
      console.log('✅ Retrieved workflow details');
      console.log(`   - Title: ${workflowDetails.data.title}`);
      console.log(`   - Description: ${workflowDetails.data.description}`);
      console.log(`   - Created: ${workflowDetails.data.createdAt}`);
    }

    // Update workflow metadata
    const updateResult = await workflowStorageService.updateStoredWorkflow(
      storedWorkflowId,
      userId,
      {
        tags: ['weekly', 'github', 'email', 'automation', 'report', 'updated'],
        description:
          'Enhanced automated weekly report of GitHub repository activity with detailed metrics',
      }
    );

    if (updateResult.success) {
      console.log('✅ Workflow updated with additional metadata');
    }

    // === STEP 3: CHECK EXECUTION READINESS ===
    console.log('\n🔍 Step 3: Checking execution readiness...');

    // Refresh connections to get latest status
    const refreshResult =
      await workflowStorageService.refreshWorkflowConnections(
        storedWorkflowId,
        userId
      );

    if (refreshResult.success) {
      console.log('✅ Connections refreshed');
      console.log(`   - Status: ${refreshResult.data.status}`);
      console.log(
        `   - Executable: ${refreshResult.data.isExecutable ? 'Yes' : 'No'}`
      );

      if (refreshResult.data.missingConnections.length > 0) {
        console.log(
          `   - Missing Connections: ${refreshResult.data.missingConnections.join(', ')}`
        );
        console.log(
          '   ⚠️ Workflow cannot be executed until these apps are connected'
        );

        // For demo purposes, we'll continue as if connections were available
        console.log('   📝 For demo: Assuming connections are available...');
      }
    }

    // === STEP 4: PREPARE FOR EXECUTION ===
    console.log('\n🔧 Step 4: Preparing workflow for execution...');

    const prepResult = await workflowStorageService.prepareWorkflowForExecution(
      storedWorkflowId,
      userId
    );

    if (prepResult.success) {
      console.log('✅ Workflow prepared for execution');
      console.log(`   - Title: ${prepResult.data.title}`);
      console.log(`   - Type: ${prepResult.data.workflowType}`);
      console.log(
        `   - Required Apps: ${prepResult.data.requiredApps.join(', ')}`
      );
      console.log(
        `   - Execution Plan: ${prepResult.data.executionPlan.length} steps`
      );

      // Show execution plan details
      console.log('   📋 Execution Plan:');
      prepResult.data.executionPlan.forEach((step, index) => {
        console.log(
          `      ${index + 1}. ${step.app} -> ${step.action}: ${step.description || 'Execute action'}`
        );
      });
    } else {
      console.log('❌ Failed to prepare workflow:', prepResult.error);
      return;
    }

    // === STEP 5: EXECUTE WORKFLOW ===
    console.log('\n🚀 Step 5: Executing stored workflow...');

    const executionResult =
      await workflowExecutionIntegrationService.executeStoredWorkflow(
        storedWorkflowId,
        userId,
        {
          triggerSource: 'demo_execution',
          executionMetadata: {
            demoMode: true,
            executionTime: new Date(),
            userAgent: 'workflow-storage-demo',
          },
        }
      );

    if (executionResult.success) {
      console.log('✅ Workflow execution started successfully!');
      console.log(
        `   - Stored Workflow ID: ${executionResult.data.storedWorkflowId}`
      );
      console.log(
        `   - Composio Workflow ID: ${executionResult.data.composioWorkflowId}`
      );
      console.log(
        `   - Execution ID: ${executionResult.data.executionId || 'Pending'}`
      );
      console.log(`   - Status: ${executionResult.data.status}`);
      console.log(
        `   - Trigger Source: ${executionResult.data.metadata.triggerSource}`
      );
      console.log(
        `   - Workflow Type: ${executionResult.data.metadata.workflowType}`
      );
      console.log(
        `   - Total Steps: ${executionResult.data.metadata.totalSteps}`
      );

      console.log('\n🎉 Workflow is now running in Composio v2!');
      console.log(
        '   📊 You can monitor its progress in the Composio v2 dashboard'
      );
    } else {
      console.log('❌ Failed to execute workflow:', executionResult.error);

      if (executionResult.details) {
        console.log('   📋 Error Details:');
        if (executionResult.details.missingConnections) {
          console.log(
            `      - Missing Connections: ${executionResult.details.missingConnections.join(', ')}`
          );
        }
        if (executionResult.details.requiredApps) {
          console.log(
            `      - Required Apps: ${executionResult.details.requiredApps.join(', ')}`
          );
        }
      }

      console.log('\n💡 To execute this workflow:');
      console.log('   1. Connect the required apps in Composio');
      console.log('   2. Refresh the workflow connections');
      console.log('   3. Try execution again');
    }

    // === STEP 6: SCHEDULE WORKFLOW (OPTIONAL) ===
    console.log('\n📅 Step 6: Scheduling workflow for recurring execution...');

    const scheduleResult =
      await workflowExecutionIntegrationService.scheduleStoredWorkflow(
        storedWorkflowId,
        userId,
        {
          frequency: 'weekly',
          cronExpression: '0 9 * * MON', // Every Monday at 9 AM
          timezone: 'UTC',
          isActive: true,
          description: 'Weekly GitHub activity report every Monday at 9 AM',
        }
      );

    if (scheduleResult.success) {
      console.log('✅ Workflow scheduled successfully!');
      console.log(
        `   - Stored Workflow ID: ${scheduleResult.data.storedWorkflowId}`
      );
      console.log(
        `   - Scheduled Workflow ID: ${scheduleResult.data.scheduledWorkflowId}`
      );
      console.log(
        `   - Next Execution: ${scheduleResult.data.nextExecution || 'Calculated by scheduler'}`
      );
      console.log(
        '   🔄 This workflow will now run automatically every Monday at 9 AM'
      );
    } else {
      console.log('❌ Failed to schedule workflow:', scheduleResult.error);
    }

    // === STEP 7: GET WORKFLOW STATISTICS ===
    console.log('\n📊 Step 7: Getting workflow statistics...');

    const statsResult =
      await workflowStorageService.getWorkflowStatistics(userId);

    if (statsResult.success) {
      console.log('✅ Workflow Statistics:');
      console.log(`   - Total Workflows: ${statsResult.data.totalWorkflows}`);
      console.log(
        `   - Ready for Execution: ${statsResult.data.readyWorkflows}`
      );
      console.log(`   - Draft Status: ${statsResult.data.draftWorkflows}`);
      console.log(`   - Single-step: ${statsResult.data.singleStepWorkflows}`);
      console.log(`   - Multi-step: ${statsResult.data.multiStepWorkflows}`);
      console.log(`   - Total Executions: ${statsResult.data.totalExecutions}`);
      console.log(
        `   - Average Steps per Workflow: ${statsResult.data.averageSteps.toFixed(1)}`
      );
    }

    // === STEP 8: CLEANUP (OPTIONAL) ===
    console.log('\n🧹 Step 8: Cleanup (optional)...');
    console.log('   📝 In a real application, you might want to:');
    console.log('      - Archive old workflows');
    console.log('      - Delete test workflows');
    console.log('      - Export workflow data');
    console.log('      - Convert successful workflows to templates');

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Complete workflow example finished successfully!');
    console.log('');
    console.log('📋 What we accomplished:');
    console.log('   ✅ Analyzed user input using Composio v2 planWorkflow');
    console.log('   ✅ Stored workflow with metadata and planning details');
    console.log('   ✅ Updated workflow information');
    console.log('   ✅ Checked execution readiness');
    console.log('   ✅ Prepared workflow for execution');
    console.log('   ✅ Executed workflow using Composio v2 integration');
    console.log('   ✅ Scheduled workflow for recurring execution');
    console.log('   ✅ Retrieved workflow statistics');
    console.log('');
    console.log('🚀 The workflow is now stored and can be executed anytime!');

    return {
      storedWorkflowId,
      storeResult,
      executionResult,
      scheduleResult,
      statsResult,
    };
  } catch (error) {
    console.error('💥 Error in complete workflow example:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure MongoDB is running and connected');
    console.log('   2. Check that Composio v2 module is properly installed');
    console.log('   3. Verify that required models are imported');
    console.log('   4. Check network connectivity for external API calls');

    return { error: error.message };
  }
};

/**
 * Batch execution example
 */
export const batchExecutionExample = async () => {
  console.log('\n🔄 Batch Execution Example\n');
  console.log('='.repeat(40));

  const userId = 'batch_demo_user';
  const workflowIds = [];

  try {
    // Create multiple workflows for batch execution
    console.log('📝 Creating multiple workflows for batch execution...');

    const workflows = [
      {
        userInput: 'Send me daily GitHub notifications',
        title: 'Daily GitHub Notifications',
        tags: ['daily', 'github'],
      },
      {
        userInput: 'Create Trello card from urgent emails',
        title: 'Urgent Email to Trello',
        tags: ['email', 'trello', 'urgent'],
      },
      {
        userInput: 'Backup my Google Drive files to Dropbox weekly',
        title: 'Weekly Drive Backup',
        tags: ['backup', 'drive', 'dropbox'],
      },
    ];

    for (const workflow of workflows) {
      const result = await workflowStorageService.analyzeAndStoreWorkflow({
        ...workflow,
        userId,
        category: 'automation',
      });

      if (result.success) {
        workflowIds.push(result.data.workflowId);
        console.log(`   ✅ Created: ${workflow.title}`);
      }
    }

    if (workflowIds.length === 0) {
      console.log('❌ No workflows created for batch execution');
      return;
    }

    console.log(`\n🚀 Executing ${workflowIds.length} workflows in batch...`);

    // Execute batch workflows
    const batchResult =
      await workflowExecutionIntegrationService.executeBatchStoredWorkflows(
        workflowIds,
        userId,
        {
          concurrent: true,
          maxConcurrency: 2,
          continueOnError: true,
          triggerSource: 'batch_demo',
          executionMetadata: {
            batchId: `batch_${Date.now()}`,
            demoMode: true,
          },
        }
      );

    if (batchResult.success) {
      console.log('✅ Batch execution completed!');
      console.log(`   - Total Requested: ${batchResult.data.totalRequested}`);
      console.log(`   - Successful: ${batchResult.data.successCount}`);
      console.log(`   - Failed: ${batchResult.data.failureCount}`);

      console.log('\n📊 Results:');
      batchResult.data.results.forEach((result, index) => {
        const status = result.result.success ? '✅' : '❌';
        console.log(
          `   ${status} Workflow ${index + 1}: ${result.result.success ? 'Started' : result.result.error}`
        );
      });

      if (batchResult.data.errors.length > 0) {
        console.log('\n❌ Errors:');
        batchResult.data.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error.workflowId}: ${error.error}`);
        });
      }
    } else {
      console.log('❌ Batch execution failed:', batchResult.error);
    }

    // Cleanup batch workflows
    console.log('\n🧹 Cleaning up batch workflows...');
    for (const workflowId of workflowIds) {
      await workflowStorageService.deleteStoredWorkflow(workflowId, userId);
    }
    console.log('✅ Cleanup completed');

    return batchResult;
  } catch (error) {
    console.error('💥 Error in batch execution example:', error);
    return { error: error.message };
  }
};

/**
 * Run both examples
 */
export const runCompleteExamples = async () => {
  console.log('🌟 Running Complete Workflow Storage Examples\n');

  try {
    // Run complete workflow example
    await completeWorkflowExample();

    // Run batch execution example
    await batchExecutionExample();

    console.log('\n🎊 All examples completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   - Integrate the routes into your main Express app');
    console.log('   - Add the module to your application startup');
    console.log('   - Create a frontend interface for workflow management');
    console.log('   - Set up monitoring for workflow executions');
  } catch (error) {
    console.error('💥 Error running complete examples:', error);
  }
};

// Uncomment to run the examples:
// runCompleteExamples();
