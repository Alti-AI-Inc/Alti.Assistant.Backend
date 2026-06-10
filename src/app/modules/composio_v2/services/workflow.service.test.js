import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { workflowService } from '../services/workflow.service.js';
import WorkflowExecution from '../models/workflowExecution.model.js';
import ComposioAuth from '../composio.model.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { logger } from '../../../../shared/logger.js';
import queueManager from './queueManager.service.js';

// Mock dependencies
vi.mock('../models/workflowExecution.model.js');
vi.mock('../composio.model.js');
vi.mock('../models/scheduledWorkflow.model.js');
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('./queueManager.service.js', () => ({
  default: {
    queueWorkflow: vi.fn(),
  },
}));

describe('WorkflowService', () => {
  const mockUserId = 'user-123';
  const mockWorkflowId = 'wf-abc-123';
  let mockWorkflow;
  let mockWorkflowInstance;

  beforeEach(() => {
    mockWorkflow = {
      _id: 'mongo-id-123',
      workflowId: mockWorkflowId,
      userId: mockUserId,
      title: 'Test Workflow',
      description: 'A test workflow',
      executionPlan: [{ step: 1 }],
      workflowType: 'automation',
      requiredApps: ['google', 'slack'],
      totalSteps: 1,
      triggerType: 'manual',
      scheduleConfig: { isActive: true, timezone: 'UTC' },
      originalUserInput: 'do the test thing',
      conversationId: 'conv-456',
      conversationContext: {},
      connectedAccounts: [{ app: 'google', connectedAccountId: 'g-1' }],
      status: 'pending',
      executionCount: 0,
      successRate: 100,
      lastExecution: null,
      nextExecution: null,
      toObject: () => mockWorkflow,
    };

    mockWorkflowInstance = {
      ...mockWorkflow,
      save: vi.fn().mockResolvedValue(mockWorkflow),
      pause: vi.fn().mockImplementation(function () {
        this.status = 'paused';
        this.scheduleConfig.isActive = false;
        return this.save();
      }),
      resume: vi.fn().mockImplementation(function () {
        this.status = 'active';
        this.scheduleConfig.isActive = true;
        return this.save();
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createWorkflow', () => {
    const workflowData = {
      userId: mockUserId,
      title: 'New Workflow',
      description: 'New Description',
      executionPlan: [{ step: 1, tool: 'test' }],
      workflowType: 'automation',
      requiredApps: ['google'],
      originalUserInput: 'create a workflow',
      conversationId: 'conv-123',
      conversationContext: {},
    };

    it('should create a manual workflow successfully', async () => {
      ScheduledWorkflow.generateWorkflowId.mockReturnValue(mockWorkflowId);
      vi.spyOn(workflowService, 'getUserConnectedAccounts').mockResolvedValue([
        { app: 'google', connectedAccountId: 'g-1', status: 'active' },
      ]);
      const saveMock = vi.fn().mockResolvedValue(true);
      ScheduledWorkflow.mockImplementation((data) => ({ ...data, save: saveMock }));

      const result = await workflowService.createWorkflow(workflowData);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Workflow created successfully');
      expect(result.data.workflowId).toBe(mockWorkflowId);
      expect(result.data.userId).toBe(mockUserId);
      expect(result.data.status).toBe('pending');
      expect(result.data.triggerType).toBe('manual');
      expect(saveMock).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith(`Workflow created: ${mockWorkflowId} for user: ${mockUserId}`);
    });

    it('should create a scheduled workflow and set nextExecution', async () => {
      const triggerDate = new Date(Date.now() + 100000).toISOString();
      const scheduledWorkflowData = {
        ...workflowData,
        triggerType: 'scheduled',
        scheduleConfig: { triggerDate, recurrence: 'daily' },
      };
      ScheduledWorkflow.generateWorkflowId.mockReturnValue(mockWorkflowId);
      vi.spyOn(workflowService, 'getUserConnectedAccounts').mockResolvedValue([]);
      const saveMock = vi.fn().mockResolvedValue(true);
      ScheduledWorkflow.mockImplementation((data) => ({ ...data, save: saveMock }));

      const result = await workflowService.createWorkflow(scheduledWorkflowData);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('active');
      expect(result.data.triggerType).toBe('scheduled');
      expect(result.data.nextExecution).toEqual(new Date(triggerDate));
      expect(saveMock).toHaveBeenCalledOnce();
    });

    it('should handle errors during workflow creation', async () => {
      const error = new Error('Database error');
      ScheduledWorkflow.generateWorkflowId.mockReturnValue(mockWorkflowId);
      vi.spyOn(workflowService, 'getUserConnectedAccounts').mockResolvedValue([]);
      const saveMock = vi.fn().mockRejectedValue(error);
      ScheduledWorkflow.mockImplementation((data) => ({ ...data, save: saveMock }));

      const result = await workflowService.createWorkflow(workflowData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to create workflow');
      expect(result.error).toBe(error.message);
      expect(logger.error).toHaveBeenCalledWith(`Error creating workflow: ${error.message}`);
    });
  });

  describe('getUserWorkflows', () => {
    it('should retrieve workflows for a specific user', async () => {
      const findMock = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([mockWorkflow]),
      };
      ScheduledWorkflow.find.mockReturnValue(findMock);
      ScheduledWorkflow.countDocuments.mockResolvedValue(1);

      const result = await workflowService.getUserWorkflows(mockUserId, 'pending', 10, 0);

      expect(result.success).toBe(true);
      expect(result.data.workflows).toEqual([mockWorkflow]);
      expect(result.data.pagination.total).toBe(1);
      expect(ScheduledWorkflow.find).toHaveBeenCalledWith({ userId: mockUserId, status: 'pending' });
    });

    it('should handle database errors when fetching workflows', async () => {
      const error = new Error('DB find failed');
      ScheduledWorkflow.find.mockImplementation(() => {
        throw error;
      });

      const result = await workflowService.getUserWorkflows(mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error.message);
      expect(logger.error).toHaveBeenCalledWith(`Error fetching user workflows: ${error.message}`);
    });
  });

  describe('getWorkflowById', () => {
    it('should retrieve a specific workflow by ID for the correct user', async () => {
      ScheduledWorkflow.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockWorkflow) });
      WorkflowExecution.findByWorkflow.mockResolvedValue([]);

      const result = await workflowService.getWorkflowById(mockWorkflowId, mockUserId);

      expect(result.success).toBe(true);
      expect(result.data.workflow).toEqual(mockWorkflow);
      expect(result.data.recentExecutions).toEqual([]);
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId: mockWorkflowId, userId: mockUserId });
    });

    it('should return not found if workflow does not exist', async () => {
      ScheduledWorkflow.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const result = await workflowService.getWorkflowById('non-existent-id', mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow not found');
    });

    it('should return not found if workflow belongs to another user (context boundary check)', async () => {
      ScheduledWorkflow.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const result = await workflowService.getWorkflowById(mockWorkflowId, 'another-user-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow not found');
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId: mockWorkflowId, userId: 'another-user-id' });
    });
  });

  describe('updateWorkflow', () => {
    it('should update a workflow successfully', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflowInstance);
      const updates = { title: 'Updated Title', description: 'Updated Description' };

      const result = await workflowService.updateWorkflow(mockWorkflowId, mockUserId, updates);

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Updated Title');
      expect(mockWorkflowInstance.save).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith(`Workflow updated: ${mockWorkflowId}`);
    });

    it('should not update a workflow if it belongs to another user', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(null);
      const updates = { title: 'Updated Title' };

      const result = await workflowService.updateWorkflow(mockWorkflowId, 'another-user-id', updates);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow not found');
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId: mockWorkflowId, userId: 'another-user-id' });
    });

    it('should prevent updates to a running workflow', async () => {
      mockWorkflowInstance.status = 'running';
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflowInstance);

      const result = await workflowService.updateWorkflow(mockWorkflowId, mockUserId, { title: 'New Title' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot update running workflow');
    });

    it('should not update disallowed fields', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflowInstance);
      const updates = { title: 'Updated Title', userId: 'hacker-id' }; // Attempt to change ownership

      await workflowService.updateWorkflow(mockWorkflowId, mockUserId, updates);

      expect(mockWorkflowInstance.userId).toBe(mockUserId); // Should not have changed
      expect(mockWorkflowInstance.title).toBe('Updated Title');
      expect(mockWorkflowInstance.save).toHaveBeenCalledOnce();
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete a workflow and its executions successfully', async () => {
      ScheduledWorkflow.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockWorkflow) });
      ScheduledWorkflow.deleteOne.mockResolvedValue({ deletedCount: 1 });
      WorkflowExecution.deleteMany.mockResolvedValue({ deletedCount: 5 });

      const result = await workflowService.deleteWorkflow(mockWorkflowId, mockUserId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Workflow deleted successfully');
      expect(ScheduledWorkflow.deleteOne).toHaveBeenCalledWith({ workflowId: mockWorkflowId, userId: mockUserId });
      expect(WorkflowExecution.deleteMany).toHaveBeenCalledWith({ workflowId: mockWorkflowId });
      expect(logger.info).toHaveBeenCalledWith(`Workflow deleted: ${mockWorkflowId}`);
    });

    it('should not delete a workflow if it belongs to another user', async () => {
      ScheduledWorkflow.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const result = await workflowService.deleteWorkflow(mockWorkflowId, 'another-user-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow not found');
      expect(ScheduledWorkflow.deleteOne).not.toHaveBeenCalled();
    });

    it('should prevent deletion of a running workflow', async () => {
      mockWorkflow.status = 'running';
      ScheduledWorkflow.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockWorkflow) });

      const result = await workflowService.deleteWorkflow(mockWorkflowId, mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot delete running workflow');
      expect(ScheduledWorkflow.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('triggerWorkflow', () => {
    beforeEach(() => {
      mockWorkflow.scheduleConfig.isActive = true;
      ScheduledWorkflow.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockWorkflow) });
      vi.spyOn(workflowService, 'validateWorkflowConnections').mockResolvedValue({ success: true });
      vi.spyOn(workflowService, 'createExecution').mockResolvedValue({ success: true, data: { executionId: 'exec-123' } });
      queueManager.queueWorkflow.mockResolvedValue({ queueId: 'queue-456' });
    });

    it('should trigger a workflow successfully', async () => {
      const result = await workflowService.triggerWorkflow(mockWorkflowId, mockUserId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Workflow execution started');
      expect(result.data.status).toBe('queued');
      expect(result.data.executionId).toBe('exec-123');
      expect(result.data.queueId).toBe('queue-456');
      expect(queueManager.queueWorkflow).toHaveBeenCalledWith(mockWorkflow, 'high', expect.any(Object));
    });

    it('should fail if workflow is not found or does not belong to user', async () => {
      ScheduledWorkflow.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      const result = await workflowService.triggerWorkflow(mockWorkflowId, 'another-user-id');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow not found');
    });

    it('should fail if workflow is not active', async () => {
      mockWorkflow.scheduleConfig.isActive = false;
      ScheduledWorkflow.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockWorkflow) });
      const result = await workflowService.triggerWorkflow(mockWorkflowId, mockUserId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow is not active');
    });

    it('should fail if connection validation fails', async () => {
      const validationError = { success: false, error: 'Missing app connections' };
      vi.spyOn(workflowService, 'validateWorkflowConnections').mockResolvedValue(validationError);
      const result = await workflowService.triggerWorkflow(mockWorkflowId, mockUserId);
      expect(result).toEqual(validationError);
    });
  });

  describe('pauseWorkflow & resumeWorkflow', () => {
    it('should pause a workflow', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflowInstance);
      const result = await workflowService.pauseWorkflow(mockWorkflowId, mockUserId);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Workflow paused successfully');
      expect(mockWorkflowInstance.pause).toHaveBeenCalledOnce();
      expect(mockWorkflowInstance.save).toHaveBeenCalledOnce();
    });

    it('should resume a workflow', async () => {
      mockWorkflowInstance.status = 'paused';
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflowInstance);
      const result = await workflowService.resumeWorkflow(mockWorkflowId, mockUserId);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Workflow resumed successfully');
      expect(mockWorkflowInstance.resume).toHaveBeenCalledOnce();
      expect(mockWorkflowInstance.save).toHaveBeenCalledOnce();
    });

    it('should return not found when trying to pause a non-existent workflow', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(null);
      const result = await workflowService.pauseWorkflow('non-existent', mockUserId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workflow not found');
    });
  });

  describe('validateWorkflowConnections', () => {
    it('should return success if all apps are connected', async () => {
      vi.spyOn(workflowService, 'getUserConnectedAccounts').mockResolvedValue([
        { app: 'google', status: 'active' },
        { app: 'slack', status: 'active' },
      ]);
      const result = await workflowService.validateWorkflowConnections(mockWorkflow);
      expect(result.success).toBe(true);
    });

    it('should return failure if some apps are missing', async () => {
      vi.spyOn(workflowService, 'getUserConnectedAccounts').mockResolvedValue([
        { app: 'google', status: 'active' },
      ]);
      const result = await workflowService.validateWorkflowConnections(mockWorkflow);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing app connections');
      expect(result.data.missingApps).toEqual(['slack']);
    });
  });

  describe('getUserConnectedAccounts', () => {
    it('should fetch and filter user accounts correctly', async () => {
      const mockAccounts = [
        { integrationId: 'GOOGLE', connectedAccountId: 'g-1', status: 'active' },
        { integrationId: 'SLACK', connectedAccountId: 's-1', status: 'active' },
        { integrationId: 'JIRA', connectedAccountId: 'j-1', status: 'active' },
        { integrationId: 'HUBSPOT', connectedAccountId: 'h-1', status: 'inactive' },
      ];
      ComposioAuth.find.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockAccounts) });

      const result = await workflowService.getUserConnectedAccounts(mockUserId, ['google', 'jira']);

      expect(result).toEqual([
        { app: 'google', connectedAccountId: 'g-1', status: 'active' },
        { app: 'jira', connectedAccountId: 'j-1', status: 'active' },
      ]);
      expect(ComposioAuth.find).toHaveBeenCalledWith({ userId: mockUserId, status: 'active' });
    });

    it('should return an empty array on database error', async () => {
      ComposioAuth.find.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB fail')) });
      const result = await workflowService.getUserConnectedAccounts(mockUserId, ['google']);
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching connected accounts'));
    });
  });

  describe('getDueWorkflows', () => {
    it('should retrieve workflows due for execution', async () => {
      const dueWorkflows = [mockWorkflow];
      ScheduledWorkflow.findDueForExecution.mockResolvedValue(dueWorkflows);

      const result = await workflowService.getDueWorkflows();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(dueWorkflows);
      expect(ScheduledWorkflow.findDueForExecution).toHaveBeenCalledOnce();
    });

    it('should handle errors when fetching due workflows', async () => {
      const error = new Error('Scheduler DB error');
      ScheduledWorkflow.findDueForExecution.mockRejectedValue(error);

      const result = await workflowService.getDueWorkflows();

      expect(result.success).toBe(false);
      expect(result.error).toBe(error.message);
      expect(logger.error).toHaveBeenCalledWith(`Error fetching due workflows: ${error.message}`);
    });
  });
});