import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const { mockPublishMessage, mockTopic } = vi.hoisted(() => {
  const mockPublishMessage = vi.fn().mockResolvedValue('pubsub-msg-id-123');
  const mockTopic = vi.fn().mockReturnValue({
    publishMessage: mockPublishMessage,
    name: 'gcp-error-reporting-events',
  });
  return { mockPublishMessage, mockTopic };
});

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: class {
    constructor() {
      this.topic = mockTopic;
    }
  }
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'test-project-id',
      error_reporting_topic: 'gcp-error-reporting-events'
    }
  }
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

// Import GcpErrorsService after the Pub/Sub mock is established
import { GcpErrorsService } from './gcp-errors.service.js';

describe('GcpErrorsService', () => {
  let originalGcpProjectId;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublishMessage.mockResolvedValue('pubsub-msg-id-123');
    // Store original env var and clear it for tests
    originalGcpProjectId = process.env.GCP_PROJECT_ID;
    delete process.env.GCP_PROJECT_ID;
  });

  afterEach(() => {
    // Restore original env var
    if (originalGcpProjectId) {
      process.env.GCP_PROJECT_ID = originalGcpProjectId;
    }
  });

  describe('reportError', () => {
    it('should return success: false if GCP_PROJECT_ID is not configured', async () => {
      // Temporarily override the config for this test
      const originalProjectId = config.google.gcp_project_id;
      config.google.gcp_project_id = undefined;

      const result = await GcpErrorsService.reportError('test error');

      expect(result).toEqual({
        success: false,
        error: 'Failed to queue error report to Pub/Sub: GCP Project ID is not configured.'
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Pub/Sub queueing for error report failed:',
        expect.any(Error)
      );
      expect(mockPublishMessage).not.toHaveBeenCalled();

      // Restore config
      config.google.gcp_project_id = originalProjectId;
    });

    it('should use process.env.GCP_PROJECT_ID as a fallback', async () => {
      const originalProjectId = config.google.gcp_project_id;
      config.google.gcp_project_id = undefined;
      process.env.GCP_PROJECT_ID = 'env-project-id';

      const result = await GcpErrorsService.reportError('test error');

      expect(result.success).toBe(true);
      expect(mockPublishMessage).toHaveBeenCalledOnce();
      
      const publishedData = JSON.parse(mockPublishMessage.mock.calls[0][0].data.toString());
      expect(publishedData.projectId).toBe('env-project-id');

      // Restore config
      config.google.gcp_project_id = originalProjectId;
    });

    it('should report an error with all parameters provided', async () => {
      const errorMessage = 'A critical failure occurred';
      const stackTrace = 'at functionA (file.js:10:5)\nat functionB (file.js:20:5)';
      const user = 'user-123';
      const serviceName = 'custom-service';

      const result = await GcpErrorsService.reportError(errorMessage, stackTrace, user, serviceName);

      expect(logger.info).toHaveBeenCalledWith(
        `GCP Errors: Queuing error report for service "${serviceName}" to Pub/Sub topic "gcp-error-reporting-events"...`
      );
      expect(mockPublishMessage).toHaveBeenCalledOnce();

      const publishedData = JSON.parse(mockPublishMessage.mock.calls[0][0].data.toString());
      expect(publishedData.serviceContext.service).toBe(serviceName);
      expect(publishedData.message).toBe(`${errorMessage}\n${stackTrace}`);
      expect(publishedData.context.user).toBe(user);
      expect(publishedData.projectId).toBe('test-project-id');
      expect(publishedData.eventTime).toBeDefined();

      expect(result).toEqual({
        success: true,
        messageId: 'pubsub-msg-id-123',
        serviceName,
        user
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should report an error using default values for optional parameters', async () => {
      const errorMessage = 'A simple failure';

      const result = await GcpErrorsService.reportError(errorMessage);

      expect(logger.info).toHaveBeenCalledWith(
        'GCP Errors: Queuing error report for service "inso-backend" to Pub/Sub topic "gcp-error-reporting-events"...'
      );
      expect(mockPublishMessage).toHaveBeenCalledOnce();

      const publishedData = JSON.parse(mockPublishMessage.mock.calls[0][0].data.toString());
      expect(publishedData.serviceContext.service).toBe('inso-backend');
      expect(publishedData.message).toBe(errorMessage);
      expect(publishedData.context.user).toBe('');

      expect(result).toEqual({
        success: true,
        messageId: 'pubsub-msg-id-123',
        serviceName: 'inso-backend',
        user: ''
      });
    });

    it('should return success: false if Pub/Sub publishing fails', async () => {
      const pubsubError = new Error('Pub/Sub connection timed out');
      mockPublishMessage.mockRejectedValue(pubsubError);

      const result = await GcpErrorsService.reportError('test error');

      expect(result).toEqual({
        success: false,
        error: 'Failed to queue error report to Pub/Sub: Pub/Sub connection timed out'
      });

      expect(logger.error).toHaveBeenCalledWith('Pub/Sub queueing for error report failed:', pubsubError);
    });

    it('should correctly format the message when stackTrace is an empty string', async () => {
      const errorMessage = 'Error without stack';
      await GcpErrorsService.reportError(errorMessage, '');

      const publishedData = JSON.parse(mockPublishMessage.mock.calls[0][0].data.toString());
      expect(publishedData.message).toBe(errorMessage);
    });
  });
});