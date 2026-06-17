import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatCodeResponse,
  validateCodeQuery,
  generateConversationTitle,
  extractProgrammingLanguage,
  formatErrorMessage,
} from './code.helper.js';

const {
  mockLogger,
  MOCK_MAX_LENGTH,
  MOCK_TITLE_MAX_LENGTH
} = vi.hoisted(() => {
  // Mock logger
  const mockLogger = {
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockLogger,
    MOCK_MAX_LENGTH: 100,
    MOCK_TITLE_MAX_LENGTH: 20,
  };
});

vi.mock('./code.constant.js', () => ({
  CODE_ASSISTANT_CONSTANTS: {
    MESSAGE: {
      MAX_LENGTH: MOCK_MAX_LENGTH,
    },
    CONVERSATION: {
      TITLE_MAX_LENGTH: MOCK_TITLE_MAX_LENGTH,
    },
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

describe('Code Helper Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatCodeResponse', () => {
    const conversationId = 'conv-123';
    const messageCount = 5;

    it('should parse a valid JSON string response', () => {
      const jsonResponse = JSON.stringify({ code: 'console.log("hello");' });
      const result = formatCodeResponse(jsonResponse, conversationId, messageCount);
      expect(result).toEqual({
        responseMessage: { code: 'console.log("hello");' },
        conversationId,
        messageCount,
      });
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should return a string response if it is not JSON', () => {
      const stringResponse = 'This is a plain string response.';
      const result = formatCodeResponse(stringResponse, conversationId, messageCount);
      expect(result).toEqual({
        responseMessage: stringResponse,
        conversationId,
        messageCount,
      });
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should return a string response if JSON parsing fails and log a warning', () => {
      const malformedJsonResponse = '{ "code": "invalid json", }'; // Malformed JSON
      const result = formatCodeResponse(malformedJsonResponse, conversationId, messageCount);
      expect(result).toEqual({
        responseMessage: malformedJsonResponse,
        conversationId,
        messageCount,
      });
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse code response as JSON, returning as string:',
        expect.any(Error)
      );
    });

    it('should return a string response if it starts and ends with curly braces but is not valid JSON', () => {
      const nonJsonResponse = '{not json}';
      const result = formatCodeResponse(nonJsonResponse, conversationId, messageCount);
      expect(result).toEqual({
        responseMessage: nonJsonResponse,
        conversationId,
        messageCount,
      });
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse code response as JSON, returning as string:',
        expect.any(Error)
      );
    });
  });

  describe('validateCodeQuery', () => {
    it('should return isValid: false for null message', () => {
      const result = validateCodeQuery(null);
      expect(result).toEqual({
        isValid: false,
        error: 'Code query must be a non-empty string',
      });
    });

    it('should return isValid: false for undefined message', () => {
      const result = validateCodeQuery(undefined);
      expect(result).toEqual({
        isValid: false,
        error: 'Code query must be a non-empty string',
      });
    });

    it('should return isValid: false for empty string message', () => {
      const result = validateCodeQuery('');
      expect(result).toEqual({
        isValid: false,
        error: 'Code query must be a non-empty string',
      });
    });

    it('should return isValid: false for non-string message (number)', () => {
      const result = validateCodeQuery(123);
      expect(result).toEqual({
        isValid: false,
        error: 'Code query must be a non-empty string',
      });
    });

    it('should return isValid: false for non-string message (object)', () => {
      const result = validateCodeQuery({});
      expect(result).toEqual({
        isValid: false,
        error: 'Code query must be a non-empty string',
      });
    });

    it('should return isValid: false for message exceeding MAX_LENGTH', () => {
      const longMessage = 'a'.repeat(MOCK_MAX_LENGTH + 1);
      const result = validateCodeQuery(longMessage);
      expect(result).toEqual({
        isValid: false,
        error: `Code query too long. Maximum ${MOCK_MAX_LENGTH} characters allowed`,
      });
    });

    it('should return isValid: true for valid message within MAX_LENGTH', () => {
      const validMessage = 'a'.repeat(MOCK_MAX_LENGTH);
      const result = validateCodeQuery(validMessage);
      expect(result).toEqual({ isValid: true });
    });

    it('should return isValid: true for valid message shorter than MAX_LENGTH', () => {
      const validMessage = 'Hello, world!';
      const result = validateCodeQuery(validMessage);
      expect(result).toEqual({ isValid: true });
    });
  });

  describe('generateConversationTitle', () => {
    it('should prefix with "Code: "', () => {
      const title = generateConversationTitle('create a function');
      expect(title).toMatch(/^Code: /);
    });

    it('should truncate and append "..." if codeQuery is longer than TITLE_MAX_LENGTH', () => {
      const longQuery = 'This is a very long code query that needs to be truncated.'; // Length > MOCK_TITLE_MAX_LENGTH
      const expectedTruncatedPart = longQuery.substring(0, MOCK_TITLE_MAX_LENGTH);
      const title = generateConversationTitle(longQuery);
      expect(title).toBe(`Code: ${expectedTruncatedPart}...`);
      expect(title.length).toBe(`Code: ${expectedTruncatedPart}...`.length);
    });

    it('should not append "..." if codeQuery is shorter than TITLE_MAX_LENGTH', () => {
      const shortQuery = 'Short query'; // Length < MOCK_TITLE_MAX_LENGTH
      const title = generateConversationTitle(shortQuery);
      expect(title).toBe(`Code: ${shortQuery}`);
    });

    it('should not append "..." if codeQuery is exactly TITLE_MAX_LENGTH', () => {
      const exactQuery = 'a'.repeat(MOCK_TITLE_MAX_LENGTH); // Length == MOCK_TITLE_MAX_LENGTH
      const title = generateConversationTitle(exactQuery);
      expect(title).toBe(`Code: ${exactQuery}`);
    });

    it('should handle empty string codeQuery', () => {
      const title = generateConversationTitle('');
      expect(title).toBe('Code: ');
    });
  });

  describe('extractProgrammingLanguage', () => {
    it('should return the language if present (case-insensitive)', () => {
      expect(extractProgrammingLanguage('How to write a javascript function?')).toBe('javascript');
      expect(extractProgrammingLanguage('Python script for data analysis')).toBe('python');
      expect(extractProgrammingLanguage('JAVA spring boot app')).toBe('java');
      expect(extractProgrammingLanguage('Write a React component')).toBe('react');
      expect(extractProgrammingLanguage('SQL query to select all users')).toBe('sql');
    });

    it('should return null if no language is found', () => {
      expect(extractProgrammingLanguage('What is the capital of France?')).toBeNull();
      expect(extractProgrammingLanguage('How to bake a cake?')).toBeNull();
    });

    it('should handle empty string', () => {
      expect(extractProgrammingLanguage('')).toBeNull();
    });

    it('should handle messages with multiple languages (first match)', () => {
      // The order of languages in the helper matters here
      expect(extractProgrammingLanguage('How to integrate Node.js with React?')).toBe('react'); // 'react' comes before 'node' in the list
      expect(extractProgrammingLanguage('Python and Django tutorial')).toBe('python'); // 'python' comes before 'django'
    });

    it('should return the correct language even if it is part of a larger word', () => {
      expect(extractProgrammingLanguage('I need help with my typescript project')).toBe('typescript');
    });
  });

  describe('formatErrorMessage', () => {
    const mockError = new Error('Something went wrong');
    const userMessage = 'Please explain this code';
    const expectedUserFriendlyMessage = 'I apologize, but an error occurred while processing your code request. Please try again or rephrase your question.';

    it('should call logger.error with the error and user message', () => {
      formatErrorMessage(mockError, userMessage);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Code Assistant Error for query: "${userMessage}":`,
        mockError
      );
    });

    it('should return a specific user-friendly error message', () => {
      const result = formatErrorMessage(mockError, userMessage);
      expect(result).toBe(expectedUserFriendlyMessage);
    });
  });
});