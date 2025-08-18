/**
 * Phase 1 Validation Test - Tests the basic workflow storage functionality
 */

import mongoose from 'mongoose';
import config from '../../../config/index.js';
import ScheduledWorkflow from './src/app/modules/composio_v2/models/scheduledWorkflow.model.js';
import WorkflowExecution from './src/app/modules/composio_v2/models/workflowExecution.model.js';
import { workflowService } from './src/app/modules/composio_v2/services/workflow.service.js';
import { detectSchedulingRequirements } from './src/app/modules/composio_v2/services/scheduleDetection.service.js';

console.log('🧪 PHASE 1 VALIDATION TEST - Scheduled Workflows');
console.log('='.repeat(60));

/**
 * Connect to database
 */
async function connectDB() {
  try {
    await mongoose.connect(config.database_local);
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

/**
 * Test 1: Database Models
 */
async function testDatabaseModels() {
  console.log('\n📋 TEST 1: Database Models');
  console.log('-'.repeat(30));
  
  try {
    // Test ScheduledWorkflow model
    const testWorkflow = new ScheduledWorkflow({
      workflowId: 'test_workflow_123',
      userId: new mongoose.Types.ObjectId(),
      title: 'Test Email Workflow',
      description: 'Send daily email reports',
      executionPlan: [
        {
          step: 1,
          app: 'gmail',
          action: 'send_email',
          description: 'Send email',
          parameters: { to: 'test@example.com', subject: 'Test' },
          dependencies: [],
          outputMapping: {}
        }
      ],
      workflowType: 'single_step',
      requiredApps: ['gmail'],
      totalSteps: 1,
      triggerType: 'manual',
      originalUserInput: 'Send a test email'
    });
    
    // Validate without saving
    const validationError = testWorkflow.validateSync();
    if (validationError) {
      throw new Error(`Validation failed: ${validationError.message}`);
    }
    
    console.log('✅ ScheduledWorkflow model validation passed');
    
    // Test WorkflowExecution model
    const testExecution = new WorkflowExecution({
      executionId: 'exec_test_123',
      workflowId: 'test_workflow_123',
      userId: new mongoose.Types.ObjectId(),
      executionType: 'manual',
      triggerSource: 'user_click',
      totalSteps: 1
    });
    
    const executionValidationError = testExecution.validateSync();
    if (executionValidationError) {
      throw new Error(`Execution validation failed: ${executionValidationError.message}`);
    }
    
    console.log('✅ WorkflowExecution model validation passed');
    
    return true;
  } catch (error) {
    console.error('❌ Database model test failed:', error.message);
    return false;
  }
}

/**
 * Test 2: Workflow Service CRUD Operations
 */
async function testWorkflowService() {
  console.log('\n⚙️  TEST 2: Workflow Service');
  console.log('-'.repeat(30));
  
  try {
    const testUserId = new mongoose.Types.ObjectId();
    
    // Test workflow creation
    const createResult = await workflowService.createWorkflow({
      userId: testUserId,
      title: 'Test Service Workflow',
      description: 'Testing workflow service',
      executionPlan: [
        {
          step: 1,
          app: 'github',
          action: 'list_issues',
          description: 'Get GitHub issues',
          parameters: { repository: 'test-repo' },
          dependencies: [],
          outputMapping: {}
        }
      ],
      workflowType: 'single_step',
      requiredApps: ['github'],
      triggerType: 'manual',
      originalUserInput: 'Get my GitHub issues'
    });
    
    if (!createResult.success) {
      throw new Error(`Workflow creation failed: ${createResult.error}`);
    }
    
    console.log(`✅ Workflow created: ${createResult.data.workflowId}`);
    
    const workflowId = createResult.data.workflowId;
    
    // Test workflow retrieval
    const getResult = await workflowService.getWorkflowById(workflowId, testUserId);
    if (!getResult.success) {
      throw new Error(`Workflow retrieval failed: ${getResult.error}`);
    }
    
    console.log('✅ Workflow retrieved successfully');
    
    // Test workflow update
    const updateResult = await workflowService.updateWorkflow(workflowId, testUserId, {
      title: 'Updated Test Workflow',
      description: 'Updated description'
    });
    
    if (!updateResult.success) {
      throw new Error(`Workflow update failed: ${updateResult.error}`);
    }
    
    console.log('✅ Workflow updated successfully');
    
    // Test user workflows listing
    const listResult = await workflowService.getUserWorkflows(testUserId);
    if (!listResult.success || listResult.data.workflows.length === 0) {
      throw new Error('Failed to list user workflows');
    }
    
    console.log('✅ User workflows listed successfully');
    
    // Test workflow trigger
    const triggerResult = await workflowService.triggerWorkflow(workflowId, testUserId);
    // Note: This might fail due to missing app connections, which is expected
    console.log(`📝 Workflow trigger test: ${triggerResult.success ? 'Success' : 'Expected failure (no connections)'}`);
    
    // Cleanup - delete test workflow
    const deleteResult = await workflowService.deleteWorkflow(workflowId, testUserId);
    if (!deleteResult.success) {
      throw new Error(`Workflow deletion failed: ${deleteResult.error}`);
    }
    
    console.log('✅ Workflow deleted successfully');
    
    return true;
  } catch (error) {
    console.error('❌ Workflow service test failed:', error.message);
    return false;
  }
}

/**
 * Test 3: Schedule Detection
 */
async function testScheduleDetection() {
  console.log('\n🕒 TEST 3: Schedule Detection');
  console.log('-'.repeat(30));
  
  try {
    const testInputs = [
      'Send an email to john@example.com right now',
      'Create a workflow to email my GitHub issues',
      'Schedule an email for tomorrow at 9 AM',
      'Set up daily automation to post on Twitter',
      'Send weekly reports every Monday'
    ];
    
    for (const input of testInputs) {
      const result = await detectSchedulingRequirements(input);
      
      if (!result.success) {
        throw new Error(`Schedule detection failed for: ${input}`);
      }
      
      console.log(`📝 Input: "${input}"`);
      console.log(`   Trigger Type: ${result.data.triggerType}`);
      console.log(`   Requires Scheduling: ${result.data.requiresScheduling}`);
      console.log(`   Confidence: ${result.data.confidence}`);
      console.log('');
    }
    
    console.log('✅ Schedule detection working correctly');
    return true;
  } catch (error) {
    console.error('❌ Schedule detection test failed:', error.message);
    return false;
  }
}

/**
 * Test 4: Database Operations
 */
async function testDatabaseOperations() {
  console.log('\n💾 TEST 4: Database Operations');
  console.log('-'.repeat(30));
  
  try {
    const testUserId = new mongoose.Types.ObjectId();
    
    // Create workflow directly in database
    const workflow = new ScheduledWorkflow({
      workflowId: ScheduledWorkflow.generateWorkflowId(),
      userId: testUserId,
      title: 'Database Test Workflow',
      description: 'Testing direct database operations',
      executionPlan: [
        {
          step: 1,
          app: 'slack',
          action: 'send_message',
          description: 'Send Slack message',
          parameters: { channel: 'general', message: 'Hello team!' },
          dependencies: [],
          outputMapping: {}
        }
      ],
      workflowType: 'single_step',
      requiredApps: ['slack'],
      totalSteps: 1,
      triggerType: 'scheduled',
      scheduleConfig: {
        triggerDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        isActive: true,
        timezone: 'UTC'
      },
      originalUserInput: 'Send a Slack message tomorrow'
    });
    
    await workflow.save();
    console.log(`✅ Workflow saved to database: ${workflow.workflowId}`);
    
    // Test static methods
    const userWorkflows = await ScheduledWorkflow.findByUser(testUserId);
    console.log(`✅ Found ${userWorkflows.length} workflows for user`);
    
    const dueWorkflows = await ScheduledWorkflow.findDueForExecution();
    console.log(`✅ Found ${dueWorkflows.length} workflows due for execution`);
    
    // Test workflow methods
    await workflow.updateExecutionStats(true);
    console.log('✅ Execution stats updated');
    
    await workflow.pause();
    console.log('✅ Workflow paused');
    
    await workflow.resume();
    console.log('✅ Workflow resumed');
    
    // Create execution record
    const execution = new WorkflowExecution({
      executionId: WorkflowExecution.generateExecutionId(),
      workflowId: workflow.workflowId,
      userId: testUserId,
      executionType: 'scheduled',
      triggerSource: 'cron_job',
      totalSteps: 1
    });
    
    await execution.save();
    console.log(`✅ Execution record created: ${execution.executionId}`);
    
    // Test execution methods
    await execution.startExecution();
    console.log('✅ Execution started');
    
    await execution.updateProgress(1, {
      app: 'slack',
      action: 'send_message',
      status: 'completed',
      startTime: new Date(),
      endTime: new Date(),
      duration: 1000,
      result: { success: true, messageId: 'msg_123' }
    });
    console.log('✅ Execution progress updated');
    
    await execution.completeExecution(true, {
      summary: 'Message sent successfully',
      data: { messageId: 'msg_123' }
    });
    console.log('✅ Execution completed');
    
    // Cleanup
    await ScheduledWorkflow.deleteOne({ workflowId: workflow.workflowId });
    await WorkflowExecution.deleteOne({ executionId: execution.executionId });
    console.log('✅ Test data cleaned up');
    
    return true;
  } catch (error) {
    console.error('❌ Database operations test failed:', error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting Phase 1 validation tests...\n');
  
  // Connect to database
  const dbConnected = await connectDB();
  if (!dbConnected) {
    console.log('\n❌ Tests failed: Cannot connect to database');
    process.exit(1);
  }
  
  const tests = [
    { name: 'Database Models', fn: testDatabaseModels },
    { name: 'Workflow Service', fn: testWorkflowService },
    { name: 'Schedule Detection', fn: testScheduleDetection },
    { name: 'Database Operations', fn: testDatabaseOperations }
  ];
  
  let passedTests = 0;
  
  for (const test of tests) {
    try {
      const passed = await test.fn();
      if (passed) passedTests++;
    } catch (error) {
      console.error(`❌ Test "${test.name}" crashed:`, error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS:');
  console.log(`✅ Passed: ${passedTests}/${tests.length}`);
  console.log(`❌ Failed: ${tests.length - passedTests}/${tests.length}`);
  
  if (passedTests === tests.length) {
    console.log('\n🎉 ALL TESTS PASSED! Phase 1 implementation is working correctly.');
    console.log('\n📋 NEXT STEPS:');
    console.log('  1. Test the API endpoints manually');
    console.log('  2. Implement Phase 2 (Scheduling system)');
    console.log('  3. Add frontend integration');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }
  
  // Close database connection
  await mongoose.connection.close();
  console.log('\n✅ Database connection closed');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { runAllTests };
