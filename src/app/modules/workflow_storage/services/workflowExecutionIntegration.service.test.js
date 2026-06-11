import { vi, describe, it, expect, beforeEach } from 'vitest';
import { workflowExecutionIntegrationService } from './workflowExecutionIntegration.service.js';

// Mock dependencies
vi.mock('./workflowStorage.service.js', () => ({
  workflowStorageService: {
    getStoredWorkflow: vi.fn(),
    analyzeAndStoreWorkflow: vi.fn(),
  },
}));
vi.mock('../../composio_v2/services/workflow.service.js', () => ({
  workflowService: {
    createWorkflow: vi.fn(),
    triggerWorkflow: vi.fn(),
    getUserWorkflows: vi.fn(),
  },
}));
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Destructure mocked services for easier access
import { workflowStorageService } from './workflowStorage.service.js';
import { workflowService } from '../../composio_v2/services/workflow.service.js';
import { logger } from '../../../../shared/logger.js';

describe('WorkflowExecutionIntegrationService', () => {
  const mockUserId = 'user-123';
  const mockWorkflowId = 'stored-wf-abc';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('executeStoredWorkflow', () => {
    const mockStoredWorkflow = {
      _id: mockWorkflowId,
      title: 'Test Workflow',
      description: 'A test workflow',
      executionPlan: { steps: [] },
      workflowType: 'test',
      requiredApps: ['google'],
      isExecutable: true,
      originalUserInput: 'do something',
      conversationId: 'conv-123',
      conversationContext: {},
      totalSteps: 1,
      markAsExecuted: vi.fn().mockResolvedValue(true),
    };

    it('should execute a stored workflow successfully', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({
        success: true,
        data: mockStoredWorkflow,
      });
      workflowService.createWorkflow.mockResolvedValue({
        success: true,
        data: { workflowId: 'composio-wf-xyz' },
      });
      workflowService.triggerWorkflow.mockResolvedValue({
        success: true,
        data: { executionId: 'exec-123' },
      });

      const result = await workflowExecutionIntegrationService.executeStoredWorkflow(
        mockWorkflowId,
        mockUserId
      );

      expect(result.success).toBe(true);
      expect(result.data.storedWorkflowId).toBe(mockWorkflowId);
      expect(result.data.composioWorkflowId).toBe('composio-wf-xyz');
      expect(result.data.executionId).toBe('exec-123');
      expect(result.message).toBe('Stored workflow execution started successfully');
      expect(workflowStorageService.getStoredWorkflow).toHaveBeenCalledWith(mockWorkflowId, mockUserId);
      expect(workflowService.createWorkflow).toHaveBeenCalled();
      expect(workflowService.triggerWorkflow).toHaveBeenCalledWith('composio-wf-xyz', mockUserId, 'user_click');
      expect(mockStoredWorkflow.markAsExecuted).toHaveBeenCalled();
    });

    it('should fail if stored workflow is not found', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({
        success: false,
        error: 'Not found',
      });

      const result = await workflowExecutionIntegrationService.executeStoredWorkflow(
        mockWorkflowId,
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Stored workflow not found');
      expect(workflowService.createWorkflow).not.toHaveBeenCalled();
    });

    it('should fail if stored workflow is not executable', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({
        success: true,
        data: { ...mockStoredWorkflow, isExecutable: false, status: 'pending' },
      });

      const result = await workflowExecutionIntegrationService.executeStoredWorkflow(
        mockWorkflowId,
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow is not executable');
      expect(result.details.status).toBe('pending');
      expect(workflowService.createWorkflow).not.toHaveBeenCalled();
    });

    it('should fail if Composio workflow creation fails', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({
        success: true,
        data: mockStoredWorkflow,
      });
      workflowService.createWorkflow.mockResolvedValue({
        success: false,
        error: 'Composio error',
      });

      const result = await workflowExecutionIntegrationService.executeStoredWorkflow(
        mockWorkflowId,
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create workflow in Composio v2');
      expect(workflowService.triggerWorkflow).not.toHaveBeenCalled();
      expect(mockStoredWorkflow.markAsExecuted).not.toHaveBeenCalled();
    });

    it('should not mark as executed if trigger fails', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({
        success: true,
        data: mockStoredWorkflow,
      });
      workflowService.createWorkflow.mockResolvedValue({
        success: true,
        data: { workflowId: 'composio-wf-xyz' },
      });
      workflowService.triggerWorkflow.mockResolvedValue({
        success: false,
        error: 'Trigger failed',
      });

      const result = await workflowExecutionIntegrationService.executeStoredWorkflow(
        mockWorkflowId,
        mockUserId
      );

      expect(result.success).toBe(true); // The overall operation is considered successful as it returns a result object
      expect(result.data.status).toBe('failed');
      expect(mockStoredWorkflow.markAsExecuted).not.toHaveBeenCalled();
    });

    it('should handle generic errors and log them', async () => {
      const error = new Error('Something went wrong');
      workflowStorageService.getStoredWorkflow.mockRejectedValue(error);

      const result = await workflowExecutionIntegrationService.executeStoredWorkflow(
        mockWorkflowId,
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
      expect(logger.error).toHaveBeenCalledWith('Error executing stored workflow:', error);
    });
  });

  describe('executeBatchStoredWorkflows', () => {
    const workflowIds = ['wf-1', 'wf-2', 'wf-3'];

    beforeEach(() => {
      // Spy on the service's own method to mock its behavior for batch tests
      vi.spyOn(workflowExecutionIntegrationService, 'executeStoredWorkflow');
    });

    it('should execute workflows sequentially and stop on error if continueOnError is false', async () => {
      workflowExecutionIntegrationService.executeStoredWorkflow
        .mockResolvedValueOnce({ success: true, data: {} })
        .mockResolvedValueOnce({ success: false, error: 'Failed' });

      const result = await workflowExecutionIntegrationService.executeBatchStoredWorkflows(
        workflowIds,
        mockUserId,
        { concurrent: false, continueOnError: false }
      );

      expect(result.success).toBe(true);
      expect(result.data.successCount).toBe(1);
      expect(result.data.failureCount).toBe(1);
      expect(result.data.totalRequested).toBe(3);
      expect(workflowExecutionIntegrationService.executeStoredWorkflow).toHaveBeenCalledTimes(2);
      expect(workflowExecutionIntegrationService.executeStoredWorkflow).toHaveBeenCalledWith('wf-1', mockUserId, expect.any(Object));
      expect(workflowExecutionIntegrationService.executeStoredWorkflow).toHaveBeenCalledWith('wf-2', mockUserId, expect.any(Object));
    });

    it('should execute all workflows sequentially even with errors if continueOnError is true', async () => {
      workflowExecutionIntegrationService.executeStoredWorkflow
        .mockResolvedValueOnce({ success: true, data: {} })
        .mockResolvedValueOnce({ success: false, error: 'Failed' })
        .mockResolvedValueOnce({ success: true, data: {} });

      const result = await workflowExecutionIntegrationService.executeBatchStoredWorkflows(
        workflowIds,
        mockUserId,
        { concurrent: false, continueOnError: true }
      );

      expect(result.success).toBe(true);
      expect(result.data.successCount).toBe(2);
      expect(result.data.failureCount).toBe(1);
      expect(workflowExecutionIntegrationService.executeStoredWorkflow).toHaveBeenCalledTimes(3);
    });

    it('should execute workflows concurrently', async () => {
      workflowExecutionIntegrationService.executeStoredWorkflow.mockResolvedValue({ success: true, data: {} });

      const result = await workflowExecutionIntegrationService.executeBatchStoredWorkflows(
        workflowIds,
        mockUserId,
        { concurrent: true }
      );

      expect(result.success).toBe(true);
      expect(result.data.successCount).toBe(3);
      expect(result.data.failureCount).toBe(0);
      expect(workflowExecutionIntegrationService.executeStoredWorkflow).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent execution with failures', async () => {
        workflowExecutionIntegrationService.executeStoredWorkflow
        .mockResolvedValueOnce({ success: true, data: {} })
        .mockResolvedValueOnce({ success: false, error: 'Failed' })
        .mockResolvedValueOnce({ success: true, data: {} });

      const result = await workflowExecutionIntegrationService.executeBatchStoredWorkflows(
        workflowIds,
        mockUserId,
        { concurrent: true }
      );

      expect(result.success).toBe(true);
      expect(result.data.successCount).toBe(2);
      expect(result.data.failureCount).toBe(1);
      expect(workflowExecutionIntegrationService.executeStoredWorkflow).toHaveBeenCalledTimes(3);
    });
  });

  describe('scheduleStoredWorkflow', () => {
    const mockStoredWorkflow = {
      isExecutable: true,
      title: 'Schedulable Workflow',
      // ... other properties
    };
    const scheduleConfig = { cron: '0 0 * * *' };

    it('should schedule a workflow successfully', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({
        success: true,
        data: mockStoredWorkflow,
      });
      workflowService.createWorkflow.mockResolvedValue({
        success: true,
        data: { workflowId: 'scheduled-wf-1', nextExecution: new Date() },
      });

      const result = await workflowExecutionIntegrationService.scheduleStoredWorkflow(
        mockWorkflowId,
        mockUserId,
        scheduleConfig
      );

      expect(result.success).toBe(true);
      expect(result.data.storedWorkflowId).toBe(mockWorkflowId);
      expect(result.data.scheduledWorkflowId).toBe('scheduled-wf-1');
      expect(workflowStorageService.getStoredWorkflow).toHaveBeenCalledWith(mockWorkflowId, mockUserId, { lean: true });
      expect(workflowService.createWorkflow).toHaveBeenCalledWith(expect.objectContaining({
        triggerType: 'scheduled',
        scheduleConfig: expect.objectContaining({
          isActive: true,
          sourceWorkflowId: mockWorkflowId,
          cron: '0 0 * * *'
        })
      }));
    });

    it('should fail if stored workflow is not found', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({ success: false });
      const result = await workflowExecutionIntegrationService.scheduleStoredWorkflow(mockWorkflowId, mockUserId, scheduleConfig);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Stored workflow not found');
    });

    it('should fail if stored workflow is not executable', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({
        success: true,
        data: { ...mockStoredWorkflow, isExecutable: false },
      });
      const result = await workflowExecutionIntegrationService.scheduleStoredWorkflow(mockWorkflowId, mockUserId, scheduleConfig);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow is not executable');
    });
  });

  describe('getStoredWorkflowExecutionHistory', () => {
    it('should retrieve execution history successfully', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({ success: true, data: {} });
      workflowService.getUserWorkflows.mockResolvedValue({
        success: true,
        data: { workflows: [{ id: 'exec-1' }], totalWorkflows: 1 },
      });

      const result = await workflowExecutionIntegrationService.getStoredWorkflowExecutionHistory(
        mockWorkflowId,
        mockUserId
      );

      expect(result.success).toBe(true);
      expect(result.data.storedWorkflowId).toBe(mockWorkflowId);
      expect(result.data.executions).toEqual([{ id: 'exec-1' }]);
      expect(result.data.totalExecutions).toBe(1);
      expect(workflowStorageService.getStoredWorkflow).toHaveBeenCalledWith(mockWorkflowId, mockUserId, { lean: true });
      expect(workflowService.getUserWorkflows).toHaveBeenCalledWith(
        mockUserId,
        null,
        20,
        0,
        { 'scheduleConfig.executionMetadata.sourceWorkflowId': mockWorkflowId }
      );
    });

    it('should fail if user does not have access to the stored workflow', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({ success: false });
      const result = await workflowExecutionIntegrationService.getStoredWorkflowExecutionHistory(mockWorkflowId, mockUserId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Stored workflow not found');
      expect(workflowService.getUserWorkflows).not.toHaveBeenCalled();
    });
  });

  describe('convertStoredWorkflowToTemplate', () => {
    const mockStoredWorkflow = {
      title: 'Original Workflow',
      description: 'Original Description',
      tags: ['original'],
      originalUserInput: 'do a thing',
    };

    it('should convert a workflow to a private template', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({
        success: true,
        data: mockStoredWorkflow,
      });
      workflowStorageService.analyzeAndStoreWorkflow.mockResolvedValue({
        success: true,
        data: { workflowId: 'template-wf-1' },
      });

      const result = await workflowExecutionIntegrationService.convertStoredWorkflowToTemplate(
        mockWorkflowId,
        mockUserId,
        { templateTitle: 'My Template' }
      );

      expect(result.success).toBe(true);
      expect(result.data.templateWorkflowId).toBe('template-wf-1');
      expect(result.data.isPublic).toBe(false);
      expect(workflowStorageService.analyzeAndStoreWorkflow).toHaveBeenCalledWith(expect.objectContaining({
        userId: mockUserId,
        title: 'My Template',
        category: 'template',
      }));
    });

    it('should convert a workflow to a public template', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({
        success: true,
        data: mockStoredWorkflow,
      });
      workflowStorageService.analyzeAndStoreWorkflow.mockResolvedValue({
        success: true,
        data: { workflowId: 'template-wf-public' },
      });

      const result = await workflowExecutionIntegrationService.convertStoredWorkflowToTemplate(
        mockWorkflowId,
        mockUserId,
        { isPublic: true }
      );

      expect(result.success).toBe(true);
      expect(result.data.templateWorkflowId).toBe('template-wf-public');
      expect(result.data.isPublic).toBe(true);
      expect(workflowStorageService.analyzeAndStoreWorkflow).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'template_user',
        title: 'Original Workflow (Template)',
      }));
    });

    it('should fail if the original workflow is not found', async () => {
      workflowStorageService.getStoredWorkflow.mockResolvedValue({ success: false });
      const result = await workflowExecutionIntegrationService.convertStoredWorkflowToTemplate(mockWorkflowId, mockUserId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Stored workflow not found');
    });
  });
});