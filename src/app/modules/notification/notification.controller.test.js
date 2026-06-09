import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { NotificationController } from './notification.controller.js';

// Mock external dependencies
// Mock catchAsync to directly execute the wrapped function for easier testing
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn,
}));

// Mock sendResponse
const mockSendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({
  default: mockSendResponse,
}));

// Mock UserModel
const mockLean = vi.fn();
const mockFindOne = vi.fn(() => ({ lean: mockLean }));
vi.mock('../auth/auth.model.js', () => ({
  default: {
    findOne: mockFindOne,
  },
}));

// Mock NotificationService
const mockNotificationService = {
  sendNotificationService: vi.fn(),
  getNotificationService: vi.fn(),
  sendNotificationByIdService: vi.fn(),
  getNotificationByIdService: vi.fn(),
  updateNotificationByIdService: vi.fn(),
  deleteNotificationByIdService: vi.fn(),
  deleteAllNotificationService: vi.fn(),
  getUserInboxService: vi.fn(),
  archiveNotificationService: vi.fn(),
};
vi.mock('./notification.service.js', () => ({
  NotificationService: mockNotificationService,
}));

describe('NotificationController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {},
    };
    res = {
      statusCode: 0,
      status: vi.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: vi.fn(function (data) {
        return data;
      }),
      send: vi.fn(),
    };
    next = vi.fn();

    // Reset all mocks before each test
    vi.clearAllMocks();
    mockLean.mockReturnValue({}); // Default lean returns an empty object
    mockFindOne.mockReturnValue({ lean: mockLean }); // Default findOne returns an object with lean
  });

  // Test sendNotification
  describe('sendNotification', () => {
    it('should send a notification and return CREATED status', async () => {
      const mockNotificationData = { title: 'Test', message: 'Hello' };
      const mockResult = { _id: 'notif123', ...mockNotificationData };
      req.body = mockNotificationData;
      mockNotificationService.sendNotificationService.mockResolvedValue(mockResult);

      await NotificationController.sendNotification(req, res, next);

      expect(mockNotificationService.sendNotificationService).toHaveBeenCalledWith(mockNotificationData);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Send Notification Successfully',
        data: mockResult,
      });
    });

    it('should call next with error if service throws an error', async () => {
      const mockError = new Error('Service error');
      req.body = { title: 'Test', message: 'Hello' };
      mockNotificationService.sendNotificationService.mockRejectedValue(mockError);

      // Since catchAsync is mocked to return the function directly,
      // we expect the error to be thrown and caught by the test runner
      // or handled by a global error handler if this were an integration test.
      // For unit tests, we check if the service was called and if sendResponse was NOT called.
      await expect(NotificationController.sendNotification(req, res, next)).rejects.toThrow(mockError);
      expect(mockNotificationService.sendNotificationService).toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  // Test getNotification
  describe('getNotification', () => {
    it('should get all notifications and return OK status', async () => {
      const mockNotifications = [{ _id: 'notif1' }, { _id: 'notif2' }];
      mockNotificationService.getNotificationService.mockResolvedValue(mockNotifications);

      await NotificationController.getNotification(req, res, next);

      expect(mockNotificationService.getNotificationService).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Get Notification Successfully',
        data: mockNotifications,
      });
    });

    it('should call next with error if service throws an error', async () => {
      const mockError = new Error('Service error');
      mockNotificationService.getNotificationService.mockRejectedValue(mockError);

      await expect(NotificationController.getNotification(req, res, next)).rejects.toThrow(mockError);
      expect(mockNotificationService.getNotificationService).toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  // Test sendNotificationById
  describe('sendNotificationById', () => {
    const userId = 'user123';
    const notificationData = { title: 'Specific', message: 'For user' };

    beforeEach(() => {
      req.params.userId = userId;
      req.body = notificationData;
    });

    it('should send a notification to a specific user and return CREATED status', async () => {
      const mockUser = { _id: userId, name: 'Test User' };
      const mockResult = { _id: 'notif456', ...notificationData, userId };

      mockLean.mockResolvedValue(mockUser); // User found
      mockNotificationService.sendNotificationByIdService.mockResolvedValue(mockResult);

      await NotificationController.sendNotificationById(req, res, next);

      expect(mockFindOne).toHaveBeenCalledWith({ _id: userId });
      expect(mockLean).toHaveBeenCalled();
      expect(mockNotificationService.sendNotificationByIdService).toHaveBeenCalledWith(userId, notificationData);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Send Notification By Id Successfull',
        data: mockResult,
      });
    });

    it('should throw an error if user is not found', async () => {
      mockLean.mockResolvedValue(null); // User not found

      await expect(NotificationController.sendNotificationById(req, res, next)).rejects.toThrow('User not found');
      expect(mockFindOne).toHaveBeenCalledWith({ _id: userId });
      expect(mockLean).toHaveBeenCalled();
      expect(mockNotificationService.sendNotificationByIdService).not.toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should call next with error if service throws an error', async () => {
      const mockUser = { _id: userId, name: 'Test User' };
      const mockError = new Error('Service error');

      mockLean.mockResolvedValue(mockUser);
      mockNotificationService.sendNotificationByIdService.mockRejectedValue(mockError);

      await expect(NotificationController.sendNotificationById(req, res, next)).rejects.toThrow(mockError);
      expect(mockNotificationService.sendNotificationByIdService).toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  // Test getNotificationById
  describe('getNotificationById', () => {
    const userId = 'user123';

    beforeEach(() => {
      req.params.userId = userId;
    });

    it('should get notifications for a specific user and return OK status', async () => {
      const mockUser = { _id: userId, name: 'Test User' };
      const mockNotifications = [{ _id: 'notifA', userId }, { _id: 'notifB', userId }];

      mockLean.mockResolvedValue(mockUser);
      mockNotificationService.getNotificationByIdService.mockResolvedValue(mockNotifications);

      await NotificationController.getNotificationById(req, res, next);

      expect(mockFindOne).toHaveBeenCalledWith({ _id: userId });
      expect(mockLean).toHaveBeenCalled();
      expect(mockNotificationService.getNotificationByIdService).toHaveBeenCalledWith(userId);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Get Notification By Id Successfully',
        data: mockNotifications,
      });
    });

    it('should throw an error if user is not found', async () => {
      mockLean.mockResolvedValue(null); // User not found

      await expect(NotificationController.getNotificationById(req, res, next)).rejects.toThrow('User not found');
      expect(mockFindOne).toHaveBeenCalledWith({ _id: userId });
      expect(mockLean).toHaveBeenCalled();
      expect(mockNotificationService.getNotificationByIdService).not.toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should call next with error if service throws an error', async () => {
      const mockUser = { _id: userId, name: 'Test User' };
      const mockError = new Error('Service error');

      mockLean.mockResolvedValue(mockUser);
      mockNotificationService.getNotificationByIdService.mockRejectedValue(mockError);

      await expect(NotificationController.getNotificationById(req, res, next)).rejects.toThrow(mockError);
      expect(mockNotificationService.getNotificationByIdService).toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  // Test updateNotificationById
  describe('updateNotificationById', () => {
    const notificationId = 'notif789';
    const updateData = { read: true };

    beforeEach(() => {
      req.params.notificationId = notificationId;
      req.body = updateData;
    });

    it('should update a notification and return OK status', async () => {
      const mockResult = { modifiedCount: 1, _id: notificationId, ...updateData };
      mockNotificationService.updateNotificationByIdService.mockResolvedValue(mockResult);

      await NotificationController.updateNotificationById(req, res, next);

      expect(mockNotificationService.updateNotificationByIdService).toHaveBeenCalledWith(notificationId, updateData);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Update Successfully',
        data: mockResult,
      });
    });

    it('should return NOT_FOUND if notification not found or no changes made', async () => {
      const mockResult = { modifiedCount: 0 };
      mockNotificationService.updateNotificationByIdService.mockResolvedValue(mockResult);

      await NotificationController.updateNotificationById(req, res, next);

      expect(mockNotificationService.updateNotificationByIdService).toHaveBeenCalledWith(notificationId, updateData);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Notification not found or no changes made',
      });
    });

    it('should call next with error if service throws an error', async () => {
      const mockError = new Error('Service error');
      mockNotificationService.updateNotificationByIdService.mockRejectedValue(mockError);

      await expect(NotificationController.updateNotificationById(req, res, next)).rejects.toThrow(mockError);
      expect(mockNotificationService.updateNotificationByIdService).toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  // Test deleteNotificationById
  describe('deleteNotificationById', () => {
    const notificationId = 'notifDelete';

    beforeEach(() => {
      req.params.notificationId = notificationId;
    });

    it('should delete a notification and return OK status', async () => {
      const mockResult = { deletedCount: 1 };
      mockNotificationService.deleteNotificationByIdService.mockResolvedValue(mockResult);

      await NotificationController.deleteNotificationById(req, res, next);

      expect(mockNotificationService.deleteNotificationByIdService).toHaveBeenCalledWith(notificationId);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Delete Notification Successfully',
        data: mockResult,
      });
    });

    it('should return 400 if notification not found', async () => {
      const mockResult = { deletedCount: 0 };
      mockNotificationService.deleteNotificationByIdService.mockResolvedValue(mockResult);

      await NotificationController.deleteNotificationById(req, res, next);

      expect(mockNotificationService.deleteNotificationByIdService).toHaveBeenCalledWith(notificationId);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        error: "Could't delete the notification",
      });
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should call next with error if service throws an error', async () => {
      const mockError = new Error('Service error');
      mockNotificationService.deleteNotificationByIdService.mockRejectedValue(mockError);

      await expect(NotificationController.deleteNotificationById(req, res, next)).rejects.toThrow(mockError);
      expect(mockNotificationService.deleteNotificationByIdService).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  // Test deleteAllNotification
  describe('deleteAllNotification', () => {
    it('should delete all notifications and return OK status', async () => {
      const mockResult = { deletedCount: 5 };
      mockNotificationService.deleteAllNotificationService.mockResolvedValue(mockResult);

      await NotificationController.deleteAllNotification(req, res, next);

      expect(mockNotificationService.deleteAllNotificationService).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Delete All Notification Successfully',
        data: mockResult,
      });
    });

    it('should call next with error if service throws an error', async () => {
      const mockError = new Error('Service error');
      mockNotificationService.deleteAllNotificationService.mockRejectedValue(mockError);

      await expect(NotificationController.deleteAllNotification(req, res, next)).rejects.toThrow(mockError);
      expect(mockNotificationService.deleteAllNotificationService).toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  // Test getUserInbox
  describe('getUserInbox', () => {
    const userId = 'userInbox123';
    const mockUser = { _id: userId, name: 'Inbox User' };
    const mockInboxItems = [{ _id: 'inbox1' }, { _id: 'inbox2' }];

    beforeEach(() => {
      req.params.userId = userId;
      mockLean.mockResolvedValue(mockUser);
      mockNotificationService.getUserInboxService.mockResolvedValue(mockInboxItems);
    });

    it('should get user inbox with default unarchived status', async () => {
      await NotificationController.getUserInbox(req, res, next);

      expect(mockFindOne).toHaveBeenCalledWith({ _id: userId });
      expect(mockLean).toHaveBeenCalled();
      expect(mockNotificationService.getUserInboxService).toHaveBeenCalledWith(userId, undefined, false, req);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Get User Inbox Successfully',
        data: mockInboxItems,
      });
    });

    it('should get user inbox with archived=true', async () => {
      req.query.archived = 'true';

      await NotificationController.getUserInbox(req, res, next);

      expect(mockNotificationService.getUserInboxService).toHaveBeenCalledWith(userId, undefined, true, req);
    });

    it('should get user inbox with archived=false', async () => {
      req.query.archived = 'false';

      await NotificationController.getUserInbox(req, res, next);

      expect(mockNotificationService.getUserInboxService).toHaveBeenCalledWith(userId, undefined, false, req);
    });

    it('should get user inbox with category filter', async () => {
      req.query.category = 'promotions';

      await NotificationController.getUserInbox(req, res, next);

      expect(mockNotificationService.getUserInboxService).toHaveBeenCalledWith(userId, 'promotions', false, req);
    });

    it('should throw an error if user is not found', async () => {
      mockLean.mockResolvedValue(null); // User not found

      await expect(NotificationController.getUserInbox(req, res, next)).rejects.toThrow('User not found');
      expect(mockFindOne).toHaveBeenCalledWith({ _id: userId });
      expect(mockLean).toHaveBeenCalled();
      expect(mockNotificationService.getUserInboxService).not.toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should call next with error if service throws an error', async () => {
      const mockError = new Error('Service error');
      mockNotificationService.getUserInboxService.mockRejectedValue(mockError);

      await expect(NotificationController.getUserInbox(req, res, next)).rejects.toThrow(mockError);
      expect(mockNotificationService.getUserInboxService).toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  // Test archiveNotification
  describe('archiveNotification', () => {
    const notificationId = 'notifArchive123';
    const mockResult = { modifiedCount: 1, _id: notificationId, archived: true };

    beforeEach(() => {
      req.params.notificationId = notificationId;
      mockNotificationService.archiveNotificationService.mockResolvedValue(mockResult);
    });

    it('should archive a notification when archived is undefined', async () => {
      req.body = {}; // archived is undefined

      await NotificationController.archiveNotification(req, res, next);

      expect(mockNotificationService.archiveNotificationService).toHaveBeenCalledWith(notificationId, true, req);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Archive Notification Successfully',
        data: mockResult,
      });
    });

    it('should archive a notification when archived is true', async () => {
      req.body = { archived: true };

      await NotificationController.archiveNotification(req, res, next);

      expect(mockNotificationService.archiveNotificationService).toHaveBeenCalledWith(notificationId, true, req);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Archive Notification Successfully',
        data: mockResult,
      });
    });

    it('should unarchive a notification when archived is false', async () => {
      req.body = { archived: false };
      const unarchiveResult = { ...mockResult, archived: false };
      mockNotificationService.archiveNotificationService.mockResolvedValue(unarchiveResult);

      await NotificationController.archiveNotification(req, res, next);

      expect(mockNotificationService.archiveNotificationService).toHaveBeenCalledWith(notificationId, false, req);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Unarchive Notification Successfully',
        data: unarchiveResult,
      });
    });

    it('should call next with error if service throws an error', async () => {
      const mockError = new Error('Service error');
      req.body = { archived: true };
      mockNotificationService.archiveNotificationService.mockRejectedValue(mockError);

      await expect(NotificationController.archiveNotification(req, res, next)).rejects.toThrow(mockError);
      expect(mockNotificationService.archiveNotificationService).toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });
});