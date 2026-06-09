import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GcpRecaptchaService } from './gcp-recaptcha.service.js';

// Mock external dependencies
const mockGoogleAuth = {
  getClient: vi.fn(),
};
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(() => mockGoogleAuth),
}));

const mockConfig = {
  google: {
    gcp_project_id: 'test-project-id',
  },
  recaptcha_site_key: 'test-config-site-key',
};
vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

describe('GcpRecaptchaService', () => {
  const MOCK_TOKEN = 'mock-recaptcha-token';
  const MOCK_EXPECTED_ACTION = 'mock-action';
  const MOCK_SITE_KEY_PARAM = 'mock-site-key-param';

  let mockClientRequest;
  let originalGcpProjectId;
  let originalRecaptchaSiteKey;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock the client.request method
    mockClientRequest = vi.fn();
    mockGoogleAuth.getClient.mockResolvedValue({
      request: mockClientRequest,
    });

    // Store original process.env values and config values
    originalGcpProjectId = process.env.GCP_PROJECT_ID;
    originalRecaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY;
    
    // Reset process.env variables that might be used
    delete process.env.GCP_PROJECT_ID;
    delete process.env.RECAPTCHA_SITE_KEY;

    // Restore default mock config values
    mockConfig.google.gcp_project_id = 'test-project-id';
    mockConfig.recaptcha_site_key = 'test-config-site-key';
  });

  afterEach(() => {
    // Clean up any process.env changes
    if (originalGcpProjectId !== undefined) {
      process.env.GCP_PROJECT_ID = originalGcpProjectId;
    } else {
      delete process.env.GCP_PROJECT_ID;
    }
    if (originalRecaptchaSiteKey !== undefined) {
      process.env.RECAPTCHA_SITE_KEY = originalRecaptchaSiteKey;
    } else {
      delete process.env.RECAPTCHA_SITE_KEY;
    }
  });

  describe('verifyRecaptchaToken', () => {
    it('should successfully verify a token and return assessment results', async () => {
      const mockApiResponse = {
        data: {
          riskAnalysis: {
            score: 0.9,
            reasons: ['HIGH_TRUST'],
          },
          tokenProperties: {
            valid: true,
            action: MOCK_EXPECTED_ACTION,
            createTime: '2023-01-01T00:00:00Z',
            hostname: 'example.com',
          },
        },
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      const result = await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION);

      expect(mockGoogleAuth.getClient).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledWith({
        url: `https://recaptchaenterprise.googleapis.com/v1/projects/${mockConfig.google.gcp_project_id}/assessments`,
        method: 'POST',
        data: {
          event: {
            token: MOCK_TOKEN,
            siteKey: mockConfig.recaptcha_site_key, // Default from config
            expectedAction: MOCK_EXPECTED_ACTION,
          },
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        `reCAPTCHA Enterprise: Evaluating token assessment for action "${MOCK_EXPECTED_ACTION}"...`
      );
      expect(result).toEqual({
        success: true,
        score: 0.9,
        reasons: ['HIGH_TRUST'],
        action: MOCK_EXPECTED_ACTION,
        invalidReason: '',
      });
    });

    it('should use the provided siteKey parameter if available', async () => {
      const mockApiResponse = {
        data: {
          riskAnalysis: { score: 0.7 },
          tokenProperties: { valid: true, action: MOCK_EXPECTED_ACTION },
        },
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION, MOCK_SITE_KEY_PARAM);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            event: expect.objectContaining({
              siteKey: MOCK_SITE_KEY_PARAM,
            }),
          },
        })
      );
    });

    it('should use process.env.RECAPTCHA_SITE_KEY if siteKey param is not provided', async () => {
      process.env.RECAPTCHA_SITE_KEY = 'env-site-key';
      const mockApiResponse = {
        data: {
          riskAnalysis: { score: 0.7 },
          tokenProperties: { valid: true, action: MOCK_EXPECTED_ACTION },
        },
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            event: expect.objectContaining({
              siteKey: 'env-site-key',
            }),
          },
        })
      );
    });

    it('should use config.recaptcha_site_key if no other siteKey is provided', async () => {
      // Ensure process.env.RECAPTCHA_SITE_KEY is not set.
      delete process.env.RECAPTCHA_SITE_KEY;
      const mockApiResponse = {
        data: {
          riskAnalysis: { score: 0.7 },
          tokenProperties: { valid: true, action: MOCK_EXPECTED_ACTION },
        },
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            event: expect.objectContaining({
              siteKey: mockConfig.recaptcha_site_key,
            }),
          },
        })
      );
    });

    it('should use the fallback "MOCK_RECAPTCHA_SITE_KEY" if no siteKey is configured', async () => {
      delete process.env.RECAPTCHA_SITE_KEY;
      mockConfig.recaptcha_site_key = undefined; // Simulate no config site key

      const mockApiResponse = {
        data: {
          riskAnalysis: { score: 0.7 },
          tokenProperties: { valid: true, action: MOCK_EXPECTED_ACTION },
        },
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            event: expect.objectContaining({
              siteKey: 'MOCK_RECAPTCHA_SITE_KEY',
            }),
          },
        })
      );
    });

    it('should throw an error if GCP Project ID is not configured', async () => {
      mockConfig.google.gcp_project_id = undefined;
      delete process.env.GCP_PROJECT_ID;

      await expect(GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION)).rejects.toThrow(
        'GCP Project ID is not configured.'
      );
      expect(mockLogger.error).not.toHaveBeenCalled(); // Error is thrown before API call
      expect(mockGoogleAuth.getClient).not.toHaveBeenCalled();
      expect(mockClientRequest).not.toHaveBeenCalled();
    });

    it('should use process.env.GCP_PROJECT_ID if config.google.gcp_project_id is not set', async () => {
      mockConfig.google.gcp_project_id = undefined;
      process.env.GCP_PROJECT_ID = 'env-project-id';

      const mockApiResponse = {
        data: {
          riskAnalysis: { score: 0.9 },
          tokenProperties: { valid: true, action: MOCK_EXPECTED_ACTION },
        },
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `https://recaptchaenterprise.googleapis.com/v1/projects/env-project-id/assessments`,
        })
      );
    });

    it('should handle API call failures gracefully', async () => {
      const apiError = new Error('API request failed');
      mockClientRequest.mockRejectedValue(apiError);

      await expect(GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION)).rejects.toThrow(
        `reCAPTCHA Enterprise validation failed: ${apiError.message}`
      );
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('reCAPTCHA Enterprise Verification failed:', apiError);
    });

    it('should return success: false if tokenProperties.valid is false', async () => {
      const mockApiResponse = {
        data: {
          riskAnalysis: {
            score: 0.1,
            reasons: ['TOKEN_UNVERIFIED'],
          },
          tokenProperties: {
            valid: false,
            action: MOCK_EXPECTED_ACTION,
            invalidReason: 'BAD_TOKEN',
          },
        },
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      const result = await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION);

      expect(result).toEqual({
        success: false,
        score: 0.1,
        reasons: ['TOKEN_UNVERIFIED'],
        action: MOCK_EXPECTED_ACTION,
        invalidReason: 'BAD_TOKEN',
      });
    });

    it('should return default values if riskAnalysis or tokenProperties are missing or empty', async () => {
      const mockApiResponse = {
        data: {}, // Empty data
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      const result = await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION);

      expect(result).toEqual({
        success: false,
        score: 0.0,
        reasons: [],
        action: MOCK_EXPECTED_ACTION, // Falls back to expectedAction param
        invalidReason: '',
      });
    });

    it('should handle expectedAction defaulting to empty string', async () => {
      const mockApiResponse = {
        data: {
          riskAnalysis: { score: 0.8 },
          tokenProperties: { valid: true, action: '' }, // API might return empty action
        },
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      const result = await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN); // No expectedAction provided

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            event: expect.objectContaining({
              expectedAction: '', // Should be empty string
            }),
          },
        })
      );
      expect(result.action).toBe(''); // Should reflect the API response or default
    });

    it('should use tokenProperties.action if available, otherwise fallback to expectedAction param', async () => {
      const apiAction = 'api-returned-action';
      const mockApiResponse = {
        data: {
          riskAnalysis: { score: 0.8 },
          tokenProperties: { valid: true, action: apiAction },
        },
      };
      mockClientRequest.mockResolvedValue(mockApiResponse);

      const result = await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION);
      expect(result.action).toBe(apiAction);

      // Test when API returns no action
      mockApiResponse.data.tokenProperties.action = undefined;
      mockClientRequest.mockResolvedValue(mockApiResponse);
      const result2 = await GcpRecaptchaService.verifyRecaptchaToken(MOCK_TOKEN, MOCK_EXPECTED_ACTION);
      expect(result2.action).toBe(MOCK_EXPECTED_ACTION);
    });
  });
});