import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
// Mock @google/generative-ai
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
  generateContent: mockGenerateContent,
}));

const {
  mockGoogleGenerativeAI,
  mockLoggerInfo,
  mockLoggerError
} = vi.hoisted(() => {
  const mockGoogleGenerativeAI = vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  }));

  // Mock logger
  const mockLoggerInfo = vi.fn();
  const mockLoggerError = vi.fn();

  return {
    mockGoogleGenerativeAI,
    mockLoggerInfo,
    mockLoggerError
  };
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI,
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
}));

// Mock config
vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key',
    DOCUMENT_CONFIG: {
      MODEL: 'gemini-pro',
    },
  },
}));

// Import constants (these don't need mocking as they are simple enums)
import {
  DOCUMENT_CONFIG,
  DOCUMENT_INTENTS,
  DOCUMENT_TYPES,
  OUTPUT_FORMATS,
  TONES,
  LENGTH_OPTIONS,
} from '../document.constant.js';

// Import the module to be tested AFTER all mocks are set up.
// This ensures that when the module initializes, it uses our mocks.
import { conversationAnalyzer } from './conversationAnalyzer.js';

describe('conversationAnalyzer module initialization', () => {
  // This test checks the initial setup of GoogleGenerativeAI when the module is loaded.
  // It runs once because the module is imported at the top level.
  it('should initialize GoogleGenerativeAI with the correct key and model on module load', () => {
    expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-pro' });
  });
});

describe('conversationAnalyzer functions', () => {
  beforeEach(() => {
    // Clear all mock call counts and reset their implementations before each test
    vi.clearAllMocks();

    // Set a default mock for generateContent for most tests to return a valid JSON structure
    mockGenerateContent.mockResolvedValue({
      response: {
        text: vi.fn().mockImplementation(() => JSON.stringify({
          intent: DOCUMENT_INTENTS.DRAFT,
          confidence: 0.9,
          parameters: { content: 'default content' },
          improvementQuestions: [],
          canProceed: true,
          suggestedResponse: 'Default successful response.',
        })),
      },
    });
  });

  describe('analyzeIntent', () => {
    it('should analyze intent with a basic user message and return parsed JSON', async () => {
      const mockAiResponse = {
        intent: DOCUMENT_INTENTS.DRAFT,
        confidence: 0.9,
        parameters: { content: 'a new report' },
        improvementQuestions: ['What is the target audience?', 'What key points should be included?'],
        canProceed: true,
        suggestedResponse: 'Okay, I can draft a report for you.',
      };
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify(mockAiResponse),
        },
      });

      const userMessage = 'I want to write a new report.';
      const result = await conversationAnalyzer.analyzeIntent(userMessage);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain(`Current user message: "${userMessage}"`);
      expect(prompt).toContain('Respond in JSON format:');
      expect(prompt).toContain('documentType: ' + Object.values(DOCUMENT_TYPES).join(', ')); // Check constants are in prompt
      expect(result).toEqual(mockAiResponse);
      expect(mockLoggerInfo).toHaveBeenCalledWith('Analyzing document intent with AI', expect.any(Object));
      expect(mockLoggerInfo).toHaveBeenCalledWith('Raw AI response:', expect.any(String));
      expect(mockLoggerInfo).toHaveBeenCalledWith('Intent analysis completed:', expect.any(Object));
    });

    it('should include conversation history in the prompt if provided (last 5 messages)', async () => {
      const mockAiResponse = {
        intent: DOCUMENT_INTENTS.DRAFT,
        confidence: 0.8,
        parameters: { content: 'follow up email' },
        improvementQuestions: [],
        canProceed: true,
        suggestedResponse: 'Drafting a follow-up email.',
      };
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify(mockAiResponse),
        },
      });

      const userMessage = 'Can you draft a follow-up email?';
      const conversationHistory = [
        { role: 'user', content: 'Msg 1' },
        { role: 'assistant', content: 'Msg 2' },
        { role: 'user', content: 'Msg 3' },
        { role: 'assistant', content: 'Msg 4' },
        { role: 'user', content: 'Msg 5' },
        { role: 'assistant', content: 'Msg 6' }, // This one should be included
        { role: 'user', content: 'Msg 7' }, // This one should be included
      ];
      const result = await conversationAnalyzer.analyzeIntent(
        userMessage,
        conversationHistory
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('Recent conversation:');
      expect(prompt).not.toContain('user: Msg 1'); // Should only include last 5
      expect(prompt).toContain('assistant: Msg 4');
      expect(prompt).toContain('user: Msg 5');
      expect(prompt).toContain('assistant: Msg 6');
      expect(prompt).toContain('user: Msg 7');
      expect(prompt).toContain(`Current user message: "${userMessage}"`);
      expect(result).toEqual(mockAiResponse);
    });

    it('should include conversation summary in the prompt if provided (takes precedence over history)', async () => {
      const mockAiResponse = {
        intent: DOCUMENT_INTENTS.DRAFT,
        confidence: 0.95,
        parameters: { content: 'meeting agenda' },
        improvementQuestions: [],
        canProceed: true,
        suggestedResponse: 'Okay, a meeting agenda.',
      };
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify(mockAiResponse),
        },
      });

      const userMessage = 'Let\'s create an agenda for the meeting.';
      const conversationHistory = [{ role: 'user', content: 'Should be ignored' }];
      const conversationSummary = 'User wants to draft a meeting agenda.';
      const result = await conversationAnalyzer.analyzeIntent(
        userMessage,
        conversationHistory,
        {},
        conversationSummary
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain(`Previous conversation summary: ${conversationSummary}`);
      expect(prompt).not.toContain('Recent conversation:'); // Summary takes precedence
      expect(prompt).toContain(`Current user message: "${userMessage}"`);
      expect(result).toEqual(mockAiResponse);
    });

    it('should include existing parameters in the prompt if provided', async () => {
      const mockAiResponse = {
        intent: DOCUMENT_INTENTS.DRAFT,
        confidence: 0.9,
        parameters: {
          content: 'marketing plan',
          documentType: DOCUMENT_TYPES.REPORT,
          tone: TONES.PROFESSIONAL,
        },
        improvementQuestions: [],
        canProceed: true,
        suggestedResponse: 'Drafting a professional marketing plan report.',
      };
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify(mockAiResponse),
        },
      });

      const userMessage = 'Make it a marketing plan.';
      const existingParams = {
        documentType: DOCUMENT_TYPES.REPORT,
        tone: TONES.PROFESSIONAL,
      };
      const result = await conversationAnalyzer.analyzeIntent(
        userMessage,
        [],
        existingParams
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('Previously collected information:');
      expect(prompt).toContain(JSON.stringify(existingParams, null, 2));
      expect(prompt).toContain(`Current user message: "${userMessage}"`);
      expect(result).toEqual(mockAiResponse);
    });

    it('should return fallback analysis if AI response is not JSON', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'This is not a JSON response.',
        },
      });

      const userMessage = 'Write something.';
      const result = await conversationAnalyzer.analyzeIntent(userMessage);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        intent: DOCUMENT_INTENTS.DRAFT,
        confidence: 0.5,
        parameters: { content: userMessage },
        improvementQuestions: expect.any(Array),
        canProceed: true,
        suggestedResponse: expect.any(String),
      });
      expect(mockLoggerError).toHaveBeenCalledWith('Error analyzing intent:', expect.any(Error));
      expect(mockLoggerError.mock.calls[0][1].message).toContain('Failed to extract JSON from AI response');
    });

    it('should return fallback analysis if AI response is malformed JSON', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => '{ "intent": "draft", "confidence": 0.9, "parameters": { "content": "test" ', // Malformed
        },
      });

      const userMessage = 'Write something.';
      const result = await conversationAnalyzer.analyzeIntent(userMessage);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        intent: DOCUMENT_INTENTS.DRAFT,
        confidence: 0.5,
        parameters: { content: userMessage },
        improvementQuestions: expect.any(Array),
        canProceed: true,
        suggestedResponse: expect.any(String),
      });
      expect(mockLoggerError).toHaveBeenCalledWith('Error analyzing intent:', expect.any(Error));
      expect(mockLoggerError.mock.calls[0][1].message).toContain('Unexpected end of JSON input');
    });

    it('should return fallback analysis if generateContent throws an error', async () => {
      const errorMessage = 'AI service unavailable';
      mockGenerateContent.mockRejectedValueOnce(new Error(errorMessage));

      const userMessage = 'Write something.';
      const result = await conversationAnalyzer.analyzeIntent(userMessage);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        intent: DOCUMENT_INTENTS.DRAFT,
        confidence: 0.5,
        parameters: { content: userMessage },
        improvementQuestions: expect.any(Array),
        canProceed: true,
        suggestedResponse: expect.any(String),
      });
      expect(mockLoggerError).toHaveBeenCalledWith('Error analyzing intent:', expect.any(Error));
      expect(mockLoggerError.mock.calls[0][1].message).toContain(errorMessage);
    });

    it('should handle empty user message gracefully with fallback', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'Not a valid JSON', // Simulate AI failing to respond meaningfully
        },
      });

      const userMessage = '';
      const result = await conversationAnalyzer.analyzeIntent(userMessage);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('Current user message: ""');
      expect(result).toEqual({
        intent: DOCUMENT_INTENTS.DRAFT,
        confidence: 0.5,
        parameters: { content: userMessage },
        improvementQuestions: expect.any(Array),
        canProceed: true,
        suggestedResponse: expect.any(String),
      });
    });
  });

  describe('summarizeConversation', () => {
    it('should summarize conversation history and return the summary', async () => {
      const mockAiSummary = 'User wants a report about Q3 sales, focusing on growth.';
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => mockAiSummary,
        },
      });

      const conversationHistory = [
        { role: 'user', content: 'I need a report.' },
        { role: 'assistant', content: 'About what?' },
        { role: 'user', content: 'Q3 sales, specifically growth metrics.' },
      ];
      const collectedParams = { documentType: DOCUMENT_TYPES.REPORT };

      const result = await conversationAnalyzer.summarizeConversation(
        conversationHistory,
        collectedParams
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('Summarize this document drafting conversation concisely');
      expect(prompt).toContain('user: I need a report.');
      expect(prompt).toContain('assistant: About what?');
      expect(prompt).toContain('user: Q3 sales, specifically growth metrics.');
      expect(prompt).toContain(JSON.stringify(collectedParams, null, 2));
      expect(result).toBe(mockAiSummary);
      expect(mockLoggerInfo).toHaveBeenCalledWith('Summarizing conversation', expect.any(Object));
      expect(mockLoggerInfo).toHaveBeenCalledWith('Conversation summarized', expect.any(Object));
    });

    it('should return a fallback string if generateContent throws an error during summarization', async () => {
      const errorMessage = 'AI summarization failed';
      mockGenerateContent.mockRejectedValueOnce(new Error(errorMessage));

      const conversationHistory = [
        { role: 'user', content: 'I need a report.' },
      ];

      const result = await conversationAnalyzer.summarizeConversation(
        conversationHistory
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result).toBe('Previous conversation about document drafting.');
      expect(mockLoggerError).toHaveBeenCalledWith('Error summarizing conversation:', expect.any(Error));
      expect(mockLoggerError.mock.calls[0][1].message).toContain(errorMessage);
    });

    it('should handle empty conversation history for summarization', async () => {
      const mockAiSummary = 'No specific conversation to summarize.';
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => mockAiSummary,
        },
      });

      const conversationHistory = [];
      const collectedParams = {};

      const result = await conversationAnalyzer.summarizeConversation(
        conversationHistory,
        collectedParams
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).not.toContain('Conversation:'); // Should not have messages if history is empty
      expect(prompt).toContain('Collected parameters:\n{}');
      expect(result).toBe(mockAiSummary);
    });
  });

  describe('_calculateConversationTokens', () => {
    it('should calculate estimated tokens for simple messages', () => {
      const conversationHistory = [
        { role: 'user', content: 'Hello world.' },
        { role: 'assistant', content: 'How can I help?' },
      ];
      const params = {};
      const combinedTextLength = ('Hello world. How can I help?'.length + JSON.stringify(params).length);
      const result = conversationAnalyzer._calculateConversationTokens(
        conversationHistory,
        params
      );
      expect(result).toBe(combinedTextLength / 4);
    });

    it('should calculate estimated tokens with parameters', () => {
      const conversationHistory = [
        { role: 'user', content: 'Draft a letter.' },
      ];
      const params = { documentType: DOCUMENT_TYPES.LETTER, tone: TONES.FORMAL };
      const combinedTextLength = ('Draft a letter.'.length + JSON.stringify(params).length);
      const result = conversationAnalyzer._calculateConversationTokens(
        conversationHistory,
        params
      );
      expect(result).toBe(combinedTextLength / 4);
    });

    it('should return correct tokens for empty conversation and parameters', () => {
      const conversationHistory = [];
      const params = {};
      const combinedTextLength = (''.length + JSON.stringify(params).length); // JSON.stringify({}) is "{}", length 2
      const result = conversationAnalyzer._calculateConversationTokens(
        conversationHistory,
        params
      );
      expect(result).toBe(combinedTextLength / 4); // (0 + 2) / 4 = 0.5
    });

    it('should handle long messages and complex parameters', () => {
      const longContent = 'a'.repeat(1000);
      const conversationHistory = [
        { role: 'user', content: longContent },
      ];
      const complexParams = {
        key1: 'value1',
        key2: [1, 2, 3],
        key3: { nested: 'object' },
        longString: 'b'.repeat(500),
      };
      const combinedTextLength = (longContent.length + JSON.stringify(complexParams).length);
      const result = conversationAnalyzer._calculateConversationTokens(
        conversationHistory,
        complexParams
      );
      expect(result).toBe(combinedTextLength / 4);
    });
  });
});