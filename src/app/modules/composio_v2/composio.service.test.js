import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
const mockComposioCore = {
  Composio: vi.fn(() => ({
    connectedAccounts: {
      initiate: vi.fn(),
      waitForConnection: vi.fn(),
    },
  })),
};
vi.mock('@composio/core', () => mockComposioCore);

const mockConfig = {
  composio: {
    orgApiKey: 'test-api-key',
  },
};
vi.mock('../../../../config/index.js', () => ({ default: mockConfig }));

const mockComposionAuth = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
  save: vi.fn(),
};
vi.mock('./composio.model.js', () => ({ default: vi.fn(() => mockComposionAuth) }));

const mockAuthConfig = {
  findOne: vi.fn(),
  save: vi.fn(),
};
vi.mock('./authConfig.model.js', () => ({ default: vi.fn(() => mockAuthConfig) }));

const mockConversation = {
  findByConversationId: vi.fn(),
  save: vi.fn(),
  messages: [],
};
vi.mock('../conversations/conversation.model.js', () => ({ default: vi.fn(() => mockConversation) }));

const mockAiClassificationService = {
  processUserInputService: vi.fn(),
};
vi.mock('./aiClassification.service.js', () => ({ aiClassificationService: mockAiClassificationService }));

const mockTenantQuery = {
  withTenantContext: vi.fn((req, data) => (req && req.tenantId ? { ...data, tenantId: req.tenantId } : data)),
  withTenantFilter: vi.fn((req, query) => (req && req.tenantId ? { ...query, tenantId: req.tenantId } : query)),
};
vi.mock('../../helpers/tenantQuery.js', () => mockTenantQuery);

// Import the service after mocks are set up
const { composioService } = await import('./composio.service.js');

describe('composioService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock instances for models
    mockComposionAuth.findOne.mockResolvedValue(null);
    mockComposionAuth.updateOne.mockResolvedValue({});
    mockComposionAuth.save.mockResolvedValue(mockComposionAuth);
    mockComposionAuth.messages = []; // Reset messages for conversation mock

    mockAuthConfig.findOne.mockResolvedValue(null);
    mockAuthConfig.save.mockResolvedValue(mockAuthConfig);

    mockConversation.findByConversationId.mockResolvedValue(null);
    mockConversation.save.mockResolvedValue(mockConversation);
    mockConversation.messages = [];

    // Reset Composio instance mocks
    mockComposioCore.Composio.mockClear();
    mockComposioCore.Composio.mockImplementation(() => ({
      connectedAccounts: {
        initiate: vi.fn(),
        waitForConnection: vi.fn(),
      },
    }));
  });

  describe('initiateComposioAuth', () => {
    const mockBody = { app_name: 'testApp', user_id: 'user123' };
    const mockConnectionUrl = {
      id: 'conn123',
      integrationId: 'int123',
      redirectUrl: 'http://redirect.url',
    };

    it('should create AuthConfig if not found, initiate connection, and save ComposionAuth', async () => {
      mockAuthConfig.findOne.mockResolvedValueOnce(null); // No existing AuthConfig
      mockComposioCore.Composio().connectedAccounts.initiate.mockResolvedValueOnce(mockConnectionUrl);

      const result = await composioService.initiateComposioAuth(mockBody);

      expect(mockAuthConfig.findOne).toHaveBeenCalledWith({ app: 'testApp' });
      expect(mockAuthConfig.save).toHaveBeenCalled();
      expect(mockComposioCore.Composio().connectedAccounts.initiate).toHaveBeenCalledWith('user123', 'ac_testApp');
      expect(mockComposionAuth.save).toHaveBeenCalled();
      expect(result).toEqual({ authConfig: mockConnectionUrl });
      expect(mockComposionAuth.userId).toBe('user123');
      expect(mockComposionAuth.authConfigId).toBe('ac_testApp');
      expect(mockComposionAuth.connectedAccountId).toBe('conn123');
      expect(mockComposionAuth.integrationId).toBe('int123');
      expect(mockComposionAuth.redirectUrl).toBe('http://redirect.url');
      expect(mockComposionAuth.status).toBe('PENDING');
      expect(mockComposionAuth.toolkit).toEqual({ slug: 'testApp' });
    });

    it('should use existing AuthConfig, initiate connection, and save ComposionAuth', async () => {
      const existingAuthConfig = { app: 'testApp', authConfigId: 'existing_ac', save: vi.fn() };
      mockAuthConfig.findOne.mockResolvedValueOnce(existingAuthConfig);
      mockComposioCore.Composio().connectedAccounts.initiate.mockResolvedValueOnce(mockConnectionUrl);

      const result = await composioService.initiateComposioAuth(mockBody);

      expect(mockAuthConfig.findOne).toHaveBeenCalledWith({ app: 'testApp' });
      expect(existingAuthConfig.save).not.toHaveBeenCalled(); // No new save for existing config
      expect(mockComposioCore.Composio().connectedAccounts.initiate).toHaveBeenCalledWith('user123', 'existing_ac');
      expect(mockComposionAuth.save).toHaveBeenCalled();
      expect(result).toEqual({ authConfig: mockConnectionUrl });
      expect(mockComposionAuth.authConfigId).toBe('existing_ac');
    });

    it('should return existing ComposionAuth if found', async () => {
      const existingComposioAuth = {
        userId: 'user123',
        status: 'ACTIVE',
        authConfigId: 'ac_testApp',
        toolkit: { slug: 'testapp' },
      };
      mockAuthConfig.findOne.mockResolvedValueOnce({ app: 'testApp', authConfigId: 'ac_testApp', save: vi.fn() });
      mockComposionAuth.findOne.mockResolvedValueOnce(existingComposioAuth);

      const result = await composioService.initiateComposioAuth(mockBody);

      expect(mockComposionAuth.findOne).toHaveBeenCalled();
      expect(mockComposioCore.Composio().connectedAccounts.initiate).not.toHaveBeenCalled();
      expect(mockComposionAuth.save).not.toHaveBeenCalled();
      expect(result).toEqual({
        authConfig: existingComposioAuth,
        message: 'User is already authenticated',
      });
    });

    it('should handle initiation failure and fallback to app_name as authConfigId', async () => {
      const existingAuthConfig = { app: 'testApp', authConfigId: 'custom_ac', save: vi.fn() };
      mockAuthConfig.findOne.mockResolvedValueOnce(existingAuthConfig);
      mockComposioCore.Composio().connectedAccounts.initiate
        .mockRejectedValueOnce(new Error('Custom config failed')) // First call fails
        .mockResolvedValueOnce(mockConnectionUrl); // Second call succeeds with app_name

      const result = await composioService.initiateComposioAuth(mockBody);

      expect(mockComposioCore.Composio().connectedAccounts.initiate).toHaveBeenCalledTimes(2);
      expect(mockComposioCore.Composio().connectedAccounts.initiate).toHaveBeenCalledWith('user123', 'custom_ac');
      expect(mockComposioCore.Composio().connectedAccounts.initiate).toHaveBeenCalledWith('user123', 'testApp');
      expect(existingAuthConfig.save).toHaveBeenCalled(); // AuthConfig should be updated
      expect(existingAuthConfig.authConfigId).toBe('testApp');
      expect(mockComposionAuth.save).toHaveBeenCalled();
      expect(result).toEqual({ authConfig: mockConnectionUrl });
      expect(mockComposionAuth.authConfigId).toBe('testApp');
    });

    it('should throw an error if any operation fails', async () => {
      mockAuthConfig.findOne.mockRejectedValueOnce(new Error('DB error'));

      await expect(composioService.initiateComposioAuth(mockBody)).rejects.toThrow(
        'Failed to initiate authentication'
      );
    });

    it('should apply tenant context and filter when req is provided', async () => {
      const mockReq = { tenantId: 'tenant123' };
      const existingAuthConfig = { app: 'testApp', authConfigId: 'existing_ac', save: vi.fn() };
      mockAuthConfig.findOne.mockResolvedValueOnce(existingAuthConfig);
      mockComposioCore.Composio().connectedAccounts.initiate.mockResolvedValueOnce(mockConnectionUrl);

      await composioService.initiateComposioAuth(mockBody, mockReq);

      expect(mockTenantQuery.withTenantFilter).toHaveBeenCalledWith(mockReq, expect.any(Object));
      expect(mockTenantQuery.withTenantContext).toHaveBeenCalledWith(mockReq, expect.any(Object));
      expect(mockComposionAuth.userId).toBe('user123');
      expect(mockComposionAuth.tenantId).toBe('tenant123'); // Ensure tenantId is added
    });
  });

  describe('waitForConnection', () => {
    const connectedAccountId = 'conn123';
    const mockConnection = {
      data: {
        status: 'active',
        accessToken: 'token123',
        refreshToken: 'refresh123',
        idToken: 'idtoken123',
      },
      toolkit: {
        slug: 'testApp',
        name: 'Test App',
      },
    };

    it('should wait for connection and update ComposionAuth', async () => {
      mockComposioCore.Composio().connectedAccounts.waitForConnection.mockResolvedValueOnce(mockConnection);

      const result = await composioService.waitForConnection(connectedAccountId);

      expect(mockComposioCore.Composio().connectedAccounts.waitForConnection).toHaveBeenCalledWith(connectedAccountId);
      expect(mockComposionAuth.updateOne).toHaveBeenCalledWith(
        { connectedAccountId: connectedAccountId },
        {
          status: 'ACTIVE',
          accessToken: 'token123',
          refreshToken: 'refresh123',
          idToken: 'idtoken123',
          toolkit: mockConnection.toolkit,
        },
        { upsert: true }
      );
      expect(result).toEqual({ connection: mockConnection });
    });

    it('should handle connection status being undefined and default to ACTIVE', async () => {
      const mockConnectionNoStatus = {
        data: {
          accessToken: 'token123',
        },
        toolkit: {
          slug: 'testApp',
        },
      };
      mockComposioCore.Composio().connectedAccounts.waitForConnection.mockResolvedValueOnce(mockConnectionNoStatus);

      await composioService.waitForConnection(connectedAccountId);

      expect(mockComposionAuth.updateOne).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ status: 'ACTIVE' }),
        expect.any(Object)
      );
    });

    it('should throw an error if waiting for connection fails', async () => {
      mockComposioCore.Composio().connectedAccounts.waitForConnection.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(composioService.waitForConnection(connectedAccountId)).rejects.toThrow(
        'Failed to establish connection'
      );
    });
  });

  describe('generateComposioConversationId', () => {
    it('should return a string with "composio-" prefix', () => {
      const id = composioService.generateComposioConversationId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^composio-\d{13}-[a-z0-9]{9}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = composioService.generateComposioConversationId();
      const id2 = composioService.generateComposioConversationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateGuestUserId', () => {
    it('should return a string with "guest-" prefix', () => {
      const id = composioService.generateGuestUserId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^guest-\d{13}-[a-z0-9]{9}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = composioService.generateGuestUserId();
      const id2 = composioService.generateGuestUserId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('handleComposioConversation', () => {
    const userId = 'user123';
    const message = 'Hello, Composio!';

    it('should return existing conversation if conversationId is provided and found', async () => {
      const existingConversation = {
        conversationId: 'conv123',
        userId,
        title: 'Existing Conversation',
        messages: [],
        save: vi.fn(),
      };
      mockConversation.findByConversationId.mockResolvedValueOnce(existingConversation);

      const result = await composioService.handleComposioConversation(userId, 'conv123', message);

      expect(mockConversation.findByConversationId).toHaveBeenCalledWith('conv123', userId);
      expect(mockConversation.save).not.toHaveBeenCalled();
      expect(result).toEqual(existingConversation);
    });

    it('should throw an error if conversationId is provided but not found', async () => {
      mockConversation.findByConversationId.mockResolvedValueOnce(null);

      await expect(composioService.handleComposioConversation(userId, 'nonExistentConv', message)).rejects.toThrow(
        'Conversation not found'
      );
    });

    it('should create and save a new conversation if no conversationId is provided', async () => {
      const newConversationInstance = {
        conversationId: expect.stringMatching(/^composio-/),
        userId,
        title: message,
        messages: [],
        metadata: {
          category: 'composio',
          userType: 'authenticated',
          isGuest: false,
        },
        status: 'active',
        save: vi.fn().mockResolvedValue(true),
      };
      mockConversation.findByConversationId.mockResolvedValueOnce(null); // Ensure no existing conversation is found
      mockConversation.mockImplementationOnce(() => newConversationInstance);

      const result = await composioService.handleComposioConversation(userId, null, message);

      expect(mockConversation.findByConversationId).not.toHaveBeenCalled();
      expect(mockConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          title: message,
          metadata: {
            category: 'composio',
            userType: 'authenticated',
            isGuest: false,
          },
        })
      );
      expect(newConversationInstance.save).toHaveBeenCalled();
      expect(result).toEqual(newConversationInstance);
    });

    it('should create a new conversation with truncated title if message is too long', async () => {
      const longMessage = 'a'.repeat(100);
      const newConversationInstance = {
        conversationId: expect.stringMatching(/^composio-/),
        userId,
        title: `${longMessage.substring(0, 50)}...`,
        messages: [],
        metadata: {
          category: 'composio',
          userType: 'authenticated',
          isGuest: false,
        },
        status: 'active',
        save: vi.fn().mockResolvedValue(true),
      };
      mockConversation.mockImplementationOnce(() => newConversationInstance);

      const result = await composioService.handleComposioConversation(userId, null, longMessage);

      expect(mockConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          title: `${longMessage.substring(0, 50)}...`,
        })
      );
      expect(newConversationInstance.save).toHaveBeenCalled();
      expect(result).toEqual(newConversationInstance);
    });

    it('should set isGuest metadata correctly for new conversations', async () => {
      const newConversationInstance = {
        conversationId: expect.stringMatching(/^composio-/),
        userId,
        title: message,
        messages: [],
        metadata: {
          category: 'composio',
          userType: 'guest',
          isGuest: true,
        },
        status: 'active',
        save: vi.fn().mockResolvedValue(true),
      };
      mockConversation.mockImplementationOnce(() => newConversationInstance);

      const result = await composioService.handleComposioConversation(userId, null, message, true);

      expect(mockConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            category: 'composio',
            userType: 'guest',
            isGuest: true,
          },
        })
      );
      expect(newConversationInstance.save).toHaveBeenCalled();
      expect(result).toEqual(newConversationInstance);
    });

    it('should throw an error if conversation save fails', async () => {
      mockConversation.mockImplementationOnce(() => ({
        save: vi.fn().mockRejectedValue(new Error('Save failed')),
      }));

      await expect(composioService.handleComposioConversation(userId, null, message)).rejects.toThrow('Save failed');
    });
  });

  describe('addComposioQueryMessage', () => {
    const conversationId = 'conv123';
    const userId = 'user123';
    const message = 'User query';
    let mockExistingConversation;

    beforeEach(() => {
      mockExistingConversation = {
        conversationId,
        userId,
        messages: [],
        lastActivity: new Date(),
        messageCount: 0,
        save: vi.fn().mockResolvedValue(true),
      };
      mockConversation.findByConversationId.mockResolvedValue(mockExistingConversation);
    });

    it('should add a user message to an existing conversation and save it', async () => {
      await composioService.addComposioQueryMessage(conversationId, userId, message);

      expect(mockConversation.findByConversationId).toHaveBeenCalledWith(conversationId, userId);
      expect(mockExistingConversation.messages).toHaveLength(1);
      expect(mockExistingConversation.messages[0]).toMatchObject({
        role: 'user',
        content: message,
        metadata: {
          isGuest: false,
          type: 'composio_query',
        },
      });
      expect(mockExistingConversation.lastActivity).toBeInstanceOf(Date);
      expect(mockExistingConversation.messageCount).toBe(1);
      expect(mockExistingConversation.save).toHaveBeenCalled();
    });

    it('should add a guest user message to an existing conversation', async () => {
      await composioService.addComposioQueryMessage(conversationId, userId, message, true);

      expect(mockExistingConversation.messages[0].metadata.isGuest).toBe(true);
      expect(mockExistingConversation.save).toHaveBeenCalled();
    });

    it('should do nothing if conversation is not found', async () => {
      mockConversation.findByConversationId.mockResolvedValueOnce(null);

      await composioService.addComposioQueryMessage(conversationId, userId, message);

      expect(mockConversation.findByConversationId).toHaveBeenCalledWith(conversationId, userId);
      expect(mockExistingConversation.messages).toHaveLength(0); // Ensure original mock is not modified
      expect(mockExistingConversation.save).not.toHaveBeenCalled();
    });

    it('should handle errors during conversation save', async () => {
      mockExistingConversation.save.mockRejectedValueOnce(new Error('Save failed'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await composioService.addComposioQueryMessage(conversationId, userId, message);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error adding composio query message:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('addComposioResponseMessage', () => {
    const conversationId = 'conv123';
    const userId = 'user123';
    const response = 'Assistant response';
    const metadata = { toolUsed: 'testTool' };
    let mockExistingConversation;

    beforeEach(() => {
      mockExistingConversation = {
        conversationId,
        userId,
        messages: [],
        lastActivity: new Date(),
        messageCount: 0,
        save: vi.fn().mockResolvedValue(true),
      };
      mockConversation.findByConversationId.mockResolvedValue(mockExistingConversation);
    });

    it('should add an assistant message to an existing conversation and save it', async () => {
      await composioService.addComposioResponseMessage(conversationId, userId, response, metadata);

      expect(mockConversation.findByConversationId).toHaveBeenCalledWith(conversationId, userId);
      expect(mockExistingConversation.messages).toHaveLength(1);
      expect(mockExistingConversation.messages[0]).toMatchObject({
        role: 'assistant',
        content: response,
        metadata: {
          isGuest: false,
          type: 'composio_response',
          toolUsed: 'testTool',
        },
      });
      expect(mockExistingConversation.lastActivity).toBeInstanceOf(Date);
      expect(mockExistingConversation.messageCount).toBe(1);
      expect(mockExistingConversation.save).toHaveBeenCalled();
    });

    it('should add a guest assistant message to an existing conversation', async () => {
      await composioService.addComposioResponseMessage(conversationId, userId, response, metadata, true);

      expect(mockExistingConversation.messages[0].metadata.isGuest).toBe(true);
      expect(mockExistingConversation.save).toHaveBeenCalled();
    });

    it('should do nothing if conversation is not found', async () => {
      mockConversation.findByConversationId.mockResolvedValueOnce(null);

      await composioService.addComposioResponseMessage(conversationId, userId, response, metadata);

      expect(mockConversation.findByConversationId).toHaveBeenCalledWith(conversationId, userId);
      expect(mockExistingConversation.messages).toHaveLength(0);
      expect(mockExistingConversation.save).not.toHaveBeenCalled();
    });

    it('should handle errors during conversation save', async () => {
      mockExistingConversation.save.mockRejectedValueOnce(new Error('Save failed'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await composioService.addComposioResponseMessage(conversationId, userId, response, metadata);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error adding composio response message:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('processComposioConversation', () => {
    const inputs = {
      query: 'What is the weather?',
      conversationContext: 'context data',
      history: [],
      userId: 'user123',
      conversationId: 'conv123',
    };

    it('should return success response and metadata if aiClassificationService succeeds', async () => {
      const mockAiResult = {
        success: true,
        data: {
          response: 'Weather is sunny',
          identifiedApp: 'weatherApp',
          identifiedAction: 'getWeather',
          confidence: 0.9,
          executionResult: { status: 'success' },
        },
      };
      mockAiClassificationService.processUserInputService.mockResolvedValueOnce(mockAiResult);

      const result = await composioService.processComposioConversation(inputs);

      expect(mockAiClassificationService.processUserInputService).toHaveBeenCalledWith(inputs.query, {
        userId: inputs.userId,
        conversationId: inputs.conversationId,
        history: inputs.conversationContext,
      });
      expect(result).toEqual({
        response: 'Weather is sunny',
        metadata: {
          identifiedApp: 'weatherApp',
          identifiedAction: 'getWeather',
          confidence: 0.9,
          executionResult: { status: 'success' },
        },
        executionResult: { status: 'success' },
      });
    });

    it('should return default success response if aiClassificationService succeeds without explicit response', async () => {
      const mockAiResult = {
        success: true,
        data: {
          identifiedApp: 'weatherApp',
        },
      };
      mockAiClassificationService.processUserInputService.mockResolvedValueOnce(mockAiResult);

      const result = await composioService.processComposioConversation(inputs);

      expect(result.response).toBe('Task completed successfully');
      expect(result.metadata.identifiedApp).toBe('weatherApp');
    });

    it('should return error response and metadata if aiClassificationService fails', async () => {
      const mockAiResult = {
        success: false,
        error: 'Classification failed',
      };
      mockAiClassificationService.processUserInputService.mockResolvedValueOnce(mockAiResult);

      const result = await composioService.processComposioConversation(inputs);

      expect(result).toEqual({
        response: 'Classification failed',
        metadata: {
          error: 'Classification failed',
        },
        executionResult: null,
      });
    });

    it('should return default error response if aiClassificationService fails without explicit error message', async () => {
      const mockAiResult = {
        success: false,
      };
      mockAiClassificationService.processUserInputService.mockResolvedValueOnce(mockAiResult);

      const result = await composioService.processComposioConversation(inputs);

      expect(result.response).toBe('Failed to process your request');
      expect(result.metadata.error).toBeUndefined();
    });

    it('should handle unexpected errors during processing', async () => {
      mockAiClassificationService.processUserInputService.mockRejectedValueOnce(new Error('Unexpected AI error'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await composioService.processComposioConversation(inputs);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error processing composio conversation:',
        expect.any(Error)
      );
      expect(result).toEqual({
        response: 'I encountered an error while processing your request. Please try again.',
        metadata: {
          error: 'Unexpected AI error',
        },
        executionResult: null,
      });
      consoleErrorSpy.mockRestore();
    });
  });
});