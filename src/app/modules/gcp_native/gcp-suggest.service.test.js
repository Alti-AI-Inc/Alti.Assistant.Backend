import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { GcpSuggestService } from './gcp-suggest.service';

const { mockAxios } = vi.hoisted(() => {
  const mock = {
    get: vi.fn(),
    isAxiosError: vi.fn(),
  };
  mock.default = mock;
  return { mockAxios: mock };
});

vi.mock('axios', () => mockAxios);

const {
  mockLogger
} = vi.hoisted(() => {
  // Mock the logger
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockLogger
  };
});
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

describe('GcpSuggestService', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Reset isAxiosError mock for each test, as some tests might set it to true/false
    axios.isAxiosError.mockReturnValue(false); // Default to false unless explicitly set
  });

  describe('getSearchSuggestions', () => {
    const GOOGLE_SUGGEST_URL = 'https://suggestqueries.google.com/complete/search';
    const REQUEST_TIMEOUT_MS = 5000;

    it('should return empty suggestions for an empty query string', async () => {
      const result = await GcpSuggestService.getSearchSuggestions('');
      expect(result).toEqual({
        success: true,
        query: '',
        suggestions: [],
      });
      expect(axios.default.get).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should return empty suggestions for a null query', async () => {
      const result = await GcpSuggestService.getSearchSuggestions(null);
      expect(result).toEqual({
        success: true,
        query: '',
        suggestions: [],
      });
      expect(axios.default.get).not.toHaveBeenCalled();
    });

    it('should return empty suggestions for an undefined query', async () => {
      const result = await GcpSuggestService.getSearchSuggestions(undefined);
      expect(result).toEqual({
        success: true,
        query: '',
        suggestions: [],
      });
      expect(axios.default.get).not.toHaveBeenCalled();
    });

    it('should fetch suggestions successfully with default language (en)', async () => {
      const mockResponseData = ['test query', ['suggestion 1', 'suggestion 2'], [], []];
      axios.default.get.mockResolvedValueOnce({ data: mockResponseData });

      const query = 'test query';
      const result = await GcpSuggestService.getSearchSuggestions(query);

      expect(axios.default.get).toHaveBeenCalledWith(
        GOOGLE_SUGGEST_URL,
        expect.objectContaining({
          params: { client: 'chrome', q: query, hl: 'en' },
          timeout: REQUEST_TIMEOUT_MS,
        })
      );
      expect(result).toEqual({
        success: true,
        query: query,
        suggestions: ['suggestion 1', 'suggestion 2'],
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        `GCP Suggest: Querying search autocomplete predictions for "${query}" (hl: en)...`
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `GCP Suggest: Resolved 2 search autocomplete predictions for "${query}".`
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should fetch suggestions successfully with a specified language (es)', async () => {
      const mockResponseData = ['hola', ['sugerencia 1', 'sugerencia 2'], [], []];
      axios.default.get.mockResolvedValueOnce({ data: mockResponseData });

      const query = 'hola';
      const language = 'es';
      const result = await GcpSuggestService.getSearchSuggestions(query, language);

      expect(axios.default.get).toHaveBeenCalledWith(
        GOOGLE_SUGGEST_URL,
        expect.objectContaining({
          params: { client: 'chrome', q: query, hl: language },
          timeout: REQUEST_TIMEOUT_MS,
        })
      );
      expect(result).toEqual({
        success: true,
        query: query,
        suggestions: ['sugerencia 1', 'sugerencia 2'],
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        `GCP Suggest: Querying search autocomplete predictions for "${query}" (hl: ${language})...`
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `GCP Suggest: Resolved 2 search autocomplete predictions for "${query}".`
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should default to "en" language for an invalid language code', async () => {
      const mockResponseData = ['query', ['suggestion'], [], []];
      axios.default.get.mockResolvedValueOnce({ data: mockResponseData });

      const query = 'query';
      const invalidLanguage = 'invalid';
      const result = await GcpSuggestService.getSearchSuggestions(query, invalidLanguage);

      expect(axios.default.get).toHaveBeenCalledWith(
        GOOGLE_SUGGEST_URL,
        expect.objectContaining({
          params: { client: 'chrome', q: query, hl: 'en' }, // Should default to 'en'
          timeout: REQUEST_TIMEOUT_MS,
        })
      );
      expect(result.success).toBe(true);
      expect(result.suggestions).toEqual(['suggestion']);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `GCP Suggest: Querying search autocomplete predictions for "${query}" (hl: en)...`
      );
    });

    it('should handle Google API returning an unexpected data format (data[1] not an array)', async () => {
      const mockResponseData = ['test query', 'not an array', [], []]; // data[1] is a string
      axios.default.get.mockResolvedValueOnce({ data: mockResponseData });

      const query = 'test query';
      const result = await GcpSuggestService.getSearchSuggestions(query);

      expect(result).toEqual({
        success: true,
        query: query,
        suggestions: [], // Should return empty array
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        `GCP Suggest: Resolved 0 search autocomplete predictions for "${query}".`
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle Google API returning an unexpected data format (data not an array)', async () => {
      const mockResponseData = { some: 'object', instead: 'of array' };
      axios.default.get.mockResolvedValueOnce({ data: mockResponseData });

      const query = 'test query';
      const result = await GcpSuggestService.getSearchSuggestions(query);

      expect(result).toEqual({
        success: true,
        query: query,
        suggestions: [], // Should return empty array
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        `GCP Suggest: Resolved 0 search autocomplete predictions for "${query}".`
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle axios timeout error (ECONNABORTED)', async () => {
      const query = 'timeout query';
      const error = new Error('timeout');
      error.code = 'ECONNABORTED';
      axios.isAxiosError.mockReturnValue(true);
      axios.default.get.mockRejectedValueOnce(error);

      const result = await GcpSuggestService.getSearchSuggestions(query);

      expect(result).toEqual({
        success: false,
        query: query,
        error: `Request to Google Suggest API timed out after ${REQUEST_TIMEOUT_MS}ms.`,
        suggestions: [],
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        `GCP Suggest Lookup Error: Request to Google Suggest API timed out after ${REQUEST_TIMEOUT_MS}ms.`
      );
      expect(mockLogger.info).toHaveBeenCalledTimes(1); // Only the initial info log
    });

    it('should handle axios HTTP error (non-2xx response)', async () => {
      const query = 'http error query';
      const error = new Error('Request failed with status code 404');
      error.response = { status: 404, data: 'Not Found' };
      axios.isAxiosError.mockReturnValue(true);
      axios.default.get.mockRejectedValueOnce(error);

      const result = await GcpSuggestService.getSearchSuggestions(query);

      expect(result).toEqual({
        success: false,
        query: query,
        error: 'Google Suggest API responded with status 404.',
        suggestions: [],
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        `GCP Suggest Lookup Error: Google Suggest API responded with status 404.`,
        { status: 404, data: 'Not Found' }
      );
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
    });

    it('should handle axios network error (no response received)', async () => {
      const query = 'network error query';
      const error = new Error('Network Error');
      error.request = {}; // Indicates request was made but no response
      axios.isAxiosError.mockReturnValue(true);
      axios.default.get.mockRejectedValueOnce(error);

      const result = await GcpSuggestService.getSearchSuggestions(query);

      expect(result).toEqual({
        success: false,
        query: query,
        error: 'No response received from Google Suggest API. Check network connectivity.',
        suggestions: [],
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        `GCP Suggest Lookup Error: No response received from Google Suggest API. Check network connectivity.`,
        { code: undefined } // `err.code` might be undefined for generic network errors
      );
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
    });

    it('should handle generic axios error (error setting up request)', async () => {
      const query = 'generic axios error query';
      const error = new Error('Something went wrong configuring request');
      axios.isAxiosError.mockReturnValue(true);
      axios.default.get.mockRejectedValueOnce(error);

      const result = await GcpSuggestService.getSearchSuggestions(query);

      expect(result).toEqual({
        success: false,
        query: query,
        error: 'Something went wrong configuring request',
        suggestions: [],
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'GCP Suggest Lookup Error: Error setting up request.',
        error
      );
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
    });

    it('should handle non-axios error', async () => {
      const query = 'non-axios error query';
      const error = new TypeError('Invalid data processing');
      axios.isAxiosError.mockReturnValue(false); // Ensure it's treated as non-Axios
      axios.default.get.mockRejectedValueOnce(error);

      const result = await GcpSuggestService.getSearchSuggestions(query);

      expect(result).toEqual({
        success: false,
        query: query,
        error: 'Invalid data processing',
        suggestions: [],
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'GCP Suggest Lookup Error: A non-network error occurred.',
        error
      );
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
    });

    it('should handle non-axios error that is not an instance of Error', async () => {
      const query = 'non-error object query';
      const error = { message: 'Some custom error object' }; // Not an Error instance
      axios.isAxiosError.mockReturnValue(false);
      axios.default.get.mockRejectedValueOnce(error);

      const result = await GcpSuggestService.getSearchSuggestions(query);

      expect(result).toEqual({
        success: false,
        query: query,
        error: 'An unexpected error occurred while fetching search suggestions.', // Default message
        suggestions: [],
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'GCP Suggest Lookup Error: A non-network error occurred.',
        error
      );
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
    });
  });
});