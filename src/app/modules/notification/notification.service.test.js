import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PubSub } from '@google-cloud/pubsub';
import UserModel from '../auth/auth.model.js';
import Notification from './notification.model.js';
import { logger } from '../../../shared/logger.js';
import {
  withTenantContext,
  withTenantFilter,
} from '../../helpers/tenantQuery.js';
import { NotificationService } from './notification.service.js';

// Mock dependencies
vi.mock('@google-cloud/pubsub', () => {
  const publishMessage = vi.fn();
  const topic = vi.fn().mockImplementation(() => ({ publishMessage }));
  const PubSub = vi.fn().mockImplementation(() => ({ topic }));
  return { PubSub, publishMessage, topic };
});

vi.mock('../auth/auth.model.js', () => ({
  default: {
    updateOne: vi.fn(),
  },
}));

vi.mock('./notification.model.js', () => {
  const lean = vi.fn();
  const sort = vi.fn().mockImplementation(() => ({ lean }));
  const find = vi.fn().mockImplementation(() => ({ sort, lean }));
  const findOne = vi.fn().mockImplementation(() => ({ lean }));
  const findOneAndUpdate = vi.fn().mockImplementation(() => ({ lean }));

  return {
    default: {
      create: vi.fn(),
      find,
      findOne,
      findOneAndUpdate,
      deleteOne: vi.fn(),
      lean,
      sort,
    },
  };
});

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../helpers/tenantQuery.js', () => ({
  withTenantContext: vi.fn().mockImplementation((req, data) => ({ ...data, tenantId: req.tenantId })),
  withTenantFilter: vi.fn().mockImplementation((req, query) => ({ ...query, tenantId: req.tenantId })),
}));

// Get mock instances for manipulation in tests
const { publishMessage, topic } = await import('@google-cloud/pubsub');

describe('NotificationService', () => {
  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';
  const mockNotificationId = 'notif-789';
  const mockReq = { tenantId: mockTenantId, user: { _id: mockUserId, role: 'user' } };
  const mockNotification = { _id: mockNotificationId, message: 'Test', tenantId: mockTenantId, toString: () => mockNotificationId };
  const mockNotificationData = { message: 'Test message' };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chained mocks
    Notification.find.mockReturnValue({ sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([mockNotification]) });
    Notification.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockNotification) });
    Notification.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockNotification) });
  });

  describe('sendNotificationService', () => {
    it('should create a notification and publish a fan-out message with tenant context', async () => {
      Notification.create.mockResolvedValue(mockNotification);
      publishMessage.mockResolvedValue('message-id-1');

      const result = await NotificationService.sendNotificationService(mockNotificationData, mockReq);

      expect(withTenantContext).toHaveBeenCalledWith(mockReq, mockNotificationData);
      expect(Notification.create).toHaveBeenCalledWith({ ...mockNotificationData, tenantId: mockTenantId });
      expect(topic).toHaveBeenCalledWith(process.env.NOTIFICATION_FANOUT_TOPIC || 'notification-fanout');
      expect(publishMessage).toHaveBeenCalled();
      const publishedData = JSON.parse(Buffer.from(publishMessage.mock.calls[0][0].data).toString());
      expect(publishedData).toEqual({ notificationId: mockNotificationId, tenantId: mockTenantId });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Fan-out task for notification'));
      expect(result).toEqual(mockNotification);
    });

    it('should create a notification but not publish if tenant context is missing', async () => {
      Notification.create.mockResolvedValue(mockNotification);

      const result = await NotificationService.sendNotificationService(mockNotificationData, null);

      expect(withTenantContext).not.toHaveBeenCalled();
      expect(Notification.create).toHaveBeenCalledWith(mockNotificationData);
      expect(publishMessage).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('sendNotificationService called without a request context (tenantId). Fan-out will not occur.');
      expect(result).toEqual(mockNotification);
    });

    it('should log an error if publishing to Pub/Sub fails', async () => {
      const pubSubError = new Error('Pub/Sub failed');
      Notification.create.mockResolvedValue(mockNotification);
      publishMessage.mockRejectedValue(pubSubError);

      const result = await NotificationService.sendNotificationService(mockNotificationData, mockReq);

      expect(Notification.create).toHaveBeenCalled();
      expect(publishMessage).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(`Failed to publish fan-out task for notification ${mockNotificationId}:`, pubSubError);
      expect(result).toEqual(mockNotification); // Should still return the created notification
    });
  });

  describe('getNotificationService', () => {
    it('should get all notifications with tenant filter', async () => {
      await NotificationService.getNotificationService(mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, {});
      expect(Notification.find).toHaveBeenCalledWith({ tenantId: mockTenantId });
      expect(Notification.find().lean).toHaveBeenCalled();
    });

    it('should get all notifications without tenant filter if req is null', async () => {
      await NotificationService.getNotificationService(null);

      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(Notification.find).toHaveBeenCalledWith({});
      expect(Notification.find().lean).toHaveBeenCalled();
    });
  });

  describe('sendNotificationByIdService', () => {
    it('should create a notification for a specific user with tenant context', async () => {
      const notificationWithRecipient = { ...mockNotification, recipientId: mockUserId };
      Notification.create.mockResolvedValue(notificationWithRecipient);
      UserModel.updateOne.mockResolvedValue({ nModified: 1 });

      const result = await NotificationService.sendNotificationByIdService(mockUserId, mockNotificationData, mockReq);

      const expectedData = { ...mockNotificationData, recipientId: mockUserId };
      expect(withTenantContext).toHaveBeenCalledWith(mockReq, expectedData);
      expect(Notification.create).toHaveBeenCalledWith({ ...expectedData, tenantId: mockTenantId });

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockUserId });
      expect(UserModel.updateOne).toHaveBeenCalledWith(
        { _id: mockUserId, tenantId: mockTenantId },
        { $push: { notifications: notificationWithRecipient._id } }
      );
      expect(result).toEqual(notificationWithRecipient);
    });
  });

  describe('getNotificationByIdService', () => {
    it('should get a single notification by ID with tenant filter', async () => {
      const result = await NotificationService.getNotificationByIdService(mockNotificationId, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockNotificationId });
      expect(Notification.findOne).toHaveBeenCalledWith({ _id: mockNotificationId, tenantId: mockTenantId });
      expect(Notification.findOne().lean).toHaveBeenCalled();
      expect(result).toEqual(mockNotification);
    });
  });

  describe('updateNotificationByIdService', () => {
    it('should update a notification by ID with tenant filter', async () => {
      const updateData = { message: 'Updated message' };
      const updatedNotification = { ...mockNotification, ...updateData };
      Notification.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updatedNotification) });

      const result = await NotificationService.updateNotificationByIdService(mockNotificationId, updateData, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockNotificationId });
      expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockNotificationId, tenantId: mockTenantId },
        { $set: updateData },
        { new: true, runValidators: true }
      );
      expect(Notification.findOneAndUpdate().lean).toHaveBeenCalled();
      expect(result).toEqual(updatedNotification);
    });

    it('should throw an error if notification to update is not found', async () => {
      Notification.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      await expect(
        NotificationService.updateNotificationByIdService(mockNotificationId, {}, mockReq)
      ).rejects.toThrow('Notification not found or no changes made');
    });
  });

  describe('deleteNotificationByIdService', () => {
    it('should delete a notification by ID with tenant filter', async () => {
      Notification.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await NotificationService.deleteNotificationByIdService(mockNotificationId, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockNotificationId });
      expect(Notification.deleteOne).toHaveBeenCalledWith({ _id: mockNotificationId, tenantId: mockTenantId });
      expect(result).toEqual({ deletedCount: 1 });
    });
  });

  describe('deleteAllNotificationService', () => {
    it('should publish a delete-all job with tenant context', async () => {
      publishMessage.mockResolvedValue('message-id-2');

      const result = await NotificationService.deleteAllNotificationService(mockReq);

      expect(topic).toHaveBeenCalledWith(process.env.NOTIFICATION_DELETE_ALL_TOPIC || 'notification-delete-all');
      expect(publishMessage).toHaveBeenCalled();
      const publishedData = JSON.parse(Buffer.from(publishMessage.mock.calls[0][0].data).toString());
      expect(publishedData).toEqual({ tenantId: mockTenantId });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`'Delete All Notifications' job for tenant ${mockTenantId}`));
      expect(result).toEqual({
        message: 'Job to delete all notifications has been queued.',
        tenantId: mockTenantId,
        topic: process.env.NOTIFICATION_DELETE_ALL_TOPIC || 'notification-delete-all',
      });
    });

    it('should throw an error if tenant context is missing', async () => {
      await expect(NotificationService.deleteAllNotificationService(null)).rejects.toThrow(
        'Tenant context is required to delete all notifications.'
      );
      expect(logger.error).toHaveBeenCalledWith('deleteAllNotificationService called without a request context (tenantId). Operation aborted.');
      expect(publishMessage).not.toHaveBeenCalled();
    });

    it('should throw an error if publishing the job fails', async () => {
      const pubSubError = new Error('Pub/Sub failed');
      publishMessage.mockRejectedValue(pubSubError);

      await expect(NotificationService.deleteAllNotificationService(mockReq)).rejects.toThrow(
        'Failed to queue the delete all notifications job.'
      );
      expect(logger.error).toHaveBeenCalledWith(`Failed to publish 'Delete All Notifications' job for tenant ${mockTenantId}:`, pubSubError);
    });
  });

  describe('getUserInboxService', () => {
    it('should get user inbox with all filters and tenant context', async () => {
      const category = 'alerts';
      const isArchived = false;
      await NotificationService.getUserInboxService(mockUserId, category, isArchived, mockReq);

      const expectedQuery = { recipientId: mockUserId, category, isArchived };
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(Notification.find).toHaveBeenCalledWith({ ...expectedQuery, tenantId: mockTenantId });
      expect(Notification.find().sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(Notification.find().lean).toHaveBeenCalled();
    });

    it('should handle undefined isArchived filter', async () => {
      await NotificationService.getUserInboxService(mockUserId, 'updates', undefined, mockReq);
      const expectedQuery = { recipientId: mockUserId, category: 'updates' };
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, expectedQuery);
      expect(Notification.find).toHaveBeenCalledWith({ ...expectedQuery, tenantId: mockTenantId });
    });
  });

  describe('archiveNotificationService', () => {
    it('should archive a notification with tenant context', async () => {
      const archivedNotification = { ...mockNotification, isArchived: true };
      Notification.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(archivedNotification) });

      const result = await NotificationService.archiveNotificationService(mockNotificationId, true, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockNotificationId });
      expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockNotificationId, tenantId: mockTenantId },
        { $set: { isArchived: true } },
        { new: true }
      );
      expect(result).toEqual(archivedNotification);
    });

    it('should un-archive a notification', async () => {
      const unArchivedNotification = { ...mockNotification, isArchived: false };
      Notification.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(unArchivedNotification) });

      const result = await NotificationService.archiveNotificationService(mockNotificationId, false, mockReq);

      expect(Notification.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        { $set: { isArchived: false } },
        { new: true }
      );
      expect(result).toEqual(unArchivedNotification);
    });

    it('should throw an error if notification to archive is not found', async () => {
      Notification.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      await expect(
        NotificationService.archiveNotificationService(mockNotificationId, true, mockReq)
      ).rejects.toThrow('Notification not found or access denied');
    });
  });
});