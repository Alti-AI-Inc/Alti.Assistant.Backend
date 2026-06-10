import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import { SerperAiController } from './serper.controller.js';

// Mock dependencies
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test_gemini_key',
  },
}));

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  const GoogleGenAI = vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  }));
  return { GoogleGenAI };
});

vi.mock('../../../shared/catchAsync.js', () => ({
  default: vi.fn(fn => fn), // Mock catchAsync to return the function directly
}));

describe('SerperAiController', () => {
  let req;
  let res; // res is not used by the inner function, but we'll define it for completeness
  let consoleErrorSpy;

  beforeEach(() => {
    req = {
      body: {
        prompt: 'What is Vitest?',
      },
    };
    res = {}; // Placeholder
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('SerperAiGetResponse', () => {
    it('should return a search summary and formatted search results on a successful API call', async () => {
      const mockApiResponse = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Vitest is a fast unit testing framework. ' },
                { thought: 'This part is a thought and should be filtered out.' },
                { text: 'It is built on Vite.' },
              ],
            },
            groundingMetadata: {
              groundingChunks: [
                { web: { title: 'Vitest Docs', uri: 'https://vitest.dev' } },
                { web: { title: 'Getting Started with Vitest', uri: 'https://example.com/vitest' } },
                { web: { title: 'Why Vitest is Fast', uri: 'https://blog.example.com/speed' } },
                { web: { title: 'Fourth Result (should be ignored)', uri: 'https://ignored.com' } },
              ],
            },
          },
        ],
      };
      mockGenerateContent.mockResolvedValue(mockApiResponse);

      const result = await SerperAiController.SerperAiGetResponse(req, res);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: `Search the web for: ${req.body.prompt}`,
        config: {
          temperature: 0.1,
          tools: [{ googleSearch: {} }],
        },
      });

      const expectedSummary = 'Vitest is a fast unit testing framework. It is built on Vite.';
      expect(result.searchSummary).toBe(expectedSummary);
      expect(result.formattedSearchResults).toHaveLength(3);
      expect(result.formattedSearchResults).toEqual([
        {
          title: 'Vitest Docs',
          link: 'https://vitest.dev',
          snippet: expectedSummary.substring(0, 200),
          position: 1,
        },
        {
          title: 'Getting Started with Vitest',
          link: 'https://example.com/vitest',
          snippet: expectedSummary.substring(0, 200),
          position: 2,
        },
        {
          title: 'Why Vitest is Fast',
          link: 'https://blog.example.com/speed',
          snippet: expectedSummary.substring(0, 200),
          position: 3,
        },
      ]);
    });

    it('should handle API responses with no candidates', async () => {
      mockGenerateContent.mockResolvedValue({ candidates: [] });

      const result = await SerperAiController.SerperAiGetResponse(req, res);

      expect(result.searchSummary).toBe('');
      expect(result.formattedSearchResults).toEqual([]);
    });

    it('should handle API responses with no grounding metadata', async () => {
      const mockApiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'A simple answer without sources.' }],
            },
            groundingMetadata: {},
          },
        ],
      };
      mockGenerateContent.mockResolvedValue(mockApiResponse);

      const result = await SerperAiController.SerperAiGetResponse(req, res);

      expect(result.searchSummary).toBe('A simple answer without sources.');
      expect(result.formattedSearchResults).toEqual([]);
    });

    it('should handle API responses with missing web details in grounding chunks', async () => {
      const mockApiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Answer with partial sources.' }],
            },
            groundingMetadata: {
              groundingChunks: [
                { web: { title: 'Complete Source', uri: 'https://complete.com' } },
                { web: { title: 'Source without URI' } },
                { web: {} },
              ],
            },
          },
        ],
      };
      mockGenerateContent.mockResolvedValue(mockApiResponse);

      const result = await SerperAiController.SerperAiGetResponse(req, res);

      expect(result.searchSummary).toBe('Answer with partial sources.');
      expect(result.formattedSearchResults).toHaveLength(3);
      expect(result.formattedSearchResults).toEqual([
        {
          title: 'Complete Source',
          link: 'https://complete.com',
          snippet: 'Answer with partial sources.'.substring(0, 200),
          position: 1,
        },
        {
          title: 'Source without URI',
          link: '',
          snippet: 'Answer with partial sources.'.substring(0, 200),
          position: 2,
        },
        {
          title: 'Result 3',
          link: '',
          snippet: 'Answer with partial sources.'.substring(0, 200),
          position: 3,
        },
      ]);
    });

    it('should return an empty result and log an error when the API call fails', async () => {
      const apiError = new Error('API request failed');
      mockGenerateContent.mockRejectedValue(apiError);

      const result = await SerperAiController.SerperAiGetResponse(req, res);

      expect(result).toEqual({
        searchSummary: '',
        formattedSearchResults: [],
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching Google Search Grounding results:',
        apiError
      );
    });

    it('should handle a request with no prompt in the body', async () => {
      req.body.prompt = undefined;
      mockGenerateContent.mockResolvedValue({ candidates: [] });

      await SerperAiController.SerperAiGetResponse(req, res);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'Search the web for: undefined',
        })
      );
    });

    it('should handle an API response with no text parts in the content', async () => {
      const mockApiResponse = {
        candidates: [
          {
            content: {
              parts: [{ thought: 'Only thoughts, no text.' }],
            },
            groundingMetadata: {},
          },
        ],
      };
      mockGenerateContent.mockResolvedValue(mockApiResponse);

      const result = await SerperAiController.SerperAiGetResponse(req, res);

      expect(result.searchSummary).toBe('');
      expect(result.formattedSearchResults).toEqual([]);
    });
  });
});