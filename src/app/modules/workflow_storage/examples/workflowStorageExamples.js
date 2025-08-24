/**
 * Example usage of the Workflow Storage Module
 * 
 * This file demonstrates how to use the workflow storage module
 * to analyze user input and store workflows for later execution.
 */

import { workflowStorageService } from './services/workflowStorage.service.js';

/**
 * Example 1: Analyze and store a simple automation workflow
 */
export const exampleSimpleWorkflow = async () => {
  try {
    console.log('=== Example 1: Simple Workflow Storage ===');
    
    const result = await workflowStorageService.analyzeAndStoreWorkflow({
      userInput: "Send me an email every morning with my GitHub notifications",
      userId: "user123",
      title: "Daily GitHub Notifications",
      description: "Automated morning email with GitHub notifications",
      tags: ["daily", "github", "email", "notifications"],
      category: "automation"
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
        console.log(`- Missing Connections: ${result.data.missingConnections.join(', ')}`);
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
 * Example 2: Analyze and store a complex multi-step workflow
 */
export const exampleComplexWorkflow = async () => {
  try {
    console.log('\n=== Example 2: Complex Multi-Step Workflow ===');
    
    const result = await workflowStorageService.analyzeAndStoreWorkflow({
      userInput: "When I create a new GitHub issue, send a Slack message to the team and add it to my Trello board",
      userId: "user456",
      title: "GitHub Issue to Team Notification",
      description: "Automatically notify team and track issues in Trello when GitHub issues are created",
      tags: ["github", "slack", "trello", "automation", "team"],
      category: "integration",
      conversationContext: {
        history: [
          { role: "user", content: "I want to automate my project management workflow" },
          { role: "assistant", content: "I can help you create automated workflows. What specific actions would you like to automate?" }
        ]
      }
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
        console.log(`- Planning Confidence: ${result.data.planningMetadata.confidence}`);
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
 * Example 3: Retrieve and manage stored workflows
 */
export const exampleWorkflowManagement = async (userId = "user123") => {
  try {
    console.log('\n=== Example 3: Workflow Management ===');
    
    // Get all workflows for user
    const allWorkflows = await workflowStorageService.getUserStoredWorkflows(userId, {
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: -1
    });

    if (allWorkflows.success) {
      console.log(`📋 Found ${allWorkflows.data.workflows.length} workflows:`);
      allWorkflows.data.workflows.forEach((workflow, index) => {
        console.log(`  ${index + 1}. ${workflow.title} (${workflow.workflowType}, ${workflow.status})`);
      });
    }

    // Get only executable workflows
    const executableWorkflows = await workflowStorageService.getExecutableWorkflows(userId);
    
    if (executableWorkflows.success) {
      console.log(`\n⚡ ${executableWorkflows.data.count} executable workflows:`);
      executableWorkflows.data.workflows.forEach((workflow, index) => {
        console.log(`  ${index + 1}. ${workflow.title} - Ready to execute`);
      });
    }

    // Search workflows
    const searchResults = await workflowStorageService.searchStoredWorkflows(userId, "github", {
      limit: 5
    });

    if (searchResults.success) {
      console.log(`\n🔍 Search results for "github" (${searchResults.data.resultCount} found):`);
      searchResults.data.workflows.forEach((workflow, index) => {
        console.log(`  ${index + 1}. ${workflow.title}`);
      });
    }

    // Get statistics
    const stats = await workflowStorageService.getWorkflowStatistics(userId);
    
    if (stats.success) {
      console.log('\n📊 Workflow Statistics:');
      console.log(`- Total Workflows: ${stats.data.totalWorkflows}`);
      console.log(`- Ready: ${stats.data.readyWorkflows}, Draft: ${stats.data.draftWorkflows}`);
      console.log(`- Single-step: ${stats.data.singleStepWorkflows}, Multi-step: ${stats.data.multiStepWorkflows}`);
      console.log(`- Total Executions: ${stats.data.totalExecutions}`);
      console.log(`- Average Steps: ${stats.data.averageSteps.toFixed(1)}`);
    }

    return {
      allWorkflows,
      executableWorkflows,
      searchResults,
      stats
    };
  } catch (error) {
    console.error('Error in exampleWorkflowManagement:', error);
  }
};

/**
 * Example 4: Prepare workflow for execution
 */
export const exampleWorkflowExecution = async (workflowId, userId = "user123") => {
  try {
    console.log('\n=== Example 4: Workflow Execution Preparation ===');
    
    // Get workflow details
    const workflow = await workflowStorageService.getStoredWorkflow(workflowId, userId);
    
    if (!workflow.success) {
      console.log('❌ Workflow not found');
      return;
    }

    console.log(`📄 Workflow: ${workflow.data.title}`);
    console.log(`- Type: ${workflow.data.workflowType}`);
    console.log(`- Status: ${workflow.data.status}`);
    console.log(`- Is Executable: ${workflow.data.isExecutable}`);

    if (!workflow.data.isExecutable) {
      console.log(`- Missing Connections: ${workflow.data.missingConnections.join(', ')}`);
      
      // Try to refresh connections
      console.log('\n🔄 Refreshing connections...');
      const refreshResult = await workflowStorageService.refreshWorkflowConnections(workflowId, userId);
      
      if (refreshResult.success) {
        console.log(`✅ Connections refreshed. New status: ${refreshResult.data.status}`);
        console.log(`- Is Executable: ${refreshResult.data.isExecutable}`);
        
        if (refreshResult.data.missingConnections.length > 0) {
          console.log(`- Still missing: ${refreshResult.data.missingConnections.join(', ')}`);
          return;
        }
      }
    }

    // Prepare for execution
    console.log('\n⚙️ Preparing for execution...');
    const executionData = await workflowStorageService.prepareWorkflowForExecution(workflowId, userId);
    
    if (executionData.success) {
      console.log('✅ Workflow prepared for execution:');
      console.log(`- Title: ${executionData.data.title}`);
      console.log(`- Type: ${executionData.data.workflowType}`);
      console.log(`- Required Apps: ${executionData.data.requiredApps.join(', ')}`);
      console.log(`- Execution Plan: ${executionData.data.executionPlan.length} steps`);
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
 * Example 5: Update workflow metadata
 */
export const exampleWorkflowUpdate = async (workflowId, userId = "user123") => {
  try {
    console.log('\n=== Example 5: Workflow Update ===');
    
    const updateResult = await workflowStorageService.updateStoredWorkflow(workflowId, userId, {
      title: "Updated Workflow Title",
      description: "This workflow has been updated with new metadata",
      tags: ["updated", "modified", "automation"],
      category: "productivity",
      status: "ready"
    });

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
 * Run all examples
 */
export const runAllExamples = async () => {
  console.log('🚀 Running Workflow Storage Module Examples...\n');
  
  try {
    // Example 1: Store simple workflow
    const simpleWorkflow = await exampleSimpleWorkflow();
    
    // Example 2: Store complex workflow
    const complexWorkflow = await exampleComplexWorkflow();
    
    // Example 3: Manage workflows
    await exampleWorkflowManagement("user123");
    
    // Example 4: Prepare for execution (if we have a stored workflow)
    if (simpleWorkflow?.success) {
      await exampleWorkflowExecution(simpleWorkflow.data.workflowId, "user123");
      
      // Example 5: Update workflow
      await exampleWorkflowUpdate(simpleWorkflow.data.workflowId, "user123");
    }
    
    console.log('\n✅ All examples completed successfully!');
    
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
};

// Uncomment to run examples:
// runAllExamples();
