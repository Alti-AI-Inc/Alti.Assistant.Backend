import { logger } from '../../../shared/logger.js';

/**
 * @fileoverview Phase 2 Integration Test Suite - Workflow Scheduling System
 * This test suite validates the complete scheduled workflow functionality,
 * covering service initialization, scheduling, execution, queue management,
 * and AI-driven schedule detection.
 */

/**
 * @typedef {object} WorkflowExecutionPlanStep
 * @property {number} step - The step number in the execution plan.
 * @property {string} app - The name of the application to use for this step (e.g., 'github', 'gmail').
 * @property {string} action - The action to perform within the specified app (e.g., 'get_issues', 'send_email').
 * @property {object} parameters - Key-value pairs of parameters required for the action.
 * @property {string[]} dependencies - An array of step numbers that must complete before this step can run.
 */

/**
 * @typedef {object} WorkflowPlanningMetadata
 * @property {string} complexity - The estimated complexity of the workflow (e.g., 'medium').
 * @property {number} estimatedDuration - The estimated duration of the workflow in milliseconds.
 */

/**
 * @typedef {object} TestWorkflowData
 * @property {string} name - The name of the workflow.
 * @property {string} description - A description of what the workflow does.
 * @property {string} userId - The ID of the user who owns this workflow.
 * @property {string} workflowType - The type of workflow (e.g., 'multi_step', 'single_step').
 * @property {WorkflowExecutionPlanStep[]} executionPlan - An array defining the steps of the workflow.
 * @property {string[]} requiredApps - An array of application names required by the workflow.
 * @property {object} crossStepParameters - Parameters that are passed between different steps.
 * @property {string} crossStepParameters.issues_summary - Example of a cross-step parameter.
 * @property {number} totalSteps - The total number of steps in the workflow.
 * @property {string} scheduleType - The type of scheduling (e.g., 'recurring', 'one_time').
 * @property {string} cronExpression - The cron expression for recurring schedules.
 * @property {string} timezone - The timezone for the schedule (e.g., 'UTC').
 * @property {WorkflowPlanningMetadata} planningMetadata - Metadata related to workflow planning.
 */

/**
 * Mock user ID for testing purposes.
 * @type {string}
 */
const testUserId = 'test_user_phase2_scheduling';

/**
 * Mock workflow data used across various tests.
 * This data represents a scheduled workflow to send a weekly GitHub issues summary.
 * @type {TestWorkflowData}
 */
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
 * @typedef {object} ServiceInitializationResult
 * @property {boolean} imported - True if the service module was successfully imported.
 * @property {boolean} hasRequiredMethods - True if the imported service object contains expected methods.
 */

/**
 * @typedef {object} Phase2ServicesInitializationTestResult
 * @property {boolean} success - Overall success status of the test.
 * @property {string} testName - The name of the test.
 * @property {object} results - Detailed results for each service.
 * @property {ServiceInitializationResult} results.cronManager - Results for cronManager service.
 * @property {ServiceInitializationResult} results.workflowExecutor - Results for workflowExecutor service.
 * @property {ServiceInitializationResult} results.schedulerInitializer - Results for schedulerInitializer service.
 * @property {ServiceInitializationResult} results.queueManager - Results for queueManager service.
 * @property {string} [error] - Error message if the test failed.
 */

/**
 * Test 1: Validate Phase 2 Services Initialization.
 * This test dynamically imports core services (cronManager, workflowExecutor,
 * schedulerInitializer, queueManager) and verifies that they are imported
 * successfully and expose their expected public methods.
 *
 * @returns {Promise<Phase2ServicesInitializationTestResult>} A promise that resolves to an object
 *   containing the test's success status, name, and detailed results for each service.
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
 * @typedef {object} WorkflowSchedulingTestResults
 * @property {boolean} initialization - Success status of cron manager initialization.
 * @property {boolean} scheduling - Success status of scheduling a workflow.
 * @property {boolean} jobStatus - True if job status could be retrieved.
 * @property {boolean} unscheduling - Success status of unscheduling a workflow.
 */

/**
 * @typedef {object} WorkflowSchedulingTestOutput
 * @property {boolean} success - Overall success status of the test.
 * @property {string} testName - The name of the test.
 * @property {WorkflowSchedulingTestResults} results - Detailed results for each scheduling operation.
 * @property {object} [scheduleResult] - The raw result object from the scheduleWorkflow call.
 * @property {object} [jobStatus] - The raw job status object.
 * @property {object} [unscheduleResult] - The raw result object from the unscheduleWorkflow call.
 * @property {string} [error] - Error message if the test failed.
 */

/**
 * Test 2: Workflow Scheduling and Management.
 * This test validates the `cronManager`'s ability to initialize, schedule a workflow,
 * retrieve its status, and unschedule it.
 *
 * @returns {Promise<WorkflowSchedulingTestOutput>} A promise that resolves to an object
 *   containing the test's success status, name, and detailed results for scheduling operations.
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
 * @typedef {object} WorkflowExecutionTestResults
 * @property {boolean} singleStepExecution - Success status of single-step workflow execution.
 * @property {boolean} multiStepExecution - Success status of multi-step workflow execution.
 * @property {boolean} connectionValidation - True if connection validation returned a result.
 */

/**
 * @typedef {object} WorkflowExecutionTestOutput
 * @property {boolean} success - Overall success status of the test.
 * @property {string} testName - The name of the test.
 * @property {WorkflowExecutionTestResults} results - Detailed results for execution and validation.
 * @property {object} [singleStepResult] - The raw result object from single-step execution.
 * @property {object} [multiStepResult] - The raw result object from multi-step execution.
 * @property {object} [connectionValidation] - The raw result object from connection validation.
 * @property {string} [error] - Error message if the test failed.
 */

/**
 * Test 3: Workflow Execution Simulation.
 * This test simulates the execution of both single-step and multi-step workflows
 * using the `workflowExecutor` and validates connection requirements.
 *
 * @returns {Promise<WorkflowExecutionTestOutput>} A promise that resolves to an object
 *   containing the test's success status, name, and detailed results for execution simulations.
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
 * @typedef {object} QueueManagementTestResults
 * @property {boolean} initialization - Success status of queue manager initialization.
 * @property {boolean} queueHighPriority - Success status of queuing a high priority workflow.
 * @property {boolean} queueNormalPriority - Success status of queuing a normal priority workflow.
 * @property {boolean} queueStatusCheck - True if queue status could be retrieved.
 * @property {boolean} cancellation - Success status of canceling a queued workflow.
 */

/**
 * @typedef {object} QueueManagementTestOutput
 * @property {boolean} success - Overall success status of the test.
 * @property {string} testName - The name of the test.
 * @property {QueueManagementTestResults} results - Detailed results for queue operations.
 * @property {object} [queueStatus] - The raw queue status object.
 * @property {string} [error] - Error message if the test failed.
 */

/**
 * Test 4: Queue Management.
 * This test verifies the `queueManager`'s functionality, including initialization,
 * queuing workflows with different priorities, checking queue status, and canceling queued items.
 *
 * @returns {Promise<QueueManagementTestOutput>} A promise that resolves to an object
 *   containing the test's success status, name, and detailed results for queue management.
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
 * @typedef {object} ScheduleDetectionResultItem
 * @property {string} input - The user input string tested.
 * @property {boolean} needsScheduling - True if scheduling was detected.
 * @property {string} [scheduleType] - The detected schedule type (e.g., 'recurring').
 * @property {number} [confidence] - Confidence score of the detection.
 * @property {string} [error] - Error message if detection failed for this input.
 */

/**
 * @typedef {object} WorkflowSaveResult
 * @property {boolean} workflowSaved - True if the workflow was successfully saved.
 * @property {string} [savedWorkflowId] - The ID of the saved workflow.
 * @property {string} [error] - Error message if saving failed.
 */

/**
 * @typedef {object} ScheduleDetectionIntegrationTestResults
 * @property {number} scheduleDetectionCount - Total number of schedule detection tests run.
 * @property {number} schedulingDetected - Number of inputs for which scheduling was detected.
 * @property {boolean} workflowSaved - Success status of the workflow saving operation.
 * @property {boolean} noErrorsInDetection - True if no errors occurred during schedule detection tests.
 * @property {boolean} noErrorsInSaving - True if no errors occurred during workflow saving.
 */

/**
 * @typedef {object} ScheduleDetectionIntegrationTestOutput
 * @property {boolean} success - Overall success status of the test.
 * @property {string} testName - The name of the test.
 * @property {ScheduleDetectionIntegrationTestResults} results - Detailed results for detection and saving.
 * @property {ScheduleDetectionResultItem[]} detectionResults - Array of results for each schedule detection input.
 * @property {WorkflowSaveResult} saveResult - Result of the workflow saving operation.
 * @property {string} [error] - Error message if the test failed.
 */

/**
 * Test 5: Schedule Detection Integration.
 * This test evaluates the integration of AI-based schedule detection and workflow saving nodes.
 * It checks if scheduling is correctly identified from various user inputs and if a workflow
 * can be successfully saved with detected schedule parameters.
 *
 * @returns {Promise<ScheduleDetectionIntegrationTestOutput>} A promise that resolves to an object
 *   containing the test's success status, name, and detailed results for schedule detection and saving.
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
 * @typedef {object} TestSummary
 * @property {number} totalTests - The total number of tests run.
 * @property {number} passedTests - The number of tests that passed.
 * @property {number} failedTests - The number of tests that failed.
 * @property {string} passRate - The pass rate as a percentage string.
 */

/**
 * @typedef {object} RunPhase2IntegrationTestsOutput
 * @property {boolean} success - Overall success status of the entire test suite.
 * @property {TestSummary} [summary] - A summary of the test results if successful.
 * @property {Array<Phase2ServicesInitializationTestResult|WorkflowSchedulingTestOutput|WorkflowExecutionTestOutput|QueueManagementTestOutput|ScheduleDetectionIntegrationTestOutput>} [testResults] - An array of detailed results for each individual test.
 * @property {string} [error] - Error message if the test suite failed catastrophically.
 */

/**
 * Run All Phase 2 Integration Tests.
 * This function orchestrates and executes all defined Phase 2 integration tests
 * sequentially, aggregates their results, and provides an overall summary.
 *
 * @returns {Promise<RunPhase2IntegrationTestsOutput>} A promise that resolves to an object
 *   containing the overall success status, a summary of results, and detailed results for each test.
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