import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ideaAnalyzer } from './ideaAnalyzer.js';
import {
  BRAINSTORM_INTENTS,
  BRAINSTORM_TYPES,
  PERSPECTIVES,
  TECHNIQUES,
  DEPTH_LEVELS,
  COMPLEXITY_LEVELS,
} from '../brainstorm.constant.js';

// Mock external dependencies
vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));
  const mockGoogleGenerativeAI = vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  }));
  return {
    GoogleGenerativeAI: mockGoogleGenerativeAI,
    _mockGenerateContent: mockGenerateContent, // Export for testing
    _mockGetGenerativeModel: mockGetGenerativeModel, // Export for testing
  };
});

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Import mocks after they are defined
import {
  GoogleGenerativeAI,
  _mockGenerateContent,
  _mockGetGenerativeModel,
} from '@google/generative-ai';
import { logger } from '../../../../shared/logger.js';

describe('ideaAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock implementation for generateContent
    _mockGenerateContent.mockReset();
    _mockGetGenerativeModel.mockReset();
    // Ensure GoogleGenerativeAI is called with the mock key
    new GoogleGenerativeAI('mock-gemini-key');
  });

  describe('analyzeIntent', () => {
    it('should analyze intent for a basic message and return valid JSON', async () => {
      const mockResponseText = `{
        "intent": "generate_ideas",
        "confidence": 0.9,
        "parameters": {
          "brainstormType": "product_idea",
          "idea": "app for pet owners",
          "technique": "free_association",
          "perspectives": [],
          "depth": "standard",
          "focusAreas": [],
          "constraints": {},
          "additionalInstructions": null
        },
        "needsMoreInfo": false,
        "missingInfo": [],
        "reasoning": "User wants ideas for a pet app."
      }`;
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => mockResponseText },
      });

      const userMessage = 'I need ideas for an app for pet owners.';
      const result = await ideaAnalyzer.analyzeIntent(userMessage);

      expect(_mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      });
      expect(_mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(_mockGenerateContent.mock.calls[0][0]).toContain(
        `User message: "${userMessage}"`
      );
      expect(_mockGenerateContent.mock.calls[0][0]).not.toContain(
        'Recent conversation:'
      );
      expect(_mockGenerateContent.mock.calls[0][0]).not.toContain(
        'Already collected parameters:'
      );

      expect(result).toEqual(JSON.parse(mockResponseText));
      expect(logger.info).toHaveBeenCalledWith('Intent analysis completed', {
        intent: 'generate_ideas',
      });
    });

    it('should include conversation history in the prompt', async () => {
      const mockResponseText = `{
        "intent": "expand_idea",
        "confidence": 0.8,
        "parameters": {
          "brainstormType": "product_idea",
          "idea": "fitness platform",
          "technique": "free_association",
          "perspectives": [],
          "depth": "standard",
          "focusAreas": [],
          "constraints": {},
          "additionalInstructions": null
        },
        "needsMoreInfo": false,
        "missingInfo": [],
        "reasoning": "Expanding on previous idea."
      }`;
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => mockResponseText },
      });

      const userMessage = 'Tell me more about the fitness platform.';
      const conversationHistory = [
        { role: 'user', content: 'I want to brainstorm a fitness platform.' },
        {
          role: 'assistant',
          content: 'Okay, what kind of fitness platform are you thinking?',
        },
      ];
      const result = await ideaAnalyzer.analyzeIntent(
        userMessage,
        conversationHistory
      );

      expect(_mockGenerateContent.mock.calls[0][0]).toContain(
        'Recent conversation:\nuser: I want to brainstorm a fitness platform.\nassistant: Okay, what kind of fitness platform are you thinking?'
      );
      expect(result.intent).toBe('expand_idea');
    });

    it('should include existing parameters in the prompt', async () => {
      const mockResponseText = `{
        "intent": "generate_ideas",
        "confidence": 0.95,
        "parameters": {
          "brainstormType": "marketing_campaign",
          "idea": "social media campaign for new coffee shop",
          "technique": "brainwriting",
          "perspectives": ["business"],
          "depth": "deep",
          "focusAreas": ["marketability"],
          "constraints": {},
          "additionalInstructions": null
        },
        "needsMoreInfo": false,
        "missingInfo": [],
        "reasoning": "User specified technique and depth."
      }`;
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => mockResponseText },
      });

      const userMessage = 'Use brainwriting and deep dive.';
      const existingParams = {
        brainstormType: 'marketing_campaign',
        idea: 'social media campaign for new coffee shop',
      };
      const result = await ideaAnalyzer.analyzeIntent(
        userMessage,
        [],
        existingParams
      );

      expect(_mockGenerateContent.mock.calls[0][0]).toContain(
        `Already collected parameters: ${JSON.stringify(existingParams)}`
      );
      expect(result.parameters.technique).toBe('brainwriting');
      expect(result.parameters.depth).toBe('deep');
    });

    it('should handle AI response with malformed JSON', async () => {
      const malformedResponse = `This is not JSON. { "intent": "generate_ideas", "confidence": 0.9, "parameters": {} }`;
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => malformedResponse },
      });

      const userMessage = 'Generate ideas.';
      const result = await ideaAnalyzer.analyzeIntent(userMessage);

      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing intent:',
        expect.any(Error)
      );
      expect(result).toEqual({
        intent: BRAINSTORM_INTENTS.UNKNOWN,
        confidence: 0.5,
        parameters: {},
        needsMoreInfo: true,
        missingInfo: [
          'Please provide more details about what you want to brainstorm',
        ],
        reasoning: 'Failed to analyze intent',
      });
    });

    it('should handle AI generation error', async () => {
      const errorMessage = 'AI service unavailable';
      _mockGenerateContent.mockRejectedValueOnce(new Error(errorMessage));

      const userMessage = 'Generate ideas.';
      const result = await ideaAnalyzer.analyzeIntent(userMessage);

      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing intent:',
        expect.any(Error)
      );
      expect(result).toEqual({
        intent: BRAINSTORM_INTENTS.UNKNOWN,
        confidence: 0.5,
        parameters: {},
        needsMoreInfo: true,
        missingInfo: [
          'Please provide more details about what you want to brainstorm',
        ],
        reasoning: 'Failed to analyze intent',
      });
    });
  });

  describe('analyzeIdea', () => {
    it('should analyze an idea and return valid JSON', async () => {
      const mockResponseText = `{
        "brainstormType": "product_idea",
        "complexity": "moderate",
        "domains": ["e-commerce", "sustainability"],
        "keyThemes": ["eco-friendly", "local businesses"],
        "implicitRequirements": ["user authentication", "payment gateway"],
        "suggestedTechniques": ["swot", "mind_map"],
        "recommendedPerspectives": ["business", "user_centric"],
        "recommendedDepth": "deep",
        "estimatedIdeaCount": 30,
        "reasoning": "Analysis of an eco-friendly e-commerce platform."
      }`;
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => mockResponseText },
      });

      const ideaText = 'An e-commerce platform for local, sustainable products.';
      const result = await ideaAnalyzer.analyzeIdea(ideaText);

      expect(_mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      });
      expect(_mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(_mockGenerateContent.mock.calls[0][0]).toContain(
        `Idea: "${ideaText}"`
      );

      expect(result).toEqual(JSON.parse(mockResponseText));
      expect(logger.info).toHaveBeenCalledWith('Idea analysis completed', {
        type: 'product_idea',
      });
    });

    it('should handle AI response with malformed JSON for idea analysis', async () => {
      const malformedResponse = `Not JSON. { "brainstormType": "general" }`;
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => malformedResponse },
      });

      const ideaText = 'A simple idea.';
      const result = await ideaAnalyzer.analyzeIdea(ideaText);

      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing idea:',
        expect.any(Error)
      );
      expect(result).toEqual({
        brainstormType: BRAINSTORM_TYPES.GENERAL,
        complexity: COMPLEXITY_LEVELS.MODERATE,
        domains: ['general'],
        keyThemes: [],
        implicitRequirements: [],
        suggestedTechniques: [TECHNIQUES.FREE_ASSOCIATION],
        recommendedPerspectives: [
          PERSPECTIVES.BUSINESS,
          PERSPECTIVES.USER_CENTRIC,
        ],
        recommendedDepth: DEPTH_LEVELS.STANDARD,
        estimatedIdeaCount: 20,
        reasoning: 'Default analysis due to error',
      });
    });

    it('should handle AI generation error for idea analysis', async () => {
      const errorMessage = 'AI model failed to respond';
      _mockGenerateContent.mockRejectedValueOnce(new Error(errorMessage));

      const ideaText = 'Another simple idea.';
      const result = await ideaAnalyzer.analyzeIdea(ideaText);

      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing idea:',
        expect.any(Error)
      );
      expect(result).toEqual({
        brainstormType: BRAINSTORM_TYPES.GENERAL,
        complexity: COMPLEXITY_LEVELS.MODERATE,
        domains: ['general'],
        keyThemes: [],
        implicitRequirements: [],
        suggestedTechniques: [TECHNIQUES.FREE_ASSOCIATION],
        recommendedPerspectives: [
          PERSPECTIVES.BUSINESS,
          PERSPECTIVES.USER_CENTRIC,
        ],
        recommendedDepth: DEPTH_LEVELS.STANDARD,
        estimatedIdeaCount: 20,
        reasoning: 'Default analysis due to error',
      });
    });
  });

  describe('extractIdea', () => {
    it('should extract the core idea from a message', async () => {
      const mockResponseText = 'An innovative social media platform.';
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => mockResponseText },
      });

      const userMessage =
        'I am thinking about an innovative social media platform, can you help me brainstorm?';
      const result = await ideaAnalyzer.extractIdea(userMessage);

      expect(_mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      });
      expect(_mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(_mockGenerateContent.mock.calls[0][0]).toContain(
        `Message: "${userMessage}"`
      );
      expect(result).toBe(mockResponseText);
      expect(logger.info).toHaveBeenCalledWith('Idea extracted from message');
    });

    it('should handle AI generation error for idea extraction', async () => {
      const errorMessage = 'Extraction AI failed';
      _mockGenerateContent.mockRejectedValueOnce(new Error(errorMessage));

      const userMessage = 'Extract idea from this message.';
      const result = await ideaAnalyzer.extractIdea(userMessage);

      expect(logger.error).toHaveBeenCalledWith(
        'Error extracting idea:',
        expect.any(Error)
      );
      expect(result).toBe(userMessage); // Should return original message on error
    });

    it('should trim whitespace from the extracted idea', async () => {
      const mockResponseText = '  A new mobile game concept. \n';
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => mockResponseText },
      });

      const userMessage = 'I have an idea for a new mobile game concept.';
      const result = await ideaAnalyzer.extractIdea(userMessage);

      expect(result).toBe('A new mobile game concept.');
    });
  });

  describe('hasValidIdea', () => {
    it('should return true if existingParams.idea is valid', () => {
      const existingParams = { idea: 'A very long and descriptive idea statement.' };
      expect(ideaAnalyzer.hasValidIdea('short message', existingParams)).toBe(true);
    });

    it('should return false if existingParams.idea is too short', () => {
      const existingParams = { idea: 'short idea' };
      expect(ideaAnalyzer.hasValidIdea('short message', existingParams)).toBe(false);
    });

    it('should return false if existingParams.idea is null', () => {
      const existingParams = { idea: null };
      expect(ideaAnalyzer.hasValidIdea('short message', existingParams)).toBe(false);
    });

    it('should return true if message contains a keyword and is long enough', () => {
      const message = 'I want to brainstorm a new app for productivity.';
      expect(ideaAnalyzer.hasValidIdea(message)).toBe(true);
    });

    it('should return true for a message with multiple keywords', () => {
      const message = 'Let\'s develop a new software product for process improvement.';
      expect(ideaAnalyzer.hasValidIdea(message)).toBe(true);
    });

    it('should return false if message is too short', () => {
      const message = 'New app.';
      expect(ideaAnalyzer.hasValidIdea(message)).toBe(false);
    });

    it('should return false if message has no keywords', () => {
      const message = 'This is a general statement about something.';
      expect(ideaAnalyzer.hasValidIdea(message)).toBe(false);
    });

    it('should return false if message is short and has no keywords', () => {
      const message = 'Hello there.';
      expect(ideaAnalyzer.hasValidIdea(message)).toBe(false);
    });

    it('should be case-insensitive for keywords', () => {
      const message = 'I need a new PRODUCT idea.';
      expect(ideaAnalyzer.hasValidIdea(message)).toBe(true);
    });

    it('should return false for an empty message', () => {
      expect(ideaAnalyzer.hasValidIdea('')).toBe(false);
    });

    it('should return false for a message with only a keyword but too short', () => {
      expect(ideaAnalyzer.hasValidIdea('app')).toBe(false);
    });

    it('should return true for a message that just meets the length and keyword criteria', () => {
      const message = 'A new product for the market.'; // 28 chars, has 'product'
      expect(ideaAnalyzer.hasValidIdea(message)).toBe(true);
    });
  });
});