import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GcpSecretsService } from './gcp-secrets.service.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const {
  mockRequest,
  mockGetClient
} = vi.hoisted(() => {
  const mockRequest = vi.fn();
  const mockGetClient = vi.fn().mockResolvedValue({ request: mockRequest });

  return {
    mockRequest,
    mockGetClient
  };
});

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor() {}
    getClient = mockGetClient;
  }
}));

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
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('GcpSecretsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.google.gcp_project_id = 'test-project-id';
    delete process.env.GCP_PROJECT_ID;
  });

  describe('getSecretValue', () => {
    it('should successfully retrieve and decode a secret', async () => {
      const secretId = 'my-secret';
      const secretValue = 'super-secret-value';
      const base64Value = Buffer.from(secretValue).toString('base64');

      mockRequest.mockResolvedValueOnce({
        data: {
          payload: {
            data: base64Value
          }
        }
      });

      const result = await GcpSecretsService.getSecretValue(secretId);

      expect(result).toEqual({
        success: true,
        secretId,
        value: secretValue
      });
      expect(mockRequest).toHaveBeenCalledWith({
        url: `https://secretmanager.googleapis.com/v1/projects/test-project-id/secrets/${secretId}/versions/latest:access`,
        method: 'GET'
      });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Fetching latest version of secret "${secretId}"`));
    });

    it('should fallback to process.env.GCP_PROJECT_ID if config is missing', async () => {
      config.google.gcp_project_id = undefined;
      process.env.GCP_PROJECT_ID = 'env-project-id';

      const secretId = 'my-secret';
      const secretValue = 'env-secret-value';
      const base64Value = Buffer.from(secretValue).toString('base64');

      mockRequest.mockResolvedValueOnce({
        data: {
          payload: {
            data: base64Value
          }
        }
      });

      const result = await GcpSecretsService.getSecretValue(secretId);

      expect(result.value).toBe(secretValue);
      expect(mockRequest).toHaveBeenCalledWith({
        url: `https://secretmanager.googleapis.com/v1/projects/env-project-id/secrets/${secretId}/versions/latest:access`,
        method: 'GET'
      });
    });

    it('should throw generic error if GCP Project ID is missing', async () => {
      config.google.gcp_project_id = undefined;
      process.env.GCP_PROJECT_ID = undefined;

      await expect(GcpSecretsService.getSecretValue('my-secret')).rejects.toThrow(
        'Failed to retrieve secret "my-secret". Please check logs for details.'
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Secret Manager Retrieval Error for my-secret:'),
        expect.any(Error)
      );
    });

    it('should throw generic error if payload is empty', async () => {
      mockRequest.mockResolvedValueOnce({
        data: {
          payload: {}
        }
      });

      await expect(GcpSecretsService.getSecretValue('my-secret')).rejects.toThrow(
        'Failed to retrieve secret "my-secret". Please check logs for details.'
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should throw generic error if client request fails', async () => {
      mockRequest.mockRejectedValueOnce(new Error('API Error'));

      await expect(GcpSecretsService.getSecretValue('my-secret')).rejects.toThrow(
        'Failed to retrieve secret "my-secret". Please check logs for details.'
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Secret Manager Retrieval Error for my-secret:'),
        expect.objectContaining({ message: 'API Error' })
      );
    });
  });

  describe('createSecretValue', () => {
    it('should successfully create container and add version', async () => {
      const secretId = 'new-secret';
      const secretValue = 'new-value';
      const base64Value = Buffer.from(secretValue).toString('base64');

      // First call: Create container
      mockRequest.mockResolvedValueOnce({ status: 200 });
      // Second call: Add version
      mockRequest.mockResolvedValueOnce({
        data: {
          name: 'projects/test-project-id/secrets/new-secret/versions/1',
          state: 'ENABLED'
        }
      });

      const result = await GcpSecretsService.createSecretValue(secretId, secretValue);

      expect(result).toEqual({
        success: true,
        secretId,
        version: 'projects/test-project-id/secrets/new-secret/versions/1',
        state: 'ENABLED'
      });

      expect(mockRequest).toHaveBeenNthCalledWith(1, {
        url: 'https://secretmanager.googleapis.com/v1/projects/test-project-id/secrets',
        method: 'POST',
        data: {
          replication: {
            automatic: {}
          }
        },
        params: {
          secretId
        }
      });

      expect(mockRequest).toHaveBeenNthCalledWith(2, {
        url: `https://secretmanager.googleapis.com/v1/projects/test-project-id/secrets/${secretId}:addVersion`,
        method: 'POST',
        data: {
          payload: {
            data: base64Value
          }
        }
      });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully created container "${secretId}"`));
    });

    it('should proceed to add version if container already exists (409 Conflict)', async () => {
      const secretId = 'existing-secret';
      const secretValue = 'new-value';
      const base64Value = Buffer.from(secretValue).toString('base64');

      const conflictError = new Error('Conflict');
      conflictError.response = { status: 409 };

      // First call: Create container throws 409
      mockRequest.mockRejectedValueOnce(conflictError);
      // Second call: Add version succeeds
      mockRequest.mockResolvedValueOnce({
        data: {
          name: 'projects/test-project-id/secrets/existing-secret/versions/2',
          state: 'ENABLED'
        }
      });

      const result = await GcpSecretsService.createSecretValue(secretId, secretValue);

      expect(result).toEqual({
        success: true,
        secretId,
        version: 'projects/test-project-id/secrets/existing-secret/versions/2',
        state: 'ENABLED'
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Container "${secretId}" already exists. Proceeding to add version.`)
      );
    });

    it('should throw generic error if container creation fails with non-409 error', async () => {
      const secretId = 'failed-secret';
      const secretValue = 'value';

      const forbiddenError = new Error('Forbidden');
      forbiddenError.response = { status: 403 };

      mockRequest.mockRejectedValueOnce(forbiddenError);

      await expect(GcpSecretsService.createSecretValue(secretId, secretValue)).rejects.toThrow(
        `Failed to create or update secret "${secretId}". Please check logs for details.`
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to create container "${secretId}":`),
        forbiddenError
      );
    });

    it('should throw generic error if version addition fails', async () => {
      const secretId = 'secret-id';
      const secretValue = 'value';

      // First call: Create container succeeds
      mockRequest.mockResolvedValueOnce({ status: 200 });
      // Second call: Add version fails
      mockRequest.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(GcpSecretsService.createSecretValue(secretId, secretValue)).rejects.toThrow(
        `Failed to create or update secret "${secretId}". Please check logs for details.`
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Secret Manager Version Addition Error for ${secretId}:`),
        expect.any(Error)
      );
    });

    it('should throw generic error if GCP Project ID is missing during creation', async () => {
      config.google.gcp_project_id = undefined;
      process.env.GCP_PROJECT_ID = undefined;

      await expect(GcpSecretsService.createSecretValue('secret-id', 'value')).rejects.toThrow(
        'Failed to create or update secret "secret-id". Please check logs for details.'
      );
    });
  });
});