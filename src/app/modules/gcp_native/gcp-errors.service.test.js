import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { GcpErrorsService } from './gcp-errors.service.js';

// Mock dependencies
vi.mock('google-auth-library');
vi.mock('../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'test-project-id'
    }
  }
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('GcpErrorsService', () => {
  let mockClient;
  let originalGcpProjectId;

  beforeEach(() => {
    mockClient = {
      request: vi.fn().mockResolvedValue({}),
    };
    GoogleAuth.prototype.getClient = vi.fn().mockResolvedValue(mockClient);

    // Store original env var and clear it for tests
    originalGcpProjectId = process.env.GCP_PROJECT_ID;
    delete process.env.GCP_PROJECT_ID;
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Restore original env var
    if (originalGcpProjectId) {
      process.env.GCP_PROJECT_ID = originalGcpProjectId;
    }
  });

  describe('reportError', () => {
    it('should throw an error if GCP_PROJECT_ID is not configured', async () => {
      // Temporarily override the mock for this test
      vi.spyOn(config.google, 'gcp_project_id', 'get').mockReturnValue(undefined);

      await expect(GcpErrorsService.reportError('test error')).rejects.toThrow(
        'GCP Project ID is not configured.'
      );

      expect(logger.error).not.toHaveBeenCalled(); // Error is thrown before logging
      expect(GoogleAuth.prototype.getClient).not.toHaveBeenCalled();
    });

    it('should use process.env.GCP_PROJECT_ID as a fallback', async () => {
      const envProjectId = 'env-project-id';
      process.env.GCP_PROJECT_ID = envProjectId;
      vi.spyOn(config.google, 'gcp_project_id', 'get').mockReturnValue(undefined);

      await GcpErrorsService.reportError('test error');

      const expectedEndpoint = `https://clouderrorreporting.googleapis.com/v1beta1/projects/${envProjectId}/events:report`;
      expect(mockClient.request).toHaveBeenCalledWith(expect.objectContaining({
        url: expectedEndpoint
      }));
    });

    it('should report an error with all parameters provided', async () => {
      const errorMessage = 'A critical failure occurred';
      const stackTrace = 'at functionA (file.js:10:5)\nat functionB (file.js:20:5)';
      const user = 'user-123';
      const serviceName = 'custom-service';

      const result = await GcpErrorsService.reportError(errorMessage, stackTrace, user, serviceName);

      expect(logger.info).toHaveBeenCalledWith(
        `Stackdriver Errors: Dispatching error report into project "test-project-id" for service "${serviceName}"...`
      );
      expect(GoogleAuth.prototype.getClient).toHaveBeenCalledOnce();
      expect(mockClient.request).toHaveBeenCalledOnce();

      const requestCall = mockClient.request.mock.calls[0][0];
      expect(requestCall.url).toBe('https://clouderrorreporting.googleapis.com/v1beta1/projects/test-project-id/events:report');
      expect(requestCall.method).toBe('POST');
      expect(requestCall.data.serviceContext.service).toBe(serviceName);
      expect(requestCall.data.message).toBe(`${errorMessage}\n${stackTrace}`);
      expect(requestCall.data.context.user).toBe(user);
      expect(requestCall.data.eventTime).toBeDefined();

      expect(result).toEqual({
        success: true,
        serviceName,
        errorMessage,
        user
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should report an error using default values for optional parameters', async () => {
      const errorMessage = 'A simple failure';

      const result = await GcpErrorsService.reportError(errorMessage);

      expect(logger.info).toHaveBeenCalledWith(
        'Stackdriver Errors: Dispatching error report into project "test-project-id" for service "alti-backend"...'
      );
      expect(mockClient.request).toHaveBeenCalledOnce();

      const requestCall = mockClient.request.mock.calls[0][0];
      expect(requestCall.data.serviceContext.service).toBe('alti-backend');
      expect(requestCall.data.message).toBe(errorMessage);
      expect(requestCall.data.context.user).toBe('');

      expect(result).toEqual({
        success: true,
        serviceName: 'alti-backend',
        errorMessage,
        user: ''
      });
    });

    it('should handle errors from getClient and re-throw a formatted error', async () => {
      const authError = new Error('Authentication failed');
      GoogleAuth.prototype.getClient.mockRejectedValue(authError);

      await expect(GcpErrorsService.reportError('test error')).rejects.toThrow(
        'Cloud Error Reporting failed: Authentication failed'
      );

      expect(logger.error).toHaveBeenCalledWith('Stackdriver Error Reporting failed:', authError);
      expect(mockClient.request).not.toHaveBeenCalled();
    });

    it('should handle errors from client.request and re-throw a formatted error', async () => {
      const requestError = new Error('API request failed');
      mockClient.request.mockRejectedValue(requestError);

      await expect(GcpErrorsService.reportError('test error')).rejects.toThrow(
        'Cloud Error Reporting failed: API request failed'
      );

      expect(logger.error).toHaveBeenCalledWith('Stackdriver Error Reporting failed:', requestError);
    });

    it('should correctly format the message when stackTrace is an empty string', async () => {
      const errorMessage = 'Error without stack';
      await GcpErrorsService.reportError(errorMessage, '');

      const requestCall = mockClient.request.mock.calls[0][0];
      expect(requestCall.data.message).toBe(errorMessage);
    });
  });
});