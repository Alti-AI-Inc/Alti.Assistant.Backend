import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { TemporalController } from './temporal.controller.js';
import { TemporalCatalogService } from './temporal-catalog.service.js';
import pick from '../../utils/pick.js';
import ApiError from '../../utils/ApiError.js';
import { PubSub } from '@google-cloud/pubsub';

// Mock dependencies
const mockPublishMessage = vi.fn();
const mockTopic = vi.fn(() => ({
  publishMessage: mockPublishMessage
}));
vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn(() => ({
    topic: mockTopic
  }))
}));

vi.mock('./temporal-catalog.service.js', () => ({
  TemporalCatalogService: {
    searchCatalog: vi.fn(),
    getStats: vi.fn()
  }
}));

vi.mock('../../utils/ApiError.js', () => ({
  default: class ApiError extends Error {
    constructor(statusCode, message, isOperational, stack) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = isOperational;
      this.stack = stack;
    }
  }
}));

vi.mock('../../utils/pick.js', () => ({
  default: vi.fn((object, keys) => {
    const result = {};
    if (!object) return result;
    keys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        result[key] = object[key];
      }
    });
    return result;
  })
}));

describe('TemporalController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      query: {},
      params: {},
      body: {},
      user: null
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn()
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getRepositories', () => {
    it('should call searchCatalog with correct filters and options and return results', async () => {
      req.query = {
        query: 'test-repo',
        license: 'MIT',
        status: 'active',
        sortBy: 'createdAt:desc',
        limit: '25',
        page: '2'
      };
      const mockResult = { results: [{ id: '1', name: 'test-repo' }], totalResults: 1 };
      TemporalCatalogService.searchCatalog.mockResolvedValue(mockResult);

      await TemporalController.getRepositories(req, res, next);

      expect(pick).toHaveBeenCalledWith(req.query, ['query', 'license', 'status']);
      expect(pick).toHaveBeenCalledWith(req.query, ['sortBy', 'limit', 'page']);

      const expectedFilter = { query: 'test-repo', license: 'MIT', status: 'active' };
      const expectedOptions = { sortBy: 'createdAt:desc', limit: 25, page: 2, lean: true };

      expect(TemporalCatalogService.searchCatalog).toHaveBeenCalledWith(expectedFilter, expectedOptions);
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(next).not.toHaveBeenCalled();
    });

    it('should use default pagination options if not provided', async () => {
      req.query = {};
      TemporalCatalogService.searchCatalog.mockResolvedValue({ results: [] });

      await TemporalController.getRepositories(req, res, next);

      const expectedFilter = {};
      const expectedOptions = { limit: 10, page: 1, lean: true };

      expect(TemporalCatalogService.searchCatalog).toHaveBeenCalledWith(expectedFilter, expectedOptions);
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
    });

    it('should handle invalid (non-numeric) pagination options gracefully', async () => {
      req.query = { limit: 'invalid', page: 'foo' };
      TemporalCatalogService.searchCatalog.mockResolvedValue({ results: [] });

      await TemporalController.getRepositories(req, res, next);

      const expectedFilter = {};
      const expectedOptions = { limit: 10, page: 1, lean: true };

      expect(TemporalCatalogService.searchCatalog).toHaveBeenCalledWith(expectedFilter, expectedOptions);
    });

    it('should call next with an error if the service throws an error', async () => {
      const error = new Error('Database connection failed');
      TemporalCatalogService.searchCatalog.mockRejectedValue(error);

      await TemporalController.getRepositories(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should call getStats service and return the result successfully', async () => {
      const mockStats = { totalRepositories: 150, statusDistribution: { active: 100, archived: 50 } };
      TemporalCatalogService.getStats.mockResolvedValue(mockStats);

      await TemporalController.getStats(req, res, next);

      expect(TemporalCatalogService.getStats).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(mockStats);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next with an error if the service throws an error', async () => {
      const error = new Error('Aggregation query failed');
      TemporalCatalogService.getStats.mockRejectedValue(error);

      await TemporalController.getStats(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('syncCatalog', () => {
    const temporalSyncTopicName = process.env.TEMPORAL_SYNC_TOPIC || 'temporal-catalog-sync-requests';

    it('should publish a sync message with user ID and return 202 Accepted for an admin user', async () => {
      // The controller assumes middleware has already verified the role (e.g., super_admin, admin)
      // and attached the user to the request.
      req.user = { id: 'admin-user-id-123', role: 'admin' };
      const mockMessageId = 'pubsub-message-id-987';
      mockPublishMessage.mockResolvedValue(mockMessageId);

      await TemporalController.syncCatalog(req, res, next);

      expect(PubSub).toHaveBeenCalled();
      expect(mockTopic).toHaveBeenCalledWith(temporalSyncTopicName);
      expect(mockPublishMessage).toHaveBeenCalledTimes(1);

      const publishedCall = mockPublishMessage.mock.calls[0][0];
      expect(publishedCall).toHaveProperty('data');
      const messageData = JSON.parse(publishedCall.data.toString());
      expect(messageData.triggeredBy).toBe('admin-user-id-123');
      expect(messageData).toHaveProperty('timestamp');

      expect(res.status).toHaveBeenCalledWith(httpStatus.ACCEPTED);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: `Synchronization process successfully initiated. Message ID: ${mockMessageId}`
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should publish a sync message with "system" as triggerer if req.user is not present', async () => {
      req.user = null;
      const mockMessageId = 'system-sync-id-456';
      mockPublishMessage.mockResolvedValue(mockMessageId);

      await TemporalController.syncCatalog(req, res, next);

      expect(mockPublishMessage).toHaveBeenCalledTimes(1);
      const publishedCall = mockPublishMessage.mock.calls[0][0];
      const messageData = JSON.parse(publishedCall.data.toString());
      expect(messageData.triggeredBy).toBe('system');

      expect(res.status).toHaveBeenCalledWith(httpStatus.ACCEPTED);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: `Synchronization process successfully initiated. Message ID: ${mockMessageId}`
      });
    });

    it('should call next with an ApiError if publishing to Pub/Sub fails', async () => {
      const pubSubError = new Error('Failed to connect to Pub/Sub');
      pubSubError.stack = 'error stack trace';
      mockPublishMessage.mockRejectedValue(pubSubError);
      req.user = { id: 'admin-user-id-123' };

      await TemporalController.syncCatalog(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const errorPassedToNext = next.mock.calls[0][0];
      expect(errorPassedToNext).toBeInstanceOf(ApiError);
      expect(errorPassedToNext.statusCode).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      expect(errorPassedToNext.message).toBe('Failed to initiate synchronization process.');
      expect(errorPassedToNext.isOperational).toBe(true);
      expect(errorPassedToNext.stack).toBe(pubSubError.stack);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});