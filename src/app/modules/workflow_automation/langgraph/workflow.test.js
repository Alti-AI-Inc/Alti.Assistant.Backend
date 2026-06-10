import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@langchain/langgraph', async (importOriginal) => {
  const original = await importOriginal();
  const mockInvoke = vi.fn();
  const mockGetState = vi.fn();
  const mockCompile = vi.fn(() => ({
    invoke: mockInvoke,
    getState: mockGetState,
  }));

  const StateGraph = vi.fn().mockImplementation(() => ({
    addNode: vi.fn(),
    addEdge: vi.fn(),
    addConditionalEdges: vi.fn(),
    compile: mockCompile,
  }));

  return {
    ...original,
    StateGraph,
    // Expose mocks for individual tests to control them
    __mockInvoke: mockInvoke,
    __mockGetState: mockGetState,
  };
});

vi.mock('./nodes.js', () => ({
  analyzeIntentNode: vi.fn(),
  planWorkflowNode: vi.fn(),
  scheduleDetectionNode: vi.fn(),
  extractParametersNode: vi.fn(),
  validateWorkflowNode: vi.fn(),
  generateResponseNode: vi.fn(),
  executeWorkflowNode: vi.fn(),
  autoHealWorkflowNode: vi.fn(),
}));

vi.mock('./mongodbSaver.js', () => ({
  MongoDBSaver: vi.fn(),
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../services/workspaceService.js', () => ({
  checkUsageAndPermissions: vi.fn(),
}));

// Import the mocked functions and the module to test
import { __mockInvoke, __mockGetState } from '@langchain/langgraph';
import { checkUsageAndPermissions } from '../../../services/workspaceService.js';
import { logger } from '../../../../shared/logger.js';
import {
  processWorkflowRequest,
  continueWorkflowConversation,
  getWorkflowConversationState,
} from './workflow.js';

describe('Workflow Automation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('processWorkflowRequest', () => {
    const userPrompt = 'Create a report for Q3';
    const userId = 'user-123';
    const workspaceId = 'workspace-abc';

    it('should successfully process a new workflow request', async () => {
      checkUsageAndPermissions.mockResolvedValue({ allowed: true });
      __mockInvoke.mockResolvedValue({ finalResponse: 'Workflow complete' });

      const result = await processWorkflowRequest(userPrompt, userId, workspaceId);

      expect(checkUsageAndPermissions).toHaveBeenCalledWith(workspaceId, 'workflowExecution');
      expect(__mockInvoke).toHaveBeenCalled();
      const invokeCall = __mockInvoke.mock.calls[0];
      expect(invokeCall[0]).toEqual({
        userPrompt,
        userId,
        workspaceId,
        conversationId: expect.any(String),
        currentStage: 'init',
      });
      expect(invokeCall[1].configurable.thread_id).toMatch(/^workflow_workspace-abc_user-123_\d+$/);
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ finalResponse: 'Workflow complete' });
      expect(result.conversationId).toBe(invokeCall[1].configurable.thread_id);
      expect(logger.info).toHaveBeenCalledWith(`Processing workflow request for user ${userId} in workspace ${workspaceId}`);
    });

    it('should use an existing conversationId if provided', async () => {
      const conversationId = 'convo-xyz-789';
      checkUsageAndPermissions.mockResolvedValue({ allowed: true });
      __mockInvoke.mockResolvedValue({});

      await processWorkflowRequest(userPrompt, userId, workspaceId, conversationId);

      expect(__mockInvoke).toHaveBeenCalledWith(
        expect.any(Object),
        { configurable: { thread_id: conversationId } }
      );
    });

    it('should deny request if usage limits are exceeded', async () => {
      const reason = 'Monthly execution limit reached.';
      checkUsageAndPermissions.mockResolvedValue({ allowed: false, reason });

      const result = await processWorkflowRequest(userPrompt, userId, workspaceId);

      expect(checkUsageAndPermissions).toHaveBeenCalledWith(workspaceId, 'workflowExecution');
      expect(__mockInvoke).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(`Workflow execution denied for workspace ${workspaceId}: ${reason}`);
      expect(result.success).toBe(false);
      expect(result.error).toBe(reason);
      expect(result.result.responseType).toBe('limit_exceeded');
    });

    it('should handle errors during workflow invocation', async () => {
      const error = new Error('Graph invocation failed');
      checkUsageAndPermissions.mockResolvedValue({ allowed: true });
      __mockInvoke.mockRejectedValue(error);

      const result = await processWorkflowRequest(userPrompt, userId, workspaceId);

      expect(logger.error).toHaveBeenCalledWith('Error processing workflow request:', error);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Graph invocation failed');
      expect(result.result.responseType).toBe('error');
    });
  });

  describe('continueWorkflowConversation', () => {
    const userInput = 'Add a chart to it';
    const conversationId = 'convo-xyz-789';
    const userId = 'user-123';
    const workspaceId = 'workspace-abc';
    const mockCurrentState = {
      values: {
        userPrompt: 'Initial prompt',
        userId: 'user-123',
        workspaceId: 'workspace-abc',
        conversationId: 'convo-xyz-789',
        currentStage: 'waiting_for_input',
      },
    };

    it('should successfully continue a conversation', async () => {
      checkUsageAndPermissions.mockResolvedValue({ allowed: true });
      __mockGetState.mockResolvedValue(mockCurrentState);
      __mockInvoke.mockResolvedValue({ finalResponse: 'Chart added' });

      const result = await continueWorkflowConversation(userInput, conversationId, userId, workspaceId);

      expect(checkUsageAndPermissions).toHaveBeenCalledWith(workspaceId, 'workflowExecution');
      expect(__mockGetState).toHaveBeenCalledWith({ configurable: { thread_id: conversationId } });
      expect(__mockInvoke).toHaveBeenCalled();
      const invokeCall = __mockInvoke.mock.calls[0];
      expect(invokeCall[0]).toEqual({
        ...mockCurrentState.values,
        userPrompt: userInput,
        currentStage: 'continued',
      });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ finalResponse: 'Chart added' });
      expect(result.conversationId).toBe(conversationId);
    });

    it('should deny continuation if usage limits are exceeded', async () => {
      const reason = 'Plan does not allow conversation continuation.';
      checkUsageAndPermissions.mockResolvedValue({ allowed: false, reason });

      const result = await continueWorkflowConversation(userInput, conversationId, userId, workspaceId);

      expect(checkUsageAndPermissions).toHaveBeenCalledWith(workspaceId, 'workflowExecution');
      expect(__mockGetState).not.toHaveBeenCalled();
      expect(__mockInvoke).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(`Workflow continuation denied for workspace ${workspaceId}: ${reason}`);
      expect(result.success).toBe(false);
      expect(result.error).toBe(reason);
      expect(result.result.responseType).toBe('limit_exceeded');
    });

    it('should fail if the conversation state cannot be found', async () => {
      checkUsageAndPermissions.mockResolvedValue({ allowed: true });
      __mockGetState.mockResolvedValue({ values: null }); // Simulate empty state

      const result = await continueWorkflowConversation(userInput, conversationId, userId, workspaceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Conversation not found or state is empty.');
      expect(logger.error).toHaveBeenCalledWith('Error continuing workflow conversation:', expect.any(Error));
    });

    it('should fail if workspaceId does not match (context boundary check)', async () => {
      const wrongWorkspaceId = 'workspace-wrong';
      checkUsageAndPermissions.mockResolvedValue({ allowed: true });
      __mockGetState.mockResolvedValue(mockCurrentState); // State has 'workspace-abc'

      const result = await continueWorkflowConversation(userInput, conversationId, userId, wrongWorkspaceId);

      expect(logger.error).toHaveBeenCalledWith(`Security Alert: Workspace ID mismatch for conversation ${conversationId}. Request: ${wrongWorkspaceId}, Stored: ${workspaceId}`);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workspace mismatch. Access denied.');
      expect(__mockInvoke).not.toHaveBeenCalled();
    });

    it('should handle errors during continuation invocation', async () => {
      const error = new Error('Graph continuation failed');
      checkUsageAndPermissions.mockResolvedValue({ allowed: true });
      __mockGetState.mockResolvedValue(mockCurrentState);
      __mockInvoke.mockRejectedValue(error);

      const result = await continueWorkflowConversation(userInput, conversationId, userId, workspaceId);

      expect(logger.error).toHaveBeenCalledWith('Error continuing workflow conversation:', error);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Graph continuation failed');
      expect(result.result.responseType).toBe('error');
    });
  });

  describe('getWorkflowConversationState', () => {
    const conversationId = 'convo-xyz-789';
    const workspaceId = 'workspace-abc';
    const mockState = {
      values: {
        workspaceId: 'workspace-abc',
        currentStage: 'done',
      },
    };

    it('should successfully retrieve the state for a valid conversation', async () => {
      __mockGetState.mockResolvedValue(mockState);

      const result = await getWorkflowConversationState(conversationId, workspaceId);

      expect(__mockGetState).toHaveBeenCalledWith({ configurable: { thread_id: conversationId } });
      expect(result.success).toBe(true);
      expect(result.state).toEqual(mockState.values);
    });

    it('should return null state if conversation is not found', async () => {
      __mockGetState.mockResolvedValue(null);

      const result = await getWorkflowConversationState(conversationId, workspaceId);

      expect(result.success).toBe(true);
      expect(result.state).toBe(null);
    });

    it('should deny access if the conversation belongs to a different workspace', async () => {
      const wrongWorkspaceId = 'workspace-wrong';
      __mockGetState.mockResolvedValue(mockState); // State has 'workspace-abc'

      const result = await getWorkflowConversationState(conversationId, wrongWorkspaceId);

      expect(logger.warn).toHaveBeenCalledWith(`Unauthorized attempt to access conversation ${conversationId} from workspace ${wrongWorkspaceId}.`);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Access denied. Conversation does not belong to this workspace.');
      expect(result.state).toBe(null);
    });

    it('should handle errors during state retrieval', async () => {
      const error = new Error('Database connection failed');
      __mockGetState.mockRejectedValue(error);

      const result = await getWorkflowConversationState(conversationId, workspaceId);

      expect(logger.error).toHaveBeenCalledWith('Error getting workflow conversation state:', error);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(result.state).toBe(null);
    });
  });
});