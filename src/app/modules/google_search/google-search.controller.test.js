import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';

// Mock external dependencies
vi.mock('@google/genai', () => {
  const mockGenerateContent = vi.fn();
  const mockModels = {
    generateContent: mockGenerateContent,
  };
  const mockGoogleGenAI = vi.fn().mockImplementation(() => ({
    models: mockModels,
  }));
  return { GoogleGenAI: mockGoogleGenAI, mockGenerateContent }; // Export mockGenerateContent for direct assertion
});

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
  },
}));

vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn, // Just return the function directly for testing
}));

const sendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({
  default: sendResponse,
}));

const generateSessionId = vi.fn();
vi.mock('../../../shared/sessionGenerate.js', () => ({
  default: generateSessionId,
}));

const {
  mockUserModel,
  mockChatHistoryModel
} = vi.hoisted(() => {
  // Mock Mongoose models
  const mockUserModel = {
    findById: vi.fn().mockReturnThis(), // Allows chaining .lean()
    lean: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  };

  const mockChatHistoryModel = {
    findOne: vi.fn().mockReturnThis(), // Allows chaining
    create: vi.fn(),
    save: vi.fn(), // For existing session
  };

  return {
    mockUserModel,
    mockChatHistoryModel
  };
});

vi.mock('../auth/auth.model.js', () => ({
  default: mockUserModel,
}));

vi.mock('../conversations/chatHistory.model.js', () => ({
  default: mockChatHistoryModel,
}));

// Import the controller after mocks are set up
const { GoogleSearchController } = await import('./google-search.controller.js');
const { mockGenerateContent } = await import('@google/genai'); // Get the specific mock function

describe('GoogleSearchController', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    req = {
      body: {
        prompt: 'Test prompt',
        user: 'user123',
        sessionId: 'session456',
      },
    };
    res = {}; // Response object is usually not deeply interacted with, just passed to sendResponse

    // Default mock implementations for common paths
    mockUserModel.findById.mockReturnThis();
    mockUserModel.lean.mockResolvedValue({ _id: 'user123', name: 'Test User' });
    mockUserModel.findByIdAndUpdate.mockResolvedValue({});

    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ text: 'AI generated reply' }],
        },
      }],
      usageMetadata: { totalTokenCount: 100 },
    });

    mockChatHistoryModel.findOne.mockResolvedValue(null); // Default to no existing session
    mockChatHistoryModel.create.mockResolvedValue({
      _id: 'newSessionId',
      user: 'user123',
      sessionId: 'session456',
      responses: [],
      save: mockChatHistoryModel.save, // Attach save method to created session
    });
    mockChatHistoryModel.save.mockResolvedValue({});

    sendResponse.mockImplementation(() => {}); // Mock sendResponse to do nothing
    generateSessionId.mockReturnValue('newGeneratedSessionId');
  });

  // Test Case 1: Missing prompt
  it('should return BAD_REQUEST if prompt is missing', async () => {
    req.body.prompt = undefined;

    await GoogleSearchController.GoogleSearchGetResponse(req, res);

    expect(sendResponse).toHaveBeenCalledWith(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Validation Error',
      errorMessages: [{ path: 'prompt', message: 'Prompt is required.' }],
    });
    expect(mockUserModel.findById).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  // Test Case 2: User not found
  it('should return NOT_FOUND if user is not found', async () => {
    mockUserModel.lean.mockResolvedValue(null); // Simulate user not found

    await GoogleSearchController.GoogleSearchGetResponse(req, res);

    expect(mockUserModel.findById).toHaveBeenCalledWith('user123');
    expect(mockUserModel.lean).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'User not found.',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  // Test Case 3: Successful AI response (new session)
  it('should create a new session and return AI reply if successful and no existing session', async () => {
    req.body.sessionId = undefined; // Force new session generation

    await GoogleSearchController.GoogleSearchGetResponse(req, res);

    expect(generateSessionId).toHaveBeenCalledWith(24);
    expect(mockUserModel.findById).toHaveBeenCalledWith('user123');
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: 'Test prompt',
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
      },
    });
    expect(mockChatHistoryModel.findOne).toHaveBeenCalledWith({
      user: 'user123',
      sessionId: 'newGeneratedSessionId',
    });
    expect(mockChatHistoryModel.create).toHaveBeenCalledWith({
      user: 'user123',
      sessionId: 'newGeneratedSessionId',
      responses: [{
        prompt: 'Test prompt',
        model: 'gemini-2.5-flash-grounded',
        reply: 'AI generated reply',
        total_time: 100,
      }],
    });
    expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
      $push: { llamaAiSessions: 'newSessionId' },
    });
    expect(sendResponse).toHaveBeenCalledWith(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response processed successfully.',
      data: { sessionId: 'newGeneratedSessionId', reply: 'AI generated reply' },
    });
  });

  // Test Case 4: Successful AI response (existing session)
  it('should update an existing session and return AI reply if successful and session exists', async () => {
    const mockExistingSession = {
      _id: 'existingSessionId',
      user: 'user123',
      sessionId: 'session456',
      responses: [{
        prompt: 'Previous prompt',
        model: 'gemini-2.5-flash-grounded',
        reply: 'Previous reply',
        total_time: 50,
      }],
      save: vi.fn().mockResolvedValue({}),
    };
    mockChatHistoryModel.findOne.mockResolvedValue(mockExistingSession);

    await GoogleSearchController.GoogleSearchGetResponse(req, res);

    expect(generateSessionId).not.toHaveBeenCalled(); // Session ID provided in req.body
    expect(mockUserModel.findById).toHaveBeenCalledWith('user123');
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    expect(mockChatHistoryModel.findOne).toHaveBeenCalledWith({
      user: 'user123',
      sessionId: 'session456',
    });
    expect(mockChatHistoryModel.create).not.toHaveBeenCalled();
    expect(mockExistingSession.responses).toHaveLength(2);
    expect(mockExistingSession.responses[1]).toEqual({
      prompt: 'Test prompt',
      model: 'gemini-2.5-flash-grounded',
      reply: 'AI generated reply',
      total_time: 100,
    });
    expect(mockExistingSession.save).toHaveBeenCalledOnce();
    expect(mockUserModel.findByIdAndUpdate).not.toHaveBeenCalled(); // Not called for existing session
    expect(sendResponse).toHaveBeenCalledWith(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response processed successfully.',
      data: { sessionId: 'session456', reply: 'AI generated reply' },
    });
  });

  // Test Case 5: AI model generates no reply
  it('should return BAD_REQUEST if AI model generates no valid reply', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ text: '' }, { thought: 'some thought' }], // Simulate no actual text reply
        },
      }],
      usageMetadata: { totalTokenCount: 10 },
    });

    await GoogleSearchController.GoogleSearchGetResponse(req, res);

    expect(mockGenerateContent).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Validation Error',
      errorMessages: [
        {
          path: 'message',
          message: 'Reply could not be generated by the AI model.',
        },
      ],
    });
    expect(mockChatHistoryModel.create).not.toHaveBeenCalled();
    expect(mockChatHistoryModel.findOne).not.toHaveBeenCalled();
  });

  // Test Case 6: AI model processing fails (try-catch block)
  it('should return INTERNAL_SERVER_ERROR if AI model processing fails', async () => {
    const errorMessage = 'AI service unavailable';
    mockGenerateContent.mockRejectedValue(new Error(errorMessage));

    // Mock console.error to prevent actual logging during test and optionally assert it
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await GoogleSearchController.GoogleSearchGetResponse(req, res);

    expect(mockGenerateContent).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', errorMessage);
    expect(sendResponse).toHaveBeenCalledWith(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'AI model processing failed.',
    });
    expect(mockChatHistoryModel.create).not.toHaveBeenCalled();
    expect(mockChatHistoryModel.findOne).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore(); // Restore original console.error
  });

  // Test Case: AI response with multiple parts, some thought, some text
  it('should correctly concatenate text parts from AI response, ignoring thoughts', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [
            { text: 'Part 1. ' },
            { thought: 'Internal thought process.' },
            { text: 'Part 2.' },
          ],
        },
      }],
      usageMetadata: { totalTokenCount: 75 },
    });

    await GoogleSearchController.GoogleSearchGetResponse(req, res);

    expect(sendResponse).toHaveBeenCalledWith(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response processed successfully.',
      data: { sessionId: 'session456', reply: 'Part 1. Part 2.' },
    });
  });

  // Test Case: AI response with no candidates or content
  it('should return BAD_REQUEST if AI response has no candidates', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [], // No candidates
      usageMetadata: { totalTokenCount: 0 },
    });

    await GoogleSearchController.GoogleSearchGetResponse(req, res);

    expect(sendResponse).toHaveBeenCalledWith(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Validation Error',
      errorMessages: [
        {
          path: 'message',
          message: 'Reply could not be generated by the AI model.',
        },
      ],
    });
  });

  it('should return BAD_REQUEST if AI response has candidates but null content', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: null }], // Content is null
      usageMetadata: { totalTokenCount: 0 },
    });

    await GoogleSearchController.GoogleSearchGetResponse(req, res);

    expect(sendResponse).toHaveBeenCalledWith(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Validation Error',
      errorMessages: [
        {
          path: 'message',
          message: 'Reply could not be generated by the AI model.',
        },
      ],
    });
  });
});