import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { orchestratorService } from './orchestrator.service.js'; // The file under test

// Mock external dependencies
// -----------------------------------------------------------------------------
// Mock @google/generative-ai
const mockGenerateContent = vi.fn();

const {
  mockGetGenerativeModel,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
  mockIncrementPromptsUsed,
  mockExecuteSwarmSync,
  mockRandomUUID,
  mockProcessUserInputService,
  mockAsyncExtractFacts,
  mockCaptureException
} = vi.hoisted(() => {
  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));

  // Mock logger
  const mockLoggerInfo = vi.fn();
  const mockLoggerWarn = vi.fn();
  const mockLoggerError = vi.fn();

  // Mock paymentController
  const mockIncrementPromptsUsed = vi.fn();

  // Mock SwarmService
  const mockExecuteSwarmSync = vi.fn();

  // Mock crypto
  const mockRandomUUID = vi.fn().mockImplementation(() => 'mock-uuid-123');

  // Mock aiClassificationService
  const mockProcessUserInputService = vi.fn();

  // Mock userMemoryService
  const mockAsyncExtractFacts = vi.fn();

  // Mock sentry
  const mockCaptureException = vi.fn();

  return {
    mockGetGenerativeModel,
    mockLoggerInfo,
    mockLoggerWarn,
    mockLoggerError,
    mockIncrementPromptsUsed,
    mockExecuteSwarmSync,
    mockRandomUUID,
    mockProcessUserInputService,
    mockAsyncExtractFacts,
    mockCaptureException
  };
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

vi.mock('../payment/payment.controller.js', () => ({
  paymentController: {
    incrementPromptsUsed: mockIncrementPromptsUsed,
  },
}));

vi.mock('../swarm/swarm.service.js', () => ({
  SwarmService: {
    executeSwarmSync: mockExecuteSwarmSync,
  },
}));

// Mock Conversation model
const mockAddMessage = vi.fn();
const mockConversationSave = vi.fn();
const mockConversationFindOne = vi.fn();
const MockConversation = vi.fn().mockImplementation(() => ({
  addMessage: mockAddMessage,
  save: mockConversationSave,
}));
MockConversation.findOne = mockConversationFindOne;
vi.mock('../conversations/conversation.model.js', () => ({
  default: MockConversation,
}));

vi.mock('crypto', () => ({
  default: {
    randomUUID: mockRandomUUID,
  },
}));

vi.mock('../composio_v2/aiClassification.service.js', () => ({
  aiClassificationService: {
    processUserInputService: mockProcessUserInputService,
  },
}));

vi.mock('../conversations/userMemory.service.js', () => ({
  userMemoryService: {
    asyncExtractFacts: mockAsyncExtractFacts,
  },
}));

vi.mock('../../../shared/sentry.js', () => ({
  captureException: mockCaptureException,
}));

// -----------------------------------------------------------------------------

describe('orchestratorService.classifyAndDispatch', () => {
  const userId = 'test-user-id';
  const sessionId = 'test-session-id';
  const conversationId = 'test-conversation-id';
  const newConversationId = 'new-chat';

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Default mock implementations for common scenarios
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ target_module: 'general_chat', confidence: 0.9, parameters: { query: 'test query' } }) }]
          }
        }]
      }
    });

    mockExecuteSwarmSync.mockResolvedValue({
      reply: 'Swarm response',
      responseMessage: { answer: 'Swarm response', reference: [] },
      webSearchQueries: [],
      relatedQuestions: [],
    });

    mockProcessUserInputService.mockResolvedValue({
      success: true,
      data: {
        responseMessage: { message: 'Connected apps response', toolResults: [] },
        executionResult: { status: 'success' },
      },
    });

    mockConversationFindOne.mockResolvedValue(null); // Default to no existing conversation
    mockConversationSave.mockResolvedValue({});
  });

  // ---------------------------------------------------------------------------
  // 1. Input Validation
  // ---------------------------------------------------------------------------
  it('should return an empty message response for an empty prompt', async () => {
    const result = await orchestratorService.classifyAndDispatch('', sessionId, userId, conversationId);
    expect(result.reply).toBe("It looks like you sent an empty message. How can I help you today?");
    expect(result.orchestrator_decision).toBe('general_chat');
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockExecuteSwarmSync).not.toHaveBeenCalled();
    expect(mockIncrementPromptsUsed).not.toHaveBeenCalled();
    expect(mockConversationSave).not.toHaveBeenCalled();
  });

  it('should return an empty message response for a whitespace-only prompt', async () => {
    const result = await orchestratorService.classifyAndDispatch('   ', sessionId, userId, conversationId);
    expect(result.reply).toBe("It looks like you sent an empty message. How can I help you today?");
  });

  it('should return an empty message response for a null prompt', async () => {
    const result = await orchestratorService.classifyAndDispatch(null, sessionId, userId, conversationId);
    expect(result.reply).toBe("It looks like you sent an empty message. How can I help you today?");
  });

  // ---------------------------------------------------------------------------
  // 2. Fast-Path
  // ---------------------------------------------------------------------------
  it('should use fast-path for common greetings and classify as general_chat', async () => {
    const prompt = 'Hi there!';
    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(result.orchestrator_decision).toBe('general_chat');
    expect(result.classification.source).toBe('fast-path');
    expect(mockGenerateContent).not.toHaveBeenCalled(); // LLM should be skipped
    expect(mockExecuteSwarmSync).toHaveBeenCalledWith(prompt, [], userId, { requireSearch: false });
    expect(mockIncrementPromptsUsed).toHaveBeenCalledWith(userId);
    expect(mockConversationFindOne).toHaveBeenCalledWith({ conversationId, userId }, { messages: { $slice: -6 } });
    expect(MockConversation).not.toHaveBeenCalled(); // Existing conversation
    expect(mockAddMessage).toHaveBeenCalledTimes(2); // user and assistant
    expect(mockConversationSave).toHaveBeenCalledTimes(1);
    expect(mockAsyncExtractFacts).toHaveBeenCalledWith(userId, prompt, result.reply);
  });

  it('should use fast-path for short queries and classify as general_chat', async () => {
    const prompt = 'Weather?'; // length <= 15
    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(result.orchestrator_decision).toBe('general_chat');
    expect(result.classification.source).toBe('fast-path');
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockExecuteSwarmSync).toHaveBeenCalledWith(prompt, [], userId, { requireSearch: false });
  });

  // ---------------------------------------------------------------------------
  // 3. LLM Classification (Gemini)
  // ---------------------------------------------------------------------------
  it('should classify using Gemini for a non-fast-path prompt', async () => {
    const prompt = 'Tell me about the latest AI advancements.';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ target_module: 'web_search', confidence: 0.95, parameters: { query: prompt, require_search: true } }) }]
          }
        }]
      }
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.any(Object));
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: expect.stringContaining('Supported Modules:') }] }
    });
    expect(result.orchestrator_decision).toBe('web_search');
    expect(result.classification.source).toBe('gemini');
    expect(result.extracted_parameters.query).toBe(prompt);
    expect(result.extracted_parameters.require_search).toBe(true);
    expect(mockExecuteSwarmSync).toHaveBeenCalledWith(prompt, [], userId, { requireSearch: true });
  });

  it('should handle Gemini returning markdown JSON and parse it', async () => {
    const prompt = 'What is the capital of France?';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ text: '```json\n{"target_module": "general_chat", "confidence": 0.9, "parameters": {"query": "capital of France"}}\n```' }]
          }
        }]
      }
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.orchestrator_decision).toBe('general_chat');
    expect(result.classification.source).toBe('gemini');
    expect(result.extracted_parameters.query).toBe('capital of France');
  });

  it('should fall back to local classifier if Gemini fails', async () => {
    const prompt = 'Generate an image of a cat.';
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error')); // Simulate Gemini failure

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Gemini failed'));
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), { stage: 'orchestrator-gemini', model: expect.any(String) });
    expect(result.orchestrator_decision).toBe('image_generation'); // Local classifier should pick this up
    expect(result.classification.source).toBe('local-fallback');
    expect(result.extracted_parameters.query).toBe(prompt);
    expect(mockExecuteSwarmSync).toHaveBeenCalledWith(prompt, [], userId, { requireSearch: false });
  });

  it('should fall back to local classifier if Gemini returns invalid JSON', async () => {
    const prompt = 'Generate an image of a dog.';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ text: '{"target_module": "invalid_module", "confidence": 0.8}' }] // Invalid module
          }
        }]
      }
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('LLM returned invalid module'));
    expect(result.orchestrator_decision).toBe('image_generation'); // Local classifier should pick this up
    expect(result.classification.source).toBe('local-fallback');
    expect(result.extracted_parameters.query).toBe(prompt);
  });

  it('should fall back to local classifier if Gemini returns non-JSON string', async () => {
    const prompt = 'Generate an image of a bird.';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ text: 'This is not JSON.' }]
          }
        }]
      }
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('LLM returned invalid module')); // The JSON.parse will fail, leading to this path
    expect(result.orchestrator_decision).toBe('image_generation'); // Local classifier should pick this up
    expect(result.classification.source).toBe('local-fallback');
    expect(result.extracted_parameters.query).toBe(prompt);
  });

  // ---------------------------------------------------------------------------
  // 4. Local Fallback Classification
  // ---------------------------------------------------------------------------
  it('should use local classifier for "connected_apps" keywords if LLM fails', async () => {
    const prompt = 'Send an email to John about the meeting.';
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error')); // Force fallback

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(result.orchestrator_decision).toBe('connected_apps');
    expect(result.classification.source).toBe('local-fallback');
    expect(mockProcessUserInputService).toHaveBeenCalledWith(
      prompt,
      { userId, conversationId, isGuest: false },
      null
    );
  });

  it('should use local classifier for "web_search" keywords if LLM fails', async () => {
    const prompt = 'What is the weather like in London today?';
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error')); // Force fallback

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(result.orchestrator_decision).toBe('web_search');
    expect(result.classification.source).toBe('local-fallback');
    expect(result.extracted_parameters.require_search).toBe(true);
    expect(mockExecuteSwarmSync).toHaveBeenCalledWith(prompt, [], userId, { requireSearch: true });
  });

  it('should default to general_chat if local classifier finds no specific match', async () => {
    const prompt = 'A very ambiguous query that should not match any specific local keyword.';
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error')); // Force fallback

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(result.orchestrator_decision).toBe('general_chat');
    expect(result.classification.source).toBe('local-fallback');
    expect(result.extracted_parameters.query).toBe(prompt);
    expect(mockExecuteSwarmSync).toHaveBeenCalledWith(prompt, [], userId, { requireSearch: false });
  });

  // ---------------------------------------------------------------------------
  // 5. Conversation Context
  // ---------------------------------------------------------------------------
  it('should load conversation context for an existing conversation', async () => {
    const prompt = 'Continue our discussion on AI.';
    const existingMessages = [
      { role: 'user', content: 'Tell me about AI.' },
      { role: 'assistant', content: 'AI is a broad field...' },
    ];
    mockConversationFindOne.mockResolvedValueOnce({
      conversationId,
      userId,
      messages: existingMessages,
      lean: () => ({ conversationId, userId, messages: existingMessages }),
    });

    await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockConversationFindOne).toHaveBeenCalledWith({ conversationId, userId }, { messages: { $slice: -6 } });
    expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents: [{
        role: 'user',
        parts: [{
          text: expect.stringContaining('Recent conversation context:\nuser: Tell me about AI.\nassistant: AI is a broad field...\n\nNew user message to classify:\nContinue our discussion on AI.')
        }]
      }]
    }));
  });

  it('should not load conversation context for a new chat', async () => {
    const prompt = 'Start a new chat about quantum physics.';
    await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, newConversationId);

    expect(mockConversationFindOne).not.toHaveBeenCalled();
    expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    }));
  });

  it('should handle conversation context loading failure gracefully', async () => {
    const prompt = 'What is the capital of France?';
    mockConversationFindOne.mockRejectedValueOnce(new Error('DB error')); // Simulate DB error

    await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to load conversation context'));
    // Should still proceed with classification without context
    expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    }));
  });

  // ---------------------------------------------------------------------------
  // 6. Dispatch Logic
  // ---------------------------------------------------------------------------
  it('should dispatch to SwarmService for general_chat module', async () => {
    const prompt = 'How are you?';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ target_module: 'general_chat', confidence: 0.9, parameters: { query: prompt } }) }]
          }
        }]
      }
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(result.orchestrator_decision).toBe('general_chat');
    expect(mockExecuteSwarmSync).toHaveBeenCalledWith(prompt, [], userId, { requireSearch: false });
    expect(mockProcessUserInputService).not.toHaveBeenCalled();
    expect(result.reply).toBe('Swarm response');
  });

  it('should dispatch to SwarmService for web_search module with requireSearch', async () => {
    const prompt = 'Latest news on AI.';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ target_module: 'web_search', confidence: 0.9, parameters: { query: prompt, require_search: true } }) }]
          }
        }]
      }
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(result.orchestrator_decision).toBe('web_search');
    expect(mockExecuteSwarmSync).toHaveBeenCalledWith(prompt, [], userId, { requireSearch: true });
    expect(mockProcessUserInputService).not.toHaveBeenCalled();
  });

  it('should dispatch to aiClassificationService for connected_apps module', async () => {
    const prompt = 'Send an email to support.';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ target_module: 'connected_apps', confidence: 0.9, parameters: { query: prompt } }) }]
          }
        }]
      }
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(result.orchestrator_decision).toBe('connected_apps');
    expect(mockProcessUserInputService).toHaveBeenCalledWith(
      prompt,
      { userId, conversationId, isGuest: false },
      null
    );
    expect(mockExecuteSwarmSync).not.toHaveBeenCalled(); // Should not call Swarm if Composio succeeds
    expect(result.reply).toBe('Connected apps response');
  });

  it('should fall back to SwarmService if aiClassificationService fails', async () => {
    const prompt = 'Create a Jira ticket.';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ target_module: 'connected_apps', confidence: 0.9, parameters: { query: prompt } }) }]
          }
        }]
      }
    });
    mockProcessUserInputService.mockResolvedValueOnce({
      success: false,
      error: 'Composio error',
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(result.orchestrator_decision).toBe('connected_apps');
    expect(mockProcessUserInputService).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Connected apps failed'));
    expect(mockExecuteSwarmSync).toHaveBeenCalledWith(prompt, [], userId, { requireSearch: false }); // Fallback to Swarm
    expect(result.reply).toBe('Swarm response');
  });

  it('should handle dispatch service errors gracefully', async () => {
    const prompt = 'Tell me a joke.';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ target_module: 'general_chat', confidence: 0.9, parameters: { query: prompt } }) }]
          }
        }]
      }
    });
    mockExecuteSwarmSync.mockRejectedValueOnce(new Error('Swarm service down')); // Simulate dispatch error

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Dispatch to general_chat failed'));
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), { stage: 'orchestrator-dispatch', target_module: 'general_chat' });
    expect(result.reply).toContain("I'm currently experiencing a temporary issue");
    expect(result.orchestrator_decision).toBe('general_chat'); // Decision remains, but reply is error message
  });

  // ---------------------------------------------------------------------------
  // 7. Credit Increment
  // ---------------------------------------------------------------------------
  it('should increment prompts used for a logged-in user', async () => {
    const prompt = 'Hello'; // Fast-path
    await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);
    expect(mockIncrementPromptsUsed).toHaveBeenCalledWith(userId);
  });

  it('should not increment prompts used if userId is null', async () => {
    const prompt = 'Hello'; // Fast-path
    await orchestratorService.classifyAndDispatch(prompt, sessionId, null, conversationId);
    expect(mockIncrementPromptsUsed).not.toHaveBeenCalled();
  });

  it('should log a warning if credit increment fails but not block the response', async () => {
    const prompt = 'Hello'; // Fast-path
    mockIncrementPromptsUsed.mockRejectedValueOnce(new Error('Payment service error'));

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockIncrementPromptsUsed).toHaveBeenCalledWith(userId);
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Payment check failed'));
    expect(result.reply).toBe('Swarm response'); // Still returns the main response
  });

  // ---------------------------------------------------------------------------
  // 8. Chat Persistence
  // ---------------------------------------------------------------------------
  it('should create a new conversation if conversationId is "new-chat"', async () => {
    const prompt = 'New chat topic.';
    const swarmResponse = { reply: 'New chat response', responseMessage: { answer: 'New chat response', reference: [] } };
    mockExecuteSwarmSync.mockResolvedValueOnce(swarmResponse);

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, newConversationId);

    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
    expect(MockConversation).toHaveBeenCalledTimes(1);
    expect(MockConversation).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'mock-uuid-123',
      userId,
      title: 'New chat topic.',
      messages: [
        expect.objectContaining({ role: 'user', content: prompt }),
        expect.objectContaining({ role: 'assistant', content: swarmResponse.reply }),
      ],
    }));
    expect(mockConversationSave).toHaveBeenCalledTimes(1);
    expect(result.conversationId).toBe('mock-uuid-123');
  });

  it('should update an existing conversation', async () => {
    const prompt = 'Follow up message.';
    const existingConversation = {
      conversationId,
      userId,
      messages: [{ role: 'user', content: 'Initial message' }],
      addMessage: mockAddMessage,
      save: mockConversationSave,
    };
    mockConversationFindOne.mockResolvedValueOnce(existingConversation);
    const swarmResponse = { reply: 'Follow up response', responseMessage: { answer: 'Follow up response', reference: [] } };
    mockExecuteSwarmSync.mockResolvedValueOnce(swarmResponse);

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockConversationFindOne).toHaveBeenCalledWith({ conversationId, userId }, { messages: { $slice: -6 } });
    expect(mockAddMessage).toHaveBeenCalledWith('user', prompt);
    expect(mockAddMessage).toHaveBeenCalledWith('assistant', swarmResponse.reply, expect.any(Object));
    expect(mockConversationSave).toHaveBeenCalledTimes(1);
    expect(MockConversation).not.toHaveBeenCalled(); // No new conversation created
    expect(result.conversationId).toBe(conversationId);
  });

  it('should not persist chat if userId is null', async () => {
    const prompt = 'Hello'; // Fast-path
    await orchestratorService.classifyAndDispatch(prompt, sessionId, null, conversationId);
    expect(mockConversationFindOne).not.toHaveBeenCalled();
    expect(MockConversation).not.toHaveBeenCalled();
    expect(mockConversationSave).not.toHaveBeenCalled();
  });

  it('should log an error if chat persistence fails but not block the response', async () => {
    const prompt = 'Hello'; // Fast-path
    mockConversationFindOne.mockResolvedValueOnce({
      conversationId,
      userId,
      messages: [],
      addMessage: mockAddMessage,
      save: vi.fn().mockRejectedValueOnce(new Error('DB save error')),
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Failed to persist chat history'), expect.any(Error));
    expect(result.reply).toBe('Swarm response'); // Still returns the main response
  });

  // ---------------------------------------------------------------------------
  // 9. Memory Extraction
  // ---------------------------------------------------------------------------
  it('should call asyncExtractFacts if userId and reply exist', async () => {
    const prompt = 'Hello'; // Fast-path
    const swarmResponse = { reply: 'Swarm response', responseMessage: { answer: 'Swarm response', reference: [] } };
    mockExecuteSwarmSync.mockResolvedValueOnce(swarmResponse);

    await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockAsyncExtractFacts).toHaveBeenCalledWith(userId, prompt, swarmResponse.reply);
  });

  it('should not call asyncExtractFacts if userId is null', async () => {
    const prompt = 'Hello'; // Fast-path
    await orchestratorService.classifyAndDispatch(prompt, sessionId, null, conversationId);
    expect(mockAsyncExtractFacts).not.toHaveBeenCalled();
  });

  it('should not call asyncExtractFacts if reply is empty', async () => {
    const prompt = 'Hello'; // Fast-path
    mockExecuteSwarmSync.mockResolvedValueOnce({ reply: '', responseMessage: { answer: '', reference: [] } });

    await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockAsyncExtractFacts).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 10. Error Handling (Top-level safety net)
  // ---------------------------------------------------------------------------
  it('should catch and handle unexpected top-level errors gracefully', async () => {
    const prompt = 'Trigger an error';
    // Force an error in a way that would bypass specific try/catch blocks
    // For example, by making a mock throw unexpectedly during setup or a critical path
    mockGetGenerativeModel.mockImplementationOnce(() => {
      throw new Error('Unexpected critical error');
    });

    const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId, conversationId);

    expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Unexpected top-level error (safety net)'), expect.any(Error));
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), { stage: 'orchestrator-top-level', prompt: expect.any(String) });
    expect(result.reply).toContain("I received your message but encountered an unexpected issue.");
    expect(result.orchestrator_decision).toBe('general_chat');
    expect(result.conversationId).toBe('mock-uuid-123'); // A new UUID is generated for the error response
  });
});