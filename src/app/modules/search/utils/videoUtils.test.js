import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isVideoOnlyQuery,
  extractVideoCount,
  analyzeVideoQuery,
  shouldSearchYouTube,
  createOptimizedYouTubeQuery,
  searchYouTube,
} from './videoUtils';

const {
  mockLlmInvoke,
  mockConfig
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockLlmInvoke = vi.fn();

  const mockConfig = {
    youtube_api_key: 'test_youtube_api_key',
  };

  return {
    mockLlmInvoke,
    mockConfig
  };
});

vi.mock('../services/geminiService.js', () => ({
  llm: {
    invoke: mockLlmInvoke,
  },
}));

vi.mock('../../../../../config/index.js', () => ({
  default: mockConfig,
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('videoUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config mock for specific tests if needed
    mockConfig.youtube_api_key = 'test_youtube_api_key';
    // Mock console.log and console.error to prevent clutter during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('isVideoOnlyQuery', () => {
    it('should return true for explicit video queries', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: 'VIDEO_ONLY' });
      const result = await isVideoOnlyQuery('show me a video of cats');
      expect(result).toBe(true);
      expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Current query: "show me a video of cats"'
      );
    });

    it('should return false for general queries', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: 'NOT_VIDEO_ONLY' });
      const result = await isVideoOnlyQuery('what is the capital of France?');
      expect(result).toBe(false);
      expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
    });

    it('should handle LLM response with <THINK> tags', async () => {
      mockLlmInvoke.mockResolvedValueOnce({
        content: '<THINK>User is asking for video.</THINK>VIDEO_ONLY',
      });
      const result = await isVideoOnlyQuery('show me a tutorial');
      expect(result).toBe(true);
    });

    it('should handle LLM response with <think> tags (lowercase)', async () => {
      mockLlmInvoke.mockResolvedValueOnce({
        content: '<think>User is asking for video.</think>NOT_VIDEO_ONLY',
      });
      const result = await isVideoOnlyQuery('tell me about history');
      expect(result).toBe(false);
    });

    it('should include conversation context if provided', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: 'VIDEO_ONLY' });
      const context = [
        { role: 'user', content: 'I want to learn about cooking.' },
        { role: 'assistant', content: 'Sure, what specifically?' },
      ];
      await isVideoOnlyQuery('show me a video tutorial', context);
      expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Previous conversation:\nUser: I want to learn about cooking.\nAssistant: Sure, what specifically?'
      );
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Current query: "show me a video tutorial"'
      );
    });

    it('should default to false on LLM error', async () => {
      mockLlmInvoke.mockRejectedValueOnce(new Error('LLM failed'));
      const result = await isVideoOnlyQuery('show me a video');
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Error detecting video-only query with LLM:',
        expect.any(Error)
      );
    });
  });

  describe('extractVideoCount', () => {
    it('should extract explicit numbers', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: '5' });
      expect(await extractVideoCount('find 5 videos')).toBe(5);
    });

    it('should extract written numbers', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: '3' });
      expect(await extractVideoCount('show me three tutorials')).toBe(3);
    });

    it('should default to 1 if no number is found', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: '1' });
      expect(await extractVideoCount('show me a video')).toBe(1);
    });

    it('should cap at 20 for large numbers', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: '50' });
      expect(await extractVideoCount('find 50 videos')).toBe(20);
    });

    it('should cap at 1 for numbers less than 1', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: '0' });
      expect(await extractVideoCount('find 0 videos')).toBe(1);
    });

    it('should handle implied quantities like "some videos"', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: '3' });
      expect(await extractVideoCount('show me some videos')).toBe(3);
    });

    it('should handle implied quantities like "many videos"', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: '5' });
      expect(await extractVideoCount('show me many videos')).toBe(5);
    });

    it('should handle LLM response with <THINK> tags', async () => {
      mockLlmInvoke.mockResolvedValueOnce({
        content: '<THINK>User wants 7 videos.</THINK>7',
      });
      const result = await extractVideoCount('show me 7 videos');
      expect(result).toBe(7);
    });

    it('should include conversation context if provided', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: '2' });
      const context = [
        { role: 'user', content: 'I need some help.' },
        { role: 'assistant', content: 'With what?' },
      ];
      await extractVideoCount('find 2 videos about it', context);
      expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Previous conversation:\nUser: I need some help.\nAssistant: With what?'
      );
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Current query: "find 2 videos about it"'
      );
    });

    it('should default to 1 on LLM error', async () => {
      mockLlmInvoke.mockRejectedValueOnce(new Error('LLM failed'));
      const result = await extractVideoCount('how many videos?');
      expect(result).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        'Error extracting video count with LLM:',
        expect.any(Error)
      );
    });
  });

  describe('analyzeVideoQuery', () => {
    beforeEach(() => {
      // Mock the internal calls to isVideoOnlyQuery and extractVideoCount
      vi.mock('./videoUtils', async (importOriginal) => {
        const actual = await importOriginal();
        return {
          ...actual,
          isVideoOnlyQuery: vi.fn(),
          extractVideoCount: vi.fn(),
        };
      });
    });

    it('should return isVideoOnly: true and correct count if video query', async () => {
      const { isVideoOnlyQuery, extractVideoCount } = await import('./videoUtils');
      isVideoOnlyQuery.mockResolvedValueOnce(true);
      extractVideoCount.mockResolvedValueOnce(5);

      const query = 'show me 5 videos about space';
      const context = [{ role: 'user', content: 'previous' }];
      const result = await analyzeVideoQuery(query, context);

      expect(result).toEqual({ isVideoOnly: true, videoCount: 5 });
      expect(isVideoOnlyQuery).toHaveBeenCalledWith(query, context);
      expect(extractVideoCount).toHaveBeenCalledWith(query, context);
    });

    it('should return isVideoOnly: false and default count if not video query', async () => {
      const { isVideoOnlyQuery, extractVideoCount } = await import('./videoUtils');
      isVideoOnlyQuery.mockResolvedValueOnce(false);

      const query = 'what is the capital of France?';
      const context = [{ role: 'user', content: 'previous' }];
      const result = await analyzeVideoQuery(query, context);

      expect(result).toEqual({ isVideoOnly: false, videoCount: 1 });
      expect(isVideoOnlyQuery).toHaveBeenCalledWith(query, context);
      expect(extractVideoCount).not.toHaveBeenCalled(); // Should not call extractVideoCount
    });

    it('should default to false and 1 on error', async () => {
      const { isVideoOnlyQuery } = await import('./videoUtils');
      isVideoOnlyQuery.mockRejectedValueOnce(new Error('Analysis failed'));

      const result = await analyzeVideoQuery('some query');
      expect(result).toEqual({ isVideoOnly: false, videoCount: 1 });
      expect(console.error).toHaveBeenCalledWith(
        'Error analyzing video query with LLM:',
        expect.any(Error)
      );
    });
  });

  describe('shouldSearchYouTube', () => {
    it('should return true for relevant YouTube queries', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: 'RELEVANT' });
      const result = await shouldSearchYouTube('how to fix a leaky faucet');
      expect(result).toBe(true);
      expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Current query: "how to fix a leaky faucet"'
      );
    });

    it('should return false for irrelevant YouTube queries', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: 'NOT_RELEVANT' });
      const result = await shouldSearchYouTube('what is the definition of photosynthesis');
      expect(result).toBe(false);
      expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
    });

    it('should handle LLM response with <THINK> tags', async () => {
      mockLlmInvoke.mockResolvedValueOnce({
        content: '<THINK>This is a good candidate for YouTube.</THINK>RELEVANT',
      });
      const result = await shouldSearchYouTube('best cat videos');
      expect(result).toBe(true);
    });

    it('should include conversation context if provided', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: 'RELEVANT' });
      const context = [
        { role: 'user', content: 'I was talking about cooking.' },
      ];
      await shouldSearchYouTube('show me a recipe', context);
      expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Previous conversation:\nUser: I was talking about cooking.'
      );
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Current query: "show me a recipe"'
      );
    });

    it('should default to false on LLM error', async () => {
      mockLlmInvoke.mockRejectedValueOnce(new Error('LLM failed'));
      const result = await shouldSearchYouTube('something youtube related');
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Error checking YouTube relevance:',
        expect.any(Error)
      );
    });
  });

  describe('createOptimizedYouTubeQuery', () => {
    it('should return an optimized query', async () => {
      mockLlmInvoke.mockResolvedValueOnce({
        content: 'how to cook pasta perfectly tutorial',
      });
      const result = await createOptimizedYouTubeQuery('How do I cook pasta');
      expect(result).toBe('how to cook pasta perfectly tutorial');
      expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Original query: "How do I cook pasta"'
      );
    });

    it('should handle LLM response with <think> tags', async () => {
      mockLlmInvoke.mockResolvedValueOnce({
        content: '<think>Optimizing for YouTube.</think>best smartphones review',
      });
      const result = await createOptimizedYouTubeQuery('Best smartphones');
      expect(result).toBe('best smartphones review');
    });

    it('should remove quotes from the LLM response', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: '"Python programming tutorial beginners"' });
      const result = await createOptimizedYouTubeQuery('Learn Python programming');
      expect(result).toBe('Python programming tutorial beginners');
    });

    it('should include conversation context if provided', async () => {
      mockLlmInvoke.mockResolvedValueOnce({ content: 'Detroit Tigers highlights' });
      const context = [
        { role: 'user', content: 'I like baseball.' },
        { role: 'assistant', content: 'Which team?' },
        { role: 'user', content: 'Detroit Tigers' },
      ];
      await createOptimizedYouTubeQuery('game', context);
      expect(mockLlmInvoke).toHaveBeenCalledTimes(1);
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Recent conversation:\nUser: I like baseball.\nAssistant: Which team?\nUser: Detroit Tigers'
      );
      expect(mockLlmInvoke.mock.calls[0][0][1].content).toContain(
        'Original query: "game"'
      );
    });

    it('should fallback to original query on LLM error', async () => {
      mockLlmInvoke.mockRejectedValueOnce(new Error('LLM failed'));
      const query = 'original query';
      const result = await createOptimizedYouTubeQuery(query);
      expect(result).toBe(query);
      expect(console.error).toHaveBeenCalledWith(
        'Error optimizing YouTube query:',
        expect.any(Error)
      );
    });
  });

  describe('searchYouTube', () => {
    const mockYoutubeResponse = {
      items: [
        {
          id: { videoId: 'video1' },
          snippet: {
            title: 'Video 1 Title',
            description: 'Description 1',
            channelTitle: 'Channel 1',
            publishedAt: '2023-01-01T00:00:00Z',
            thumbnails: { default: { url: 'thumb1.jpg' } },
          },
        },
        {
          id: { videoId: 'video2' },
          snippet: {
            title: 'Video 2 Title',
            description: 'Description 2',
            channelTitle: 'Channel 2',
            publishedAt: '2023-01-02T00:00:00Z',
            thumbnails: { default: { url: 'thumb2.jpg' } },
          },
        },
      ],
    };

    beforeEach(() => {
      // Mock createOptimizedYouTubeQuery for searchYouTube tests
      vi.mock('./videoUtils', async (importOriginal) => {
        const actual = await importOriginal();
        return {
          ...actual,
          createOptimizedYouTubeQuery: vi.fn(),
        };
      });
    });

    it('should return an empty array if YouTube API key is not configured', async () => {
      mockConfig.youtube_api_key = undefined;
      const { createOptimizedYouTubeQuery } = await import('./videoUtils');
      createOptimizedYouTubeQuery.mockResolvedValueOnce('optimized query');

      const results = await searchYouTube('test query');
      expect(results).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        'YouTube API key not configured, skipping YouTube search'
      );
      expect(createOptimizedYouTubeQuery).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch and return formatted YouTube results', async () => {
      const { createOptimizedYouTubeQuery } = await import('./videoUtils');
      createOptimizedYouTubeQuery.mockResolvedValueOnce('optimized query for youtube');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockYoutubeResponse),
      });

      const query = 'how to make pizza';
      const maxResults = 2;
      const context = [{ role: 'user', content: 'I like food' }];
      const results = await searchYouTube(query, maxResults, context);

      expect(createOptimizedYouTubeQuery).toHaveBeenCalledWith(query, context);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0];
      expect(fetchUrl).toContain('q=optimized%20query%20for%20youtube');
      expect(fetchUrl).toContain('maxResults=2');
      expect(fetchUrl).toContain('key=test_youtube_api_key');

      expect(results).toEqual([
        {
          title: 'Video 1 Title',
          description: 'Description 1',
          url: 'https://www.youtube.com/watch?v=video1',
          videoId: 'video1',
          channelTitle: 'Channel 1',
          publishedAt: '2023-01-01T00:00:00Z',
          thumbnails: { default: { url: 'thumb1.jpg' } },
          relevanceScore: 1, // (2-0)/2
          source: 'youtube',
          citationIndex: 1,
        },
        {
          title: 'Video 2 Title',
          description: 'Description 2',
          url: 'https://www.youtube.com/watch?v=video2',
          videoId: 'video2',
          channelTitle: 'Channel 2',
          publishedAt: '2023-01-02T00:00:00Z',
          thumbnails: { default: { url: 'thumb2.jpg' } },
          relevanceScore: 0.5, // (2-1)/2
          source: 'youtube',
          citationIndex: 2,
        },
      ]);
    });

    it('should return an empty array if no results are found', async () => {
      const { createOptimizedYouTubeQuery } = await import('./videoUtils');
      createOptimizedYouTubeQuery.mockResolvedValueOnce('no results query');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      const results = await searchYouTube('empty search');
      expect(results).toEqual([]);
      expect(console.log).toHaveBeenCalledWith('No YouTube results found');
    });

    it('should return an empty array on fetch error (network or non-200)', async () => {
      const { createOptimizedYouTubeQuery } = await import('./videoUtils');
      createOptimizedYouTubeQuery.mockResolvedValueOnce('error query');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const results = await searchYouTube('error query');
      expect(results).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        'YouTube API error: 500 Internal Server Error'
      );
    });

    it('should return an empty array on unexpected error during fetch or processing', async () => {
      const { createOptimizedYouTubeQuery } = await import('./videoUtils');
      createOptimizedYouTubeQuery.mockResolvedValueOnce('exception query');
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const results = await searchYouTube('exception query');
      expect(results).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        'Error searching YouTube:',
        expect.any(Error)
      );
    });
  });
});