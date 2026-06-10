import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { evaluatePromptQuality, buildEnhancedPrompt } from './promptEvaluator.js';

// Mock the config module
vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
    google: {
      gcp_project_id: 'mock-project-id',
      vertex_ai_region: 'mock-region',
    },
  },
}));

// Setup mocks for ChatGoogleGenerativeAI
const mockConstructor = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@langchain/google-genai', () => {
  return {
    ChatGoogleGenerativeAI: class {
      constructor(config) {
        mockConstructor(config);
        this.config = config;
      }
      async invoke(input, options) {
        return mockInvoke(input, options);
      }
    },
  };
});

describe('promptEvaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('evaluatePromptQuality', () => {
    it('should successfully evaluate prompt quality with default parameters', async () => {
      const mockResponse = {
        isComplete: true,
        missingElements: [],
        suggestions: [],
        score: 95,
      };

      mockInvoke.mockResolvedValueOnce({
        content: JSON.stringify(mockResponse),
      });

      const result = await evaluatePromptQuality('A beautiful photorealistic mountain landscape');

      expect(mockConstructor).toHaveBeenCalledWith({
        apiKey: 'mock-gemini-key',
        model: 'gemini-3.5-flash',
        project: 'mock-project-id',
        location: 'mock-region',
        temperature: 0,
      });

      expect(result).toEqual(mockResponse);
    });

    it('should respect custom modelName and history parameters', async () => {
      const mockResponse = {
        isComplete: false,
        missingElements: ['lighting details'],
        suggestions: ['What kind of lighting would you prefer?'],
        score: 60,
      };

      mockInvoke.mockResolvedValueOnce({
        content: JSON.stringify(mockResponse),
      });

      const result = await evaluatePromptQuality(
        'A red car',
        'User previously asked for a vehicle.',
        { modelName: 'gemini-pro' }
      );

      expect(mockConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-pro',
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle JSON parsing errors by cleaning markdown code blocks', async () => {
      const rawOutput = '```json\n{\n"isComplete": true,\n"missingElements": [],\n"suggestions": [],\n"score": 85\n}\n```';
      
      const parsingError = new Error('Failed to parse');
      parsingError.output = rawOutput;

      mockInvoke.mockRejectedValueOnce(parsingError);

      const result = await evaluatePromptQuality('A cute kitten');

      expect(result).toEqual({
        isComplete: true,
        missingElements: [],
        suggestions: [],
        score: 85,
      });
    });

    it('should handle JSON parsing errors with trailing text after the closing brace', async () => {
      const rawOutput = '```json\n{"isComplete": false, "missingElements": ["background"], "suggestions": ["Add background"], "score": 40}\n```\nSome extra trailing text here';
      
      const parsingError = new Error('Failed to parse');
      parsingError.output = rawOutput;

      mockInvoke.mockRejectedValueOnce(parsingError);

      const result = await evaluatePromptQuality('A cute kitten');

      expect(result).toEqual({
        isComplete: false,
        missingElements: ['background'],
        suggestions: ['Add background'],
        score: 40,
      });
    });

    it('should return a safe default response if parsing completely fails', async () => {
      const parsingError = new Error('Failed to parse');
      parsingError.output = 'completely invalid non-JSON string';

      mockInvoke.mockRejectedValueOnce(parsingError);

      const result = await evaluatePromptQuality('A cute kitten');

      expect(result).toEqual({
        isComplete: false,
        missingElements: ['Unable to fully evaluate prompt quality'],
        suggestions: ['Please try again with a clearer prompt description'],
        score: 50,
      });
      expect(console.error).toHaveBeenCalled();
    });

    it('should rethrow critical non-parsing errors', async () => {
      const criticalError = new Error('API key expired or invalid');
      mockInvoke.mockRejectedValueOnce(criticalError);

      await expect(evaluatePromptQuality('A cute kitten')).rejects.toThrow('API key expired or invalid');
    });
  });

  describe('buildEnhancedPrompt', () => {
    it('should successfully build an enhanced prompt from conversation history', async () => {
      const mockEnhancedPrompt = 'A highly detailed, photorealistic portrait of a majestic golden retriever sitting in a sunny park, 8k resolution.';
      
      mockInvoke.mockResolvedValueOnce({
        content: mockEnhancedPrompt,
      });

      const conversationHistory = [
        'I want a picture of a dog',
        'Make it a golden retriever',
        'In a sunny park, photorealistic style',
      ];

      const result = await buildEnhancedPrompt(conversationHistory);

      expect(mockConstructor).toHaveBeenCalledWith({
        apiKey: 'mock-gemini-key',
        model: 'gemini-3.5-flash',
        project: 'mock-project-id',
        location: 'mock-region',
        temperature: 0.3,
      });

      expect(result).toBe(mockEnhancedPrompt);
    });

    it('should respect custom modelName when building enhanced prompt', async () => {
      mockInvoke.mockResolvedValueOnce({
        content: 'Enhanced prompt',
      });

      await buildEnhancedPrompt(['A simple prompt'], { modelName: 'gemini-pro' });

      expect(mockConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-pro',
        })
      );
    });
  });
});