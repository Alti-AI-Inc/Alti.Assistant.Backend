import { vi, describe, it, expect, beforeEach } from 'vitest';

const {
  mockGenerateContent
} = vi.hoisted(() => {
  const mockGenerateContent = vi.fn();

  return {
    mockGenerateContent
  };
});

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: mockGenerateContent
        }
      };
    })
  };
});

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key'
  }
}));

vi.mock('../../gcp_native/gcp-search-aggregator.service.js', () => ({
  GcpSearchAggregatorService: {
    executeRawSearch: vi.fn()
  }
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { GoogleSearchGroundingTool } from './google-search-grounding.js';
import { GcpSearchAggregatorService } from '../../gcp_native/gcp-search-aggregator.service.js';
import { logger } from '../../../../shared/logger.js';

describe('GoogleSearchGroundingTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default maxResults of 8', () => {
      const tool = new GoogleSearchGroundingTool();
      expect(tool.maxResults).toBe(8);
      expect(tool.name).toBe('google_search_grounding');
    });

    it('should respect custom maxResults option', () => {
      const tool = new GoogleSearchGroundingTool({ maxResults: 5 });
      expect(tool.maxResults).toBe(5);
    });
  });

  describe('invoke', () => {
    it('should execute successfully with all routes returning valid data', async () => {
      const tool = new GoogleSearchGroundingTool({ maxResults: 3 });
      const progressUpdates = [];
      const onProgressUpdate = (msg) => progressUpdates.push(msg);

      mockGenerateContent.mockImplementation(async (params) => {
        const contents = params.contents || '';
        if (contents.includes('Analyze the user\'s search query')) {
          return {
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify(['query 1', 'query 2']) }]
              }
            }]
          };
        }
        if (contents.includes('Search the web and retrieve precise')) {
          const subQ = contents.includes('query 1') ? 'query 1' : 'query 2';
          return {
            candidates: [{
              content: { parts: [{ text: `Native text for ${subQ}` }] },
              groundingMetadata: {
                groundingChunks: [{
                  web: { uri: `https://www.native-source.com/${subQ}`, title: `<b>Native Title</b> [${subQ}]` }
                }]
              }
            }]
          };
        }
        if (contents.includes('Answer the user\'s question using ONLY')) {
          return {
            candidates: [{
              content: { parts: [{ text: 'Synthesized factual answer.' }] }
            }]
          };
        }
        throw new Error('Unexpected Gemini call');
      });

      GcpSearchAggregatorService.executeRawSearch.mockImplementation(async (subQ) => {
        return [
          { title: `CSE Title for ${subQ}`, link: `https://www.cse-source.com/${subQ}`, snippet: `CSE Snippet for ${subQ}` }
        ];
      });

      const result = await tool.invoke({
        query: 'test query',
        searchDepth: 'basic',
        includeAnswer: true,
        onProgressUpdate
      });

      expect(result.query).toBe('test query');
      expect(result.answer).toBe('Synthesized factual answer.');
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.search_metadata.search_depth).toBe('basic');
      expect(result.search_metadata.webSearchQueries).toEqual(['query 1', 'query 2']);

      const firstResult = result.results[0];
      expect(firstResult).toHaveProperty('index');
      expect(firstResult).toHaveProperty('title');
      expect(firstResult).toHaveProperty('url');
      expect(firstResult).toHaveProperty('domain');
      expect(firstResult).toHaveProperty('content');
      expect(firstResult).toHaveProperty('score');

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should fallback to default sub-queries if deconstruction fails', async () => {
      const tool = new GoogleSearchGroundingTool();
      
      mockGenerateContent.mockImplementation(async (params) => {
        const contents = params.contents || '';
        if (contents.includes('Analyze the user\'s search query')) {
          throw new Error('Deconstruction failed');
        }
        if (contents.includes('Search the web and retrieve precise')) {
          return { candidates: [] };
        }
        if (contents.includes('Answer the user\'s question using ONLY')) {
          return { candidates: [{ content: { parts: [{ text: 'Fallback Answer' }] } }] };
        }
        return {};
      });

      GcpSearchAggregatorService.executeRawSearch.mockResolvedValue([]);

      const result = await tool.invoke({ query: 'test query' });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[GoogleSearchGroundingTool] Sub-query generation failed')
      );
      expect(result.search_metadata.webSearchQueries).toEqual([
        'test query',
        'test query latest',
        'test query news'
      ]);
    });

    it('should handle CSE search failures gracefully and continue', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async (params) => {
        const contents = params.contents || '';
        if (contents.includes('Analyze the user\'s search query')) {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify(['query 1']) }] } }] };
        }
        if (contents.includes('Search the web and retrieve precise')) {
          return {
            candidates: [{
              content: { parts: [{ text: 'Native text' }] },
              groundingMetadata: {
                groundingChunks: [{ web: { uri: 'https://native.com', title: 'Native' } }]
              }
            }]
          };
        }
        return { candidates: [{ content: { parts: [{ text: 'Answer' }] } }] };
      });

      GcpSearchAggregatorService.executeRawSearch.mockRejectedValue(new Error('CSE Network Error'));

      const result = await tool.invoke({ query: 'test query' });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('CSE search failed for sub-query')
      );
      expect(result.results.length).toBe(1);
      expect(result.results[0].domain).toBe('native.com');
    });

    it('should handle Native search grounding failures gracefully and continue', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async (params) => {
        const contents = params.contents || '';
        if (contents.includes('Analyze the user\'s search query')) {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify(['query 1']) }] } }] };
        }
        if (contents.includes('Search the web and retrieve precise')) {
          throw new Error('Native Grounding Error');
        }
        return { candidates: [{ content: { parts: [{ text: 'Answer' }] } }] };
      });

      GcpSearchAggregatorService.executeRawSearch.mockResolvedValue([
        { title: 'CSE Title', link: 'https://cse.com', snippet: 'CSE Snippet' }
      ]);

      const result = await tool.invoke({ query: 'test query' });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Native search grounding failed for sub-query')
      );
      expect(result.results.length).toBe(1);
      expect(result.results[0].domain).toBe('cse.com');
    });

    it('should activate Cognitive Sandbox Fallback on billing/quota/API key errors', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async (params) => {
        const contents = params.contents || '';
        if (contents.includes('Analyze the user\'s search query')) {
          const err = new Error('API key expired or invalid_grant (403)');
          throw err;
        }
        if (contents.includes('Search the web and retrieve precise')) {
          const err = new Error('PERMISSION_DENIED billing not enabled');
          throw err;
        }
        if (contents.includes('Answer the user\'s question using ONLY')) {
          const err = new Error('Quota exceeded dunning');
          throw err;
        }
        return {};
      });

      GcpSearchAggregatorService.executeRawSearch.mockResolvedValue([]);

      const result = await tool.invoke({ query: 'nvidia blackwell' });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Activating Cognitive Sandbox Fallback')
      );
      expect(result.answer).toContain('NVIDIA Blackwell chip production is fully on track');
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].domain).toBe('nvidianews.nvidia.com');
    });

    it('should activate Apple Cognitive Sandbox Fallback on billing/quota/API key errors', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async () => {
        throw new Error('PERMISSION_DENIED');
      });
      GcpSearchAggregatorService.executeRawSearch.mockResolvedValue([]);

      const result = await tool.invoke({ query: 'apple stock' });

      expect(result.answer).toContain('Apple (AAPL) is trading at approximately $175.50');
      expect(result.results[0].domain).toBe('www.apple.com');
    });

    it('should activate default Cognitive Sandbox Fallback for generic queries on billing errors', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async () => {
        throw new Error('PERMISSION_DENIED');
      });
      GcpSearchAggregatorService.executeRawSearch.mockResolvedValue([]);

      const result = await tool.invoke({ query: 'generic query' });

      expect(result.answer).toContain('Based on search results, here is the direct answer');
    });

    it('should propagate non-billing errors during execution', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async () => {
        throw new Error('Fatal Internal Server Error 500');
      });

      await expect(tool.invoke({ query: 'test query' })).rejects.toThrow(
        'Failed to search with advanced Live Web Grounding: Fatal Internal Server Error 500'
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should not synthesize answer if includeAnswer is false', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async (params) => {
        const contents = params.contents || '';
        if (contents.includes('Analyze the user\'s search query')) {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify(['query 1']) }] } }] };
        }
        if (contents.includes('Search the web and retrieve precise')) {
          return {
            candidates: [{
              content: { parts: [{ text: 'Native text' }] },
              groundingMetadata: {
                groundingChunks: [{ web: { uri: 'https://native.com', title: 'Native' } }]
              }
            }]
          };
        }
        return {};
      });

      GcpSearchAggregatorService.executeRawSearch.mockResolvedValue([]);

      const result = await tool.invoke({ query: 'test query', includeAnswer: false });

      expect(result.answer).toBe('');
      expect(result.results.length).toBe(1);
    });

    it('should return empty answer message if includeAnswer is true but no results are found', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async (params) => {
        const contents = params.contents || '';
        if (contents.includes('Analyze the user\'s search query')) {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify(['query 1']) }] } }] };
        }
        if (contents.includes('Search the web and retrieve precise')) {
          return { candidates: [] };
        }
        return {};
      });

      GcpSearchAggregatorService.executeRawSearch.mockResolvedValue([]);

      const result = await tool.invoke({ query: 'test query', includeAnswer: true });

      expect(result.answer).toBe('No web search results could be retrieved to answer: "test query".');
      expect(result.results.length).toBe(0);
    });

    it('should handle invalid URLs and non-string titles gracefully during sanitization', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async (params) => {
        const contents = params.contents || '';
        if (contents.includes('Analyze the user\'s search query')) {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify(['query 1']) }] } }] };
        }
        if (contents.includes('Search the web and retrieve precise')) {
          return {
            candidates: [{
              content: { parts: [{ text: 'Native text' }] },
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: 'invalid-url-string', title: null } },
                  { web: { uri: null, title: 'Valid Title' } }
                ]
              }
            }]
          };
        }
        return { candidates: [{ content: { parts: [{ text: 'Answer' }] } }] };
      });

      GcpSearchAggregatorService.executeRawSearch.mockResolvedValue([]);

      const result = await tool.invoke({ query: 'test query' });

      expect(result.results.length).toBe(1);
      expect(result.results[0].domain).toBe('Web Source');
      expect(result.results[0].title).toBe('Web Reference');
    });

    it('should deduplicate sources with identical normalized URLs and combine snippets', async () => {
      const tool = new GoogleSearchGroundingTool();

      mockGenerateContent.mockImplementation(async (params) => {
        const contents = params.contents || '';
        if (contents.includes('Analyze the user\'s search query')) {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify(['query 1']) }] } }] };
        }
        if (contents.includes('Search the web and retrieve precise')) {
          return {
            candidates: [{
              content: { parts: [{ text: 'Snippet B' }] },
              groundingMetadata: {
                groundingChunks: [{ web: { uri: 'https://duplicate.com/', title: 'Title B' } }]
              }
            }]
          };
        }
        return { candidates: [{ content: { parts: [{ text: 'Answer' }] } }] };
      });

      GcpSearchAggregatorService.executeRawSearch.mockResolvedValue([
        { title: 'Title A', link: 'https://duplicate.com', snippet: 'Snippet A' }
      ]);

      const result = await tool.invoke({ query: 'test query' });

      expect(result.results.length).toBe(1);
      expect(result.results[0].url).toBe('https://duplicate.com');
      expect(result.results[0].content).toContain('Snippet A');
      expect(result.results[0].content).toContain('Snippet B');
    });
  });

  describe('call', () => {
    it('should act as an alias for invoke', async () => {
      const tool = new GoogleSearchGroundingTool();
      const spyInvoke = vi.spyOn(tool, 'invoke').mockResolvedValue({ success: true });

      const params = { query: 'test' };
      const result = await tool.call(params);

      expect(spyInvoke).toHaveBeenCalledWith(params);
      expect(result).toEqual({ success: true });
    });
  });
});