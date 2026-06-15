import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { legalContractAnalyzer } from './legalContractAnalyzer.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../../../shared/logger.js';
import {
  CONTRACT_REVIEW_INTENTS,
  INTENT_KEYWORDS,
} from '../legal_contract_review.constant.js';

// Mock external dependencies
vi.mock('@google/generative-ai');
vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
  },
}));
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('legalContractAnalyzer', () => {
  const mockGenerateContent = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }));
  });

  describe('analyzeIntent', () => {
    it('should initialize GoogleGenerativeAI with the correct key', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
              confidence: 0.9,
              parameters: {},
              reasoning: 'Test',
            }),
        },
      });

      await legalContractAnalyzer.analyzeIntent('test message');

      expect(GoogleGenerativeAI).toHaveBeenCalledWith('mock-gemini-key');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      });
    });

    it('should return general_review intent and parameters for a basic request', async () => {
      const mockResponse = {
        intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
        confidence: 0.95,
        parameters: {
          reviewDepth: 'standard',
          contractType: 'nda',
          aspects: ['confidentiality'],
        },
        reasoning: 'User wants a standard review of an NDA focusing on confidentiality.',
      };

      mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(mockResponse) },
      });

      const result = await legalContractAnalyzer.analyzeIntent(
        'Please review my NDA for standard terms and confidentiality clauses.'
      );

      expect(result).toEqual({
        intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
        confidence: 0.95,
        parameters: {
          reviewDepth: 'standard',
          contractType: 'nda',
          aspects: ['confidentiality'],
        },
        reasoning: 'User wants a standard review of an NDA focusing on confidentiality.',
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Legal contract intent analysis:',
        expect.any(Object)
      );
    });

    it('should include conversation history in the prompt', async () => {
      const conversationHistory = [
        { role: 'user', content: 'Hi, I need help with a contract.' },
        { role: 'model', content: 'Sure, what kind of contract?' },
      ];
      const userMessage = 'It is an employment contract.';

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
              confidence: 0.9,
              parameters: { contractType: 'employment' },
              reasoning: 'Identified contract type from message.',
            }),
        },
      });

      await legalContractAnalyzer.analyzeIntent(userMessage, conversationHistory);

      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('Recent conversation:\nuser: Hi, I need help with a contract.\nmodel: Sure, what kind of contract?');
      expect(prompt).toContain(`User message: "${userMessage}"`);
    });

    it('should include existing parameters in the prompt', async () => {
      const existingParams = {
        contractType: 'service_agreement',
        reviewDepth: 'detailed',
      };
      const userMessage = 'I want to focus on payment terms.';

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              intent: CONTRACT_REVIEW_INTENTS.CLAUSE_ANALYSIS,
              confidence: 0.9,
              parameters: { aspects: ['payment_terms'] },
              reasoning: 'User specified focus on payment terms.',
            }),
        },
      });

      await legalContractAnalyzer.analyzeIntent(userMessage, [], existingParams);

      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain(
        `Already collected parameters: ${JSON.stringify(existingParams)}`
      );
      expect(prompt).toContain(`User message: "${userMessage}"`);
    });

    it('should clean up null and empty array parameters from the AI response', async () => {
      const mockResponse = {
        intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
        confidence: 0.8,
        parameters: {
          reviewType: null,
          reviewDepth: 'standard',
          contractType: 'nda',
          aspects: [],
          additionalInstructions: 'null',
          validParam: 'value',
        },
        reasoning: 'Test cleaning.',
      };

      mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(mockResponse) },
      });

      const result = await legalContractAnalyzer.analyzeIntent('test message');

      expect(result.parameters).toEqual({
        reviewDepth: 'standard',
        contractType: 'nda',
        validParam: 'value',
      });
    });

    it('should handle AI response with missing intent or confidence, using defaults', async () => {
      const mockResponse = {
        parameters: { contractType: 'employment' },
        reasoning: 'Only parameters provided.',
      };

      mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(mockResponse) },
      });

      const result = await legalContractAnalyzer.analyzeIntent('test message');

      expect(result.intent).toBe(CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW);
      expect(result.confidence).toBe(0.5);
      expect(result.parameters).toEqual({ contractType: 'employment' });
      expect(result.reasoning).toBe('Only parameters provided.');
    });

    it('should use default fallback if AI response is not valid JSON', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => 'This is not JSON response' },
      });

      const result = await legalContractAnalyzer.analyzeIntent('review my NDA');

      expect(logger.warn).toHaveBeenCalledWith('Could not parse intent analysis response');
      expect(result.intent).toBe(CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW);
      expect(result.confidence).toBe(0.5);
      expect(result.parameters).toEqual({});
      expect(result.reasoning).toBe('Default fallback');
    });

    it('should use ultimate fallback if AI model interaction fails and no keywords match', async () => {
      mockGenerateContent.mockRejectedValue(new Error('AI model error'));

      const result = await legalContractAnalyzer.analyzeIntent('random message with no keywords');

      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing legal contract intent:',
        expect.any(Error)
      );
      expect(result.intent).toBe(CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW);
      expect(result.confidence).toBe(0.5);
      expect(result.parameters).toEqual({});
      expect(result.reasoning).toBe('Fallback - error in analysis');
    });

    it('should use keyword fallback for specific intent when AI fails', async () => {
      mockGenerateContent.mockRejectedValue(new Error('AI model error'));

      // Temporarily add a keyword for 'NDA' to INTENT_KEYWORDS for this test
      const originalGeneralReviewKeywords = INTENT_KEYWORDS.GENERAL_REVIEW;
      INTENT_KEYWORDS.GENERAL_REVIEW = [...originalGeneralReviewKeywords, 'nda'];

      const result = await legalContractAnalyzer.analyzeIntent('I need to review an NDA');

      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing legal contract intent:',
        expect.any(Error)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Using fallback keyword-based intent detection',
        { intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW }
      );
      expect(result.intent).toBe(CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW);
      expect(result.confidence).toBe(0.6);
      expect(result.parameters).toEqual({});
      expect(result.reasoning).toBe('Detected keyword: nda');

      // Restore original keywords
      INTENT_KEYWORDS.GENERAL_REVIEW = originalGeneralReviewKeywords;
    });

    it('should correctly identify clause_analysis intent', async () => {
      const mockResponse = {
        intent: CONTRACT_REVIEW_INTENTS.CLAUSE_ANALYSIS,
        confidence: 0.9,
        parameters: {
          aspects: ['termination', 'payment_terms'],
        },
        reasoning: 'User wants to analyze specific clauses.',
      };

      mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(mockResponse) },
      });

      const result = await legalContractAnalyzer.analyzeIntent(
        'Analyze the termination and payment clauses.'
      );

      expect(result.intent).toBe(CONTRACT_REVIEW_INTENTS.CLAUSE_ANALYSIS);
      expect(result.parameters.aspects).toEqual(['termination', 'payment_terms']);
    });
  });

  describe('needsMoreInfo', () => {
    it('should return false if no required parameters are specified', () => {
      const collectedParams = { contractType: 'nda' };
      const requiredParams = [];
      expect(legalContractAnalyzer.needsMoreInfo('general_review', collectedParams, requiredParams)).toBe(false);
    });

    it('should return false if all required parameters are present', () => {
      const collectedParams = { contractType: 'nda', reviewDepth: 'standard' };
      const requiredParams = ['contractType', 'reviewDepth'];
      expect(legalContractAnalyzer.needsMoreInfo('general_review', collectedParams, requiredParams)).toBe(false);
    });

    it('should return true if one required parameter is missing', () => {
      const collectedParams = { contractType: 'nda' };
      const requiredParams = ['contractType', 'reviewDepth'];
      expect(legalContractAnalyzer.needsMoreInfo('general_review', collectedParams, requiredParams)).toBe(true);
    });

    it('should return true if multiple required parameters are missing', () => {
      const collectedParams = {};
      const requiredParams = ['contractType', 'reviewDepth'];
      expect(legalContractAnalyzer.needsMoreInfo('general_review', collectedParams, requiredParams)).toBe(true);
    });

    it('should return true if a required parameter is present but falsy (null)', () => {
      const collectedParams = { contractType: 'nda', reviewDepth: null };
      const requiredParams = ['contractType', 'reviewDepth'];
      expect(legalContractAnalyzer.needsMoreInfo('general_review', collectedParams, requiredParams)).toBe(true);
    });

    it('should return true if a required parameter is present but falsy (undefined)', () => {
      const collectedParams = { contractType: 'nda', reviewDepth: undefined };
      const requiredParams = ['contractType', 'reviewDepth'];
      expect(legalContractAnalyzer.needsMoreInfo('general_review', collectedParams, requiredParams)).toBe(true);
    });

    it('should return true if a required parameter is present but falsy (empty string)', () => {
      const collectedParams = { contractType: 'nda', reviewDepth: '' };
      const requiredParams = ['contractType', 'reviewDepth'];
      expect(legalContractAnalyzer.needsMoreInfo('general_review', collectedParams, requiredParams)).toBe(true);
    });

    it('should return false if requiredParams is null', () => {
      const collectedParams = { contractType: 'nda' };
      const requiredParams = null;
      expect(legalContractAnalyzer.needsMoreInfo('general_review', collectedParams, requiredParams)).toBe(false);
    });

    it('should return false if requiredParams is undefined', () => {
      const collectedParams = { contractType: 'nda' };
      const requiredParams = undefined;
      expect(legalContractAnalyzer.needsMoreInfo('general_review', collectedParams, requiredParams)).toBe(false);
    });
  });
});