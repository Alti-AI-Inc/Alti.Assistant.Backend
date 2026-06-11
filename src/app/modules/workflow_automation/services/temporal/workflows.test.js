import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock activities module. This will be used for both local import and Temporal proxy.
const mockExecuteWorkflowStepActivity = vi.fn();
const mockRollbackWorkflowStepActivity = vi.fn();
const mockUpdateExecutionToRunningActivity = vi.fn();
const mockSkipWorkflowStepActivity = vi.fn();
const mockCompleteExecutionActivity = vi.fn();
const mockFailExecutionActivity = vi.fn();

const mockActivities = {
  executeWorkflowStepActivity: mockExecuteWorkflowStepActivity,
  rollbackWorkflowStepActivity: mockRollbackWorkflowStepActivity,
  updateExecutionToRunningActivity: mockUpdateExecutionToRunningActivity,
  skipWorkflowStepActivity: mockSkipWorkflowStepActivity,
  completeExecutionActivity: mockCompleteExecutionActivity,
  failExecutionActivity: mockFailExecutionActivity,
};

// Mock Temporal's proxyActivities to return our mock activities
const mockProxyActivities = vi.fn(() => mockActivities);

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: mockProxyActivities,
}));

// Mock the local activities.js file to also return our mock activities
vi.mock('./activities.js', async () => ({
  ...mockActivities
}));

// Import the function to be tested
import { runDurableWorkflow } from './workflows.js';

describe('runDurableWorkflow', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    // Default success behavior for execute activity
    mockExecuteWorkflowStepActivity.mockImplementation(async (step) => {
      return {
        success: true,
        contextUpdates: { [`${step.stepId}_result`]: 'success' },
      };
    });

    // Default success behavior for rollback activity
    mockRollbackWorkflowStepActivity.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should run a simple sequential workflow successfully', async () => {
    const workflow = {
      steps: [
        { stepId: 'step1', order: 1, app: 'test', action: 'do' },
        { stepId: 'step2', order: 2, app: 'test', action: 'do' },
      ],
    };
    const userId = 'user-123';
    const initialContext = { initial: 'data' };

    const result = await runDurableWorkflow(workflow, userId, initialContext);

    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledTimes(2);
    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'step1' }),
      { initial: 'data' },
      userId
    );
    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'step2' }),
      { initial: 'data', step1_result: 'success' }, // Context from step1 is passed to step2
      userId
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.context).toEqual({
      initial: 'data',
      step1_result: 'success',
      step2_result: 'success',
    });
  });

  it('should run a parallel DAG workflow and merge context correctly', async () => {
    const workflow = {
      steps: [
        { stepId: 'start', order: 1, app: 'test', action: 'do' },
        { stepId: 'parallel_a', order: 2, app: 'test', action: 'do', dependsOn: ['start'] },
        { stepId: 'parallel_b', order: 2, app: 'test', action: 'do', dependsOn: ['start'] },
        { stepId: 'join', order: 3, app: 'test', action: 'do', dependsOn: ['parallel_a', 'parallel_b'] },
      ],
    };
    const userId = 'user-456';

    mockExecuteWorkflowStepActivity.mockImplementation(async (step) => {
        return {
          success: true,
          contextUpdates: { [`${step.stepId}_result`]: `data_from_${step.stepId}` },
        };
      });

    const result = await runDurableWorkflow(workflow, userId, {});

    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledTimes(4);
    // Check that join step receives context from both parallel branches
    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledWith(
        expect.objectContaining({ stepId: 'join' }),
        expect.objectContaining({
            start_result: 'data_from_start',
            parallel_a_result: 'data_from_parallel_a',
            parallel_b_result: 'data_from_parallel_b',
        }),
        userId
    );

    expect(result.success).toBe(true);
    expect(result.context).toEqual({
        start_result: 'data_from_start',
        parallel_a_result: 'data_from_parallel_a',
        parallel_b_result: 'data_from_parallel_b',
        join_result: 'data_from_join',
    });
  });

  it('should trigger Saga rollback on step failure', async () => {
    const workflow = {
      steps: [
        { stepId: 'step1', order: 1, app: 'test', action: 'do' },
        { stepId: 'step2_fails', order: 2, app: 'test', action: 'do' },
        { stepId: 'step3', order: 3, app: 'test', action: 'do' },
      ],
    };
    const userId = 'user-789';

    mockExecuteWorkflowStepActivity
      .mockResolvedValueOnce({ success: true, contextUpdates: { step1_result: 'done' } })
      .mockResolvedValueOnce({ success: false, error: 'Something went wrong' });

    await expect(runDurableWorkflow(workflow, userId, {})).rejects.toThrow(
      'Workflow execution failed: Step step2_fails (test.do) returned unsuccessful status.'
    );

    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledTimes(2); // step1, step2_fails
    expect(mockExecuteWorkflowStepActivity).not.toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step3' }), expect.anything(), expect.anything());
    
    expect(mockRollbackWorkflowStepActivity).toHaveBeenCalledTimes(1);
    expect(mockRollbackWorkflowStepActivity).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'step1' }),
      { success: true, contextUpdates: { step1_result: 'done' } },
      userId
    );
  });

  it('should continue execution if a step fails with continueOnError: true', async () => {
    const workflow = {
      steps: [
        { stepId: 'step1', order: 1, app: 'test', action: 'do' },
        { stepId: 'step2_fails', order: 2, app: 'test', action: 'do', continueOnError: true },
        { stepId: 'step3', order: 3, app: 'test', action: 'do' },
      ],
    };
    const userId = 'user-123';

    mockExecuteWorkflowStepActivity
      .mockResolvedValueOnce({ success: true, contextUpdates: { step1_result: 'done' } })
      .mockResolvedValueOnce({ success: false, error: 'Non-critical error' })
      .mockResolvedValueOnce({ success: true, contextUpdates: { step3_result: 'done' } });

    const result = await runDurableWorkflow(workflow, userId, {});

    expect(result.success).toBe(true);
    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledTimes(3);
    expect(mockRollbackWorkflowStepActivity).not.toHaveBeenCalled();
    expect(result.context).toEqual({ step1_result: 'done', step3_result: 'done' });
  });

  it('should handle boolean conditional branching (true path)', async () => {
    const workflow = {
      steps: [
        { stepId: 'condition', order: 1, app: 'logic', action: 'evaluate', stepType: 'condition' },
        { stepId: 'true_branch', order: 2, app: 'test', action: 'do', dependsOn: ['condition.true'] },
        { stepId: 'false_branch', order: 2, app: 'test', action: 'do', dependsOn: ['condition.false'] },
        { stepId: 'cascade_skip', order: 3, app: 'test', action: 'do', dependsOn: ['false_branch'] },
      ],
    };

    mockExecuteWorkflowStepActivity.mockImplementation(async (step) => {
      if (step.stepId === 'condition') {
        return { success: true, evaluation: true, contextUpdates: { cond: 'true' } };
      }
      return { success: true, contextUpdates: { [`${step.stepId}_result`]: 'done' } };
    });

    const result = await runDurableWorkflow(workflow, 'user-1', {});

    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'condition' }), expect.anything(), expect.anything());
    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'true_branch' }), expect.anything(), expect.anything());
    expect(mockExecuteWorkflowStepActivity).not.toHaveBeenCalledWith(expect.objectContaining({ stepId: 'false_branch' }), expect.anything(), expect.anything());
    expect(mockExecuteWorkflowStepActivity).not.toHaveBeenCalledWith(expect.objectContaining({ stepId: 'cascade_skip' }), expect.anything(), expect.anything());
    expect(result.context).toEqual({ cond: 'true', true_branch_result: 'done' });
  });

  it('should handle string router conditional branching', async () => {
    const workflow = {
      steps: [
        { stepId: 'router', order: 1, app: 'ai', action: 'route', stepType: 'condition' },
        { stepId: 'path_a', order: 2, app: 'test', action: 'do', dependsOn: ['router.path_a'] },
        { stepId: 'path_b', order: 2, app: 'test', action: 'do', dependsOn: ['router.path_b'] },
      ],
    };

    mockExecuteWorkflowStepActivity.mockImplementation(async (step) => {
      if (step.stepId === 'router') {
        return { success: true, evaluation: 'path_b', contextUpdates: { route: 'b' } };
      }
      return { success: true, contextUpdates: { [`${step.stepId}_result`]: 'done' } };
    });

    const result = await runDurableWorkflow(workflow, 'user-1', {});

    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'router' }), expect.anything(), expect.anything());
    expect(mockExecuteWorkflowStepActivity).not.toHaveBeenCalledWith(expect.objectContaining({ stepId: 'path_a' }), expect.anything(), expect.anything());
    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'path_b' }), expect.anything(), expect.anything());
    expect(result.context).toEqual({ route: 'b', path_b_result: 'done' });
  });

  it('should throw an error on cyclic dependency', async () => {
    const workflow = {
      steps: [
        { stepId: 'step1', order: 1, app: 'test', action: 'do', dependsOn: ['step2'] },
        { stepId: 'step2', order: 2, app: 'test', action: 'do', dependsOn: ['step1'] },
      ],
    };

    await expect(runDurableWorkflow(workflow, 'user-1', {})).rejects.toThrow(
      'Cyclic dependency or deadlock detected in Temporal workflow steps.'
    );
  });

  it('should call execution status activities when _executionId is present', async () => {
    const workflow = {
      steps: [
        { stepId: 'step1', order: 1, app: 'test', action: 'do' },
        { stepId: 'step2', order: 2, app: 'test', action: 'do' },
      ],
    };
    const context = { _executionId: 'exec-abc' };

    await runDurableWorkflow(workflow, 'user-1', context);

    expect(mockUpdateExecutionToRunningActivity).toHaveBeenCalledWith('exec-abc', 2);
    expect(mockCompleteExecutionActivity).toHaveBeenCalledWith(
      'exec-abc',
      'Durable Temporal parallel DAG completed successfully: 2/2 steps complete.',
      expect.any(Object),
      2,
      0
    );
    expect(mockFailExecutionActivity).not.toHaveBeenCalled();
  });

  it('should call failExecutionActivity on failure when _executionId is present', async () => {
    const workflow = {
      steps: [{ stepId: 'step1_fails', order: 1, app: 'test', action: 'do' }],
    };
    const context = { _executionId: 'exec-def' };
    const error = new Error('Forced failure');
    mockExecuteWorkflowStepActivity.mockRejectedValue(error);

    await expect(runDurableWorkflow(workflow, 'user-1', context)).rejects.toThrow();

    expect(mockFailExecutionActivity).toHaveBeenCalledWith('exec-def', error.message, error.stack);
    expect(mockCompleteExecutionActivity).not.toHaveBeenCalled();
  });

  it('should call skipWorkflowStepActivity when a branch is skipped', async () => {
    const workflow = {
      steps: [
        { stepId: 'condition', order: 1, app: 'logic', action: 'evaluate', stepType: 'condition' },
        { stepId: 'false_branch', order: 2, app: 'test', action: 'do', dependsOn: ['condition.false'] },
      ],
    };
    const context = { _executionId: 'exec-ghi' };

    mockExecuteWorkflowStepActivity.mockResolvedValue({ success: true, evaluation: true });

    await runDurableWorkflow(workflow, 'user-1', context);

    expect(mockSkipWorkflowStepActivity).toHaveBeenCalledWith(
      'exec-ghi',
      'false_branch',
      'Condition evaluated to true, skipping false branch.'
    );
  });

  it('should use custom retry policy when provided and not in mock mode', async () => {
    process.env.TEMPORAL_MOCK = 'false';
    const workflow = {
      steps: [
        { 
          stepId: 'step1', 
          order: 1, 
          app: 'test', 
          action: 'do',
          retryPolicy: {
            initialIntervalMs: 500,
            backoffCoefficient: 1.5,
            maxDelayMs: 5000,
            maxAttempts: 5
          }
        },
      ],
    };

    await runDurableWorkflow(workflow, 'user-1', {});

    // The first call is the default proxy for the whole workflow
    expect(mockProxyActivities).toHaveBeenCalledWith(expect.objectContaining({
      retry: expect.objectContaining({ maximumAttempts: 3 })
    }));
    // The second call is the custom one for the specific step
    expect(mockProxyActivities).toHaveBeenCalledWith(expect.objectContaining({
      retry: {
        initialInterval: '500ms',
        backoffCoefficient: 1.5,
        maximumInterval: '5000ms',
        maximumAttempts: 5
      }
    }));
  });

  it('should start execution from startStepIndex', async () => {
    const workflow = {
      steps: [
        { stepId: 'step1', order: 1, app: 'test', action: 'do' },
        { stepId: 'step2', order: 2, app: 'test', action: 'do' },
        { stepId: 'step3', order: 3, app: 'test', action: 'do' },
      ],
    };

    await runDurableWorkflow(workflow, 'user-1', {}, 1);

    expect(mockExecuteWorkflowStepActivity).not.toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step1' }), expect.anything(), expect.anything());
    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step2' }), expect.anything(), expect.anything());
    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step3' }), expect.anything(), expect.anything());
    expect(mockExecuteWorkflowStepActivity).toHaveBeenCalledTimes(2);
  });
});