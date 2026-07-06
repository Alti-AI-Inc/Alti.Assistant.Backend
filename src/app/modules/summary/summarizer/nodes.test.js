import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchContentNode,
  convertRawJsonToJson,
  summarizeContentNode,
} from './nodes.js';

const {
  mockGetUrlFromUserInputUsingAi,
  mockGenerateSummary,
  mockCheerioLoad,
  mockYoutubeLoad
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockGetUrlFromUserInputUsingAi = vi.fn();
  const mockGenerateSummary = vi.fn();

  // Mock Langchain loaders
  const mockCheerioLoad = vi.fn();
  const mockYoutubeLoad = vi.fn();

  return {
    mockGetUrlFromUserInputUsingAi,
    mockGenerateSummary,
    mockCheerioLoad,
    mockYoutubeLoad
  };
});

vi.mock('../geminiSummaryService.js', () => ({
  getUrlFromUserInputUsingAi: mockGetUrlFromUserInputUsingAi,
}));

vi.mock('../summarizerService.js', () => ({
  generateSummary: mockGenerateSummary,
}));

vi.mock('@langchain/community/document_loaders/web/cheerio', () => ({
  CheerioWebBaseLoader: vi.fn().mockImplementation(() => ({
    load: mockCheerioLoad,
  })),
}));

vi.mock('@langchain/community/document_loaders/web/youtube', () => ({
  YoutubeLoader: {
    createFromUrl: vi.fn().mockImplementation(() => ({
      load: mockYoutubeLoad,
    })),
  },
}));

describe('nodes.js', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Spy on console.log and console.error to prevent actual logging during tests
    // and to assert on their calls if needed.
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original console methods after each test
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('fetchContentNode', () => {
    it('should return user_input as content if isFilePassed is true', async () => {
      const state = { user_input: 'This is file content.', isFilePassed: true };
      const result = await fetchContentNode(state);
      expect(result).toEqual({ content: 'This is file content.' });
      expect(mockGetUrlFromUserInputUsingAi).not.toHaveBeenCalled();
      expect(mockCheerioLoad).not.toHaveBeenCalled();
      expect(mockYoutubeLoad).not.toHaveBeenCalled();
    });

    it('should fetch content from a non-YouTube URL', async () => {
      const mockUrlInfo = { url: 'http://example.com', isYoutubeUrl: false };
      mockGetUrlFromUserInputUsingAi.mockResolvedValueOnce(
        '```json\n{"url": "http://example.com", "isYoutubeUrl": false}\n```'
      );
      mockCheerioLoad.mockResolvedValueOnce([
        { pageContent: 'Part 1' },
        { pageContent: 'Part 2' },
      ]);

      const state = { user_input: 'Summarize example.com', isFilePassed: false };
      const result = await fetchContentNode(state);

      expect(mockGetUrlFromUserInputUsingAi).toHaveBeenCalledWith(
        'Summarize example.com'
      );
      expect(result).toEqual({ content: 'Part 1\nPart 2' });
      expect(
        require('@langchain/community/document_loaders/web/cheerio')
          .CheerioWebBaseLoader
      ).toHaveBeenCalledWith('http://example.com');
      expect(mockCheerioLoad).toHaveBeenCalled();
      expect(mockYoutubeLoad).not.toHaveBeenCalled();
    });

    it('should handle no content found for a non-YouTube URL', async () => {
      const mockUrlInfo = { url: 'http://example.com', isYoutubeUrl: false };
      mockGetUrlFromUserInputUsingAi.mockResolvedValueOnce(
        '```json\n{"url": "http://example.com", "isYoutubeUrl": false}\n```'
      );
      mockCheerioLoad.mockResolvedValueOnce([]); // No documents found

      const state = { user_input: 'Summarize example.com', isFilePassed: false };
      const result = await fetchContentNode(state);

      expect(result).toEqual({
        content:
          'Error: Failed to fetch content from the URL. Please check if the link is correct and publicly accessible.',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in fetchContentNode: No content found at the provided URL.'
      );
    });

    it('should handle errors during CheerioWebBaseLoader.load()', async () => {
      const mockUrlInfo = { url: 'http://example.com', isYoutubeUrl: false };
      mockGetUrlFromUserInputUsingAi.mockResolvedValueOnce(
        '```json\n{"url": "http://example.com", "isYoutubeUrl": false}\n```'
      );
      mockCheerioLoad.mockRejectedValueOnce(new Error('Network error'));

      const state = { user_input: 'Summarize example.com', isFilePassed: false };
      const result = await fetchContentNode(state);

      expect(result).toEqual({
        content:
          'Error: Failed to fetch content from the URL. Please check if the link is correct and publicly accessible.',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in fetchContentNode: Network error'
      );
    });

    it('should fetch content from a YouTube URL', async () => {
      const mockUrlInfo = {
        url: 'https://www.youtube.com/watch?v=test',
        isYoutubeUrl: true,
      };
      mockGetUrlFromUserInputUsingAi.mockResolvedValueOnce(
        '```json\n{"url": "https://www.youtube.com/watch?v=test", "isYoutubeUrl": true}\n```'
      );
      mockYoutubeLoad.mockResolvedValueOnce([
        { pageContent: 'YouTube Part 1' },
        { pageContent: 'YouTube Part 2' },
      ]);

      const state = { user_input: 'Summarize youtube video', isFilePassed: false };
      const result = await fetchContentNode(state);

      expect(mockGetUrlFromUserInputUsingAi).toHaveBeenCalledWith(
        'Summarize youtube video'
      );
      expect(result).toEqual({ content: 'YouTube Part 1\nYouTube Part 2' });
      expect(
        require('@langchain/community/document_loaders/web/youtube').YoutubeLoader.createFromUrl
      ).toHaveBeenCalledWith('https://www.youtube.com/watch?v=test', {
        language: 'en',
        addVideoInfo: true,
      });
      expect(mockYoutubeLoad).toHaveBeenCalled();
      expect(mockCheerioLoad).not.toHaveBeenCalled();
    });

    it('should handle no content found for a YouTube URL', async () => {
      const mockUrlInfo = {
        url: 'https://www.youtube.com/watch?v=test',
        isYoutubeUrl: true,
      };
      mockGetUrlFromUserInputUsingAi.mockResolvedValueOnce(
        '```json\n{"url": "https://www.youtube.com/watch?v=test", "isYoutubeUrl": true}\n```'
      );
      mockYoutubeLoad.mockResolvedValueOnce([]); // No documents found

      const state = { user_input: 'Summarize youtube video', isFilePassed: false };
      const result = await fetchContentNode(state);

      expect(result).toEqual({
        content:
          'Error: Failed to fetch content from the URL. Please check if the link is correct and publicly accessible.',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in fetchContentNode: No content found at the provided URL.'
      );
    });

    it('should handle errors during YoutubeLoader.load()', async () => {
      const mockUrlInfo = {
        url: 'https://www.youtube.com/watch?v=test',
        isYoutubeUrl: true,
      };
      mockGetUrlFromUserInputUsingAi.mockResolvedValueOnce(
        '```json\n{"url": "https://www.youtube.com/watch?v=test", "isYoutubeUrl": true}\n```'
      );
      mockYoutubeLoad.mockRejectedValueOnce(new Error('YouTube API error'));

      const state = { user_input: 'Summarize youtube video', isFilePassed: false };
      const result = await fetchContentNode(state);

      expect(result).toEqual({
        content:
          'Error: Failed to fetch content from the URL. Please check if the link is correct and publicly accessible.',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in fetchContentNode: YouTube API error'
      );
    });

    it('should return user_input as content if no URL is found', async () => {
      mockGetUrlFromUserInputUsingAi.mockResolvedValueOnce(
        '```json\n{"url": null, "isYoutubeUrl": false}\n```'
      ); // No URL found

      const state = { user_input: 'Just a plain text input', isFilePassed: false };
      const result = await fetchContentNode(state);

      expect(mockGetUrlFromUserInputUsingAi).toHaveBeenCalledWith(
        'Just a plain text input'
      );
      expect(result).toEqual({ content: 'Just a plain text input' });
      expect(mockCheerioLoad).not.toHaveBeenCalled();
      expect(mockYoutubeLoad).not.toHaveBeenCalled();
    });

    it('should handle errors from getUrlFromUserInputUsingAi', async () => {
      mockGetUrlFromUserInputUsingAi.mockRejectedValueOnce(
        new Error('AI service down')
      );

      const state = { user_input: 'Summarize something', isFilePassed: false };
      const result = await fetchContentNode(state);

      expect(result).toEqual({
        content:
          'Error: Failed to fetch content from the URL. Please check if the link is correct and publicly accessible.',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in fetchContentNode: AI service down'
      );
    });

    it('should handle malformed JSON from getUrlFromUserInputUsingAi', async () => {
      mockGetUrlFromUserInputUsingAi.mockResolvedValueOnce('```json\n{"url": "invalid"'); // Malformed JSON

      const state = { user_input: 'Summarize something', isFilePassed: false };
      const result = await fetchContentNode(state);

      expect(result).toEqual({ content: 'Summarize something' }); // Falls back to user_input
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error converting raw JSON to object:')
      );
    });
  });

  describe('convertRawJsonToJson', () => {
    it('should correctly parse a raw JSON string with markdown backticks', () => {
      const rawJson =
        '```json\n{"url": "https://example.com", "isYoutubeUrl": false}\n```';
      const expectedObject = { url: 'https://example.com', isYoutubeUrl: false };
      const result = convertRawJsonToJson(rawJson);
      expect(result).toEqual(expectedObject);
    });

    it('should correctly parse a raw JSON string without markdown backticks', () => {
      const rawJson = '{"url": "https://example.com/video", "isYoutubeUrl": true}';
      const expectedObject = { url: 'https://example.com/video', isYoutubeUrl: true };
      const result = convertRawJsonToJson(rawJson);
      expect(result).toEqual(expectedObject);
    });

    it('should handle empty string input', () => {
      const rawJson = '';
      const result = convertRawJsonToJson(rawJson);
      expect(result).toEqual({});
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error converting raw JSON to object:')
      );
    });

    it('should handle invalid JSON string input', () => {
      const rawJson = '```json\n{"url": "invalid"'; // Malformed JSON
      const result = convertRawJsonToJson(rawJson);
      expect(result).toEqual({});
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error converting raw JSON to object:')
      );
    });

    it('should handle JSON with extra whitespace', () => {
      const rawJson =
        '  ```json\n  {"url": "https://example.com", "isYoutubeUrl": false}\n  ```  ';
      const expectedObject = { url: 'https://example.com', isYoutubeUrl: false };
      const result = convertRawJsonToJson(rawJson);
      expect(result).toEqual(expectedObject);
    });
  });

  describe('summarizeContentNode', () => {
    it('should return content as summary if it starts with "Error:"', async () => {
      const state = { content: 'Error: Failed to fetch content.', history: [] };
      const result = await summarizeContentNode(state);
      expect(result).toEqual({ summary: 'Error: Failed to fetch content.' });
      expect(mockGenerateSummary).not.toHaveBeenCalled();
    });

    it('should call generateSummary and return its result for valid content', async () => {
      const mockSummary = 'This is a generated summary.';
      mockGenerateSummary.mockResolvedValueOnce(mockSummary);

      const state = { content: 'Some content to summarize.', history: ['prev chat'] };
      const result = await summarizeContentNode(state);

      expect(mockGenerateSummary).toHaveBeenCalledWith(
        'Some content to summarize.',
        ['prev chat']
      );
      expect(result).toEqual({ summary: mockSummary });
    });

    it('should propagate errors from generateSummary', async () => {
      const mockError = new Error('Summary generation failed');
      mockGenerateSummary.mockRejectedValueOnce(mockError);

      const state = { content: 'Some content.', history: [] };

      await expect(summarizeContentNode(state)).rejects.toThrow(
        'Summary generation failed'
      );
      expect(mockGenerateSummary).toHaveBeenCalledWith('Some content.', []);
    });
  });
});