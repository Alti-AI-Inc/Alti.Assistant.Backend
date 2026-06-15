import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

// --- Mocks ---

// Mock GCP Pub/Sub client
const mockPublishMessage = vi.fn();

const {
  mockTopic,
  mockAuth,
  mockExtractTenantContext
} = vi.hoisted(() => {
  const mockTopic = vi.fn().mockImplementation(() => ({
    publishMessage: mockPublishMessage,
  }));
  const mockAuth = vi.fn().mockImplementation(() => mockAuthMiddleware);

  // Mock tenant context middleware
  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => {
    req.tenant = { tenantId: 'mock-tenant-id' };
    next();
  });

  return {
    mockTopic,
    mockAuth,
    mockExtractTenantContext
  };
});

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn().mockImplementation(() => ({
    topic: mockTopic,
  })),
}));

// Mock auth middleware factory to verify role checks
const mockAuthMiddleware = vi.fn().mockImplementation((req, res, next) => next());
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

// Mock NotificationController
vi.mock('./notification.controller.js', () => ({
  NotificationController: {
    getNotificationById: vi.fn().mockImplementation((req, res) => res.status(200).json([])),
    updateNotificationById: vi.fn().mockImplementation((req, res) =>
      res.status(200).json({ success: true })),
    deleteNotificationById: vi.fn().mockImplementation((req, res) =>
      res.status(200).json({ success: true })),
    getNotification: vi.fn().mockImplementation((req, res) => res.status(200).json([])),
    getUserInbox: vi.fn().mockImplementation((req, res) => res.status(200).json([])),
    archiveNotification: vi.fn().mockImplementation((req, res) =>
      res.status(200).json({ success: true })),
  },
}));

// --- Test Setup ---

// Import router after mocks are defined
import { notificationRoutes } from './notification.route.js';
import { NotificationController } from './notification.controller.js';

const app = express();
app.use(express.json());
app.use('/notifications', notificationRoutes);

// Add a generic error handler to catch errors passed by next()
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

describe('Notification Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Middleware Configuration and Role Checks', () => {
    it('should configure ADMIN routes with ADMIN role', () => {
      const adminCalls = mockAuth.mock.calls.filter(
        call => call[0] === ENUM_USER_ROLE.ADMIN
      ).length;
      // POST /user/:userId, PUT /update/:id, DELETE /delete/:id, DELETE /delete-all, POST /send-notification-all, GET /get-all
      expect(adminCalls).toBe(6);
    });

    it('should configure USER routes with USER role', () => {
      const userCalls = mockAuth.mock.calls.filter(
        call => call[0] === ENUM_USER_ROLE.USER
      ).length;
      // GET /get-notification/:userId, GET /user/:userId/inbox, PUT /archive/:notificationId
      expect(userCalls).toBe(3);
    });
  });

  describe('POST /notifications/user/:userId', () => {
    it('should publish a message to Pub/Sub and return 202 on success', async () => {
      const userId = 'user-uuid-123';
      const notificationData = {
        title: 'Test Title',
        message: 'Test Message',
        type: 'info',
      };
      mockPublishMessage.mockResolvedValue('mock-message-id');

      const response = await request(app)
        .post(`/notifications/user/${userId}`)
        .send(notificationData);

      expect(response.status).toBe(202);
      expect(response.body.message).toBe(
        'Notification request has been accepted and is being processed.'
      );
      expect(mockAuthMiddleware).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(mockTopic).toHaveBeenCalledWith('send-notification-to-user');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        json: {
          tenantId: 'mock-tenant-id',
          userId,
          notification: notificationData,
        },
      });
    });

    it('should handle errors from Pub/Sub and pass to the error handler', async () => {
      const userId = 'user-uuid-123';
      const testError = new Error('Pub/Sub failed');
      mockPublishMessage.mockRejectedValue(testError);

      const response = await request(app)
        .post(`/notifications/user/${userId}`)
        .send({ title: 'Test', message: 'Test' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Pub/Sub failed');
    });
  });

  describe('GET /notifications/get-notification/:userId', () => {
    it('should call NotificationController.getNotificationById', async () => {
      const userId = 'user-uuid-123';
      await request(app).get(`/notifications/get-notification/${userId}`);

      expect(mockAuthMiddleware).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(NotificationController.getNotificationById).toHaveBeenCalled();
    });
  });

  describe('PUT /notifications/update/:notificationId', () => {
    it('should call NotificationController.updateNotificationById', async () => {
      const notificationId = 'notif-uuid-123';
      await request(app)
        .put(`/notifications/update/${notificationId}`)
        .send({});

      expect(mockAuthMiddleware).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(NotificationController.updateNotificationById).toHaveBeenCalled();
    });
  });

  describe('DELETE /notifications/delete/:notificationId', () => {
    it('should call NotificationController.deleteNotificationById', async () => {
      const notificationId = 'notif-uuid-123';
      await request(app).delete(`/notifications/delete/${notificationId}`);

      expect(mockAuthMiddleware).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(NotificationController.deleteNotificationById).toHaveBeenCalled();
    });
  });

  describe('DELETE /notifications/delete-all', () => {
    it('should publish a delete-all message to Pub/Sub and return 202', async () => {
      mockPublishMessage.mockResolvedValue('mock-message-id');

      const response = await request(app).delete('/notifications/delete-all');

      expect(response.status).toBe(202);
      expect(response.body.message).toBe(
        'Request to delete all notifications has been accepted and is being processed.'
      );
      expect(mockAuthMiddleware).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(mockTopic).toHaveBeenCalledWith('delete-all-notifications');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        json: {
          tenantId: 'mock-tenant-id',
        },
      });
    });

    it('should handle errors from Pub/Sub and pass to the error handler', async () => {
      const testError = new Error('Pub/Sub failed on delete-all');
      mockPublishMessage.mockRejectedValue(testError);

      const response = await request(app).delete('/notifications/delete-all');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Pub/Sub failed on delete-all');
    });
  });

  describe('POST /notifications/send-notification-all', () => {
    it('should publish a broadcast message to Pub/Sub and return 202', async () => {
      const notificationData = {
        title: 'Broadcast Title',
        message: 'Broadcast Message',
        type: 'warning',
      };
      mockPublishMessage.mockResolvedValue('mock-message-id');

      const response = await request(app)
        .post('/notifications/send-notification-all')
        .send(notificationData);

      expect(response.status).toBe(202);
      expect(response.body.message).toBe(
        'Broadcast notification request has been accepted and is being processed.'
      );
      expect(mockAuthMiddleware).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(mockTopic).toHaveBeenCalledWith('broadcast-notification');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        json: {
          tenantId: 'mock-tenant-id',
          notification: notificationData,
        },
      });
    });

    it('should handle errors from Pub/Sub and pass to the error handler', async () => {
      const testError = new Error('Pub/Sub failed on broadcast');
      mockPublishMessage.mockRejectedValue(testError);

      const response = await request(app)
        .post('/notifications/send-notification-all')
        .send({ title: 'Test', message: 'Test' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Pub/Sub failed on broadcast');
    });
  });

  describe('GET /notifications/get-all', () => {
    it('should call NotificationController.getNotification', async () => {
      await request(app).get('/notifications/get-all');

      expect(mockAuthMiddleware).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(NotificationController.getNotification).toHaveBeenCalled();
    });
  });

  describe('GET /notifications/user/:userId/inbox', () => {
    it('should call NotificationController.getUserInbox', async () => {
      const userId = 'user-uuid-123';
      await request(app).get(`/notifications/user/${userId}/inbox`);

      expect(mockAuthMiddleware).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(NotificationController.getUserInbox).toHaveBeenCalled();
    });
  });

  describe('PUT /notifications/archive/:notificationId', () => {
    it('should call NotificationController.archiveNotification', async () => {
      const notificationId = 'notif-uuid-123';
      await request(app).put(`/notifications/archive/${notificationId}`);

      expect(mockAuthMiddleware).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(NotificationController.archiveNotification).toHaveBeenCalled();
    });
  });
});