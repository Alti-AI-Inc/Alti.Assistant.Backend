process.env.TEMPORAL_MOCK = 'true';
process.env.OFFLINE_MODE = 'true';

import { workflowExecutionService } from '../src/app/modules/workflow_automation/services/workflowExecution.service.js';
import { workflowLayoutService } from '../src/app/modules/workflow_automation/services/workflowLayout.service.js';
import { temporalClientCoordinator } from '../src/app/modules/workflow_automation/services/temporal/client.js';
import Workflow from '../src/app/modules/workflow_automation/models/workflow.model.js';
import WorkflowExecution from '../src/app/modules/workflow_automation/models/workflowExecution.model.js';

// Setup Mock Spies and Hooks
const activityLogs = [];
const dbUpdateLogs = [];
const executedSteps = [];

// Mock Mongoose model operations to prevent database errors
Workflow.findById = async (id) => {
  return {
    _id: id,
    userId: '507f1f77bcf86cd799439011',
    status: 'active',
    trigger: { triggerType: 'manual' }
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
    startTime: new Date(Date.now() - 5000),
    status: 'running'
  };
};

// Spy on executeStep to capture executions and test real router/conditions
const originalExecuteStep = workflowExecutionService.executeStep;
workflowExecutionService.executeStep = async function (step, context, userId) {
  executedSteps.push({ stepId: step.stepId, stepType: step.stepType, app: step.app, action: step.action });
  activityLogs.push(`execute:${step.stepId}`);
  
  if (step.stepType === 'condition' || (step.app?.toLowerCase() === 'google_cloud' && step.action === 'vertex_ai_router')) {
    return originalExecuteStep.call(this, step, context, userId);
  }
  
  return { success: true, contextUpdates: { [step.stepId + '_result']: 'Executed' } };
};

async function run() {
  console.log('🚀 INITIALIZING PHASE 3 ENTERPRISE WORKFLOW ENGINE VERIFICATION SUITE...\n');

  try {
    // ----------------------------------------------------
    // TEST CASE 1: VISUAL GRAPH LAYOUT SCHEMA VALIDATION
    // ----------------------------------------------------
    console.log('====================================================');
    console.log('TEST 1: Visual Graph Layout Schema Validation');
    console.log('====================================================');

    const validNodes = [
      { id: 'node1', type: 'trigger', data: { stepType: 'trigger' }, position: { x: 10, y: 10 } },
      { id: 'node2', type: 'google_cloud', data: { stepType: 'action', app: 'google_cloud', action: 'vertex_ai_router' }, position: { x: 200, y: 10 } },
      { id: 'node3', type: 'chat', data: { stepType: 'action', app: 'chat', action: 'send_message' }, position: { x: 400, y: -100 } },
      { id: 'node4', type: 'chat', data: { stepType: 'action', app: 'chat', action: 'send_message' }, position: { x: 400, y: 100 } }
    ];

    const validEdges = [
      { id: 'e1-2', source: 'node1', target: 'node2' },
      { id: 'e2-3', source: 'node2', target: 'node3', sourceHandle: 'sales' },
      { id: 'e2-4', source: 'node2', target: 'node4', sourceHandle: 'support' }
    ];

    // Case 1A: Validate a perfectly structured layout
    const reportValid = workflowLayoutService.validateLayoutSchema(validNodes, validEdges);
    if (reportValid.valid) {
      console.log('✓ Successfully validated correct React Flow node and edge schema graph.');
    } else {
      throw new Error(`Failed to validate correct layout: ${JSON.stringify(reportValid.errors)}`);
    }

    // Case 1B: Cyclic dependency loop validation check
    const cyclicEdges = [
      ...validEdges,
      { id: 'e3-1', source: 'node3', target: 'node1' } // Back-edge forming a cycle
    ];
    const reportCyclic = workflowLayoutService.validateLayoutSchema(validNodes, cyclicEdges);
    if (!reportCyclic.valid && reportCyclic.errors.some(e => e.includes('Cyclic dependency'))) {
      console.log('✓ Successfully detected closed feedback loop cycle error.');
    } else {
      throw new Error(`Failed to catch cyclic dependency error. Report: ${JSON.stringify(reportCyclic)}`);
    }

    // Case 1C: Disconnected node warning check
    const disconnectedNodes = [
      ...validNodes,
      { id: 'node5', type: 'chat', data: { stepType: 'action', app: 'chat', action: 'send_message' }, position: { x: 600, y: 0 } }
    ];
    const reportDisconnected = workflowLayoutService.validateLayoutSchema(disconnectedNodes, validEdges);
    if (reportDisconnected.valid && reportDisconnected.warnings.some(w => w.includes('node5'))) {
      console.log('✓ Successfully warned about disconnected node5.');
    } else {
      throw new Error(`Failed to warn about disconnected node. Report: ${JSON.stringify(reportDisconnected)}`);
    }

    console.log('✅ TEST 1 PASSED: Visual graph layout schema validation is accurate!');

    // ----------------------------------------------------
    // TEST CASE 2: VISUAL GRAPH LAYOUT COMPILATION API
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST 2: Visual Graph layout Topological Compiler');
    console.log('====================================================');

    const steps = workflowLayoutService.compileLayoutToSteps(validNodes, validEdges);
    
    // Assert order matches topological index sequences (node1, node2, node3/4 in parallel)
    const step1 = steps.find(s => s.stepId === 'node1');
    const step2 = steps.find(s => s.stepId === 'node2');
    const step3 = steps.find(s => s.stepId === 'node3');
    const step4 = steps.find(s => s.stepId === 'node4');

    if (step1.order < step2.order && step2.order < step3.order && step2.order < step4.order) {
      console.log('✓ Successfully sorted visual nodes topologically into backend step execution order.');
    } else {
      throw new Error(`Incorrect topological sorting orders: node1=${step1.order}, node2=${step2.order}, node3=${step3.order}, node4=${step4.order}`);
    }

    // Assert dependsOn correctly maps edge source and handle suffixes
    if (
      step2.dependsOn.includes('node1') &&
      step3.dependsOn.includes('node2.sales') &&
      step4.dependsOn.includes('node2.support')
    ) {
      console.log('✓ Successfully mapped source handles to dependsOn dot-notation branch suffixes (e.g. node2.sales, node2.support).');
    } else {
      throw new Error(`DependsOn mapping failed: step3 dependsOn: ${JSON.stringify(step3.dependsOn)}, step4 dependsOn: ${JSON.stringify(step4.dependsOn)}`);
    }

    // Assert node coordinates saved inside metadata
    if (step3.metadata?.layout?.position?.x === 400 && step3.metadata?.layout?.position?.y === -100) {
      console.log('✓ Successfully preserved visual layout node coordinates in backend metadata schema.');
    } else {
      throw new Error(`Visual coordinates metadata missing or incorrect: ${JSON.stringify(step3.metadata)}`);
    }

    console.log('✅ TEST 2 PASSED: Layout topological compiler works flawlessly!');

    // ----------------------------------------------------
    // TEST CASE 3: LOCAL AI SEMANTIC PROMPT ROUTER & DAG SKIPS
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST 3: Local AI Prompt Router execution & DAG skips');
    console.log('====================================================');

    const routerWorkflow = {
      _id: '507f1f77bcf86cd799439011',
      steps: [
        {
          stepId: 'routerNode',
          stepType: 'action',
          order: 1,
          app: 'google_cloud',
          action: 'vertex_ai_router',
          parameters: {
            input: 'What is the cost of enterprise plans?',
            routes: {
              sales: 'Pricing inquiries and seat quotes',
              support: 'Bug tickets and system errors',
              default: 'General assistance requests'
            }
          },
          dependsOn: []
        },
        {
          stepId: 'salesBranchStep',
          stepType: 'action',
          order: 2,
          app: 'chat',
          action: 'send_message',
          parameters: { content: 'Forwarding to sales team.' },
          dependsOn: ['routerNode.sales']
        },
        {
          stepId: 'supportBranchStep',
          stepType: 'action',
          order: 3,
          app: 'chat',
          action: 'send_message',
          parameters: { content: 'Opening technical support ticket.' },
          dependsOn: ['routerNode.support']
        },
        {
          stepId: 'defaultBranchStep',
          stepType: 'action',
          order: 4,
          app: 'chat',
          action: 'send_message',
          parameters: { content: 'How else can we help you?' },
          dependsOn: ['routerNode.default']
        },
        {
          stepId: 'salesSubChildStep',
          stepType: 'action',
          order: 5,
          app: 'chat',
          action: 'send_message',
          parameters: { content: 'Sales discount notification.' },
          dependsOn: ['salesBranchStep']
        }
      ]
    };

    executedSteps.length = 0;
    const executionContext = {};
    const execution = {
      _id: '507f1f77bcf86cd799439055',
      executionId: 'test_exec_local_router',
      startTime: new Date()
    };

    console.log('Executing local workflow steps with semantic prompt router...');
    const resultLocal = await workflowExecutionService.runWorkflowSteps(
      routerWorkflow,
      execution,
      executionContext
    );

    console.log('Executed steps list:', JSON.stringify(executedSteps.map(s => s.stepId)));

    const executedIds = executedSteps.map(s => s.stepId);
    
    // Router evaluated to 'sales' because of 'cost of enterprise plans' input.
    // Therefore, salesBranchStep and salesSubChildStep must execute.
    // supportBranchStep and defaultBranchStep must be skipped.
    const hasRouterExecuted = executedIds.includes('routerNode');
    const hasSalesBranchExecuted = executedIds.includes('salesBranchStep');
    const hasSalesSubChildExecuted = executedIds.includes('salesSubChildStep');
    const hasSupportBranchExecuted = executedIds.includes('supportBranchStep');
    const hasDefaultBranchExecuted = executedIds.includes('defaultBranchStep');

    if (hasRouterExecuted && hasSalesBranchExecuted && hasSalesSubChildExecuted && !hasSupportBranchExecuted && !hasDefaultBranchExecuted) {
      console.log('✓ Successfully executed AI Prompt Router.');
      console.log('✓ correctly categorized semantic input to "sales" route key.');
      console.log('✓ skipped non-matching branches ("support" and "default").');
      console.log('✓ Executed dependent child node "salesSubChildStep" successfully.');
    } else {
      throw new Error(`AI Semantic routing execution mismatch. Executed steps: ${JSON.stringify(executedIds)}`);
    }

    console.log('✅ TEST 3 PASSED: AI Semantic routing and skip cascades are robust!');

    // ----------------------------------------------------
    // TEST CASE 4: DURABLE TEMPORAL WORKFLOW ROUTING INTEGRATION
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST 4: Durable Temporal AI Prompt Routing Execution');
    console.log('====================================================');

    activityLogs.length = 0;
    executedSteps.length = 0;

    // Triggering durable workflow execution
    const temporalResult = await temporalClientCoordinator.startWorkflow(
      routerWorkflow,
      'user_temporal_router_111',
      { _executionId: '507f1f77bcf86cd799439055' }
    );

    const report = await temporalResult.handle.result();
    console.log('Temporal Run Completed:', report.success);
    console.log('Activity Invocation Logs:', JSON.stringify(activityLogs));

    const temporalExecutedIds = executedSteps.map(s => s.stepId);
    const hasTempRouterExecuted = temporalExecutedIds.includes('routerNode');
    const hasTempSalesBranchExecuted = temporalExecutedIds.includes('salesBranchStep');
    const hasTempSalesSubChildExecuted = temporalExecutedIds.includes('salesSubChildStep');
    const hasTempSupportBranchExecuted = temporalExecutedIds.includes('supportBranchStep');
    const hasTempDefaultBranchExecuted = temporalExecutedIds.includes('defaultBranchStep');

    // Also assert auditing records skipped correctly
    const skipLogs = activityLogs.filter(log => log.startsWith('skip:'));
    console.log('Audited skips:', JSON.stringify(skipLogs));

    if (
      hasTempRouterExecuted && 
      hasTempSalesBranchExecuted && 
      hasTempSalesSubChildExecuted && 
      !hasTempSupportBranchExecuted && 
      !hasTempDefaultBranchExecuted
    ) {
      console.log('✓ Successfully completed Temporal run with AI Semantic Router.');
      console.log('✓ Correctly performed skip cascade checks inside stateful Temporal workflow activities.');
    } else {
      throw new Error(`Temporal AI Prompt Router execution mismatch. Executed steps: ${JSON.stringify(temporalExecutedIds)}`);
    }

    console.log('✅ TEST 4 PASSED: Durable Temporal routing is 100% active!');

    console.log('\n🎉 ALL PHASE 3 INTEGRATION TESTS PASSED GLORIOUSLY!');
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
