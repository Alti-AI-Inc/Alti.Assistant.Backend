import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createImageIntentController } from './imageIntentController.js';

// Mock config
vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-api-key',
  },
}));

// Mock dynamic import target
const mockAnalyzeImageIntent = vi.fn();
vi.mock('../utils/imageIntentAnalyzer.js', () => ({
  analyzeImageIntent: (...args) => mockAnalyzeImageIntent(...args),
}));

describe('imageIntentController', () => {
  let sessionManager;
  let controller;
  let req;
  let res;

  beforeEach(() => {
    vi.clearAllMocks();

    sessionManager = {
      getSession: vi.fn(),
      getHistory: vi.fn(),
    };

    controller = createImageIntentController(sessionManager);

    req = {
      body: {},
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it('should return 400 if both request and userMessage are missing', async () => {
    req.body = {};

    await controller.analyzeIntent(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'request or userMessage is required',
    });
  });

  it('should analyze intent successfully using "request" and default context', async () => {
    req.body = { request: 'make it brighter' };
    const mockAnalysis = {
      isEditable: true,
      intent: 'edit',
      editType: 'brightness',
      reasoning: 'User wants to make it brighter',
      needsMoreInfo: false,
      questions: [],
    };
    mockAnalyzeImageIntent.mockResolvedValueOnce(mockAnalysis);

    await controller.analyzeIntent(req, res);

    expect(mockAnalyzeImageIntent).toHaveBeenCalledWith(
      'make it brighter',
      false,
      'No previous context.',
      { apiKey: 'test-api-key' }
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockAnalysis,
    });
  });

  it('should analyze intent successfully using "userMessage" and hasImage = true', async () => {
    req.body = { userMessage: 'crop this', hasImage: true };
    const mockAnalysis = {
      isEditable: true,
      intent: 'crop',
      editType: 'crop',
      reasoning: 'User wants to crop',
      needsMoreInfo: false,
      questions: [],
    };
    mockAnalyzeImageIntent.mockResolvedValueOnce(mockAnalysis);

    await controller.analyzeIntent(req, res);

    expect(mockAnalyzeImageIntent).toHaveBeenCalledWith(
      'crop this',
      true,
      'No previous context.',
      { apiKey: 'test-api-key' }
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ...mockAnalysis,
    });
  });

  it('should retrieve context from session manager if sessionId is provided and session exists', async () => {
    req.body = { request: 'apply filter', sessionId: 'session-123' };
    sessionManager.getSession.mockReturnValueOnce({ id: 'session-123' });
    sessionManager.getHistory.mockReturnValueOnce('previous chat history');

    const mockAnalysis = {
      isEditable: true,
      intent: 'filter',
      editType: 'filter',
      reasoning: 'User wants a filter',
      needsMoreInfo: false,
      questions: [],
    };
    mockAnalyzeImageIntent.mockResolvedValueOnce(mockAnalysis);

    await controller.analyzeIntent(req, res);

    expect(sessionManager.getSession).toHaveBeenCalledWith('session-123');
    expect(sessionManager.getHistory).toHaveBeenCalledWith('session-123');
    expect(mockAnalyzeImageIntent).toHaveBeenCalledWith(
      'apply filter',
      false,
      'previous chat history',
      { apiKey: 'test-api-key' }
    );
  });

  it('should default context if session exists but history is empty', async () => {
    req.body = { request: 'apply filter', sessionId: 'session-123' };
    sessionManager.getSession.mockReturnValueOnce({ id: 'session-123' });
    sessionManager.getHistory.mockReturnValueOnce(null);

    mockAnalyzeImageIntent.mockResolvedValueOnce({});

    await controller.analyzeIntent(req, res);

    expect(mockAnalyzeImageIntent).toHaveBeenCalledWith(
      'apply filter',
      false,
      'No previous context.',
      { apiKey: 'test-api-key' }
    );
  });

  it('should default context if session does not exist', async () => {
    req.body = { request: 'apply filter', sessionId: 'session-123' };
    sessionManager.getSession.mockReturnValueOnce(null);

    mockAnalyzeImageIntent.mockResolvedValueOnce({});

    await controller.analyzeIntent(req, res);

    expect(sessionManager.getSession).toHaveBeenCalledWith('session-123');
    expect(sessionManager.getHistory).not.toHaveBeenCalled();
    expect(mockAnalyzeImageIntent).toHaveBeenCalledWith(
      'apply filter',
      false,
      'No previous context.',
      { apiKey: 'test-api-key' }
    );
  });

  it('should handle errors and return 500 status', async () => {
    req.body = { request: 'error trigger' };
    const errorMessage = 'Something went wrong';
    mockAnalyzeImageIntent.mockRejectedValueOnce(new Error(errorMessage));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await controller.analyzeIntent(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: errorMessage,
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});