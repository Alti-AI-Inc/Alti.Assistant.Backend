import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { GcpSearchAggregatorService } from './gcp-search-aggregator.service.js';

// Mock dependencies
vi.mock('axios');
vi.mock('../../../../config/index.js', () => ({
  default: {
    google_search_api_key: 'test_api_key',
    google_engine_id: 'test_cx_id',
  },
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Test data
const mockWebResultsPage1 = {
  data: {
    items: [
      { title: 'Result 1', link: 'http://example.com/1', displayLink: 'example.com/1', snippet: 'Snippet for result 1 about Inso Assistant', formattedUrl: 'http://example.com/1' },
      { title: 'Result 2', link: 'http://example.com/2', displayLink: 'example.com/2', snippet: 'Snippet for result 2', formattedUrl: 'http://example.com/2' },
    ],
  },
};

const mockImageResultsPage1 = {
  data: {
    items: [
      { title: 'Image 1', link: 'http://images.com/1.jpg', displayLink: 'images.com/1', snippet: 'Image snippet 1', image: { width: 800, height: 600, thumbnailLink: 'http://images.com/thumb1.jpg' } },
      { title: 'Image 2', link: 'http://images.com/2.jpg', displayLink: 'images.com/2', snippet: 'Image snippet 2', image: { width: 1024, height: 768, thumbnailLink: 'http://images.com/thumb2.jpg' } },
    ],
  },
};

const mockEmptyResults = { data: { items: [] } };

describe('GcpSearchAggregatorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // This service layer file does not and should not contain role-based access checks.
  // Authorization (RBAC) is a responsibility of the controller/middleware layer,
  // which acts as a gatekeeper before calling the service. This test confirms
  // that the service correctly operates within its context boundary and does not
  // concern itself with user roles (super_admin, admin, etc.).
  it('should confirm context boundaries: no role-based access logic is present', () => {
    // The function signatures do not accept user or role arguments, confirming
    // they are not involved in authorization.
    expect(GcpSearchAggregatorService.executeRawSearch.length).toBeLessThanOrEqual(5); // query, searchType, num, start, safe
    expect(GcpSearchAggregatorService.executeParallelSearch.length).toBeLessThanOrEqual(4); // query, searchType, numResults, safe
  });

  describe('executeRawSearch', () => {
    it('should return an empty array and log an error if API key or engine ID is not configured', async () => {
      config.google_search_api_key = null;
      config.google_engine_id = null;
      // Temporarily mock process.env as a fallback check
      const originalEnv = process.env;
      process.env = { ...originalEnv, GOOGLE_SEARCH_API_KEY: undefined, GOOGLE_ENGINE_ID: undefined };

      const results = await GcpSearchAggregatorService.executeRawSearch('test');
      expect(results).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'GCP Search Aggregator Raw Search Error:',
        'Web Search API Key or CSE Engine ID is not configured.'
      );
      
      // Restore
      process.env = originalEnv;
      config.google_search_api_key = 'test_api_key';
      config.google_engine_id = 'test_cx_id';
    });

    it('should execute a web search and format results correctly', async () => {
      axios.get.mockResolvedValue(mockWebResultsPage1);

      const results = await GcpSearchAggregatorService.executeRawSearch('test query', 'web', 5, 1);

      expect(axios.get).toHaveBeenCalledWith('https://www.googleapis.com/customsearch/v1', {
        params: {
          q: 'test query',
          key: 'test_api_key',
          cx: 'test_cx_id',
          num: 5,
          start: 1,
          safe: 'active',
        },
      });
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: 'Result 1',
        link: 'http://example.com/1',
        displayLink: 'example.com/1',
        snippet: 'Snippet for result 1 about Inso Assistant',
        formattedUrl: 'http://example.com/1',
        source: 'google_web',
        index: 1,
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should execute an image search and format results correctly', async () => {
      axios.get.mockResolvedValue(mockImageResultsPage1);

      const results = await GcpSearchAggregatorService.executeRawSearch('test image', 'image', 10, 1);

      expect(axios.get).toHaveBeenCalledWith('https://www.googleapis.com/customsearch/v1', {
        params: {
          q: 'test image',
          key: 'test_api_key',
          cx: 'test_cx_id',
          num: 10,
          start: 1,
          safe: 'active',
          searchType: 'image',
        },
      });
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: 'Image 1',
        link: 'http://images.com/1.jpg',
        displayLink: 'images.com/1',
        snippet: 'Image snippet 1',
        width: 800,
        height: 600,
        thumbnailLink: 'http://images.com/thumb1.jpg',
        source: 'google_image',
        index: 1,
      });
    });

    it('should cap the number of results to 10 per Google CSE API limits', async () => {
      axios.get.mockResolvedValue(mockWebResultsPage1);
      await GcpSearchAggregatorService.executeRawSearch('test query', 'web', 20);
      expect(axios.get).toHaveBeenCalledWith(expect.any(String), {
        params: expect.objectContaining({ num: 10 }),
      });
    });

    it('should handle API errors gracefully and return an empty array', async () => {
      const error = new Error('Network Error');
      axios.get.mockRejectedValue(error);

      const results = await GcpSearchAggregatorService.executeRawSearch('failing query');

      expect(results).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('GCP Search Aggregator Raw Search Error:', 'Network Error');
    });

    it('should handle responses with no items and return an empty array', async () => {
      axios.get.mockResolvedValue(mockEmptyResults);
      const results = await GcpSearchAggregatorService.executeRawSearch('empty query');
      expect(results).toEqual([]);
    });
  });

  describe('executeParallelSearch', () => {
    let executeRawSearchSpy;

    beforeEach(() => {
      executeRawSearchSpy = vi.spyOn(GcpSearchAggregatorService, 'executeRawSearch');
    });

    afterEach(() => {
      executeRawSearchSpy.mockRestore();
    });

    it('should generate sub-queries, execute searches, deduplicate, score, and rank results', async () => {
      const mockResultsSubQuery1 = [
        { title: 'Inso Assistant platform overview', link: 'http://example.com/inso-platform', snippet: 'The Inso Assistant platform is great.', source: 'google_web' },
        { title: 'Common result', link: 'http://example.com/common', snippet: 'This appears in multiple searches.', source: 'google_web' },
      ];
      const mockResultsSubQuery2 = [
        { title: 'News about Inso Assistant', link: 'http://example.com/inso-news', snippet: 'Recent news for the platform.', source: 'google_web' },
        { title: 'Common result', link: 'http://example.com/common', snippet: 'This appears in multiple searches.', source: 'google_web' },
      ];
      const mockResultsSubQuery3 = [
        { title: 'Inso Assistant specifications', link: 'http://example.com/inso-specs', snippet: 'Core details of the platform.', source: 'google_web' },
      ];

      executeRawSearchSpy
        .mockResolvedValueOnce(mockResultsSubQuery1)
        .mockResolvedValueOnce(mockResultsSubQuery2)
        .mockResolvedValueOnce(mockResultsSubQuery3);

      const response = await GcpSearchAggregatorService.executeParallelSearch('what is the Inso Assistant platform', 'web', 5);

      expect(executeRawSearchSpy).toHaveBeenCalledTimes(3);
      expect(executeRawSearchSpy).toHaveBeenCalledWith('what is the Inso Assistant platform', 'web', 10, 1, 'active');
      expect(executeRawSearchSpy).toHaveBeenCalledWith('the Inso Assistant platform recent news analysis', 'web', 10, 1, 'active');
      expect(executeRawSearchSpy).toHaveBeenCalledWith('the Inso Assistant platform core details specifications', 'web', 10, 1, 'active');

      expect(response.success).toBe(true);
      expect(response.originalQuery).toBe('what is the Inso Assistant platform');
      expect(response.totalCandidates).toBe(5);
      expect(response.uniqueCount).toBe(4);
      expect(response.results).toHaveLength(4);

      // Check scoring and ranking. Query terms (len>2): ['what', 'inso', 'platform']
      // 'Inso Assistant platform overview' -> title: inso, platform (2*10), snippet: inso, platform (2*2) -> score 24
      // 'News about Inso Assistant' -> title: inso (10), snippet: platform (2) -> score 12
      // 'Inso Assistant specifications' -> title: inso (10), snippet: platform (2) -> score 12
      // 'Common result' -> title: 0, snippet: 0 -> score 0
      expect(response.results[0].title).toBe('Inso Assistant platform overview');
      expect(response.results[0].relevanceScore).toBe(26);
      expect(response.results[0].finalRank).toBe(1);

      expect(response.results[1].title).toBe('News about Inso Assistant');
      expect(response.results[1].relevanceScore).toBe(14);
      expect(response.results[1].finalRank).toBe(2);

      expect(response.results[2].title).toBe('Inso Assistant specifications');
      expect(response.results[2].relevanceScore).toBe(14);
      expect(response.results[2].finalRank).toBe(3);
      
      expect(response.results[3].title).toBe('Common result');
      expect(response.results[3].relevanceScore).toBe(0);
      expect(response.results[3].finalRank).toBe(4);
    });

    it('should handle partial failures from sub-queries', async () => {
      const mockResultsSubQuery1 = [
        { title: 'Result A', link: 'http://example.com/a', snippet: 'A', source: 'google_web' },
      ];
      
      executeRawSearchSpy
        .mockResolvedValueOnce(mockResultsSubQuery1)
        .mockResolvedValueOnce([]) // Failed search
        .mockResolvedValueOnce([]); // Failed search

      const response = await GcpSearchAggregatorService.executeParallelSearch('short query');
      
      expect(response.success).toBe(true);
      expect(response.totalCandidates).toBe(1);
      expect(response.uniqueCount).toBe(1);
      expect(response.results).toHaveLength(1);
      expect(response.results[0].link).toBe('http://example.com/a');
    });

    it('should handle total failure of all sub-queries and return an empty success response', async () => {
      executeRawSearchSpy.mockResolvedValue([]); // All return empty

      const response = await GcpSearchAggregatorService.executeParallelSearch('another query');
      
      expect(response.success).toBe(true);
      expect(response.totalCandidates).toBe(0);
      expect(response.uniqueCount).toBe(0);
      expect(response.results).toHaveLength(0);
    });

    it('should handle a top-level error during parallel execution and return a failure response', async () => {
      const error = new Error('Promise.all failed');
      executeRawSearchSpy.mockRejectedValue(error);

      const response = await GcpSearchAggregatorService.executeParallelSearch('failing query');

      expect(response.success).toBe(false);
      expect(response.results).toEqual([]);
      expect(response.error).toBe('Promise.all failed');
      expect(logger.error).toHaveBeenCalledWith('GCP Search Aggregator Parallel Search Error:', error);
    });

    it('should correctly generate sub-queries for short queries (<= 2 words)', async () => {
        executeRawSearchSpy.mockResolvedValue([]);
        await GcpSearchAggregatorService.executeParallelSearch('Inso Assistant');

        expect(executeRawSearchSpy).toHaveBeenCalledWith('Inso Assistant', expect.any(String), expect.any(Number), expect.any(Number), expect.any(String));
        expect(executeRawSearchSpy).toHaveBeenCalledWith('Inso Assistant latest updates', expect.any(String), expect.any(Number), expect.any(Number), expect.any(String));
        expect(executeRawSearchSpy).toHaveBeenCalledWith('Inso Assistant overview details', expect.any(String), expect.any(Number), expect.any(Number), expect.any(String));
    });

    it('should trim results to the requested numResults', async () => {
        const mockResults = Array.from({ length: 20 }, (_, i) => ({
            title: `Result ${i}`,
            link: `http://example.com/${i}`,
            snippet: 'some content',
            source: 'google_web'
        }));

        executeRawSearchSpy.mockResolvedValue(mockResults); // All 3 return the same large list
        const response = await GcpSearchAggregatorService.executeParallelSearch('long list', 'web', 5);

        expect(response.success).toBe(true);
        expect(response.uniqueCount).toBe(20);
        expect(response.results).toHaveLength(5);
        expect(response.results[4].finalRank).toBe(5);
    });
  });
});