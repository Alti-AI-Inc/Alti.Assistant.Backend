import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  processUserInputService,
  getUserConnectedAccountsService,
  checkUserConnectionsService,
  getComposioConversationHistoryService,
} from './aiClassification.service.js';

// Mock external dependencies
vi.mock('./ai_classification/workflow.js', () => ({
  runAIClassificationAgent: vi.fn(),
}));
vi.mock('./composio.conversation.service.js', () => ({
  composioConversationService: {
    generateGuestUserId: vi.fn(),
    handleComposioConversation: vi.fn(),
    addComposioQueryMessage: vi.fn(),
    addComposioResultMessage: vi.fn(),
    updateComposioConversationTitle: vi.fn(),
    addComposioErrorMessage: vi.fn(),
    getComposioHistory: vi.fn(),
    getComposioStats: vi.fn(),
  },
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('./composio.model.js', () => ({
  default: {
    find: vi.fn(),
  },
}));

// Import the mocked modules
import { runAIClassificationAgent } from './ai_classification/workflow.js';
import { composioConversationService } from './composio.conversation.service.js';
import { logger } from '../../../shared/logger.js';
import ComposioAuth from './composio.model.js';

describe('aiClassificationService', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Default mock implementations for common dependencies
    composioConversationService.generateGuestUserId.mockReturnValue('guest-123');
    composioConversationService.handleComposioConversation.mockResolvedValue({
      conversationId: 'conv-123',
      messages: [],
      messageCount: 0,
    });
    composioConversationService.addComposioQueryMessage.mockResolvedValue(true);
    composioConversationService.addComposioResultMessage.mockResolvedValue(true);
    composioConversationService.updateComposioConversationTitle.mockResolvedValue(true);
    composioConversationService.addComposioErrorMessage.mockResolvedValue(true);

    // Mock ComposioAuth.find chainable methods
    ComposioAuth.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]), // Default to no accounts found
    });
  });

  describe('processUserInputService', () => {
    const mockUserInput = 'What is the weather like?';
    const mockOptions = { userId: 'user-123', conversationId: 'conv-abc', history: [] };

    it('should return an error if effectiveUserId is missing', async () => {
      const result = await processUserInputService(mockUserInput, { isGuest: false });

      expect(result).toEqual({
        success: false,
        message: 'User ID is required for tool execution',
        error: 'Missing user identifier',
      });
      expect(logger.info).not.toHaveBeenCalled();
      expect(composioConversationService.generateGuestUserId).not.toHaveBeenCalled();
    });

    it('should generate guest userId if isGuest is true and userId is not provided', async () => {
      const result = await processUserInputService(mockUserInput, { isGuest: true });

      expect(composioConversationService.generateGuestUserId).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith(
        `Processing user input: "${mockUserInput}" for user: guest-123 (guest: true)`
      );
      // Expect other service calls to proceed with the generated guest ID
      expect(composioConversationService.handleComposioConversation).toHaveBeenCalledWith(
        'guest-123',
        null, // No conversationId provided in options
        mockUserInput,
        true
      );
    });

    it('should use provided userId even if isGuest is true', async () => {
      await processUserInputService(mockUserInput, { userId: 'existing-guest-id', isGuest: true });

      expect(composioConversationService.generateGuestUserId).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        `Processing user input: "${mockUserInput}" for user: existing-guest-id (guest: true)`
      );
      expect(composioConversationService.handleComposioConversation).toHaveBeenCalledWith(
        'existing-guest-id',
        null,
        mockUserInput,
        true
      );
    });

    it('should handle conversation creation/retrieval and add query message', async () => {
      runAIClassificationAgent.mockResolvedValue({ success: true, data: { responseMessage: { message: 'OK' } } });

      await processUserInputService(mockUserInput, mockOptions);

      expect(composioConversationService.handleComposioConversation).toHaveBeenCalledWith(
        mockOptions.userId,
        mockOptions.conversationId,
        mockUserInput,
        false
      );
      expect(composioConversationService.addComposioQueryMessage).toHaveBeenCalledWith(
        'conv-123', // Mocked conversationId
        mockOptions.userId,
        mockUserInput,
        false
      );
    });

    it('should throw an error if handleComposioConversation fails to return a valid conversationId', async () => {
      composioConversationService.handleComposioConversation.mockResolvedValueOnce({ messages: [] }); // Missing conversationId

      const result = await processUserInputService(mockUserInput, mockOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to establish or retrieve conversation.');
      expect(logger.error).toHaveBeenCalledWith(
        `handleComposioConversation failed to return a valid conversation object or conversationId for user: ${mockOptions.userId}, input conversationId: ${mockOptions.conversationId}`
      );
      expect(composioConversationService.addComposioErrorMessage).toHaveBeenCalledWith(
        mockOptions.conversationId, // Fallback to original conversationId for error logging
        mockOptions.userId,
        expect.stringContaining('Failed to establish or retrieve conversation.'),
        expect.any(Error),
        false
      );
    });

    it('should run AI classification agent and process successful result', async () => {
      const mockAgentResult = {
        success: true,
        data: {
          responseMessage: {
            message: 'Here is the weather for your location.',
            metadata: {
              identifiedApp: 'WeatherApp',
              identifiedAction: 'getWeather',
              confidence: 0.9,
              workflowType: 'tool_execution',
              totalSteps: 1,
              executionResult: { status: 'success' },
              toolResults: [{ tool: 'weather', output: 'sunny' }],
            },
          },
        },
      };
      runAIClassificationAgent.mockResolvedValue(mockAgentResult);
      composioConversationService.handleComposioConversation.mockResolvedValue({
        conversationId: 'conv-123',
        messages: [{ role: 'user', content: 'hi' }],
        messageCount: 1,
      });

      const result = await processUserInputService(mockUserInput, mockOptions);

      expect(runAIClassificationAgent).toHaveBeenCalledWith(mockUserInput, {
        userId: mockOptions.userId,
        conversationId: 'conv-123',
        history: [{ role: 'user', content: 'hi' }], // History from conversation
      });
      expect(composioConversationService.addComposioResultMessage).toHaveBeenCalledWith(
        'conv-123',
        mockOptions.userId,
        mockAgentResult.data.responseMessage.message,
        expect.objectContaining({
          identifiedApp: 'WeatherApp',
          workflowType: 'tool_execution',
        }),
        false
      );
      expect(composioConversationService.updateComposioConversationTitle).toHaveBeenCalledWith(
        'conv-123',
        mockOptions.userId,
        mockAgentResult.data.responseMessage.metadata
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          conversationId: 'conv-123',
          messageCount: 3, // 1 existing + user query + assistant response
          userType: 'authenticated',
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Successfully processed input. Workflow: ${mockAgentResult.data.responseMessage.metadata.workflowType}`
      );
    });

    it('should use provided history if conversation has no messages', async () => {
      runAIClassificationAgent.mockResolvedValue({ success: true, data: { responseMessage: { message: 'OK' } } });
      composioConversationService.handleComposioConversation.mockResolvedValue({
        conversationId: 'conv-123',
        messages: [], // No messages in conversation
        messageCount: 0,
      });
      const optionsWithHistory = {
        ...mockOptions,
        history: [{ role: 'user', content: 'initial query' }],
      };

      await processUserInputService(mockUserInput, optionsWithHistory);

      expect(runAIClassificationAgent).toHaveBeenCalledWith(mockUserInput, {
        userId: mockOptions.userId,
        conversationId: 'conv-123',
        history: optionsWithHistory.history, // Should use provided history
      });
    });

    it('should run AI classification agent and process failed result', async () => {
      const mockAgentResult = {
        success: false,
        error: 'Tool execution failed',
        data: {
          responseMessage: {
            text: 'I could not find the weather app.',
            type: 'error',
          },
        },
      };
      runAIClassificationAgent.mockResolvedValue(mockAgentResult);
      composioConversationService.handleComposioConversation.mockResolvedValue({
        conversationId: 'conv-123',
        messages: [{ role: 'user', content: 'hi' }],
        messageCount: 1,
      });

      const result = await processUserInputService(mockUserInput, mockOptions);

      expect(composioConversationService.addComposioErrorMessage).toHaveBeenCalledWith(
        'conv-123',
        mockOptions.userId,
        mockAgentResult.data.responseMessage.text,
        expect.any(Error),
        false
      );
      expect(composioConversationService.updateComposioConversationTitle).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool execution failed');
      expect(result.data).toEqual(
        expect.objectContaining({
          conversationId: 'conv-123',
          messageCount: 3, // 1 existing + user query + assistant error response
          userType: 'authenticated',
        })
      );
      expect(logger.error).toHaveBeenCalledWith(`Failed to process input: ${mockAgentResult.error}`);
    });

    it('should handle unexpected errors during processing', async () => {
      const errorMessage = 'Database connection lost';
      composioConversationService.handleComposioConversation.mockRejectedValue(new Error(errorMessage));

      const result = await processUserInputService(mockUserInput, mockOptions);

      expect(logger.error).toHaveBeenCalledWith('Error in processUserInputService:', expect.any(Error));
      expect(composioConversationService.addComposioErrorMessage).toHaveBeenCalledWith(
        mockOptions.conversationId, // Original conversationId passed to service
        mockOptions.userId,
        expect.stringContaining(errorMessage),
        expect.any(Error),
        false
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Tool execution failed');
      expect(result.error).toBe(errorMessage);
      expect(result.data).toEqual(
        expect.objectContaining({
          conversationId: mockOptions.conversationId,
          messageCount: 1, // Only the error message itself
          userType: 'authenticated',
        })
      );
    });

    it('should attempt to create a new conversation for error logging if no conversationId is available', async () => {
      const errorMessage = 'Agent internal error';
      runAIClassificationAgent.mockRejectedValue(new Error(errorMessage));
      composioConversationService.handleComposioConversation.mockResolvedValueOnce({
        conversationId: 'new-conv-for-error',
        messages: [],
        messageCount: 0,
      }); // For error logging

      const result = await processUserInputService(mockUserInput, { userId: 'user-123' }); // No conversationId in options

      expect(logger.error).toHaveBeenCalledWith('Error in processUserInputService:', expect.any(Error));
      expect(composioConversationService.handleComposioConversation).toHaveBeenCalledTimes(2); // Initial call + error logging call
      expect(composioConversationService.handleComposioConversation).toHaveBeenCalledWith(
        'user-123',
        null, // No conversationId initially
        mockUserInput,
        false
      );
      expect(composioConversationService.handleComposioConversation).toHaveBeenCalledWith(
        'user-123',
        null, // For error logging, creating a new one
        mockUserInput,
        false
      );
      expect(composioConversationService.addComposioErrorMessage).toHaveBeenCalledWith(
        'new-conv-for-error',
        'user-123',
        expect.stringContaining(errorMessage),
        expect.any(Error),
        false
      );
      expect(result.success).toBe(false);
      expect(result.data.conversationId).toBe('new-conv-for-error');
    });

    it('should return guest userId in data for guest users on success', async () => {
      runAIClassificationAgent.mockResolvedValue({ success: true, data: { responseMessage: { message: 'OK' } } });
      composioConversationService.generateGuestUserId.mockReturnValue('guest-abc');

      const result = await processUserInputService(mockUserInput, { isGuest: true });

      expect(result.success).toBe(true);
      expect(result.data.userType).toBe('guest');
      expect(result.data.userId).toBe('guest-abc');
    });

    it('should return guest userId in data for guest users on failure', async () => {
      runAIClassificationAgent.mockResolvedValue({ success: false, error: 'Failed' });
      composioConversationService.generateGuestUserId.mockReturnValue('guest-abc');

      const result = await processUserInputService(mockUserInput, { isGuest: true });

      expect(result.success).toBe(false);
      expect(result.data.userType).toBe('guest');
      expect(result.data.userId).toBe('guest-abc');
    });
  });

  describe('getUserConnectedAccountsService', () => {
    const mockUserId = 'user-123';

    it('should return connected accounts for a given userId and default status ACTIVE', async () => {
      const mockAccounts = [{ _id: 'acc1', userId: mockUserId, status: 'ACTIVE', toolkit: { slug: 'slack' } }];
      ComposioAuth.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockAccounts),
      });

      const result = await getUserConnectedAccountsService(mockUserId);

      expect(ComposioAuth.find).toHaveBeenCalledWith({ userId: mockUserId, status: 'ACTIVE' });
      expect(ComposioAuth.find().sort).toHaveBeenCalledWith({ updatedAt: -1 });
      expect(ComposioAuth.find().sort().lean).toHaveBeenCalledOnce();
      expect(result).toEqual({ success: true, data: mockAccounts });
      expect(logger.info).toHaveBeenCalledWith(
        `User connected accounts for ${mockUserId}: ${mockAccounts.length} found (status: ACTIVE)`
      );
    });

    it('should return connected accounts for a given userId and specified status', async () => {
      const mockAccounts = [{ _id: 'acc2', userId: mockUserId, status: 'INACTIVE', toolkit: { slug: 'jira' } }];
      ComposioAuth.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockAccounts),
      });

      const result = await getUserConnectedAccountsService(mockUserId, 'INACTIVE');

      expect(ComposioAuth.find).toHaveBeenCalledWith({ userId: mockUserId, status: 'INACTIVE' });
      expect(result).toEqual({ success: true, data: mockAccounts });
      expect(logger.info).toHaveBeenCalledWith(
        `User connected accounts for ${mockUserId}: ${mockAccounts.length} found (status: INACTIVE)`
      );
    });

    it('should return empty array if no accounts found', async () => {
      ComposioAuth.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      });

      const result = await getUserConnectedAccountsService(mockUserId);

      expect(result).toEqual({ success: true, data: [] });
      expect(logger.info).toHaveBeenCalledWith(
        `User connected accounts for ${mockUserId}: 0 found (status: ACTIVE)`
      );
    });

    it('should handle errors during account retrieval', async () => {
      const errorMessage = 'DB connection error';
      ComposioAuth.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockRejectedValue(new Error(errorMessage)),
      });

      const result = await getUserConnectedAccountsService(mockUserId);

      expect(result).toEqual({ success: false, error: errorMessage });
      expect(logger.error).toHaveBeenCalledWith('Error in getUserConnectedAccountsService:', expect.any(Error));
    });
  });

  describe('checkUserConnectionsService', () => {
    const mockUserId = 'user-123';
    const mockAppName = 'Slack';

    it('should return hasConnection true if user has active connections for the app', async () => {
      const mockAccounts = [
        { _id: 'acc1', userId: mockUserId, status: 'ACTIVE', 'toolkit.slug': 'slack' },
      ];
      ComposioAuth.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockAccounts),
      });

      const result = await checkUserConnectionsService(mockUserId, mockAppName);

      expect(ComposioAuth.find).toHaveBeenCalledWith({
        userId: mockUserId,
        status: 'ACTIVE',
        $or: [
          { 'toolkit.slug': 'slack' },
          { authConfigId: 'slack' },
          { authConfigId: 'ac_slack' },
        ],
      });
      expect(ComposioAuth.find().lean).toHaveBeenCalledOnce();
      expect(result).toEqual({
        success: true,
        data: {
          hasConnection: true,
          appName: mockAppName,
          connectedAccounts: mockAccounts,
        },
      });
    });

    it('should return hasConnection false if user has no active connections for the app', async () => {
      ComposioAuth.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      });

      const result = await checkUserConnectionsService(mockUserId, mockAppName);

      expect(result).toEqual({
        success: true,
        data: {
          hasConnection: false,
          appName: mockAppName,
          connectedAccounts: [],
        },
      });
    });

    it('should normalize appName to lowercase for the query', async () => {
      ComposioAuth.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      });

      await checkUserConnectionsService(mockUserId, 'JIRA');

      expect(ComposioAuth.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { 'toolkit.slug': 'jira' },
            { authConfigId: 'jira' },
            { authConfigId: 'ac_jira' },
          ],
        })
      );
    });

    it('should handle errors during connection check', async () => {
      const errorMessage = 'Network error';
      ComposioAuth.find.mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error(errorMessage)),
      });

      const result = await checkUserConnectionsService(mockUserId, mockAppName);

      expect(result).toEqual({ success: false, error: errorMessage });
      expect(logger.error).toHaveBeenCalledWith('Error in checkUserConnectionsService:', expect.any(Error));
    });
  });

  describe('getComposioConversationHistoryService', () => {
    const mockUserId = 'user-123';
    const mockReq = {}; // Mock request object if needed by service

    it('should get specific conversation history if conversationId is provided', async () => {
      const mockHistory = [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }];
      composioConversationService.getComposioHistory.mockResolvedValue(mockHistory);

      const result = await getComposioConversationHistoryService(mockUserId, { conversationId: 'conv-456', limit: 10 }, mockReq);

      expect(composioConversationService.getComposioHistory).toHaveBeenCalledWith(
        'conv-456',
        mockUserId,
        10,
        mockReq
      );
      expect(result).toEqual({
        success: true,
        data: {
          conversationId: 'conv-456',
          messages: mockHistory,
          messageCount: mockHistory.length,
        },
      });
    });

    it('should get conversation stats if no conversationId is provided', async () => {
      const mockStats = [{ conversationId: 'conv-1', title: 'Chat 1' }, { conversationId: 'conv-2', title: 'Chat 2' }];
      composioConversationService.getComposioStats.mockResolvedValue(mockStats);

      const result = await getComposioConversationHistoryService(mockUserId, {}, mockReq);

      expect(composioConversationService.getComposioStats).toHaveBeenCalledWith(mockUserId, mockReq);
      expect(result).toEqual({ success: true, data: mockStats });
    });

    it('should use default limit if not provided for specific conversation history', async () => {
      composioConversationService.getComposioHistory.mockResolvedValue([]);

      await getComposioConversationHistoryService(mockUserId, { conversationId: 'conv-456' }, mockReq);

      expect(composioConversationService.getComposioHistory).toHaveBeenCalledWith(
        'conv-456',
        mockUserId,
        20, // Default limit
        mockReq
      );
    });

    it('should handle errors during history retrieval', async () => {
      const errorMessage = 'DB error on history';
      composioConversationService.getComposioHistory.mockRejectedValue(new Error(errorMessage));

      const result = await getComposioConversationHistoryService(mockUserId, { conversationId: 'conv-456' }, mockReq);

      expect(result).toEqual({ success: false, error: errorMessage });
      expect(logger.error).toHaveBeenCalledWith('Error in getComposioConversationHistoryService:', expect.any(Error));
    });

    it('should handle errors during stats retrieval', async () => {
      const errorMessage = 'DB error on stats';
      composioConversationService.getComposioStats.mockRejectedValue(new Error(errorMessage));

      const result = await getComposioConversationHistoryService(mockUserId, {}, mockReq);

      expect(result).toEqual({ success: false, error: errorMessage });
      expect(logger.error).toHaveBeenCalledWith('Error in getComposioConversationHistoryService:', expect.any(Error));
    });
  });
});