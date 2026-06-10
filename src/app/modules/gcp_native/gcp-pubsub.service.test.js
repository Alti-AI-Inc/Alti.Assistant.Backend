import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GcpPubSubService } from './gcp-pubsub.service.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const mockRequest = vi.fn();
const mockGetClient = vi.fn().mockResolvedValue({
  request: mockRequest
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

describe('GcpPubSubService', () => {
  let originalEnvProjectId;
  let originalConfigProjectId;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnvProjectId = process.env.GCP_PROJECT_ID;
    originalConfigProjectId = config.google.gcp_project_id;
    
    config.google.gcp_project_id = 'test-project-id';
    delete process.env.GCP_PROJECT_ID;
  });

  afterEach(() => {
    process.env.GCP_PROJECT_ID = originalEnvProjectId;
    config.google.gcp_project_id = originalConfigProjectId;
  });

  describe('createTopic', () => {
    it('should successfully create a topic using config project ID', async () => {
      mockRequest.mockResolvedValueOnce({
        data: { name: 'projects/test-project-id/topics/my-topic' }
      });

      const result = await GcpPubSubService.createTopic('my-topic');

      expect(result).toEqual({
        success: true,
        projectId: 'test-project-id',
        topicId: 'my-topic',
        name: 'projects/test-project-id/topics/my-topic'
      });

      expect(mockRequest).toHaveBeenCalledWith({
        url: 'https://pubsub.googleapis.com/v1/projects/test-project-id/topics/my-topic',
        method: 'PUT'
      });
      expect(logger.info).toHaveBeenCalledWith('Pub/Sub: Creating Topic "my-topic"...');
    });

    it('should fallback to process.env.GCP_PROJECT_ID if config is missing', async () => {
      config.google.gcp_project_id = undefined;
      process.env.GCP_PROJECT_ID = 'env-project-id';

      mockRequest.mockResolvedValueOnce({
        data: { name: 'projects/env-project-id/topics/my-topic' }
      });

      const result = await GcpPubSubService.createTopic('my-topic');

      expect(result.projectId).toBe('env-project-id');
      expect(mockRequest).toHaveBeenCalledWith({
        url: 'https://pubsub.googleapis.com/v1/projects/env-project-id/topics/my-topic',
        method: 'PUT'
      });
    });

    it('should throw an error if no project ID is configured', async () => {
      config.google.gcp_project_id = undefined;
      delete process.env.GCP_PROJECT_ID;

      await expect(GcpPubSubService.createTopic('my-topic')).rejects.toThrow(
        'Pub/Sub Topic creation failed: GCP Project ID is not configured.'
      );
    });

    it('should log and throw error if API request fails', async () => {
      const apiError = new Error('API Connection Timeout');
      mockRequest.mockRejectedValueOnce(apiError);

      await expect(GcpPubSubService.createTopic('my-topic')).rejects.toThrow(
        'Pub/Sub Topic creation failed: API Connection Timeout'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Pub/Sub Topic Creation Error for my-topic:',
        apiError
      );
    });
  });

  describe('publishMessage', () => {
    it('should successfully publish a JSON payload encoded in base64', async () => {
      mockRequest.mockResolvedValueOnce({
        data: { messageIds: ['msg-111', 'msg-222'] }
      });

      const payload = { event: 'user_signup', userId: 42 };
      const result = await GcpPubSubService.publishMessage('my-topic', payload);

      expect(result).toEqual({
        success: true,
        topicId: 'my-topic',
        messageIds: ['msg-111', 'msg-222']
      });

      const expectedBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
      expect(mockRequest).toHaveBeenCalledWith({
        url: 'https://pubsub.googleapis.com/v1/projects/test-project-id/topics/my-topic:publish',
        method: 'POST',
        data: {
          messages: [
            {
              data: expectedBase64
            }
          ]
        }
      });
      expect(logger.info).toHaveBeenCalledWith('Pub/Sub: Publishing message to Topic "my-topic"...');
    });

    it('should return empty messageIds array if response data is empty', async () => {
      mockRequest.mockResolvedValueOnce({ data: {} });

      const result = await GcpPubSubService.publishMessage('my-topic', {});
      expect(result.messageIds).toEqual([]);
    });

    it('should throw an error if no project ID is configured', async () => {
      config.google.gcp_project_id = undefined;
      delete process.env.GCP_PROJECT_ID;

      await expect(GcpPubSubService.publishMessage('my-topic', {})).rejects.toThrow(
        'Pub/Sub Publish failed: GCP Project ID is not configured.'
      );
    });

    it('should log and throw error if publish API request fails', async () => {
      const apiError = new Error('Unauthorized');
      mockRequest.mockRejectedValueOnce(apiError);

      await expect(GcpPubSubService.publishMessage('my-topic', {})).rejects.toThrow(
        'Pub/Sub Publish failed: Unauthorized'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Pub/Sub Publish Error for Topic my-topic:',
        apiError
      );
    });
  });

  describe('createSubscription', () => {
    it('should successfully create a standard pull subscription when pushEndpoint is omitted', async () => {
      mockRequest.mockResolvedValueOnce({
        data: {
          name: 'projects/test-project-id/subscriptions/my-sub'
        }
      });

      const result = await GcpPubSubService.createSubscription('my-topic', 'my-sub');

      expect(result).toEqual({
        success: true,
        projectId: 'test-project-id',
        topicId: 'my-topic',
        subscriptionId: 'my-sub',
        name: 'projects/test-project-id/subscriptions/my-sub',
        pushConfig: undefined
      });

      expect(mockRequest).toHaveBeenCalledWith({
        url: 'https://pubsub.googleapis.com/v1/projects/test-project-id/subscriptions/my-sub',
        method: 'PUT',
        data: {
          topic: 'projects/test-project-id/topics/my-topic',
          ackDeadlineSeconds: 10
        }
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Pub/Sub: Creating Subscription "my-sub" for Topic "my-topic"...'
      );
    });

    it('should successfully create a push subscription when pushEndpoint is provided', async () => {
      const pushEndpoint = 'https://api.example.com/webhook';
      mockRequest.mockResolvedValueOnce({
        data: {
          name: 'projects/test-project-id/subscriptions/my-sub',
          pushConfig: { pushEndpoint }
        }
      });

      const result = await GcpPubSubService.createSubscription('my-topic', 'my-sub', pushEndpoint);

      expect(result).toEqual({
        success: true,
        projectId: 'test-project-id',
        topicId: 'my-topic',
        subscriptionId: 'my-sub',
        name: 'projects/test-project-id/subscriptions/my-sub',
        pushConfig: { pushEndpoint }
      });

      expect(mockRequest).toHaveBeenCalledWith({
        url: 'https://pubsub.googleapis.com/v1/projects/test-project-id/subscriptions/my-sub',
        method: 'PUT',
        data: {
          topic: 'projects/test-project-id/topics/my-topic',
          ackDeadlineSeconds: 10,
          pushConfig: {
            pushEndpoint
          }
        }
      });
    });

    it('should throw an error if no project ID is configured', async () => {
      config.google.gcp_project_id = undefined;
      delete process.env.GCP_PROJECT_ID;

      await expect(GcpPubSubService.createSubscription('my-topic', 'my-sub')).rejects.toThrow(
        'Pub/Sub Subscription creation failed: GCP Project ID is not configured.'
      );
    });

    it('should log and throw error if subscription API request fails', async () => {
      const apiError = new Error('Quota Exceeded');
      mockRequest.mockRejectedValueOnce(apiError);

      await expect(GcpPubSubService.createSubscription('my-topic', 'my-sub')).rejects.toThrow(
        'Pub/Sub Subscription creation failed: Quota Exceeded'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Pub/Sub Subscription Creation Error for my-sub:',
        apiError
      );
    });
  });
});