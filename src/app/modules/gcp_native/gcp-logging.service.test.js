import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockRequest = vi.fn();

const {
  mockGetClient,
  mockConfig,
  mockLogger
} = vi.hoisted(() => {
  const mockGetClient = vi.fn().mockResolvedValue({
    request: mockRequest
  });

  const mockConfig = {
    google: {
      gcp_project_id: 'test-project-id'
    },
    env: 'test-env'
  };

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn()
  };

  return {
    mockGetClient,
    mockConfig,
    mockLogger
  };
});

vi.mock('google-auth-library', () => {
  return {
    GoogleAuth: vi.fn().mockImplementation(() => {
      return {
        getClient: mockGetClient
      };
    })
  };
});

vi.mock('../../../../config/index.js', () => ({
  default: mockConfig
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger
}));

import { GcpLoggingService } from './gcp-logging.service.js';

describe('GcpLoggingService', () => {
  const originalEnvProjectId = process.env.GCP_PROJECT_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.google.gcp_project_id = 'test-project-id';
    mockConfig.env = 'test-env';
    process.env.GCP_PROJECT_ID = undefined;
    mockRequest.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    process.env.GCP_PROJECT_ID = originalEnvProjectId;
  });

  it('should write a log entry successfully with default parameters', async () => {
    const result = await GcpLoggingService.writeLogEntry('test-log', 'test message');

    expect(mockGetClient).toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledWith({
      url: 'https://logging.googleapis.com/v2/entries:write',
      method: 'POST',
      data: {
        entries: [
          {
            logName: 'projects/test-project-id/logs/test-log',
            resource: { type: 'global' },
            textPayload: 'test message',
            severity: 'INFO',
            labels: { environment: 'test-env' },
            timestamp: expect.any(String)
          }
        ]
      }
    });

    expect(result).toEqual({
      success: true,
      logName: 'projects/test-project-id/logs/test-log',
      severity: 'INFO',
      message: 'test message',
      labels: {}
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Stackdriver Logging: Streaming entry into project "test-project-id"')
    );
  });

  it('should write a log entry with custom severity and labels', async () => {
    const result = await GcpLoggingService.writeLogEntry(
      'custom-log',
      'warning message',
      'WARNING',
      { userId: '12345', action: 'login' }
    );

    expect(mockRequest).toHaveBeenCalledWith({
      url: 'https://logging.googleapis.com/v2/entries:write',
      method: 'POST',
      data: {
        entries: [
          {
            logName: 'projects/test-project-id/logs/custom-log',
            resource: { type: 'global' },
            textPayload: 'warning message',
            severity: 'WARNING',
            labels: {
              environment: 'test-env',
              userId: '12345',
              action: 'login'
            },
            timestamp: expect.any(String)
          }
        ]
      }
    });

    expect(result).toEqual({
      success: true,
      logName: 'projects/test-project-id/logs/custom-log',
      severity: 'WARNING',
      message: 'warning message',
      labels: { userId: '12345', action: 'login' }
    });
  });

  it('should fallback to process.env.GCP_PROJECT_ID if config is not set', async () => {
    mockConfig.google.gcp_project_id = undefined;
    process.env.GCP_PROJECT_ID = 'env-project-id';

    const result = await GcpLoggingService.writeLogEntry('env-log', 'env message');

    expect(result.logName).toBe('projects/env-project-id/logs/env-log');
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entries: [
            expect.objectContaining({
              logName: 'projects/env-project-id/logs/env-log'
            })
          ]
        })
      })
    );
  });

  it('should fallback to default environment "development" if config.env is missing', async () => {
    mockConfig.env = undefined;

    await GcpLoggingService.writeLogEntry('dev-log', 'dev message');

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entries: [
            expect.objectContaining({
              labels: { environment: 'development' }
            })
          ]
        })
      })
    );
  });

  it('should throw an error if GCP Project ID is missing', async () => {
    mockConfig.google.gcp_project_id = undefined;
    process.env.GCP_PROJECT_ID = undefined;

    await expect(
      GcpLoggingService.writeLogEntry('test-log', 'test message')
    ).rejects.toThrow('GCP Project ID is not configured.');

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('should log error and throw a wrapped error if client request fails', async () => {
    const apiError = new Error('API connection timeout');
    mockRequest.mockRejectedValueOnce(apiError);

    await expect(
      GcpLoggingService.writeLogEntry('test-log', 'test message')
    ).rejects.toThrow('Cloud Logging failed: API connection timeout');

    expect(mockLogger.error).toHaveBeenCalledWith('Stackdriver Logging Error:', apiError);
  });
});