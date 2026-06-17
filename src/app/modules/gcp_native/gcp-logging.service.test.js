import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const {
  mockRequest,
  mockGetClient,
  mockConfig,
  mockLogger
} = vi.hoisted(() => {
  const mockRequest = vi.fn();
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
    warn: vi.fn(),
    error: vi.fn()
  };

  return {
    mockRequest,
    mockGetClient,
    mockConfig,
    mockLogger
  };
});

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor() {}
    getClient = mockGetClient;
  }
}));

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
    mockRequest.mockClear();
    mockGetClient.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockConfig.google.gcp_project_id = 'test-project-id';
    mockConfig.env = 'test-env';
    delete process.env.GCP_PROJECT_ID;
    mockRequest.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    process.env.GCP_PROJECT_ID = originalEnvProjectId;
  });

  it('should write a log entry successfully with default parameters', async () => {
    const result = await GcpLoggingService.writeLogEntry('test-log', 'INFO', { message: 'test message' });

    expect(mockGetClient).toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledWith({
      url: 'https://logging.googleapis.com/v2/entries:write',
      method: 'POST',
      data: {
        entries: [
          {
            logName: 'projects/test-project-id/logs/test-log',
            resource: { type: 'global', labels: {} },
            jsonPayload: { message: 'test message' },
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
      payload: { message: 'test message' }
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Stackdriver Logging: Streaming entry into project "test-project-id"')
    );
  });

  it('should write a log entry with custom severity and labels', async () => {
    const result = await GcpLoggingService.writeLogEntry(
      'custom-log',
      'WARNING',
      { message: 'warning message', userId: '12345', action: 'login' },
      'trace-123'
    );

    expect(mockRequest).toHaveBeenCalledWith({
      url: 'https://logging.googleapis.com/v2/entries:write',
      method: 'POST',
      data: {
        entries: [
          {
            logName: 'projects/test-project-id/logs/custom-log',
            resource: { type: 'global', labels: {} },
            jsonPayload: { message: 'warning message', userId: '12345', action: 'login' },
            severity: 'WARNING',
            labels: {
              environment: 'test-env',
              action: 'login'
            },
            trace: 'projects/test-project-id/traces/trace-123',
            timestamp: expect.any(String)
          }
        ]
      }
    });

    expect(result).toEqual({
      success: true,
      logName: 'projects/test-project-id/logs/custom-log',
      severity: 'WARNING',
      payload: { message: 'warning message', userId: '12345', action: 'login' }
    });
  });

  it('should fallback to process.env.GCP_PROJECT_ID if config is not set', async () => {
    mockConfig.google.gcp_project_id = undefined;
    process.env.GCP_PROJECT_ID = 'env-project-id';

    const result = await GcpLoggingService.writeLogEntry('env-log', 'INFO', { message: 'env message' });

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

    await GcpLoggingService.writeLogEntry('dev-log', 'INFO', { message: 'dev message' });

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

  it('should return failure reason if GCP Project ID is missing', async () => {
    mockConfig.google.gcp_project_id = undefined;
    delete process.env.GCP_PROJECT_ID;

    const result = await GcpLoggingService.writeLogEntry('test-log', 'INFO', { message: 'test message' });

    expect(result).toEqual({
      success: false,
      reason: 'GCP_PROJECT_ID_MISSING',
      details: 'GCP Project ID is not configured.'
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('should log error and throw a wrapped error if client request fails', async () => {
    const apiError = new Error('API connection timeout');
    mockRequest.mockRejectedValueOnce(apiError);

    await expect(
      GcpLoggingService.writeLogEntry('test-log', 'INFO', { message: 'test message' })
    ).rejects.toThrow('Cloud Logging failed: API connection timeout');

    expect(mockLogger.error).toHaveBeenCalledWith('Stackdriver Logging Error:', expect.objectContaining({
      message: 'API connection timeout'
    }));
  });
});