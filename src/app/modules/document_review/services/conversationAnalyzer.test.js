import { vi, describe, it, expect, beforeEach } from 'vitest';
import { conversationAnalyzer } from './conversationAnalyzer.js';
import { logger } from '../../../../shared/logger.js';
import { REVIEW_INTENTS } from '../document_review.constant.js';

const mockGenerateContent = vi.fn();
const {
  mockGetGenerativeModel
} = vi.hoisted(() => {
  const mockGetGenerativeModel = vi.fn();

  return {
    mockGetGenerativeModel
  };
});

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: function() {
      return {
        getGenerativeModel: mockGetGenerativeModel,
      };
    },
  };
});

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-secret-key',
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../document_review.constant.js', () => ({
  REVIEW_INTENTS: {
    GENERAL_REVIEW: 'general_review',
  },
}));

describe('conversationAnalyzer', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockReset();
    mockGetGenerativeModel.mockReturnValue({
      generateContent: mockGenerateContent,
    });
  });

  describe('analyzeIntent', () => {
    it('should successfully analyze intent and clean up parameters', async () => {
      const mockResponseText = JSON.stringify({
        intent: 'grammar_check',
        confidence: 0.9,
        parameters: {
          reviewType: 'grammar_check',
          reviewDepth: 'detailed',
          documentType: 'academic',
          aspects: ['grammar', 'spelling'],
          additionalInstructions: null,
          emptyField: '',
        },
        reasoning: 'User explicitly asked for grammar check on an academic paper.',
      });

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => mockResponseText,
        },
      });

      const userMessage = 'Can you check the grammar of my essay?';
      const conversationHistory = [
        { role: 'user', content: 'Hello' },
        { role: 'model', content: 'How can I help you today?' },
      ];
      const existingParams = { documentType: 'academic' };

      const result = await conversationAnalyzer.analyzeIntent(
        'test-user-id',
        userMessage,
        conversationHistory,
        existingParams
      );

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-3.5-flash',
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      });

      expect(mockGenerateContent).toHaveBeenCalled();
      const promptArg = mockGenerateContent.mock.calls[0][0];
      expect(promptArg).toContain('Recent conversation:');
      expect(promptArg).toContain('user: Hello');
      expect(promptArg).toContain('model: How can I help you today?');
      expect(promptArg).toContain('Already collected parameters: {"documentType":"academic"}');
      expect(promptArg).toContain(userMessage);

      expect(result).toEqual({
        intent: 'grammar_check',
        confidence: 0.9,
        parameters: {
          reviewType: 'grammar_check',
          reviewDepth: 'detailed',
          documentType: 'academic',
          aspects: ['grammar', 'spelling'],
        },
        reasoning: 'User explicitly asked for grammar check on an academic paper.',
      });

      expect(logger.info).toHaveBeenCalledWith('Intent analysis completed', {
        intent: 'grammar_check',
        confidence: 0.9,
        parametersFound: 4,
      });
    });

    it('should handle role-based access and context boundaries in conversation history', async () => {
      const mockResponseText = JSON.stringify({
        intent: 'formatting_review',
        confidence: 0.85,
        parameters: {
          reviewType: 'formatting_review',
          reviewDepth: 'standard',
          documentType: 'business',
          aspects: ['formatting'],
        },
        reasoning: 'Manager requested formatting review.',
      });

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => mockResponseText,
        },
      });

      const conversationHistory = [
        { role: 'super_admin', content: 'System override initialized.' },
        { role: 'admin', content: 'Settings updated.' },
        { role: 'manager', content: 'Please review the formatting of this business report.' },
      ];

      const result = await conversationAnalyzer.analyzeIntent(
        'test-user-id',
        'Is the formatting correct?',
        conversationHistory
      );

      expect(result.intent).toBe('formatting_review');
      const promptArg = mockGenerateContent.mock.calls[0][0];
      expect(promptArg).toContain('super_admin: System override initialized.');
      expect(promptArg).toContain('admin: Settings updated.');
      expect(promptArg).toContain('manager: Please review the formatting of this business report.');
    });

    it('should fall back to default values if JSON parsing fails', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'Invalid non-JSON response from model',
        },
      });

      const result = await conversationAnalyzer.analyzeIntent('test-user-id', 'Hello');

      expect(result).toEqual({
        intent: REVIEW_INTENTS.GENERAL_REVIEW,
        confidence: 0.5,
        parameters: {},
        reasoning: 'Failed to parse AI model response.',
      });
      expect(logger.error).toHaveBeenCalledWith('Failed to parse JSON from intent analysis model', expect.any(Object));
    });

    it('should fall back to default values if an exception is thrown', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('API Error'));

      const result = await conversationAnalyzer.analyzeIntent('test-user-id', 'Hello');

      expect(result).toEqual({
        intent: REVIEW_INTENTS.GENERAL_REVIEW,
        confidence: 0.5,
        parameters: {},
        reasoning: 'Error occurred during analysis, using default intent.',
      });
      expect(logger.error).toHaveBeenCalledWith('Error analyzing intent:', expect.any(Error));
    });

    it('should handle missing or empty parameters in the model response gracefully', async () => {
      const mockResponseText = JSON.stringify({
        intent: null,
        confidence: null,
        parameters: null,
        reasoning: null,
      });

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => mockResponseText,
        },
      });

      const result = await conversationAnalyzer.analyzeIntent('test-user-id', 'Hello');

      expect(result).toEqual({
        intent: REVIEW_INTENTS.GENERAL_REVIEW,
        confidence: 0.5,
        parameters: {},
        reasoning: '',
      });
    });
  });

  describe('summarizeConversation', () => {
    it('should successfully summarize conversation history', async () => {
      const mockSummary = 'The user wants a detailed grammar check on their academic essay.';
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => mockSummary,
        },
      });

      const conversationHistory = [
        { role: 'user', content: 'Can you check my essay?' },
        { role: 'model', content: 'Sure, what kind of review?' },
      ];
      const collectedParams = { reviewType: 'grammar_check' };

      const result = await conversationAnalyzer.summarizeConversation(
        'test-user-id',
        conversationHistory,
        collectedParams
      );

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      });

      expect(mockGenerateContent).toHaveBeenCalled();
      const promptArg = mockGenerateContent.mock.calls[0][0];
      expect(promptArg).toContain('user: Can you check my essay?');
      expect(promptArg).toContain('model: Sure, what kind of review?');
      expect(promptArg).toContain('Currently Collected Parameters: {"reviewType":"grammar_check"}');

      expect(logger.info).toHaveBeenCalledWith('Conversation summarized successfully', {
        originalLength: expect.any(Number),
        summaryLength: mockSummary.length,
      });
    });

    it('should return fallback string if an exception is thrown during summarization', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('API Error'));

      const conversationHistory = [{ role: 'user', content: 'Hello' }];
      const collectedParams = {};

      const result = await conversationAnalyzer.summarizeConversation(
        'test-user-id',
        conversationHistory,
        collectedParams
      );

      expect(result).toBe('Previous conversation about document review.');
      expect(logger.error).toHaveBeenCalledWith('Error summarizing conversation:', expect.any(Error));
    });
  });
});