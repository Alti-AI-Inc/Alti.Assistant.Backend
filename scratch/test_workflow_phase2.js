process.env.TEMPORAL_MOCK = 'true';
process.env.OFFLINE_MODE = 'true';

import { workflowExecutionService } from '../src/app/modules/workflow_automation/services/workflowExecution.service.js';
import { workflowResilienceService } from '../src/app/modules/workflow_automation/services/workflowResilience.service.js';
import { executionController } from '../src/app/modules/workflow_automation/controllers/execution.controller.js';
import { temporalClientCoordinator } from '../src/app/modules/workflow_automation/services/temporal/client.js';
import { RedisClient } from '../src/shared/redis.js';
import Workflow from '../src/app/modules/workflow_automation/models/workflow.model.js';
import WorkflowExecution from '../src/app/modules/workflow_automation/models/workflowExecution.model.js';

// Setup Mock Spies and Hooks
const activityLogs = [];
const dbUpdateLogs = [];

// Mock Mongoose model operations to prevent database errors
Workflow.findById = async (id) => {
  return {
    _id: id,
    userId: '507f1f77bcf86cd799439011',
    status: 'active',
    trigger: {
      triggerType: 'webhook',
      webhookConfig: {
        secret: 'super-secret-token'
      }
    }
  };
};

WorkflowExecution.updateOne = async (filter, update) => {
  dbUpdateLogs.push({ filter, update });
  
  const status = update.status || update.$set?.status;
  if (status === 'running') {
    activityLogs.push(`running:${filter._id}`);
  } else if (status === 'completed') {
    activityLogs.push(`complete:${filter._id}`);
  }
  
  const stepStatus = update['steps.$.status'] || update.$set?.['steps.$.status'];
  if (stepStatus === 'skipped') {
    const stepId = filter['steps.stepId'];
    const reason = update['steps.$.result']?.reason || update.$set?.['steps.$.result']?.reason || 'skipped';
    activityLogs.push(`skip:${stepId}:${reason}`);
  }
  
  return { success: true, nModified: 1 };
};

WorkflowExecution.findById = async (id) => {
  return {
    _id: id,
    startTime: new Date(Date.now() - 5000), // Started 5s ago
    status: 'running'
  };
};

const logger = {
  info: (...args) => console.log('   [INFO]', ...args),
  warn: (...args) => console.warn('   [WARN]', ...args),
  error: (...args) => console.error('   [ERROR]', ...args)
};

// Spy on executeStep to capture executions
const executedSteps = [];
const originalExecuteStep = workflowExecutionService.executeStep;
workflowExecutionService.executeStep = async function (step, context, userId) {
  executedSteps.push({ stepId: step.stepId, stepType: step.stepType, app: step.app });
  activityLogs.push(`execute:${step.stepId}`);
  
  if (step.stepType === 'condition') {
    return originalExecuteStep.call(this, step, context, userId);
  }
  
  return { success: true, contextUpdates: { [step.stepId + '_result']: 'Executed' } };
};

async function run() {
  console.log('🚀 INITIALIZING PHASE 2 WORKFLOW ENGINE VERIFICATION SUITE...\n');

  try {
    // ----------------------------------------------------
    // TEST CASE 1: WEBHOOK TRIGGER ENGINE CONTROLLER
    // ----------------------------------------------------
    console.log('====================================================');
    console.log('TEST 1: Webhook Trigger Controller, Secrets & Payloads');
    console.log('====================================================');

    let responseStatus, responseJson;
    const mockRes = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseJson = data;
        return this;
      }
    };

    // Case 1A: Check without secret or query
    const mockReqInvalid = {
      params: { webhookId: '507f1f77bcf86cd799439011' },
      headers: {},
      query: {},
      body: { paymentId: 'pay_999', amount: 99 }
    };
    await executionController.handleWebhookTriggerController(mockReqInvalid, mockRes);
    
    if (responseStatus === 401) {
      console.log('✓ Successfully unauthorized incoming webhook with missing secret key.');
    } else {
      throw new Error(`Webhook authorization bypass: expected 401, got ${responseStatus}`);
    }

    // Case 1B: Valid secret provided via header
    const mockReqValid = {
      params: { webhookId: '507f1f77bcf86cd799439011' },
      headers: { 'x-webhook-secret': 'super-secret-token' },
      query: {},
      body: { paymentId: 'pay_999', amount: 99 }
    };
    
    await executionController.handleWebhookTriggerController(mockReqValid, mockRes);
    
    if (responseStatus === 200 && responseJson.success === true) {
      console.log('✓ Successfully accepted valid webhook request with body context mapping.');
    } else {
      throw new Error(`Webhook validation failed: expected 200, got ${responseStatus}`);
    }

    console.log('✅ TEST 1 PASSED: Webhook controller verification complete!');

    // ----------------------------------------------------
    // TEST CASE 2: DAG CONDITIONAL BRANCHING & CASCADE SKIPS (Local)
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST 2: DAG Condition step, Branch Suffixes & Cascade Skips');
    console.log('====================================================');

    // Scenario:
    // step1: condition (amount > 100) -> will evaluate to false (since amount is 99)
    // step2: true branch (depends on step1.true) -> should be skipped!
    // step3: false branch (depends on step1.false) -> should be executed!
    // step4: cascade skip (depends on step2) -> should be skipped recursively!
    
    const conditionWorkflow = {
      _id: '507f1f77bcf86cd799439011',
      steps: [
        {
          stepId: 'step1',
          stepType: 'condition',
          order: 1,
          app: 'workflow',
          action: 'evaluate',
          parameters: {
            expression: 'amount > 100'
          },
          dependsOn: []
        },
        {
          stepId: 'step2',
          stepType: 'action',
          order: 2,
          app: 'chat',
          action: 'send_message',
          parameters: { content: 'High amount alert!' },
          dependsOn: ['step1.true']
        },
        {
          stepId: 'step3',
          stepType: 'action',
          order: 3,
          app: 'chat',
          action: 'send_message',
          parameters: { content: 'Standard amount warning.' },
          dependsOn: ['step1.false']
        },
        {
          stepId: 'step4',
          stepType: 'action',
          order: 4,
          app: 'chat',
          action: 'send_message',
          parameters: { content: 'Trigger supervisor report' },
          dependsOn: ['step2']
        }
      ]
    };

    executedSteps.length = 0;
    const executionContext = { amount: 99 };
    const execution = {
      _id: '507f1f77bcf86cd799439022',
      executionId: 'test_exec_local_dag',
      startTime: new Date()
    };

    console.log('Running local DAG execution for condition evaluation...');
    const result = await workflowExecutionService.runWorkflowSteps(
      conditionWorkflow,
      execution,
      executionContext
    );

    console.log('Executed step paths:', JSON.stringify(executedSteps));
    
    const isStep2Executed = executedSteps.some(s => s.stepId === 'step2');
    const isStep3Executed = executedSteps.some(s => s.stepId === 'step3');
    const isStep4Executed = executedSteps.some(s => s.stepId === 'step4');

    if (!isStep2Executed && isStep3Executed && !isStep4Executed) {
      console.log('✓ Correct branching routes followed:');
      console.log('  - step1 condition evaluated to FALSE.');
      console.log('  - step2 (true branch) was skipped.');
      console.log('  - step3 (false branch) was completed.');
      console.log('  - step4 (child of skipped step2) was cascade skipped.');
    } else {
      throw new Error(`DAG routing failed. step2 executed: ${isStep2Executed}, step3: ${isStep3Executed}, step4: ${isStep4Executed}`);
    }

    console.log('✅ TEST 2 PASSED: Conditional DAG branching is robust!');

    // ----------------------------------------------------
    // TEST CASE 3: REDIS-BACKED OUTGOING RATE LIMITER
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST 3: Redis-Backed Sliding Window Outgoing Rate Limiter');
    console.log('====================================================');

    console.log('Triggering high-density concurrent calls...');
    const startTime = Date.now();
    
    // We mock the throttle budget to limit 'gmail' to 3 calls per 3 seconds
    // Let's invoke throttle for 'gmail' concurrently 5 times.
    // The 4th and 5th call should be delayed by ~3000ms.
    const runThrottle = async (idx) => {
      await workflowResilienceService.throttle('gmail', 3, 3000);
      return idx;
    };

    const promises = [
      runThrottle(1),
      runThrottle(2),
      runThrottle(3),
      runThrottle(4),
      runThrottle(5)
    ];

    const throttledIdxs = await Promise.all(promises);
    const duration = Date.now() - startTime;
    console.log(`Executed 5 throttled calls in ${duration}ms (Index runs: ${throttledIdxs.join(', ')})`);

    if (duration >= 2900) {
      console.log('✓ Successfully throttled calls. 4th and 5th calls were delayed to fit sliding window budget.');
    } else {
      throw new Error(`Throttle failed. Completed too fast in ${duration}ms, rate limit violated.`);
    }

    console.log('✅ TEST 3 PASSED: Redis outgoing rate limiting works perfectly!');

    // ----------------------------------------------------
    // TEST CASE 4: TEMPORAL STATUS LOGGING ACTIVITIES
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST 4: Temporal DB Auditing Lifecycle Activities');
    console.log('====================================================');

    activityLogs.length = 0;
    dbUpdateLogs.length = 0;

    const bypassWorkflow = {
      _id: '507f1f77bcf86cd799439033',
      steps: [
        {
          stepId: 'step1',
          stepType: 'condition',
          order: 1,
          app: 'workflow',
          action: 'evaluate',
          parameters: { expression: 'amount > 50' },
          dependsOn: []
        },
        {
          stepId: 'step2',
          stepType: 'action',
          order: 2,
          app: 'chat',
          action: 'send_message',
          parameters: { content: 'Alert' },
          dependsOn: ['step1.true']
        }
      ]
    };

    const temporalResult = await temporalClientCoordinator.startWorkflow(
      bypassWorkflow,
      'user_bypass_111',
      { amount: 100, _executionId: '507f1f77bcf86cd799439022' }
    );

    const report = await temporalResult.handle.result();
    console.log('Temporal Run Completed:', report.success);
    console.log('Activity Invocation Logs:', JSON.stringify(activityLogs));
    
    // Validate that activities were called to mark execution running, skipped/completed step, and complete execution
    const containsRunning = activityLogs.includes('running:507f1f77bcf86cd799439022');
    const containsComplete = activityLogs.includes('complete:507f1f77bcf86cd799439022');
    const containsExecuteStep1 = activityLogs.includes('execute:step1');
    const containsExecuteStep2 = activityLogs.includes('execute:step2');

    if (containsRunning && containsComplete && containsExecuteStep1 && containsExecuteStep2) {
      console.log('✓ Successfully completed Temporal run with database tracking activities.');
      console.log('✓ Real-time MongoDB audits triggered: `running`, `step1`, `step2`, `completed`.');
    } else {
      throw new Error(`Temporal logging activities skipped. Logs: ${JSON.stringify(activityLogs)}`);
    }

    console.log('✅ TEST 4 PASSED: Temporal auditing is 100% active!');

    console.log('\n🎉 ALL PHASE 2 INTEGRATION TESTS PASSED GLORIOUSLY!');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Verification Suite Failed:', err);
    process.exit(1);
  } finally {
    // Restore original execution steps
    workflowExecutionService.executeStep = originalExecuteStep;
  }
}

run().catch(console.error);
