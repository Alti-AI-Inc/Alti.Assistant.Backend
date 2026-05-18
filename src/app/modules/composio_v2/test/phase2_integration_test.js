import { logger } from '../../../shared/logger.js';

/**
 * Phase 2 Integration Test Suite - Workflow Scheduling System
 * This test validates the complete scheduled workflow functionality
 */

// Mock user and workflow data for testing
const testUserId = 'test_user_phase2_scheduling';
const testWorkflowData = {
  name: 'Test Scheduled Workflow - Phase 2',
  description:
    "Send a summary email every Monday at 9 AM with last week's GitHub issues",
  userId: testUserId,
  workflowType: 'multi_step',
  executionPlan: [
    {
      step: 1,
      app: 'github',
      action: 'get_issues',
      parameters: {
        repo: 'test-repo',
        state: 'all',
        since: 'last_week',
      },
      dependencies: [],
    },
    {
      step: 2,
      app: 'gmail',
      action: 'send_email',
      parameters: {
        to: 'manager@company.com',
        subject: 'Weekly GitHub Issues Summary',
        body: 'from_step_1.issues_summary',
      },
      dependencies: [1],
    },
  ],
  requiredApps: ['github', 'gmail'],
  crossStepParameters: {
    issues_summary: 'step_1_output',
  },
  totalSteps: 2,
  scheduleType: 'recurring',
  cronExpression: '0 9 * * MON',
  timezone: 'UTC',
  planningMetadata: {
    complexity: 'medium',
    estimatedDuration: 30000,
  },
};

/**
 * Test 1: Validate Phase 2 Services Initialization
 */
export const testPhase2ServicesInitialization = async () => {
  try {
    logger.info('🧪 Testing Phase 2 Services Initialization...');

    // Test individual service imports
    const { cronManager } = await import('./services/cronManager.service.js');
    const { workflowExecutor } = await import(
      './services/workflowExecutor.service.js'
    );
    const { schedulerInitializer } = await import(
      './services/schedulerInitializer.service.js'
    );
    const { queueManager } = await import('./services/queueManager.service.js');

    // Test service initialization
    const results = {
      cronManager: {
        imported: !!cronManager,
        hasRequiredMethods: !!(
          cronManager.initialize && cronManager.scheduleWorkflow
        ),
      },
      workflowExecutor: {
        imported: !!workflowExecutor,
        hasRequiredMethods: !!(
          workflowExecutor.executeWorkflow &&
          workflowExecutor.validateConnections
        ),
      },
      schedulerInitializer: {
        imported: !!schedulerInitializer,
        hasRequiredMethods: !!(
          schedulerInitializer.initialize &&
          schedulerInitializer.loadActiveWorkflows
        ),
      },
      queueManager: {
        imported: !!queueManager,
        hasRequiredMethods: !!(
          queueManager.queueWorkflow && queueManager.processQueue
        ),
      },
    };

    const allServicesValid = Object.values(results).every(
      (service) => service.imported && service.hasRequiredMethods
    );

    logger.info('✅ Phase 2 Services Initialization Test Results:', {
      success: allServicesValid,
      details: results,
    });

    return {
      success: allServicesValid,
      testName: 'Phase 2 Services Initialization',
      results,
    };
  } catch (error) {
    logger.error('❌ Phase 2 Services Initialization Test Failed:', error);
    return {
      success: false,
      testName: 'Phase 2 Services Initialization',
      error: error.message,
    };
  }
};

/**
 * Test 2: Workflow Scheduling and Management
 */
export const testWorkflowScheduling = async () => {
  try {
    logger.info('🧪 Testing Workflow Scheduling...');

    const { cronManager } = await import('./services/cronManager.service.js');

    // Initialize cron manager
    const initResult = await cronManager.initialize();
    if (!initResult.success) {
      throw new Error(
        `Cron manager initialization failed: ${initResult.error}`
      );
    }

    // Test scheduling a workflow
    const scheduleResult = await cronManager.scheduleWorkflow(
      'test_workflow_123',
      '0 9 * * MON', // Every Monday at 9 AM
      testUserId,
      'UTC'
    );

    // Test getting job status
    const jobStatus = cronManager.getJobStatus('test_workflow_123');

    // Test unscheduling
    const unscheduleResult =
      await cronManager.unscheduleWorkflow('test_workflow_123');

    const results = {
      initialization: initResult.success,
      scheduling: scheduleResult.success,
      jobStatus: !!jobStatus,
      unscheduling: unscheduleResult.success,
    };

    const testSuccess = Object.values(results).every(
      (result) => result === true
    );

    logger.info('✅ Workflow Scheduling Test Results:', {
      success: testSuccess,
      details: results,
      scheduleResult,
      jobStatus,
      unscheduleResult,
    });

    return {
      success: testSuccess,
      testName: 'Workflow Scheduling',
      results,
    };
  } catch (error) {
    logger.error('❌ Workflow Scheduling Test Failed:', error);
    return {
      success: false,
      testName: 'Workflow Scheduling',
      error: error.message,
    };
  }
};

/**
 * Test 3: Workflow Execution Simulation
 */
export const testWorkflowExecution = async () => {
  try {
    logger.info('🧪 Testing Workflow Execution...');

    const { workflowExecutor } = await import(
      './services/workflowExecutor.service.js'
    );
    const ScheduledWorkflow = (
      await import('./models/scheduledWorkflow.model.js')
    ).default;

    // Create a test workflow document
    const testWorkflow = new ScheduledWorkflow(testWorkflowData);

    // Test single-step execution
    const singleStepWorkflow = {
      ...testWorkflowData,
      workflowType: 'single_step',
      executionPlan: [testWorkflowData.executionPlan[0]],
      totalSteps: 1,
    };

    const singleStepResult = await workflowExecutor.executeWorkflow(
      singleStepWorkflow,
      'test',
      'integration_test'
    );

    // Test multi-step execution
    const multiStepResult = await workflowExecutor.executeWorkflow(
      testWorkflow,
      'test',
      'integration_test'
    );

    // Test connection validation
    const connectionValidation =
      await workflowExecutor.validateConnections(testWorkflow);

    const results = {
      singleStepExecution: singleStepResult.success,
      multiStepExecution: multiStepResult.success,
      connectionValidation: connectionValidation.success !== undefined,
    };

    const testSuccess = Object.values(results).every(
      (result) => result === true
    );

    logger.info('✅ Workflow Execution Test Results:', {
      success: testSuccess,
      details: results,
      singleStepResult,
      multiStepResult,
      connectionValidation,
    });

    return {
      success: testSuccess,
      testName: 'Workflow Execution',
      results,
    };
  } catch (error) {
    logger.error('❌ Workflow Execution Test Failed:', error);
    return {
      success: false,
      testName: 'Workflow Execution',
      error: error.message,
    };
  }
};

/**
 * Test 4: Queue Management
 */
export const testQueueManagement = async () => {
  try {
    logger.info('🧪 Testing Queue Management...');

    const { queueManager } = await import('./services/queueManager.service.js');
    const ScheduledWorkflow = (
      await import('./models/scheduledWorkflow.model.js')
    ).default;

    // Initialize queue manager
    const initResult = await queueManager.initialize();
    if (!initResult.success) {
      throw new Error(
        `Queue manager initialization failed: ${initResult.error}`
      );
    }

    // Create test workflow
    const testWorkflow = new ScheduledWorkflow(testWorkflowData);

    // Test queuing workflows
    const queueResult1 = await queueManager.queueWorkflow(testWorkflow, 'high');
    const queueResult2 = await queueManager.queueWorkflow(
      testWorkflow,
      'normal'
    );

    // Test queue status
    const queueStatus = queueManager.getQueueStatus();

    // Test canceling queued workflow
    const cancelResult = await queueManager.cancelQueuedWorkflow(
      queueResult1.queueId,
      testUserId
    );

    // Clean up
    await queueManager.clearQueue(testUserId);

    const results = {
      initialization: initResult.success,
      queueHighPriority: queueResult1.success,
      queueNormalPriority: queueResult2.success,
      queueStatusCheck: !!queueStatus.queueSize,
      cancellation: cancelResult.success,
    };

    const testSuccess = Object.values(results).every(
      (result) => result === true
    );

    logger.info('✅ Queue Management Test Results:', {
      success: testSuccess,
      details: results,
      queueStatus,
    });

    return {
      success: testSuccess,
      testName: 'Queue Management',
      results,
    };
  } catch (error) {
    logger.error('❌ Queue Management Test Failed:', error);
    return {
      success: false,
      testName: 'Queue Management',
      error: error.message,
    };
  }
};

/**
 * Test 5: Schedule Detection Integration
 */
export const testScheduleDetectionIntegration = async () => {
  try {
    logger.info('🧪 Testing Schedule Detection Integration...');

    const { scheduleDetectionNode, saveWorkflowNode } = await import(
      './ai_classification/nodes.js'
    );

    // Test schedule detection with various inputs
    const testInputs = [
      'Send me a daily report at 9 AM',
      'Remind me every Friday to review issues',
      'Schedule this for tomorrow at 2 PM',
      'Run this workflow now', // Should not detect scheduling
    ];

    const detectionResults = [];

    for (const input of testInputs) {
      const mockState = {
        userInput: input,
        workflowType: 'single_step',
        executionPlan: [testWorkflowData.executionPlan[0]],
        userId: testUserId,
      };

      const detectionResult = await scheduleDetectionNode(mockState);
      detectionResults.push({
        input,
        needsScheduling: detectionResult.needsScheduling,
        scheduleType: detectionResult.scheduleType,
        confidence: detectionResult.confidence,
      });
    }

    // Test workflow saving
    const saveState = {
      userInput: 'Send me a daily report at 9 AM',
      userId: testUserId,
      workflowType: 'single_step',
      executionPlan: [testWorkflowData.executionPlan[0]],
      requiredApps: ['gmail'],
      scheduleType: 'recurring',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      scheduleDescription: 'Daily at 9 AM',
      scheduleMetadata: { workflowName: 'Daily Report' },
      planningMetadata: { complexity: 'low' },
      crossStepParameters: {},
    };

    const saveResult = await saveWorkflowNode(saveState);

    const results = {
      scheduleDetectionCount: detectionResults.length,
      schedulingDetected: detectionResults.filter((r) => r.needsScheduling)
        .length,
      workflowSaved: saveResult.workflowSaved,
      noErrorsInDetection: !detectionResults.some((r) => r.error),
      noErrorsInSaving: !saveResult.error,
    };

    const testSuccess =
      results.scheduleDetectionCount === 4 &&
      results.schedulingDetected >= 3 &&
      results.noErrorsInDetection &&
      results.noErrorsInSaving;

    logger.info('✅ Schedule Detection Integration Test Results:', {
      success: testSuccess,
      details: results,
      detectionResults,
      saveResult: {
        success: saveResult.workflowSaved,
        workflowId: saveResult.savedWorkflowId,
      },
    });

    return {
      success: testSuccess,
      testName: 'Schedule Detection Integration',
      results,
    };
  } catch (error) {
    logger.error('❌ Schedule Detection Integration Test Failed:', error);
    return {
      success: false,
      testName: 'Schedule Detection Integration',
      error: error.message,
    };
  }
};

/**
 * Run All Phase 2 Tests
 */
export const runPhase2IntegrationTests = async () => {
  try {
    logger.info('🚀 Starting Phase 2 Integration Test Suite...');

    const tests = [
      testPhase2ServicesInitialization,
      testWorkflowScheduling,
      testWorkflowExecution,
      testQueueManagement,
      testScheduleDetectionIntegration,
    ];

    const results = [];
    let passedTests = 0;

    for (const test of tests) {
      const result = await test();
      results.push(result);
      if (result.success) passedTests++;
    }

    const overallSuccess = passedTests === tests.length;

    logger.info('🏁 Phase 2 Integration Test Suite Complete:', {
      success: overallSuccess,
      totalTests: tests.length,
      passedTests,
      failedTests: tests.length - passedTests,
      results,
    });

    return {
      success: overallSuccess,
      summary: {
        totalTests: tests.length,
        passedTests,
        failedTests: tests.length - passedTests,
        passRate: `${Math.round((passedTests / tests.length) * 100)}%`,
      },
      testResults: results,
    };
  } catch (error) {
    logger.error('❌ Phase 2 Integration Test Suite Failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Individual test functions are already exported above, so no need to re-export
