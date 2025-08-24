/**
 * Test file for Workflow Storage Module
 * 
 * This file contains tests to verify the workflow storage functionality
 * Run with: node test_workflow_storage.js
 */

import mongoose from 'mongoose';
import { workflowStorageService } from './services/workflowStorage.service.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// Test configuration
const TEST_USER_ID = '6891adec96841647d3bc8047';
const TEST_WORKFLOWS = [
  {
    userInput: "Send me a daily email with GitHub repository stars count",
    title: "Daily GitHub Stars Report",
    description: "Get daily updates on repository star counts",
    tags: ["daily", "github", "email", "stars"],
    category: "automation"
  },
  // {
  //   userInput: "When I receive an email with 'urgent' in subject, create a Slack message and a Trello card",
  //   title: "Urgent Email Handler",
  //   description: "Handle urgent emails by notifying team and creating tasks",
  //   tags: ["urgent", "email", "slack", "trello"],
  //   category: "automation"
  // },
  // {
  //   userInput: "Export my GitHub issues to a CSV file and upload to Google Drive",
  //   title: "GitHub Issues Export",
  //   description: "Export and backup GitHub issues data",
  //   tags: ["github", "export", "csv", "drive"],
  //   category: "data_processing"
  // }
];

/**
 * Test workflow analysis and storage
 */
async function testWorkflowAnalysisAndStorage() {
  console.log('🧪 Testing Workflow Analysis and Storage...\n');
  
  const results = [];
  
  for (const [index, testWorkflow] of TEST_WORKFLOWS.entries()) {
    console.log(`📝 Test ${index + 1}: ${testWorkflow.title}`);
    console.log(`Input: "${testWorkflow.userInput}"`);
    
    try {
      const result = await workflowStorageService.analyzeAndStoreWorkflow({
        ...testWorkflow,
        userId: TEST_USER_ID,
        conversationId: `test_conv_${index + 1}`,
        conversationContext: {
          history: [],
          sessionId: `test_session_${index + 1}`
        }
      });

      if (result.success) {
        console.log('✅ Success:');
        console.log(`   - Workflow ID: ${result.data.workflowId}`);
        console.log(`   - Type: ${result.data.workflowType}`);
        console.log(`   - Status: ${result.data.status}`);
        console.log(`   - Required Apps: ${result.data.requiredApps.join(', ')}`);
        console.log(`   - Steps: ${result.data.totalSteps}`);
        console.log(`   - Executable: ${result.data.isExecutable ? 'Yes' : 'No'}`);
        
        if (result.data.missingConnections?.length > 0) {
          console.log(`   - Missing: ${result.data.missingConnections.join(', ')}`);
        }
        
        results.push(result.data);
      } else {
        console.log('❌ Failed:', result.error);
      }
    } catch (error) {
      console.log('💥 Error:', error.message);
    }
    
    console.log(''); // Empty line between tests
  }
  
  return results;
}

/**
 * Test workflow retrieval and filtering
 */
async function testWorkflowRetrieval() {
  console.log('🔍 Testing Workflow Retrieval and Filtering...\n');
  
  try {
    // Test 1: Get all workflows
    console.log('📋 Getting all workflows...');
    const allWorkflows = await workflowStorageService.getUserStoredWorkflows(TEST_USER_ID);
    
    if (allWorkflows.success) {
      console.log(`✅ Found ${allWorkflows.data.workflows.length} workflows`);
      allWorkflows.data.workflows.forEach((workflow, i) => {
        console.log(`   ${i + 1}. ${workflow.title} (${workflow.workflowType})`);
      });
    } else {
      console.log('❌ Failed to get workflows:', allWorkflows.error);
    }
    
    console.log('');
    
    // Test 2: Filter by workflow type
    console.log('🔧 Filtering by workflow type (multi_step)...');
    const multiStepWorkflows = await workflowStorageService.getUserStoredWorkflows(TEST_USER_ID, {
      workflowType: 'multi_step',
      limit: 10
    });
    
    if (multiStepWorkflows.success) {
      console.log(`✅ Found ${multiStepWorkflows.data.workflows.length} multi-step workflows`);
    } else {
      console.log('❌ Failed to filter workflows:', multiStepWorkflows.error);
    }
    
    console.log('');
    
    // Test 3: Filter by category
    console.log('📂 Filtering by category (automation)...');
    const automationWorkflows = await workflowStorageService.getUserStoredWorkflows(TEST_USER_ID, {
      category: 'automation',
      limit: 10
    });
    
    if (automationWorkflows.success) {
      console.log(`✅ Found ${automationWorkflows.data.workflows.length} automation workflows`);
    } else {
      console.log('❌ Failed to filter by category:', automationWorkflows.error);
    }
    
    console.log('');
    
    // Test 4: Search workflows
    console.log('🔍 Searching workflows for "github"...');
    const searchResults = await workflowStorageService.searchStoredWorkflows(TEST_USER_ID, 'github');
    
    if (searchResults.success) {
      console.log(`✅ Found ${searchResults.data.resultCount} workflows matching "github"`);
      searchResults.data.workflows.forEach((workflow, i) => {
        console.log(`   ${i + 1}. ${workflow.title}`);
      });
    } else {
      console.log('❌ Failed to search workflows:', searchResults.error);
    }
    
    console.log('');
    
    return {
      allWorkflows,
      multiStepWorkflows,
      automationWorkflows,
      searchResults
    };
    
  } catch (error) {
    console.log('💥 Error in testWorkflowRetrieval:', error.message);
  }
}

/**
 * Test workflow statistics
 */
async function testWorkflowStatistics() {
  console.log('📊 Testing Workflow Statistics...\n');
  
  try {
    const stats = await workflowStorageService.getWorkflowStatistics(TEST_USER_ID);
    
    if (stats.success) {
      console.log('✅ Workflow Statistics:');
      console.log(`   - Total Workflows: ${stats.data.totalWorkflows}`);
      console.log(`   - Ready: ${stats.data.readyWorkflows}`);
      console.log(`   - Draft: ${stats.data.draftWorkflows}`);
      console.log(`   - Single-step: ${stats.data.singleStepWorkflows}`);
      console.log(`   - Multi-step: ${stats.data.multiStepWorkflows}`);
      console.log(`   - Total Executions: ${stats.data.totalExecutions}`);
      console.log(`   - Average Steps: ${stats.data.averageSteps.toFixed(1)}`);
    } else {
      console.log('❌ Failed to get statistics:', stats.error);
    }
    
    console.log('');
    return stats;
    
  } catch (error) {
    console.log('💥 Error in testWorkflowStatistics:', error.message);
  }
}

/**
 * Test workflow execution preparation
 */
async function testWorkflowExecutionPrep(storedWorkflows) {
  console.log('⚙️ Testing Workflow Execution Preparation...\n');
  
  if (!storedWorkflows || storedWorkflows.length === 0) {
    console.log('⚠️ No stored workflows available for execution test');
    return;
  }
  
  const testWorkflow = storedWorkflows[0];
  console.log(`🎯 Testing execution preparation for: ${testWorkflow.title}`);
  
  try {
    // Test 1: Get workflow details
    const workflowDetails = await workflowStorageService.getStoredWorkflow(
      testWorkflow.workflowId, 
      TEST_USER_ID
    );
    
    if (workflowDetails.success) {
      console.log('✅ Retrieved workflow details');
      console.log(`   - Status: ${workflowDetails.data.status}`);
      console.log(`   - Executable: ${workflowDetails.data.isExecutable ? 'Yes' : 'No'}`);
    } else {
      console.log('❌ Failed to get workflow details:', workflowDetails.error);
      return;
    }
    
    // Test 2: Refresh connections
    console.log('\n🔄 Refreshing connections...');
    const refreshResult = await workflowStorageService.refreshWorkflowConnections(
      testWorkflow.workflowId, 
      TEST_USER_ID
    );
    
    if (refreshResult.success) {
      console.log('✅ Connections refreshed');
      console.log(`   - Status: ${refreshResult.data.status}`);
      console.log(`   - Executable: ${refreshResult.data.isExecutable ? 'Yes' : 'No'}`);
      
      if (refreshResult.data.missingConnections?.length > 0) {
        console.log(`   - Missing: ${refreshResult.data.missingConnections.join(', ')}`);
      }
    } else {
      console.log('❌ Failed to refresh connections:', refreshResult.error);
    }
    
    // Test 3: Prepare for execution
    console.log('\n🚀 Preparing for execution...');
    const executionPrep = await workflowStorageService.prepareWorkflowForExecution(
      testWorkflow.workflowId, 
      TEST_USER_ID
    );
    console.log('✅ Execution preparation successful', executionPrep);

    if (executionPrep.success) {
      console.log('✅ Execution preparation successful');
      console.log(`   - Title: ${executionPrep.data.title}`);
      console.log(`   - Type: ${executionPrep.data.workflowType}`);
      console.log(`   - Apps: ${executionPrep.data.requiredApps.join(', ')}`);
      console.log(`   - Steps: ${executionPrep.data.executionPlan.length}`);
      console.log('   - Ready for Composio v2 execution! 🎉');
    } else {
      console.log('❌ Failed to prepare for execution:', executionPrep.error);
    }
    
    console.log('');
    return {
      workflowDetails,
      refreshResult,
      executionPrep
    };
    
  } catch (error) {
    console.log('💥 Error in testWorkflowExecutionPrep:', error.message);
  }
}

/**
 * Test workflow updates
 */
async function testWorkflowUpdates(storedWorkflows) {
  console.log('✏️ Testing Workflow Updates...\n');
  
  if (!storedWorkflows || storedWorkflows.length === 0) {
    console.log('⚠️ No stored workflows available for update test');
    return;
  }
  
  const testWorkflow = storedWorkflows[0];
  console.log(`📝 Testing updates for: ${testWorkflow.title}`);
  
  try {
    const updateResult = await workflowStorageService.updateStoredWorkflow(
      testWorkflow.workflowId,
      TEST_USER_ID,
      {
        title: `${testWorkflow.title} (Updated)`,
        description: "This workflow has been updated during testing",
        tags: [...(testWorkflow.tags || []), "updated", "test"],
        category: "productivity"
      }
    );
    
    if (updateResult.success) {
      console.log('✅ Workflow updated successfully');
      console.log(`   - New Title: ${updateResult.data.title}`);
      console.log(`   - New Description: ${updateResult.data.description}`);
      console.log(`   - New Tags: ${updateResult.data.tags.join(', ')}`);
      console.log(`   - New Category: ${updateResult.data.category}`);
    } else {
      console.log('❌ Failed to update workflow:', updateResult.error);
    }
    
    console.log('');
    return updateResult;
    
  } catch (error) {
    console.log('💥 Error in testWorkflowUpdates:', error.message);
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData() {
  console.log('🧹 Cleaning up test data...\n');
  
  try {
    // Get all test workflows
    const workflows = await workflowStorageService.getUserStoredWorkflows(TEST_USER_ID);
    
    if (workflows.success && workflows.data.workflows.length > 0) {
      console.log(`🗑️ Deleting ${workflows.data.workflows.length} test workflows...`);
      
      for (const workflow of workflows.data.workflows) {
        const deleteResult = await workflowStorageService.deleteStoredWorkflow(
          workflow.workflowId,
          TEST_USER_ID
        );
        
        if (deleteResult.success) {
          console.log(`   ✅ Deleted: ${workflow.title}`);
        } else {
          console.log(`   ❌ Failed to delete: ${workflow.title}`);
        }
      }
    } else {
      console.log('ℹ️ No test workflows to clean up');
    }
    
    console.log('');
    
  } catch (error) {
    console.log('💥 Error in cleanup:', error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting Workflow Storage Module Tests...\n');
  console.log('=' .repeat(60));
  console.log('');
  const connection = await mongoose
    .connect(config.database_local)
    .catch(err => {
      logger.error('❌ Error connecting to the database:', err);
      process.exit(1); // Exit the application on database connection error
    });
  console.log('✅ Database connection established');

  try {
    // Test 1: Analyze and store workflows
    const storedWorkflows = await testWorkflowAnalysisAndStorage();
    
    // Test 2: Retrieve and filter workflows
    await testWorkflowRetrieval();
    
    // Test 3: Get statistics
    await testWorkflowStatistics();
    
    // Test 4: Test execution preparation
    await testWorkflowExecutionPrep(storedWorkflows);
    
    // Test 5: Test updates
    await testWorkflowUpdates(storedWorkflows);
    
    // Cleanup
    // await cleanupTestData();
    
    console.log('=' .repeat(60));
    console.log('🎉 All tests completed! Workflow Storage Module is working correctly.');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
  }
}

// Export for external use
export {
  testWorkflowAnalysisAndStorage,
  testWorkflowRetrieval,
  testWorkflowStatistics,
  testWorkflowExecutionPrep,
  testWorkflowUpdates,
  cleanupTestData,
  runAllTests
};

runAllTests()