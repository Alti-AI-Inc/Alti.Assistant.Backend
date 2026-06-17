import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleAuth } from 'google-auth-library';

const {
  mockGoogleAuthInstance,
  mockGoogleAuthCalls,
  mockConfig,
  mockLogger
} = vi.hoisted(() => {
  const mockGoogleAuthCalls = [];
  const mockGoogleAuthInstance = {
    getClient: vi.fn(),
  };
  const mockConfig = {
    google: {
      gcp_project_id: 'test-project-id',
      gcp_location: 'us-central1',
    },
  };
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockGoogleAuthCalls,
    mockGoogleAuthInstance,
    mockConfig,
    mockLogger
  };
});

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor(...args) {
      mockGoogleAuthCalls.push(args);
      return mockGoogleAuthInstance;
    }
  }
}));
vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Import the service after mocks are set up
import { GcpTasksService } from './gcp-tasks.service.js';

describe('GcpTasksService', () => {
  const mockClientRequest = vi.fn();
  const mockClient = {
    request: mockClientRequest,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGoogleAuthInstance.getClient.mockResolvedValue(mockClient);
    mockClientRequest.mockResolvedValue({
      data: {
        name: 'projects/test-project-id/locations/us-central1/queues/alti-default-tasks/tasks/test-task-id',
        scheduleTime: new Date().toISOString(),
      },
    });
    // Reset config mocks to default successful values
    mockConfig.google.gcp_project_id = 'test-project-id';
    mockConfig.google.gcp_location = 'us-central1';
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_LOCATION;
  });

  it('should initialize GoogleAuth with correct scopes', () => {
    // The module is imported once, so GoogleAuth constructor is called once.
    // We need to ensure it's called with the correct scope.
    expect(mockGoogleAuthCalls).toHaveLength(1);
    expect(mockGoogleAuthCalls[0][0]).toEqual({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  });

  describe('createHttpTask', () => {
    const defaultUrl = 'https://example.com/callback';
    const defaultPayload = { key: 'value', data: 123 };

    it('should successfully create a task with default parameters', async () => {
      const result = await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl);

      expect(mockGoogleAuthInstance.getClient).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledWith({
        url: 'https://cloudtasks.googleapis.com/v2/projects/test-project-id/locations/us-central1/queues/alti-default-tasks/tasks',
        method: 'POST',
        data: {
          task: {
            httpRequest: {
              httpMethod: 'POST',
              url: defaultUrl,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          },
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'GCP Cloud Tasks: Dispatching task to queue "projects/test-project-id/locations/us-central1/queues/alti-default-tasks"...'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('GCP Cloud Tasks: Task successfully enqueued:')
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          taskName: expect.any(String),
          dispatchUrl: defaultUrl,
          scheduleTime: expect.any(String),
          queue: 'alti-default-tasks',
          delaySeconds: 0,
        })
      );
    });

    it('should successfully create a task with a payload', async () => {
      const result = await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl, defaultPayload);

      expect(mockClientRequest).toHaveBeenCalledTimes(1);
      const expectedBody = Buffer.from(JSON.stringify(defaultPayload)).toString('base64');
      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            task: {
              httpRequest: expect.objectContaining({
                body: expectedBody,
              }),
            },
          },
        })
      );
      expect(result.success).toBe(true);
    });

    it('should successfully create a task with a delay', async () => {
      const delaySeconds = 60;
      const result = await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl, {}, delaySeconds);

      expect(mockClientRequest).toHaveBeenCalledTimes(1);
      const callArgs = mockClientRequest.mock.calls[0][0];
      const scheduleTime = callArgs.data.task.scheduleTime;
      expect(scheduleTime).toBeDefined();
      const now = Date.now();
      const scheduledMs = new Date(scheduleTime).getTime();
      // Allow for slight test execution delay (e.g., 1 second tolerance)
      expect(scheduledMs).toBeGreaterThanOrEqual(now + delaySeconds * 1000 - 1000);
      expect(scheduledMs).toBeLessThanOrEqual(now + delaySeconds * 1000 + 1000);

      expect(result.success).toBe(true);
      expect(result.delaySeconds).toBe(delaySeconds);
    });

    it('should successfully create a task with custom headers', async () => {
      const customHeaders = { 'X-Custom-Header': 'test-value', 'Authorization': 'Bearer token' };
      const result = await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl, {}, 0, customHeaders);

      expect(mockClientRequest).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            task: {
              httpRequest: expect.objectContaining({
                headers: {
                  'Content-Type': 'application/json',
                  'X-Custom-Header': 'test-value',
                  'Authorization': 'Bearer token',
                },
              }),
            },
          },
        })
      );
      expect(result.success).toBe(true);
    });

    it('should use the provided queue name', async () => {
      const customQueueName = 'my-custom-queue';
      const result = await GcpTasksService.createHttpTask(customQueueName, defaultUrl);

      expect(mockClientRequest).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `https://cloudtasks.googleapis.com/v2/projects/test-project-id/locations/us-central1/queues/${customQueueName}/tasks`,
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Dispatching task to queue "projects/test-project-id/locations/us-central1/queues/${customQueueName}"...`)
      );
      expect(result.success).toBe(true);
      expect(result.queue).toBe(customQueueName);
    });

    it('should throw an error if GCP Project ID is not configured', async () => {
      mockConfig.google.gcp_project_id = undefined;

      await expect(GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl)).rejects.toThrow(
        'GCP Project ID is not configured.'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'GCP Cloud Tasks Dispatch Error:',
        expect.any(Error)
      );
      expect(mockClientRequest).not.toHaveBeenCalled();
    });

    it('should throw an error if target callback URL is not provided', async () => {
      await expect(GcpTasksService.createHttpTask('alti-default-tasks', undefined)).rejects.toThrow(
        'Target callback URL is required.'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'GCP Cloud Tasks Dispatch Error:',
        expect.any(Error)
      );
      expect(mockClientRequest).not.toHaveBeenCalled();
    });

    it('should throw a wrapped error if client.request fails', async () => {
      const clientError = new Error('Network error');
      mockClientRequest.mockRejectedValue(clientError);

      await expect(GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl)).rejects.toThrow(
        'Cloud Tasks dispatch failed: Network error'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'GCP Cloud Tasks Dispatch Error:',
        clientError
      );
    });

    it('should prioritize config.google.gcp_project_id over process.env.GCP_PROJECT_ID', async () => {
      process.env.GCP_PROJECT_ID = 'env-project-id';
      mockConfig.google.gcp_project_id = 'config-project-id';

      await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('projects/config-project-id/'),
        })
      );
    });

    it('should use process.env.GCP_PROJECT_ID if config.google.gcp_project_id is missing', async () => {
      mockConfig.google.gcp_project_id = undefined;
      process.env.GCP_PROJECT_ID = 'env-project-id';

      await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('projects/env-project-id/'),
        })
      );
    });

    it('should prioritize config.google.gcp_location over process.env.GCP_LOCATION', async () => {
      process.env.GCP_LOCATION = 'env-location';
      mockConfig.google.gcp_location = 'config-location';

      await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/locations/config-location/'),
        })
      );
    });

    it('should use process.env.GCP_LOCATION if config.google.gcp_location is missing', async () => {
      mockConfig.google.gcp_location = undefined;
      process.env.GCP_LOCATION = 'env-location';

      await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/locations/env-location/'),
        })
      );
    });

    it('should use default location "us-central1" if both config and env location are missing', async () => {
      mockConfig.google.gcp_location = undefined;
      delete process.env.GCP_LOCATION;

      await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl);

      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/locations/us-central1/'),
        })
      );
    });

    it('should handle empty payload gracefully (no body in request)', async () => {
      await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl, {});

      expect(mockClientRequest).toHaveBeenCalledTimes(1);
      const callArgs = mockClientRequest.mock.calls[0][0];
      expect(callArgs.data.task.httpRequest).not.toHaveProperty('body');
    });

    it('should handle null payload gracefully (no body in request)', async () => {
      await GcpTasksService.createHttpTask('alti-default-tasks', defaultUrl, null);

      expect(mockClientRequest).toHaveBeenCalledTimes(1);
      const callArgs = mockClientRequest.mock.calls[0][0];
      expect(callArgs.data.task.httpRequest).not.toHaveProperty('body');
    });
  });
});