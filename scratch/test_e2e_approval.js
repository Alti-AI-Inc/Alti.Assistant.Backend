import mongoose from 'mongoose';
import { workflowExecutionService } from '../src/app/modules/workflow_automation/services/workflowExecution.service.js';
import Workflow from '../src/app/modules/workflow_automation/models/workflow.model.js';
import WorkflowExecution from '../src/app/modules/workflow_automation/models/workflowExecution.model.js';
import WorkflowApproval from '../src/app/modules/workflow_automation/models/workflowApproval.model.js';

// ── In-Memory Database Mocking ──────────────────────────────────────────────
const dbMock = {
  workflows: [],
  executions: [],
  approvals: []
};

console.log('🔬 Setting up Mongoose Model Mocking for E2E Human-in-the-Loop tests...');

// Mock Workflow
Workflow.findOne = async function (query) {
  return dbMock.workflows.find(w => w._id.toString() === query._id.toString());
};
Workflow.findById = async function (id) {
  return dbMock.workflows.find(w => w._id.toString() === id.toString());
};
Workflow.updateOne = async function (filter, update) {
  const w = dbMock.workflows.find(x => x._id.toString() === filter._id.toString());
  if (w && update.$inc) {
    w.executionCount = (w.executionCount || 0) + update.$inc.executionCount;
  }
  return { acknowledged: true };
};

// Mock WorkflowExecution
WorkflowExecution.prototype.save = async function () {
  if (!this._id) {
    this._id = new mongoose.Types.ObjectId();
  }
  const existingIndex = dbMock.executions.findIndex(e => e._id.toString() === this._id.toString());
  if (existingIndex >= 0) {
    dbMock.executions[existingIndex] = this;
  } else {
    dbMock.executions.push(this);
  }
  return this;
};
WorkflowExecution.findOne = async function (query) {
  return dbMock.executions.find(e => (query.executionId && e.executionId === query.executionId) || (query._id && e._id.toString() === query._id.toString()));
};
WorkflowExecution.updateOne = async function (filter, update) {
  const exec = dbMock.executions.find(e => (filter._id && e._id.toString() === filter._id.toString()) || (filter.executionId && e.executionId === filter.executionId));
  if (exec) {
    Object.assign(exec, update.$set || update);
  }
  return { acknowledged: true };
};

// Mock WorkflowApproval
WorkflowApproval.prototype.save = async function () {
  if (!this._id) {
    this._id = new mongoose.Types.ObjectId();
  }
  const existingIndex = dbMock.approvals.findIndex(a => a._id.toString() === this._id.toString());
  if (existingIndex >= 0) {
    dbMock.approvals[existingIndex] = this;
  } else {
    dbMock.approvals.push(this);
  }
  return this;
};
WorkflowApproval.findOne = async function (query) {
  return dbMock.approvals.find(a => a.approvalId === query.approvalId);
};
WorkflowApproval.find = async function (query) {
  return dbMock.approvals.filter(a => a.userId.toString() === query.userId.toString() && a.status === query.status);
};

// Mock the core executeStep to bypass Composio connection checks for testing
workflowExecutionService.executeStep = async function (step, context, userId) {
  console.log(`   [Mock Step Execution] Running: ${step.app}.${step.action}`);
  return {
    success: true,
    data: { message: `Step ${step.stepId} finished successfully` },
    contextUpdates: { [`${step.stepId}_done`]: true }
  };
};

async function main() {
  console.log('\n🚀 Starting E2E Workflow Execution & Resumption Audit...');

  const userId = new mongoose.Types.ObjectId();
  const workflowId = new mongoose.Types.ObjectId();

  // Create a mock Workflow containing a sensitive email sending action (requires human approval)
  const mockWorkflow = {
    _id: workflowId,
    userId,
    name: 'Auto Lead Alert Notification',
    status: 'active',
    originalPrompt: 'Notify team when a new lead lands',
    steps: [
      {
        stepId: 'step_1',
        stepType: 'action',
        description: 'Format lead details',
        app: 'utility',
        action: 'format_text',
        parameters: { text: 'Format new lead: {{leadName}}' },
        order: 1,
        requireApproval: false
      },
      {
        stepId: 'step_2',
        stepType: 'action',
        description: 'Send lead details to CEO',
        app: 'gmail',
        action: 'send_email', // Gmail send_email is registered as a SENSITIVE action, will auto-intercept!
        parameters: { to: 'ceo@altihq.com', subject: 'New Lead Alert', body: 'Formatted: {{step_1_result.data}}' },
        order: 2,
        requireApproval: false
      },
      {
        stepId: 'step_3',
        stepType: 'action',
        description: 'Log success to sheets',
        app: 'google_sheets',
        action: 'append_row',
        parameters: { sheet: 'Leads Log', row: ['{{leadName}}', 'Alert Sent'] },
        order: 3,
        requireApproval: false
      }
    ]
  };
  dbMock.workflows.push(mockWorkflow);

  console.log('\nStep 1: Launching manual execution of the workflow...');
  const initialResult = await workflowExecutionService.executeWorkflow(
    workflowId,
    userId,
    { leadName: 'DeepMind Advanced Team' }
  );

  console.log('Execution result status:', initialResult.result?.status);
  console.log('Execution pause message:', initialResult.result?.message);
  console.log('Generated Approval ID:', initialResult.result?.approvalId);
  console.log('Generated Execution ID:', initialResult.executionId);

  // Assertions
  if (initialResult.result?.status === 'paused' && initialResult.result?.approvalId) {
    console.log('✅ Success! Workflow execution successfully suspended before running sensitive step_2.');
  } else {
    throw new Error(`❌ Failed: expected workflow to pause, but got status ${initialResult.result?.status}`);
  }

  // Verify that an approval record is stored in DB
  const pendingApprovals = await WorkflowApproval.find({ userId, status: 'pending' });
  console.log('Pending approvals in database:', pendingApprovals.length);
  if (pendingApprovals.length === 1 && pendingApprovals[0].approvalId === initialResult.result.approvalId) {
    console.log('✅ Success! WorkflowApproval request properly persisted to database.');
    console.log(`   Pending approval for action: "${pendingApprovals[0].action}" at step "${pendingApprovals[0].stepId}"`);
  } else {
    throw new Error('❌ Failed: WorkflowApproval record was not correctly saved.');
  }

  // Verify that the execution record shows awaiting_approval
  const execDetails = dbMock.executions.find(e => e.executionId === initialResult.executionId);
  console.log('Execution Status in DB:', execDetails.status);
  console.log('Current Step Index suspended at:', execDetails.currentStepIndex);
  if (execDetails.status === 'awaiting_approval' && execDetails.currentStepIndex === 1) {
    console.log('✅ Success! Execution state perfectly checkpointed at step index 1.');
  } else {
    throw new Error(`❌ Failed: Incorrect execution status in DB: ${execDetails.status} at index ${execDetails.currentStepIndex}`);
  }

  console.log('\nStep 2: Simulating user approval of the sensitive task...');
  const resumeResult = await workflowExecutionService.resumeExecution(
    initialResult.result.approvalId,
    userId,
    true // Approve!
  );

  console.log('Resumption status:', resumeResult.status);
  console.log('Resumption workflow steps completed:', resumeResult.result?.completedSteps);
  console.log('Resumption success flag:', resumeResult.result?.success);

  if (resumeResult.status === 'resumed' && resumeResult.result?.success) {
    console.log('✅ Success! Workflow resumed and ran all remaining steps to completion.');
  } else {
    throw new Error('❌ Failed: Workflow could not be resumed.');
  }

  // Verify DB state is updated
  const updatedExecDetails = dbMock.executions.find(e => e.executionId === initialResult.executionId);
  console.log('Final Execution Status in DB:', updatedExecDetails.status);
  if (updatedExecDetails.status === 'completed') {
    console.log('✅ Success! Final execution status correctly updated to "completed".');
  } else {
    throw new Error(`❌ Failed: Expected final execution status to be "completed", got: ${updatedExecDetails.status}`);
  }

  const resolvedApproval = dbMock.approvals.find(a => a.approvalId === initialResult.result.approvalId);
  console.log('Approval Status in DB:', resolvedApproval.status);
  if (resolvedApproval.status === 'approved') {
    console.log('✅ Success! Approval request correctly marked as "approved" in DB.');
  } else {
    throw new Error(`❌ Failed: Expected approval request to be "approved", got: ${resolvedApproval.status}`);
  }

  console.log('\n🎉 ALL E2E HUMAN-IN-THE-LOOP INTEGRATION AUDITS COMPLETED & VERIFIED SUCCESSFULLY!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ E2E Integration Audit failed:', err);
  process.exit(1);
});
