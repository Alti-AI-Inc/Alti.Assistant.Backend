import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDeepResearchResponse,
  formatDeepResearchError,
  formatDeepResearchStats,
  formatPDFResponse,
  deepResearchHelpers,
} from './deep_research.helpers.js';

const MOCK_DATE = new Date('2023-11-20T12:00:00.000Z');
const MOCK_ISO_STRING = MOCK_DATE.toISOString();

describe('Deep Research Helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatDeepResearchResponse', () => {
    it('should format a deep research response with all required fields', () => {
      const answer = 'This is the research answer.';
      const conversationId = 'conv-123';
      const messageCount = 5;

      const result = formatDeepResearchResponse(answer, conversationId, messageCount);

      expect(result).toEqual({
        answer: 'This is the research answer.',
        conversationId: 'conv-123',
        messageCount: 5,
      });
    });

    it('should include additional data when provided', () => {
      const answer = 'Another answer.';
      const conversationId = 'conv-456';
      const messageCount = 2;
      const additionalData = {
        sources: ['http://example.com'],
        sentiment: 'positive',
      };

      const result = formatDeepResearchResponse(
        answer,
        conversationId,
        messageCount,
        additionalData
      );

      expect(result).toEqual({
        answer: 'Another answer.',
        conversationId: 'conv-456',
        messageCount: 2,
        sources: ['http://example.com'],
        sentiment: 'positive',
      });
    });

    it('should handle empty additionalData object gracefully', () => {
      const answer = 'Final answer.';
      const conversationId = 'conv-789';
      const messageCount = 10;

      const result = formatDeepResearchResponse(answer, conversationId, messageCount, {});

      expect(result).toEqual({
        answer: 'Final answer.',
        conversationId: 'conv-789',
        messageCount: 10,
      });
      expect(Object.keys(result).length).toBe(3);
    });
  });

  describe('formatDeepResearchError', () => {
    it('should format a deep research error for an authenticated user', () => {
      const error = 'Failed to fetch data.';
      const conversationId = 'conv-err-123';
      const userType = 'authenticated';

      const result = formatDeepResearchError(error, conversationId, userType);

      expect(result).toEqual({
        error: 'Failed to fetch data.',
        conversationId: 'conv-err-123',
        userType: 'authenticated',
        timestamp: MOCK_ISO_STRING,
      });
    });

    it('should format a deep research error for a guest user', () => {
      const error = 'API limit reached.';
      const conversationId = 'conv-err-456';
      const userType = 'guest';

      const result = formatDeepResearchError(error, conversationId, userType);

      expect(result).toEqual({
        error: 'API limit reached.',
        conversationId: 'conv-err-456',
        userType: 'guest',
        timestamp: MOCK_ISO_STRING,
      });
    });

    it('should generate a new timestamp for each call', () => {
      const result1 = formatDeepResearchError('Error 1', 'c1', 'guest');
      expect(result1.timestamp).toBe(MOCK_ISO_STRING);

      const newDate = new Date('2023-11-20T12:00:05.000Z');
      vi.setSystemTime(newDate);

      const result2 = formatDeepResearchError('Error 2', 'c2', 'authenticated');
      expect(result2.timestamp).toBe(newDate.toISOString());
      expect(result2.timestamp).not.toBe(result1.timestamp);
    });
  });

  describe('formatDeepResearchStats', () => {
    it('should format stats when all data is provided', () => {
      const rawStats = {
        totalDeepResearchConversations: 150,
        totalDeepResearchMessages: 750,
        averageMessagesPerConversation: 5,
      };

      const result = formatDeepResearchStats(rawStats);

      expect(result).toEqual({
        totalResearches: 150,
        totalMessages: 750,
        averageMessagesPerResearch: 5,
        lastUpdated: MOCK_ISO_STRING,
      });
    });

    it('should handle missing or partial stats by defaulting to 0', () => {
      const partialStats = {
        totalDeepResearchConversations: 100,
      };

      const result = formatDeepResearchStats(partialStats);

      expect(result).toEqual({
        totalResearches: 100,
        totalMessages: 0,
        averageMessagesPerResearch: 0,
        lastUpdated: MOCK_ISO_STRING,
      });
    });

    it('should handle an empty stats object gracefully', () => {
      const result = formatDeepResearchStats({});

      expect(result).toEqual({
        totalResearches: 0,
        totalMessages: 0,
        averageMessagesPerResearch: 0,
        lastUpdated: MOCK_ISO_STRING,
      });
    });

    it('should handle null or undefined input for stats', () => {
      const resultUndefined = formatDeepResearchStats(undefined);
      const resultNull = formatDeepResearchStats(null);

      const expected = {
        totalResearches: 0,
        totalMessages: 0,
        averageMessagesPerResearch: 0,
        lastUpdated: MOCK_ISO_STRING,
      };

      expect(resultUndefined).toEqual(expected);
      expect(resultNull).toEqual(expected);
    });
  });

  describe('formatPDFResponse', () => {
    it('should format a PDF response with all required data', () => {
      const pdfData = {
        filename: 'research_summary.pdf',
        size: 102400, // 100 KB
        downloadUrl: 'https://example.com/downloads/research_summary.pdf',
      };

      const result = formatPDFResponse(pdfData);

      expect(result).toEqual({
        filename: 'research_summary.pdf',
        size: 102400,
        downloadUrl: 'https://example.com/downloads/research_summary.pdf',
        generatedAt: MOCK_ISO_STRING,
      });
    });

    it('should handle an empty pdfData object gracefully', () => {
      const result = formatPDFResponse({});

      expect(result).toEqual({
        filename: undefined,
        size: undefined,
        downloadUrl: undefined,
        generatedAt: MOCK_ISO_STRING,
      });
    });

    it('should handle null or undefined input for pdfData', () => {
      const resultUndefined = formatPDFResponse(undefined);
      const resultNull = formatPDFResponse(null);

      const expected = {
        filename: undefined,
        size: undefined,
        downloadUrl: undefined,
        generatedAt: MOCK_ISO_STRING,
      };

      expect(resultUndefined).toEqual(expected);
      expect(resultNull).toEqual(expected);
    });
  });

  describe('deepResearchHelpers aggregate object', () => {
    it('should contain all the helper functions', () => {
      expect(deepResearchHelpers).toBeInstanceOf(Object);
      expect(deepResearchHelpers.formatDeepResearchResponse).toBe(formatDeepResearchResponse);
      expect(deepResearchHelpers.formatDeepResearchError).toBe(formatDeepResearchError);
      expect(deepResearchHelpers.formatDeepResearchStats).toBe(formatDeepResearchStats);
      expect(deepResearchHelpers.formatPDFResponse).toBe(formatPDFResponse);
    });
  });
});