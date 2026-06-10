import {
  describe,
  it,
  expect,
  vi,
  beforeEach
} from 'vitest';
import {
  PromptService
} from '../services/promptService.js';
import {
  evaluatePromptQuality,
  buildEnhancedPrompt,
} from '../utils/promptEvaluator.js';

// Mock the external utility module
vi.mock('../utils/promptEvaluator.js', () => ({
  evaluatePromptQuality: vi.fn(),
  buildEnhancedPrompt: vi.fn(),
}));

describe('PromptService', () => {
  const mockApiKey = 'test-api-key-123';

  beforeEach(() => {
    // Reset mocks before each test to ensure isolation
    vi.clearAllMocks();
  });

  it('should be instantiated with an API key', () => {
    const service = new PromptService(mockApiKey);
    expect(service).toBeInstanceOf(PromptService);
    expect(service.apiKey).toBe(mockApiKey);
  });

  describe('evaluatePrompt', () => {
    it('should call evaluatePromptQuality with the correct arguments and return its result', async () => {
      const service = new PromptService(mockApiKey);
      const mockPrompt = 'This is a test prompt.';
      const mockHistory = [{
        role: 'user',
        content: 'Hello'
      }];
      const mockEvaluationResult = {
        quality: 'good',
        score: 0.8
      };

      // Mock the implementation of the imported function
      evaluatePromptQuality.mockResolvedValue(mockEvaluationResult);

      const result = await service.evaluatePrompt(mockPrompt, mockHistory);

      // Expect the external function to have been called
      expect(evaluatePromptQuality).toHaveBeenCalledTimes(1);
      expect(evaluatePromptQuality).toHaveBeenCalledWith(
        mockPrompt,
        mockHistory, {
          apiKey: mockApiKey
        }
      );

      // Expect the service method to return the result from the external function
      expect(result).toEqual(mockEvaluationResult);
    });

    it('should propagate errors from evaluatePromptQuality', async () => {
      const service = new PromptService(mockApiKey);
      const mockPrompt = 'This is a test prompt.';
      const mockHistory = [];
      const mockError = new Error('Failed to evaluate prompt');

      evaluatePromptQuality.mockRejectedValue(mockError);

      await expect(service.evaluatePrompt(mockPrompt, mockHistory)).rejects.toThrow(mockError);
      expect(evaluatePromptQuality).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildEnhancedPrompt', () => {
    it('should call buildEnhancedPrompt with the correct arguments and return its result', async () => {
      const service = new PromptService(mockApiKey);
      const mockConversationHistory = [{
        role: 'user',
        content: 'Draw a cat.'
      }, {
        role: 'assistant',
        content: 'Okay, what kind of cat?'
      }];
      const mockEnhancedPromptResult = 'A fluffy orange cat sitting on a couch.';

      // Mock the implementation of the imported function
      buildEnhancedPrompt.mockResolvedValue(mockEnhancedPromptResult);

      const result = await service.buildEnhancedPrompt(mockConversationHistory);

      // Expect the external function to have been called
      expect(buildEnhancedPrompt).toHaveBeenCalledTimes(1);
      expect(buildEnhancedPrompt).toHaveBeenCalledWith(
        mockConversationHistory, {
          apiKey: mockApiKey
        }
      );

      // Expect the service method to return the result from the external function
      expect(result).toEqual(mockEnhancedPromptResult);
    });

    it('should propagate errors from buildEnhancedPrompt', async () => {
      const service = new PromptService(mockApiKey);
      const mockConversationHistory = [];
      const mockError = new Error('Failed to build enhanced prompt');

      buildEnhancedPrompt.mockRejectedValue(mockError);

      await expect(service.buildEnhancedPrompt(mockConversationHistory)).rejects.toThrow(mockError);
      expect(buildEnhancedPrompt).toHaveBeenCalledTimes(1);
    });
  });
});