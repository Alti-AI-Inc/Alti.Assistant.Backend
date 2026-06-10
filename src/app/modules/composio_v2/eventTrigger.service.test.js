import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventTrigger from './models/eventTrigger.model.js';
import { LangchainExecutionService } from '../langchain/langchainExecution.service.js';
import { workflowExecutionService } from '../workflow_automation/services/workflowExecution.service.js';
import { logger } from '../../../shared/logger.js';
import { eventTriggerService } from './eventTrigger.service.js';

// Mock dependencies
vi.mock('./models/eventTrigger.model.js', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock('../langchain/langchainExecution.service.js', () => ({
  LangchainExecutionService: {
    executeChain: vi.fn(),
  },
}));

vi.mock('../workflow_automation/services/workflowExecution.service.js', () => ({
  workflowExecutionService: {
    executeWorkflow: vi.fn(),
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('eventTriggerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerTrigger', () => {
    const mockTriggerData = {
      userId: 'user-123',
      appName: 'GitHub',
      eventName: 'Issue_Opened',
      dispatchType: 'chain',
      targetId: 'chain-abc',
      paramMapping: { issueTitle: 'body.issue.title' },
    };

    it('should register a new trigger with normalized names and return it', async () => {
      const mockSavedTrigger = {
        ...mockTriggerData,
        appName: 'github',
        eventName: 'issue_opened',
        isActive: true,
        _id: 'trigger-id-1',
      };

      const findOneAndUpdateMock = {
        lean: vi.fn().mockResolvedValue(mockSavedTrigger),
      };
      EventTrigger.findOneAndUpdate.mockReturnValue(findOneAndUpdateMock);

      const { userId, appName, eventName, dispatchType, targetId, paramMapping } = mockTriggerData;
      const result = await eventTriggerService.registerTrigger(userId, appName, eventName, dispatchType, targetId, paramMapping);

      expect(EventTrigger.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user-123', appName: 'github', eventName: 'issue_opened' },
        {
          dispatchType: 'chain',
          targetId: 'chain-abc',
          paramMapping: { issueTitle: 'body.issue.title' },
          isActive: true,
          appName: 'github',
          eventName: 'issue_opened',
        },
        { new: true, upsert: true }
      );
      expect(findOneAndUpdateMock.lean).toHaveBeenCalled();
      expect(result).toEqual({ success: true, trigger: mockSavedTrigger });
      expect(logger.info).toHaveBeenCalledWith('EventTrigger: registered trigger for user user-123 on event github:issue_opened');
    });

    it('should throw an error and log it if database operation fails', async () => {
      const dbError = new Error('Database connection failed');
      const findOneAndUpdateMock = {
        lean: vi.fn().mockRejectedValue(dbError),
      };
      EventTrigger.findOneAndUpdate.mockReturnValue(findOneAndUpdateMock);

      const { userId, appName, eventName, dispatchType, targetId, paramMapping } = mockTriggerData;

      await expect(
        eventTriggerService.registerTrigger(userId, appName, eventName, dispatchType, targetId, paramMapping)
      ).rejects.toThrow(dbError);

      expect(logger.error).toHaveBeenCalledWith('EventTrigger: registration failed:', dbError);
    });
  });

  describe('receiveWebhookEvent', () => {
    const mockPayload = {
      body: {
        issue: {
          title: 'Critical Bug Found',
          number: 42,
          user: { login: 'testuser' },
        },
        repository: {
          name: 'Alti.Assistant',
        },
      },
      headers: { 'x-github-event': 'issues' },
    };

    const mockChainTrigger = {
      _id: 'trigger-chain-1',
      userId: 'user-chain-owner',
      appName: 'github',
      eventName: 'issue_opened',
      dispatchType: 'chain',
      targetId: 'chain-abc',
      paramMapping: {
        title: 'body.issue.title',
        repo: 'body.repository.name',
      },
      isActive: true,
    };

    const mockWorkflowTrigger = {
      _id: 'trigger-workflow-1',
      userId: 'user-workflow-owner',
      appName: 'github',
      eventName: 'issue_opened',
      dispatchType: 'workflow',
      targetId: 'workflow-xyz',
      paramMapping: {
        issueNumber: 'body.issue.number',
        author: 'body.issue.user.login',
        nonExistent: 'body.issue.labels.name', // To test undefined values
      },
      isActive: true,
    };

    it('should find and dispatch multiple triggers (chain and workflow) for different users', async () => {
      const findMock = {
        lean: vi.fn().mockResolvedValue([mockChainTrigger, mockWorkflowTrigger]),
      };
      EventTrigger.find.mockReturnValue(findMock);

      const result = await eventTriggerService.receiveWebhookEvent('GitHub', 'Issue_Opened', mockPayload);

      // Allow async dispatch calls to proceed
      await new Promise(setImmediate);

      expect(EventTrigger.find).toHaveBeenCalledWith({
        appName: 'github',
        eventName: 'issue_opened',
        isActive: true,
      });
      expect(findMock.lean).toHaveBeenCalled();

      // Verify chain dispatch
      expect(LangchainExecutionService.executeChain).toHaveBeenCalledTimes(1);
      expect(LangchainExecutionService.executeChain).toHaveBeenCalledWith(
        'chain-abc',
        { title: 'Critical Bug Found', repo: 'Alti.Assistant' },
        'user-chain-owner' // Verifies user context boundary
      );

      // Verify workflow dispatch
      expect(workflowExecutionService.executeWorkflow).toHaveBeenCalledTimes(1);
      expect(workflowExecutionService.executeWorkflow).toHaveBeenCalledWith(
        'workflow-xyz',
        'user-workflow-owner', // Verifies user context boundary
        {
          webhookPayload: mockPayload,
          webhookInputs: { issueNumber: 42, author: 'testuser' }, // nonExistent field is correctly ignored
        }
      );

      expect(result).toEqual({
        success: true,
        message: 'Webhook received. Initiated 2 automation dispatch(es) asynchronously.',
        dispatchedCount: 2,
      });
      expect(logger.info).toHaveBeenCalledWith('EventTrigger: processing incoming webhook for "GitHub:Issue_Opened"');
      expect(logger.info).toHaveBeenCalledWith('EventTrigger: dispatching execution of type "chain" for user user-chain-owner');
      expect(logger.info).toHaveBeenCalledWith('EventTrigger: dispatching execution of type "workflow" for user user-workflow-owner');
    });

    it('should return successfully with 0 count if no triggers are found', async () => {
      const findMock = {
        lean: vi.fn().mockResolvedValue([]),
      };
      EventTrigger.find.mockReturnValue(findMock);

      const result = await eventTriggerService.receiveWebhookEvent('slack', 'message', {});

      expect(result).toEqual({ success: true, executedCount: 0 });
      expect(LangchainExecutionService.executeChain).not.toHaveBeenCalled();
      expect(workflowExecutionService.executeWorkflow).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('EventTrigger: no active triggers matched "slack:message"');
    });

    it('should throw and log an error if finding triggers fails', async () => {
      const dbError = new Error('DB find failed');
      const findMock = {
        lean: vi.fn().mockRejectedValue(dbError),
      };
      EventTrigger.find.mockReturnValue(findMock);

      await expect(eventTriggerService.receiveWebhookEvent('github', 'push', {})).rejects.toThrow(dbError);

      expect(logger.error).toHaveBeenCalledWith('EventTrigger: receiveWebhookEvent failed:', dbError);
    });

    it('should not throw but log an error if an individual dispatch fails', async () => {
      const executionError = new Error('Chain execution failed');
      LangchainExecutionService.executeChain.mockRejectedValue(executionError);

      const findMock = {
        lean: vi.fn().mockResolvedValue([mockChainTrigger]),
      };
      EventTrigger.find.mockReturnValue(findMock);

      // The main function should still succeed as dispatch is async
      const result = await eventTriggerService.receiveWebhookEvent('GitHub', 'Issue_Opened', mockPayload);

      expect(result.success).toBe(true);
      expect(result.dispatchedCount).toBe(1);

      // Allow the async rejection to be processed
      await new Promise(setImmediate);

      expect(LangchainExecutionService.executeChain).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'EventTrigger: failed to execute dispatched target chain-abc:',
        executionError
      );
    });
  });
});