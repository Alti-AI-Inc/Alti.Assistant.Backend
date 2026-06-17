import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GcpSafeBrowsingService } from './gcp-safe-browsing.service.js';
import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// Mock dependencies
vi.mock('axios');
vi.mock('../../../../config/index.js', () => ({
  default: {
    google_search_api_key: 'test-api-key-from-config',
  },
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GcpSafeBrowsingService', () => {
  const testUrl = 'http://example.com';
  const mockConfigApiKey = 'test-api-key-from-config';
  let originalProcessEnvApiKey;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Store original process.env.GOOGLE_SEARCH_API_KEY to restore later
    originalProcessEnvApiKey = process.env.GOOGLE_SEARCH_API_KEY;

    // Ensure config has a key by default for most tests
    config.google_search_api_key = mockConfigApiKey;
    // Ensure process.env is undefined by default for most tests, to test config preference
    delete process.env.GOOGLE_SEARCH_API_KEY;
  });

  afterEach(() => {
    // Restore original process.env.GOOGLE_SEARCH_API_KEY
    if (originalProcessEnvApiKey === undefined) {
      delete process.env.GOOGLE_SEARCH_API_KEY;
    } else {
      process.env.GOOGLE_SEARCH_API_KEY = originalProcessEnvApiKey;
    }
  });

  describe('lookupUrlSafety', () => {
    it('should return a secure status for a safe URL', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          matches: [],
        },
      });

      const result = await GcpSafeBrowsingService.lookupUrlSafety(testUrl);

      expect(result).toEqual({
        success: true,
        url: testUrl,
        isSecure: true,
        threatCount: 0,
        threats: [],
      });
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${mockConfigApiKey}`,
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        `GCP Safe Browsing: Evaluating security threat status for URL "${testUrl}"...`
      );
      expect(logger.info).toHaveBeenCalledWith(
        `GCP Safe Browsing: Evaluation complete. URL "${testUrl}" is SECURE.`
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should return an insecure status and threats for an unsafe URL', async () => {
      const mockThreats = [
        { threatType: 'MALWARE', platformType: 'ANY_PLATFORM', threatEntryType: 'URL' },
        { threatType: 'SOCIAL_ENGINEERING', platformType: 'ANY_PLATFORM', threatEntryType: 'URL' },
      ];

      axios.post.mockResolvedValueOnce({
        data: {
          matches: mockThreats,
        },
      });

      const result = await GcpSafeBrowsingService.lookupUrlSafety(testUrl);

      expect(result).toEqual({
        success: true,
        url: testUrl,
        isSecure: false,
        threatCount: mockThreats.length,
        threats: mockThreats.map(m => ({
          threatType: m.threatType,
          platformType: m.platformType,
          threatEntryType: m.threatEntryType
        })),
      });
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        `GCP Safe Browsing: Evaluation complete. URL "${testUrl}" is FLAGGED THREAT.`
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should throw an error if no API key is configured (config and env)', async () => {
      config.google_search_api_key = undefined; // Unset config key
      delete process.env.GOOGLE_SEARCH_API_KEY; // Unset env key

      await expect(GcpSafeBrowsingService.lookupUrlSafety(testUrl)).rejects.toThrow(
        'Google Search/Safe Browsing API Key is not configured.'
      );
      expect(axios.post).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should use API key from process.env if config is not set', async () => {
      config.google_search_api_key = undefined;
      process.env.GOOGLE_SEARCH_API_KEY = 'env-api-key';

      axios.post.mockResolvedValueOnce({ data: { matches: [] } });

      await GcpSafeBrowsingService.lookupUrlSafety(testUrl);

      expect(axios.post).toHaveBeenCalledWith(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=env-api-key`,
        expect.any(Object)
      );
    });

    it('should throw an error if the URL is not provided', async () => {
      await expect(GcpSafeBrowsingService.lookupUrlSafety(null)).rejects.toThrow(
        'Target URL to check is required.'
      );
      await expect(GcpSafeBrowsingService.lookupUrlSafety(undefined)).rejects.toThrow(
        'Target URL to check is required.'
      );
      await expect(GcpSafeBrowsingService.lookupUrlSafety('')).rejects.toThrow(
        'Target URL to check is required.'
      );
      expect(axios.post).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully and return a fallback insecure status', async () => {
      const errorMessage = 'Network error';
      axios.post.mockRejectedValueOnce(new Error(errorMessage));

      const result = await GcpSafeBrowsingService.lookupUrlSafety(testUrl);

      expect(result).toEqual({
        success: false,
        url: testUrl,
        isSecure: false, // Fallback to insecure for safety
        error: errorMessage,
        threatCount: 0,
        threats: [],
      });
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('GCP Safe Browsing Lookup Error:', expect.any(Error));
      // Only the initial info log should be called, not the completion log
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        `GCP Safe Browsing: Evaluating security threat status for URL "${testUrl}"...`
      );
    });

    it('should send the correct request body to the Safe Browsing API', async () => {
      axios.post.mockResolvedValueOnce({ data: { matches: [] } });

      await GcpSafeBrowsingService.lookupUrlSafety(testUrl);

      const expectedRequestBody = {
        client: {
          clientId: 'alti-assistant-backend',
          clientVersion: '1.0.0'
        },
        threatInfo: {
          threatTypes: [
            'MALWARE',
            'SOCIAL_ENGINEERING',
            'UNWANTED_SOFTWARE',
            'POTENTIALLY_HARMFUL_APPLICATION'
          ],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [
            { url: testUrl }
          ]
        }
      };

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String), // Endpoint URL
        expectedRequestBody // Request body
      );
    });
  });
});