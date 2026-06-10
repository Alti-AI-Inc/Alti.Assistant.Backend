import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { search } from './tavily.service';

vi.mock('axios');
vi.mock('../../config/config', () => ({
  TAVILY_API_KEY: 'mocked-api-key',
}));

describe('TavilyService', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('search', () => {
    it('should successfully perform a search and return data', async () => {
      const mockQuery = 'test query';
      const mockResponseData = {
        answer: 'This is a test answer',
        results: [{ title: 'Test Title', url: 'https://test.com', content: 'Test content' }],
      };

      axios.post.mockResolvedValueOnce({ data: mockResponseData });

      const result = await search(mockQuery);

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith('https://api.tavily.com/search', {
        api_key: 'mocked-api-key',
        query: mockQuery,
        search_depth: 'advanced',
        include_answer: true,
        include_images: false,
        include_raw_content: false,
        max_results: 5,
      });
      expect(result).toEqual(mockResponseData);
    });

    it('should throw an error and log it when the API call fails', async () => {
      const mockQuery = 'failing query';
      const mockError = new Error('Network Error');
      axios.post.mockRejectedValueOnce(mockError);

      await expect(search(mockQuery)).rejects.toThrow('Failed to perform Tavily search.');

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error searching with Tavily:', 'Network Error');
    });
  });
});