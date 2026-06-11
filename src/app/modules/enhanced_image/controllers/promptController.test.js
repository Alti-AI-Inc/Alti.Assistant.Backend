import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPromptController } from './promptController';

// Mock dependencies
const mockSessionManager = {
  getSession: vi.fn(),
  createSession: vi.fn(),
  addToHistory: vi.fn(),
  getHistory: vi.fn(),
  getConversationHistory: vi.fn(),
};

const mockPromptService = {
  evaluatePrompt: vi.fn(),
  buildEnhancedPrompt: vi.fn(),
};

// Mock Express response object
const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('createPromptController', () => {
  let controller;
  let req;
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = createPromptController(mockSessionManager, mockPromptService);
    res = mockRes();
    req = {
      body: {},
      // NOTE: The file has no role-based access checks.
      // If it did, we would mock req.user here for different roles.
      // e.g., req.user = { role: 'user' }
    };
  });

  describe('evaluatePrompt', () => {
    it('should return 400 if sessionId is missing', async () => {
      req.body = { prompt: 'a test prompt' };
      await controller.evaluatePrompt(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId and prompt are required',
      });
    });

    it('should return 400 if prompt is missing', async () => {
      req.body = { sessionId: '123' };
      await controller.evaluatePrompt(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId and prompt are required',
      });
    });

    it('should evaluate a prompt for an existing session', async () => {
      const sessionId = 'existing-session';
      const prompt = 'A cat sitting on a mat';
      req.body = { sessionId, prompt };

      const mockSession = { id: sessionId, history: [] };
      const mockHistory = [prompt];
      const mockEvaluation = { isComplete: false, score: 50, missingElements: ['style'], suggestions: ['Add a style'] };

      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSessionManager.getHistory.mockReturnValue(mockHistory);
      mockSessionManager.getConversationHistory.mockReturnValue(mockHistory);
      mockPromptService.evaluatePrompt.mockResolvedValue(mockEvaluation);

      await controller.evaluatePrompt(req, res);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(mockSessionManager.createSession).not.toHaveBeenCalled();
      expect(mockSessionManager.addToHistory).toHaveBeenCalledWith(sessionId, prompt);
      expect(mockPromptService.evaluatePrompt).toHaveBeenCalledWith(prompt, mockHistory);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        evaluation: {
          isComplete: mockEvaluation.isComplete,
          score: mockEvaluation.score,
          missingElements: mockEvaluation.missingElements,
          suggestions: mockEvaluation.suggestions,
        },
        conversationHistory: mockHistory,
      });
    });

    it('should create a new session if sessionId is not found and evaluate the prompt', async () => {
      const originalSessionId = 'non-existent-session';
      const newSessionId = 'new-session-123';
      const prompt = 'A dog chasing a ball';
      req.body = { sessionId: originalSessionId, prompt };

      const mockNewSession = { id: newSessionId, history: [] };
      const mockHistory = [prompt];
      const mockEvaluation = { isComplete: true, score: 90, missingElements: [], suggestions: [] };

      // First call to getSession fails, second succeeds after creation
      mockSessionManager.getSession
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(mockNewSession);
      mockSessionManager.createSession.mockReturnValue(newSessionId);
      mockSessionManager.getHistory.mockReturnValue(mockHistory);
      mockSessionManager.getConversationHistory.mockReturnValue(mockHistory);
      mockPromptService.evaluatePrompt.mockResolvedValue(mockEvaluation);

      await controller.evaluatePrompt(req, res);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(originalSessionId);
      expect(mockSessionManager.createSession).toHaveBeenCalled();
      expect(mockSessionManager.getSession).toHaveBeenCalledWith(newSessionId);
      expect(mockSessionManager.addToHistory).toHaveBeenCalledWith(newSessionId, prompt);
      expect(mockPromptService.evaluatePrompt).toHaveBeenCalledWith(prompt, mockHistory);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        evaluation: {
          isComplete: mockEvaluation.isComplete,
          score: mockEvaluation.score,
          missingElements: mockEvaluation.missingElements,
          suggestions: mockEvaluation.suggestions,
        },
        conversationHistory: mockHistory,
      });
    });

    it('should return 500 on internal server error', async () => {
      const sessionId = 'error-session';
      const prompt = 'This will fail';
      req.body = { sessionId, prompt };

      mockSessionManager.getSession.mockReturnValue({ id: sessionId, history: [] });
      mockPromptService.evaluatePrompt.mockRejectedValue(new Error('Evaluation failed'));

      await controller.evaluatePrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'An internal error occurred while evaluating the prompt.',
      });
    });
  });

  describe('addDetail', () => {
    it('should return 400 if sessionId is missing', async () => {
      req.body = { detail: 'some detail' };
      await controller.addDetail(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId and detail are required',
      });
    });

    it('should return 400 if detail is missing', async () => {
      req.body = { sessionId: '123' };
      await controller.addDetail(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId and detail are required',
      });
    });

    it('should return 404 if session is not found', async () => {
      const sessionId = 'not-found-session';
      req.body = { sessionId, detail: 'some detail' };
      mockSessionManager.getSession.mockReturnValue(undefined);

      await controller.addDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found',
      });
    });

    it('should add detail to an existing session and re-evaluate', async () => {
      const sessionId = 'existing-session';
      const detail = 'in a photorealistic style';
      req.body = { sessionId, detail };

      const initialHistory = ['A cat on a mat'];
      const updatedHistory = [...initialHistory, detail];
      const mockEvaluation = { isComplete: true, score: 95, missingElements: [], suggestions: [] };

      mockSessionManager.getSession.mockReturnValue({ id: sessionId, history: initialHistory });
      mockSessionManager.getHistory.mockReturnValue(updatedHistory);
      mockSessionManager.getConversationHistory.mockReturnValue(updatedHistory);
      mockPromptService.evaluatePrompt.mockResolvedValue(mockEvaluation);

      await controller.addDetail(req, res);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(mockSessionManager.addToHistory).toHaveBeenCalledWith(sessionId, detail);
      expect(mockPromptService.evaluatePrompt).toHaveBeenCalledWith(updatedHistory.join('. '), updatedHistory);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        evaluation: {
          isComplete: mockEvaluation.isComplete,
          score: mockEvaluation.score,
          missingElements: mockEvaluation.missingElements,
          suggestions: mockEvaluation.suggestions,
        },
        conversationHistory: updatedHistory,
      });
    });

    it('should return 500 on internal server error', async () => {
      const sessionId = 'error-session';
      req.body = { sessionId, detail: 'This will fail' };

      mockSessionManager.getSession.mockReturnValue({ id: sessionId, history: [] });
      mockPromptService.evaluatePrompt.mockRejectedValue(new Error('Evaluation failed'));

      await controller.addDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'An internal error occurred while adding detail.',
      });
    });
  });

  describe('finalizePrompt', () => {
    it('should return 400 if sessionId is missing', async () => {
      req.body = {};
      await controller.finalizePrompt(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId is required',
      });
    });

    it('should return 404 if session is not found', async () => {
      const sessionId = 'not-found-session';
      req.body = { sessionId };
      mockSessionManager.getSession.mockReturnValue(undefined);

      await controller.finalizePrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found',
      });
    });

    it('should finalize a prompt for an existing session', async () => {
      const sessionId = 'existing-session';
      req.body = { sessionId };

      const conversationHistory = ['A futuristic city', 'at sunset', 'with flying cars'];
      const enhancedPrompt = 'Enhanced prompt: A futuristic city. at sunset. with flying cars';

      mockSessionManager.getSession.mockReturnValue({ id: sessionId, history: conversationHistory });
      mockSessionManager.getConversationHistory.mockReturnValue(conversationHistory);
      mockPromptService.buildEnhancedPrompt.mockResolvedValue(enhancedPrompt);

      await controller.finalizePrompt(req, res);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(mockSessionManager.getConversationHistory).toHaveBeenCalledWith(sessionId);
      expect(mockPromptService.buildEnhancedPrompt).toHaveBeenCalledWith(conversationHistory);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        enhancedPrompt,
        conversationHistory,
      });
    });

    it('should return 500 on internal server error', async () => {
      const sessionId = 'error-session';
      req.body = { sessionId };

      mockSessionManager.getSession.mockReturnValue({ id: sessionId, history: [] });
      mockSessionManager.getConversationHistory.mockReturnValue(['some history']);
      mockPromptService.buildEnhancedPrompt.mockRejectedValue(new Error('Build failed'));

      await controller.finalizePrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'An internal error occurred while finalizing the prompt.',
      });
    });
  });
});