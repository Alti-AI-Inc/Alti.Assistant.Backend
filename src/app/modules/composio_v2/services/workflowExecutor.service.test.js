import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workflowExecutor } from './workflowExecutor.service.js';
import { logger } from '../../../../shared/logger.js';
import WorkflowExecution from '../models/workflowExecution.model.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import ComposioAuth from '../composio.model.js';

// Mock dependencies
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('../models/workflowExecution.model.js', () => {
  const mockExecutionInstance = {
    _id: 'mock-execution-id',
    save: vi.fn().mockResolvedValue(true),
    startExecution: vi.fn().mockResolvedValue(true),
    addLog: vi.fn().mockResolvedValue(true),
    completeExecution: vi.fn().mockResolvedValue(true),
    updateProgress: vi.fn().mockResolvedValue(true),
    cancel: vi.fn().mockResolvedValue(true),
    isRunning: true,
    status: 'running'
  };

  const MockWorkflowExecution = vi.fn().mockImplementation(() => mockExecutionInstance);
  MockWorkflowExecution.generateExecutionId = vi.fn().mockReturnValue('mock-exec-id');
  MockWorkflowExecution.getExecutionStats = vi.fn().mockResolvedValue({ total: 10, success: 8, failed: 2 });
  MockWorkflowExecution.findOne = vi.fn().mockResolvedValue(mockExecutionInstance);
  
  return {
    default: MockWorkflowExecution
  };
});

vi.mock('../models/scheduledWorkflow.model.js', () => {
  const mockWorkflowInstance = {
    workflowId: 'wf-123',
    userId: 'user-123',
    updateExecutionStats: vi.fn().mockResolvedValue(true)
  };
  return {
    default: {
      findOne: vi.fn().mockResolvedValue(mockWorkflowInstance)
    }
  };
});

vi.mock('../composio.model.js', () => {
  return {
    default: {
      find: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { userId: 'user-123', integrationId: 'github', status: 'active', connectedAccountId: 'conn-1' }
        ])
      }),
      findOne: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: 'user-123', integrationId: 'github', status: 'active', connectedAccountId: 'conn-1'
        })
      })
    }
  };
});

describe('WorkflowExecutor Service', () => {
  let mockWorkflow;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockWorkflow = {
      workflowId: 'wf-123',
      userId: 'user-123',
      totalSteps: 1,
      connectedAccounts: ['github'],
      requiredApps: ['github'],
      workflowType: 'single_step',
      executionPlan: [
        {
          step: 1,
          app: 'github',
          action: 'create_issue',
          parameters: { title: 'Test Issue' }
        }
      ],
      updateExecutionStats: vi.fn().mockResolvedValue(true)
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('executeWorkflow', () => {
    it('should execute single-step workflow successfully', async () => {
      const executeSingleStepSpy = vi.spyOn(workflowExecutor, 'executeSingleStepWorkflow')
        .mockResolvedValue({
          success: true,
          data: { result: 'success' },
          summary: 'Successfully executed',
          outputData: { stepResults: [] }
        });

      const result = await workflowExecutor.executeWorkflow(mockWorkflow);

      expect(result.success).toBe(true);
      expect(result.executionId).toBe('mock-exec-id');
      expect(executeSingleStepSpy).toHaveBeenCalled();
      expect(mockWorkflow.updateExecutionStats).toHaveBeenCalledWith(true);
    });

    it('should execute multi-step workflow successfully', async () => {
      mockWorkflow.workflowType = 'multi_step';
      const executeMultiStepSpy = vi.spyOn(workflowExecutor, 'executeMultiStepWorkflow')
        .mockResolvedValue({
          success: true,
          data: { result: 'success' },
          summary: 'Successfully executed multi',
          outputData: { stepResults: [] }
        });

      const result = await workflowExecutor.executeWorkflow(mockWorkflow);

      expect(result.success).toBe(true);
      expect(executeMultiStepSpy).toHaveBeenCalled();
    });

    it('should fail if connection validation fails', async () => {
      vi.spyOn(workflowExecutor, 'validateConnections').mockResolvedValue({
        success: false,
        error: 'Missing connections'
      });

      const result = await workflowExecutor.executeWorkflow(mockWorkflow);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing connections');
      expect(mockWorkflow.updateExecutionStats).toHaveBeenCalledWith(false);
    });

    it('should handle execution errors gracefully', async () => {
      vi.spyOn(workflowExecutor, 'validateConnections').mockRejectedValue(new Error('DB Error'));

      const result = await workflowExecutor.executeWorkflow(mockWorkflow);

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB Error');
      expect(mockWorkflow.updateExecutionStats).toHaveBeenCalledWith(false);
    });
  });

  describe('executeSingleStepWorkflow', () => {
    it('should execute single step successfully', async () => {
      const mockExecution = new WorkflowExecution();
      vi.spyOn(workflowExecutor, 'getConnectedAccount').mockResolvedValue({ connectedAccountId: 'conn-1' });
      vi.spyOn(workflowExecutor, 'executeComposioAction').mockResolvedValue({
        success: true,
        data: { issue_id: 123 }
      });

      const result = await workflowExecutor.executeSingleStepWorkflow(mockWorkflow, mockExecution);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ issue_id: 123 });
      expect(mockExecution.updateProgress).toHaveBeenCalledTimes(2);
    });

    it('should fail if no connected account is found', async () => {
      const mockExecution = new WorkflowExecution();
      vi.spyOn(workflowExecutor, 'getConnectedAccount').mockResolvedValue(null);

      const result = await workflowExecutor.executeSingleStepWorkflow(mockWorkflow, mockExecution);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No connected account found');
    });

    it('should handle execution action failure', async () => {
      const mockExecution = new WorkflowExecution();
      vi.spyOn(workflowExecutor, 'getConnectedAccount').mockResolvedValue({ connectedAccountId: 'conn-1' });
      vi.spyOn(workflowExecutor, 'executeComposioAction').mockResolvedValue({
        success: false,
        error: 'API Timeout'
      });

      const result = await workflowExecutor.executeSingleStepWorkflow(mockWorkflow, mockExecution);

      expect(result.success).toBe(false);
      expect(result.summary).toContain('Failed to execute');
    });
  });

  describe('executeMultiStepWorkflow', () => {
    beforeEach(() => {
      mockWorkflow.workflowType = 'multi_step';
      mockWorkflow.executionPlan = [
        {
          step: 1,
          app: 'github',
          action: 'get_issue',
          parameters: { issue_id: 1 },
          outputMapping: { title: 'issue_title' }
        },
        {
          step: 2,
          app: 'slack',
          action: 'send_message',
          dependencies: [1],
          parameters: { message: 'from_step_1.issue_title' }
        }
      ];
    });

    it('should execute all steps successfully with parameter mapping', async () => {
      const mockExecution = new WorkflowExecution();
      vi.spyOn(workflowExecutor, 'getConnectedAccount').mockResolvedValue({ connectedAccountId: 'conn-1' });
      
      vi.spyOn(workflowExecutor, 'executeComposioAction')
        .mockResolvedValueOnce({
          success: true,
          data: { title: 'Bug found' }
        })
        .mockResolvedValueOnce({
          success: true,
          data: { sent: true }
        });

      const result = await workflowExecutor.executeMultiStepWorkflow(mockWorkflow, mockExecution);

      expect(result.success).toBe(true);
      expect(result.outputData.crossStepOutputs).toEqual({ issue_title: 'Bug found' });
    });

    it('should fail if dependencies are not met', async () => {
      const mockExecution = new WorkflowExecution();
      mockWorkflow.executionPlan[1].dependencies = [3]; // Non-existent step

      const result = await workflowExecutor.executeMultiStepWorkflow(mockWorkflow, mockExecution);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Dependencies not met');
    });

    it('should fail if a step execution fails', async () => {
      const mockExecution = new WorkflowExecution();
      vi.spyOn(workflowExecutor, 'getConnectedAccount').mockResolvedValue({ connectedAccountId: 'conn-1' });
      vi.spyOn(workflowExecutor, 'executeComposioAction').mockResolvedValue({
        success: false,
        error: 'Step failed'
      });

      const result = await workflowExecutor.executeMultiStepWorkflow(mockWorkflow, mockExecution);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Multi-step execution failed');
    });
  });

  describe('executeComposioAction', () => {
    it('should simulate execution successfully', async () => {
      const promise = workflowExecutor.executeComposioAction(
        'user-123',
        'github',
        'create_issue',
        { title: 'Test' },
        { connectedAccountId: 'conn-1' }
      );

      vi.advanceTimersByTime(1000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.data.app).toBe('github');
    });
  });

  describe('resolveCrossStepParameters', () => {
    it('should resolve parameters from step outputs', () => {
      const parameters = { message: 'from_step_1.issue_title', staticVal: 'hello' };
      const stepOutputs = { issue_title: 'Resolved Title' };
      const crossStepParameters = null;

      const resolved = workflowExecutor.resolveCrossStepParameters(parameters, stepOutputs, crossStepParameters);

      expect(resolved.message).toBe('Resolved Title');
      expect(resolved.staticVal).toBe('hello');
    });

    it('should apply cross-step parameter mappings', () => {
      const parameters = { message: 'static' };
      const stepOutputs = { mapped_val: 'Dynamic Value' };
      const crossStepParameters = { message: 'mapped_val' };

      const resolved = workflowExecutor.resolveCrossStepParameters(parameters, stepOutputs, crossStepParameters);

      expect(resolved.message).toBe('Dynamic Value');
    });
  });

  describe('validateConnections', () => {
    it('should return success if no required apps', async () => {
      mockWorkflow.requiredApps = [];
      const result = await workflowExecutor.validateConnections(mockWorkflow);
      expect(result.success).toBe(true);
    });

    it('should return success if all required apps are connected', async () => {
      const result = await workflowExecutor.validateConnections(mockWorkflow);
      expect(result.success).toBe(true);
    });

    it('should return failure if some required apps are missing', async () => {
      mockWorkflow.requiredApps = ['github', 'slack'];
      const result = await workflowExecutor.validateConnections(mockWorkflow);
      expect(result.success).toBe(false);
      expect(result.missingApps).toContain('slack');
    });

    it('should handle database errors gracefully', async () => {
      ComposioAuth.find.mockReturnValueOnce({
        lean: vi.fn().mockRejectedValue(new Error('DB Connection Failed'))
      });

      const result = await workflowExecutor.validateConnections(mockWorkflow);
      expect(result.success).toBe(false);
      expect(result.error).toBe('DB Connection Failed');
    });
  });

  describe('getConnectedAccount', () => {
    it('should return connected account details if found', async () => {
      const result = await workflowExecutor.getConnectedAccount('user-123', 'github');
      expect(result).toEqual({
        connectedAccountId: 'conn-1',
        integrationId: 'github',
        status: 'active'
      });
    });

    it('should return null if not found', async () => {
      ComposioAuth.findOne.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(null)
      });
      const result = await workflowExecutor.getConnectedAccount('user-123', 'slack');
      expect(result).toBeNull();
    });

    it('should return null and log error on exception', async () => {
      ComposioAuth.findOne.mockReturnValueOnce({
        lean: vi.fn().mockRejectedValue(new Error('Query Error'))
      });
      const result = await workflowExecutor.getConnectedAccount('user-123', 'github');
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getExecutionStats', () => {
    it('should return stats successfully', async () => {
      const result = await workflowExecutor.getExecutionStats('wf-123');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      WorkflowExecution.getExecutionStats.mockRejectedValueOnce(new Error('Stats Error'));
      const result = await workflowExecutor.getExecutionStats('wf-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Stats Error');
    });
  });

  describe('cancelExecution', () => {
    it('should cancel running execution successfully', async () => {
      const result = await workflowExecutor.cancelExecution('exec-123', 'user-123');
      expect(result.success).toBe(true);
    });

    it('should return error if execution not found', async () => {
      WorkflowExecution.findOne.mockResolvedValueOnce(null);
      const result = await workflowExecutor.cancelExecution('exec-123', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution not found');
    });

    it('should return error if execution is not running', async () => {
      WorkflowExecution.findOne.mockResolvedValueOnce({
        isRunning: false
      });
      const result = await workflowExecutor.cancelExecution('exec-123', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution is not running');
    });

    it('should handle errors gracefully', async () => {
      WorkflowExecution.findOne.mockRejectedValueOnce(new Error('DB Error'));
      const result = await workflowExecutor.cancelExecution('exec-123', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('DB Error');
    });
  });

  describe('retryExecution', () => {
    it('should retry failed execution successfully', async () => {
      WorkflowExecution.findOne.mockResolvedValueOnce({
        status: 'failed',
        workflowId: 'wf-123'
      });

      vi.spyOn(workflowExecutor, 'executeWorkflow').mockResolvedValue({
        success: true,
        executionId: 'new-exec-id'
      });

      const result = await workflowExecutor.retryExecution('exec-123', 'user-123');

      expect(result.success).toBe(true);
      expect(result.data.executionId).toBe('new-exec-id');
    });

    it('should return error if execution not found', async () => {
      WorkflowExecution.findOne.mockResolvedValueOnce(null);
      const result = await workflowExecutor.retryExecution('exec-123', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution not found');
    });

    it('should return error if execution is not in failed status', async () => {
      WorkflowExecution.findOne.mockResolvedValueOnce({
        status: 'completed'
      });
      const result = await workflowExecutor.retryExecution('exec-123', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Only failed executions can be retried');
    });

    it('should return error if original workflow not found', async () => {
      WorkflowExecution.findOne.mockResolvedValueOnce({
        status: 'failed',
        workflowId: 'wf-123'
      });
      ScheduledWorkflow.findOne.mockResolvedValueOnce(null);

      const result = await workflowExecutor.retryExecution('exec-123', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Original workflow not found');
    });

    it('should handle errors gracefully', async () => {
      WorkflowExecution.findOne.mockRejectedValueOnce(new Error('Retry Error'));
      const result = await workflowExecutor.retryExecution('exec-123', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Retry Error');
    });
  });
});