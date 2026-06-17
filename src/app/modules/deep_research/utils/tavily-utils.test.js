import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { GcpSearchAggregatorService } from '../../gcp_native/gcp-search-aggregator.service.js';
import { logger } from '../../../../shared/logger.js';

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

// Mock external dependencies
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = {
        generateContent: mockGenerateContent,
      };
    }
  },
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
  },
}));
vi.mock('../../gcp_native/gcp-search-aggregator.service.js');
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import the module after mocks are set up
const { GoogleSearchGroundingTool, TavilySearchTool } = await import('./tavily-utils.js');

describe('tavily-utils', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockGenerateContent.mockReset();
  });

  // Helper functions are not exported, but they are used internally.
  // We can test them indirectly through the main class, or if they were exported, directly.
  // For this exercise, I'll assume they are internal and focus on the exported class.
  // However, if they were exported, they would be tested like this:

  describe('Internal Helper Functions (simulated export for testing)', () => {
    let sanitizeTitle, getDomainFromUrl, callGeminiWithResilience;

    beforeAll(async () => {
      const module = await import('./tavily-utils.js');
      sanitizeTitle = module.sanitizeTitle;
      getDomainFromUrl = module.getDomainFromUrl;
      callGeminiWithResilience = module.callGeminiWithResilience;
    });

    describe('sanitizeTitle', () => {
      it('should strip HTML tags', () => {
        expect(sanitizeTitle('<b>Hello</b> World')).toBe('Hello World');
        expect(sanitizeTitle('<div>Test</div><p>Paragraph</p>')).toBe('TestParagraph');
        expect(sanitizeTitle('No HTML here')).toBe('No HTML here');
      });

      it('should strip square brackets', () => {
        expect(sanitizeTitle('Title [Citation]')).toBe('Title Citation');
        expect(sanitizeTitle('[Another] Title')).toBe('Another Title');
        expect(sanitizeTitle('No brackets')).toBe('No brackets');
      });

      it('should strip both HTML and square brackets', () => {
        expect(sanitizeTitle('<b>[Important]</b> Info')).toBe('Important Info');
        expect(sanitizeTitle('<div>[Source 1]</div>')).toBe('Source 1');
      });

      it('should trim whitespace', () => {
        expect(sanitizeTitle('  Hello World  ')).toBe('Hello World');
        expect(sanitizeTitle(' <b>Test</b> ')).toBe('Test');
      });

      it('should return empty string for invalid inputs', () => {
        expect(sanitizeTitle(null)).toBe('');
        expect(sanitizeTitle(undefined)).toBe('');
        expect(sanitizeTitle(123)).toBe('');
        expect(sanitizeTitle({})).toBe('');
        expect(sanitizeTitle('')).toBe('');
      });
    });

    describe('getDomainFromUrl', () => {
      it('should extract clean domain from valid URLs', () => {
        expect(getDomainFromUrl('https://www.example.com/path')).toBe('example.com');
        expect(getDomainFromUrl('http://example.org')).toBe('example.org');
        expect(getDomainFromUrl('https://sub.domain.co.uk/page?id=1')).toBe('sub.domain.co.uk');
        expect(getDomainFromUrl('ftp://ftp.test.net')).toBe('Web Source'); // URL constructor doesn't handle ftp as expected for hostname
      });

      it('should return "Web Source" for invalid URLs', () => {
        expect(getDomainFromUrl('invalid-url')).toBe('Web Source');
        expect(getDomainFromUrl('example.com')).toBe('Web Source'); // Needs protocol
        expect(getDomainFromUrl(null)).toBe('Web Source');
        expect(getDomainFromUrl(undefined)).toBe('Web Source');
        expect(getDomainFromUrl(123)).toBe('Web Source');
        expect(getDomainFromUrl('')).toBe('Web Source');
      });
    });

    describe('callGeminiWithResilience', () => {
      const mockFallback = vi.fn(() => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Fallback response' }] } }]
      }));

      beforeEach(() => {
        mockFallback.mockClear();
      });

      it('should return Gemini response on success', async () => {
        const geminiResponse = { candidates: [{ content: { parts: [{ text: 'Gemini success' }] } }] };
        mockGenerateContent.mockResolvedValueOnce(geminiResponse);

        const result = await callGeminiWithResilience({ model: 'gemini-pro', contents: 'test' }, mockFallback);

        expect(result).toEqual(geminiResponse);
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
        expect(mockFallback).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should call fallback for billing/API key errors', async () => {
        const errorMessages = [
          'dunning',
          '403',
          'API key is invalid',
          'invalid_grant',
          'PERMISSION_DENIED',
        ];

        for (const msg of errorMessages) {
          mockGenerateContent.mockClear(); // Reset mock call counts
          mockGenerateContent.mockRejectedValueOnce(new Error(msg));
          mockFallback.mockClear(); // Clear for each iteration

          const result = await callGeminiWithResilience({ model: 'gemini-pro', contents: 'test' }, mockFallback);

          expect(result).toEqual({ candidates: [{ content: { parts: [{ text: 'Fallback response' }] } }] });
          expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Called once per iteration
          expect(mockFallback).toHaveBeenCalledTimes(1);
          expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Activating Cognitive Sandbox Fallback.'));
          logger.warn.mockClear(); // Clear for next iteration
        }
      });

      it('should rethrow for non-billing/API key errors', async () => {
        const networkError = new Error('fetch failed');
        mockGenerateContent.mockRejectedValueOnce(networkError);

        await expect(callGeminiWithResilience({ model: 'gemini-pro', contents: 'test' }, mockFallback))
          .rejects.toThrow('fetch failed');

        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
        expect(mockFallback).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      });
    });
  });

  describe('GoogleSearchGroundingTool', () => {
    let tool;

    beforeEach(() => {
      tool = new GoogleSearchGroundingTool();
      // Reset mocks for the tool's internal calls
      mockGenerateContent.mockReset();
      GcpSearchAggregatorService.executeRawSearch.mockReset();
      logger.info.mockReset();
      logger.warn.mockReset();
      logger.error.mockReset();
    });

    it('should have correct name and description', () => {
      expect(tool.name).toBe('google_search_grounding');
      expect(tool.description).toBe('Search the web using Google Search Grounding and Custom Search APIs for real-time information');
    });

    it('should set maxResults from options or default to 8', () => {
      const defaultTool = new GoogleSearchGroundingTool();
      expect(defaultTool.maxResults).toBe(8);

      const customTool = new GoogleSearchGroundingTool({ maxResults: 5 });
      expect(customTool.maxResults).toBe(5);
    });

    describe('invoke', () => {
      const mockCseResult = [{
        title: 'CSE Result Title',
        link: 'https://cse.example.com/page',
        snippet: 'This is a snippet from CSE.',
      }];

      const mockGeminiGroundingResult = {
        candidates: [{
          content: { parts: [{ text: 'Gemini grounding text.' }] },
          groundingMetadata: {
            groundingChunks: [{
              web: {
                uri: 'https://gemini.example.com/doc',
                title: 'Gemini Grounding Title',
              },
            }],
          },
        }],
      };

      const mockGeminiDeconstructResponse = {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify(['query 1', 'query 2']) }]
          }
        }]
      };

      const mockGeminiSynthesisResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Synthesized answer based on sources.' }]
          }
        }]
      };

      it('should perform a full search, deconstruct, ground, and synthesize an answer', async () => {
        mockGenerateContent
          .mockResolvedValueOnce(mockGeminiDeconstructResponse) // For query deconstruction
          .mockResolvedValueOnce(mockGeminiGroundingResult) // For first sub-query grounding
          .mockResolvedValueOnce(mockGeminiGroundingResult) // For second sub-query grounding
          .mockResolvedValueOnce(mockGeminiSynthesisResponse); // For answer synthesis

        GcpSearchAggregatorService.executeRawSearch
          .mockResolvedValueOnce(mockCseResult) // For first sub-query CSE
          .mockResolvedValueOnce(mockCseResult); // For second sub-query CSE

        const onProgressUpdate = vi.fn();
        const query = 'test query';

        const result = await tool.invoke({ query, onProgressUpdate });

        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Running advanced search grounding for: "${query}"`));
        expect(onProgressUpdate).toHaveBeenCalledWith('Deconstructing query into multi-turn search strategies...');
        expect(onProgressUpdate).toHaveBeenCalledWith(expect.stringContaining('Searching concurrently for:'));
        expect(onProgressUpdate).toHaveBeenCalledWith(expect.stringContaining('Consolidated 2 pristine web citations.'));

        expect(mockGenerateContent).toHaveBeenCalledTimes(4); // Deconstruct, 2x grounding, synthesis
        expect(GcpSearchAggregatorService.executeRawSearch).toHaveBeenCalledTimes(2); // 2x CSE

        expect(result.query).toBe(query);
        expect(result.answer).toBe('Synthesized answer based on sources.');
        expect(result.results).toHaveLength(2); // 2 unique sources (CSE + Gemini)
        expect(result.results[0].title).toBe('CSE Result Title');
        expect(result.results[0].domain).toBe('cse.example.com');
        expect(result.results[1].title).toBe('Gemini Grounding Title');
        expect(result.results[1].domain).toBe('gemini.example.com');
        expect(result.search_metadata.webSearchQueries).toEqual(['query 1', 'query 2']);
        expect(result.search_metadata.total_results).toBe(2);
      });

      it('should handle query deconstruction failure gracefully with fallback', async () => {
        mockGenerateContent
          .mockRejectedValueOnce(new Error('Deconstruct failed')) // Deconstruction fails
          .mockResolvedValueOnce(mockGeminiGroundingResult) // For first sub-query grounding
          .mockResolvedValueOnce(mockGeminiGroundingResult) // For second sub-query grounding
          .mockResolvedValueOnce(mockGeminiSynthesisResponse); // For answer synthesis

        GcpSearchAggregatorService.executeRawSearch
          .mockResolvedValueOnce(mockCseResult)
          .mockResolvedValueOnce(mockCseResult);

        const query = 'test query';
        const result = await tool.invoke({ query });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sub-query generation failed, using fallback: Deconstruct failed'));
        expect(result.search_metadata.webSearchQueries).toEqual([query, `${query} latest`, `${query} news`]);
      });

      it('should handle search failures (CSE and Native Grounding) gracefully', async () => {
        mockGenerateContent
          .mockResolvedValueOnce(mockGeminiDeconstructResponse) // Deconstruct
          .mockRejectedValueOnce(new Error('Native grounding failed')) // First grounding fails
          .mockResolvedValueOnce(mockGeminiGroundingResult) // Second grounding succeeds
          .mockResolvedValueOnce(mockGeminiSynthesisResponse); // Synthesis

        GcpSearchAggregatorService.executeRawSearch
          .mockRejectedValueOnce(new Error('CSE failed')) // First CSE fails
          .mockResolvedValueOnce(mockCseResult); // Second CSE succeeds

        const query = 'test query';
        const result = await tool.invoke({ query });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('CSE search failed for sub-query "query 1": CSE failed'));
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Native search grounding failed for sub-query "query 1": Native grounding failed'));
        expect(result.results).toHaveLength(2); // Collected from both CSE and Native Grounding on second sub-query
        expect(result.results[0].title).toBe('CSE Result Title');
        expect(result.results[1].title).toBe('Gemini Grounding Title');
      });

      it('should return "No web search results" if no results are found and includeAnswer is true', async () => {
        mockGenerateContent
          .mockResolvedValueOnce(mockGeminiDeconstructResponse) // Deconstruct
          .mockRejectedValueOnce(new Error('Native grounding failed')) // All grounding fails
          .mockRejectedValueOnce(new Error('Native grounding failed'))
          .mockResolvedValueOnce(mockGeminiSynthesisResponse); // Synthesis (won't be called if no results)

        GcpSearchAggregatorService.executeRawSearch
          .mockResolvedValueOnce([]) // All CSE returns empty
          .mockResolvedValueOnce([]);

        const query = 'test query';
        const result = await tool.invoke({ query, includeAnswer: true });

        expect(result.results).toHaveLength(0);
        expect(result.answer).toBe(`No web search results could be retrieved to answer: "${query}".`);
        expect(mockGenerateContent).toHaveBeenCalledTimes(3); // Deconstruct, 2x grounding. Synthesis not called.
      });

      it('should not synthesize an answer if includeAnswer is false', async () => {
        mockGenerateContent
          .mockResolvedValueOnce(mockGeminiDeconstructResponse) // Deconstruct
          .mockResolvedValueOnce(mockGeminiGroundingResult) // Grounding
          .mockResolvedValueOnce(mockGeminiGroundingResult); // Grounding

        GcpSearchAggregatorService.executeRawSearch
          .mockResolvedValueOnce(mockCseResult)
          .mockResolvedValueOnce(mockCseResult);

        const query = 'test query';
        const result = await tool.invoke({ query, includeAnswer: false });

        expect(mockGenerateContent).toHaveBeenCalledTimes(3); // Deconstruct, 2x grounding. Synthesis NOT called.
        expect(result.answer).toBe('');
        expect(result.results).toHaveLength(2);
      });

      it('should use fallback for Gemini grounding when billing/API error occurs', async () => {
        mockGenerateContent
          .mockResolvedValueOnce({
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify(['NVIDIA Blackwell GPU', 'Blackwell release date']) }]
              }
            }]
          }) // Deconstruct with nvidia/blackwell query terms
          .mockRejectedValueOnce(new Error('403 Forbidden')) // First grounding fails with billing error
          .mockResolvedValueOnce(mockGeminiGroundingResult) // Second grounding succeeds
          .mockResolvedValueOnce(mockGeminiSynthesisResponse); // Synthesis

        GcpSearchAggregatorService.executeRawSearch
          .mockResolvedValueOnce(mockCseResult)
          .mockResolvedValueOnce(mockCseResult);

        const query = 'NVIDIA Blackwell'; // Trigger specific fallback
        const result = await tool.invoke({ query });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[GoogleSearchGroundingTool] Gemini call failed: "403 Forbidden". Activating Cognitive Sandbox Fallback.'));
        expect(result.results).toHaveLength(3); // One fallback (NVIDIA), one CSE 1, one CSE 2/Gemini Grounding (unique)
        expect(result.results[0].title).toBe('NVIDIA Newsroom - Blackwell Architecture Updates');
        expect(result.results[0].domain).toBe('nvidianews.nvidia.com');
      });

      it('should use fallback for Gemini synthesis when billing/API error occurs', async () => {
        mockGenerateContent
          .mockResolvedValueOnce(mockGeminiDeconstructResponse) // Deconstruct
          .mockResolvedValueOnce(mockGeminiGroundingResult) // Grounding
          .mockResolvedValueOnce(mockGeminiGroundingResult) // Grounding
          .mockRejectedValueOnce(new Error('API key invalid')); // Synthesis fails with billing error

        GcpSearchAggregatorService.executeRawSearch
          .mockResolvedValueOnce(mockCseResult)
          .mockResolvedValueOnce(mockCseResult);

        const query = 'Apple stock price'; // Trigger specific fallback
        const result = await tool.invoke({ query });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[GoogleSearchGroundingTool] Gemini call failed: "API key invalid". Activating Cognitive Sandbox Fallback.'));
        expect(result.answer).toBe('Apple (AAPL) is trading at approximately $210. Recent announcements feature Apple Intelligence integrations across iOS 18, iPadOS 18, and macOS Sequoia.');
      });

      it('should throw an error if a critical failure occurs', async () => {
        mockGenerateContent
          .mockResolvedValueOnce(mockGeminiDeconstructResponse) // Deconstruct succeeds
          .mockResolvedValueOnce(mockGeminiGroundingResult) // Grounding 1 succeeds
          .mockResolvedValueOnce(mockGeminiGroundingResult) // Grounding 2 succeeds
          .mockRejectedValueOnce(new Error('Critical network error')); // Synthesis fails critically

        GcpSearchAggregatorService.executeRawSearch
          .mockResolvedValueOnce(mockCseResult)
          .mockResolvedValueOnce(mockCseResult);

        const query = 'test query';
        await expect(tool.invoke({ query })).rejects.toThrow('Failed to search with advanced Google Search Grounding: Critical network error');
        expect(logger.error).toHaveBeenCalledWith('[GoogleSearchGroundingTool] Execution Error:', expect.any(Error));
      });

      it('should deduplicate results based on normalized URL', async () => {
        const duplicateCseResult = [{
          title: 'Duplicate Title',
          link: 'https://example.com/page/', // Trailing slash
          snippet: 'Snippet 1',
        }];
        const duplicateGeminiResult = {
          candidates: [{
            content: { parts: [{ text: 'Gemini text.' }] },
            groundingMetadata: {
              groundingChunks: [{
                web: {
                  uri: 'https://www.example.com/page', // www prefix, no trailing slash
                  title: 'Duplicate Title',
                },
              }],
            },
          }],
        };

        mockGenerateContent
          .mockResolvedValueOnce(mockGeminiDeconstructResponse) // Deconstruct
          .mockResolvedValueOnce(duplicateGeminiResult) // Grounding 1
          .mockResolvedValueOnce(mockGeminiSynthesisResponse); // Synthesis

        GcpSearchAggregatorService.executeRawSearch
          .mockResolvedValueOnce(duplicateCseResult); // CSE 1

        const query = 'test query';
        const result = await tool.invoke({ query });

        expect(result.results).toHaveLength(1); // Should be deduplicated to 1 unique source
        expect(result.results[0].title).toBe('Duplicate Title');
        expect(result.results[0].domain).toBe('example.com');
        expect(result.results[0].content).toContain('Snippet 1');
        expect(result.results[0].content).toContain('Gemini text.');
      });

      it('should limit results to maxResults', async () => {
        tool = new GoogleSearchGroundingTool({ maxResults: 1 }); // Set maxResults to 1

        const manyCseResults = Array(5).fill(0).map((_, i) => ({
          title: `CSE Result ${i}`,
          link: `https://cse.example.com/page${i}`,
          snippet: `Snippet ${i}`,
        }));

        mockGenerateContent
          .mockResolvedValueOnce(mockGeminiDeconstructResponse) // Deconstruct
          .mockResolvedValueOnce(mockGeminiSynthesisResponse); // Synthesis

        GcpSearchAggregatorService.executeRawSearch
          .mockResolvedValueOnce(manyCseResults); // CSE returns 5 results

        const query = 'test query';
        const result = await tool.invoke({ query });

        expect(result.results).toHaveLength(1);
        expect(result.results[0].title).toBe('CSE Result 0'); // Assuming sorting keeps the first
      });
    });

    describe('call', () => {
      it('should be an alias for invoke', async () => {
        const invokeSpy = vi.spyOn(tool, 'invoke');
        const params = { query: 'test' };
        await tool.call(params);
        expect(invokeSpy).toHaveBeenCalledWith(params);
        invokeSpy.mockRestore();
      });
    });
  });

  describe('TavilySearchTool alias', () => {
    it('should be the same as GoogleSearchGroundingTool', () => {
      expect(TavilySearchTool).toBe(GoogleSearchGroundingTool);
    });
  });
});