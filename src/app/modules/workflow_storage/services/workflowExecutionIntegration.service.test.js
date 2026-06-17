import { vi, describe, it, expect, beforeEach } from 'vitest';
import { workflowExecutionIntegrationService } from './workflowExecutionIntegration.service.js';

// Mock dependencies
vi.mock('./workflowStorage.service.js', () => ({
  workflowStorageService: {
    getStoredWorkflow: vi.fn(),
    analyzeAndStoreWorkflow: vi.fn(),
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
import { logger } from '../../../../shared/logger.js';

describe('WorkflowExecutionIntegrationService', () => {
  const mockUserId = 'user-123';
  const mockWorkflowId = 'stored-wf-abc';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('executeStoredWorkflow', () => {
    it('should return failure because execution is disabled', async () => {
      const result = await workflowExecutionIntegrationService.executeStoredWorkflow(
        mockWorkflowId,
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
      expect(result.message).toContain('Composio integration has been removed');
    });
  });

  describe('executeBatchStoredWorkflows', () => {
    it('should return failure because batch execution is disabled', async () => {
      const result = await workflowExecutionIntegrationService.executeBatchStoredWorkflows(
        [mockWorkflowId],
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
      expect(result.message).toContain('Composio integration has been removed');
    });
  });

  describe('scheduleStoredWorkflow', () => {
    it('should return failure because scheduling is disabled', async () => {
      const result = await workflowExecutionIntegrationService.scheduleStoredWorkflow(
        mockWorkflowId,
        mockUserId,
        { cron: '0 0 * * *' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
      expect(result.message).toContain('Composio integration has been removed');
    });
  });

  describe('getStoredWorkflowExecutionHistory', () => {
    it('should retrieve empty execution history successfully', async () => {
      const result = await workflowExecutionIntegrationService.getStoredWorkflowExecutionHistory(
        mockWorkflowId,
        mockUserId
      );

      expect(result.success).toBe(true);
      expect(result.data.storedWorkflowId).toBe(mockWorkflowId);
      expect(result.data.executions).toEqual([]);
      expect(result.data.totalExecutions).toBe(0);
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