import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
// OPTIMIZATION: This import is no longer needed in the controller as user validation is delegated to the service layer.
// import UserModel from '../auth/auth.model.js';
import { NotificationService } from './notification.service.js';

const sendNotification = catchAsync(async (req, res) => {
  const result = await NotificationService.sendNotificationService(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Send Notification Successfully',
    data: result,
  });
});

const getNotification = catchAsync(async (req, res) => {
  const result = await NotificationService.getNotificationService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Notification Successfully',
    data: result,
  });
});

const sendNotificationById = catchAsync(async (req, res) => {
  const { userId } = req.params;
  // OPTIMIZATION: Removed redundant user existence check.
  // The service layer should be responsible for validating the user's existence
  // and handling the case where the user is not found. This avoids an extra database query in the controller.
  const result = await NotificationService.sendNotificationByIdService(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Send Notification By Id Successfull',
    data: result,
  });
});

const getNotificationById = catchAsync(async (req, res) => {
  const { userId } = req.params;
  // OPTIMIZATION: Removed redundant user existence check.
  // The service layer can handle cases where the user ID is invalid or has no notifications.
  // This avoids an unnecessary database call in the controller.
  const result = await NotificationService.getNotificationByIdService(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Notification By Id Successfully',
    data: result,
  });
});

const updateNotificationById = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  const result = await NotificationService.updateNotificationByIdService(notificationId, req.body);
  if (!result || result.modifiedCount === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Notification not found or no changes made',
    });
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Update Successfully',
    data: result,
  });
});

const deleteNotificationById = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  const result = await NotificationService.deleteNotificationByIdService(notificationId);
  if (!result || result.deletedCount === 0) {
    // RECOMMENDATION: Use the shared sendResponse for consistency and provide a more accurate status code.
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Notification not found',
    });
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Delete Notification Successfully',
    data: result,
  });
});

const deleteAllNotification = catchAsync(async (req, res) => {
  const result = await NotificationService.deleteAllNotificationService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Delete All Notification Successfully',
    data: result,
  });
});

const getUserInbox = catchAsync(async (req, res) => {
  const { userId } = req.params;
  // OPTIMIZATION: Removed redundant user existence check.
  // The service layer is the correct place to handle this logic.
  // If a user doesn't exist, the service can return an empty array of inbox items,
  // which is a valid response, or throw a specific "Not Found" error.
  // This saves a database query on every request to this endpoint.
  const isArchived = req.query.archived === 'true';
  const category = req.query.category;
  const result = await NotificationService.getUserInboxService(userId, category, isArchived, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get User Inbox Successfully',
    data: result,
  });
});

const archiveNotification = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  // OPTIMIZATION: Simplified boolean assignment. This defaults to 'true' unless explicitly 'false'.
  const isArchived = req.body.archived !== false;
  const result = await NotificationService.archiveNotificationService(notificationId, isArchived, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: isArchived ? 'Archive Notification Successfully' : 'Unarchive Notification Successfully',
    data: result,
  });
});

export const NotificationController = {
  sendNotification,
  getNotification,
  sendNotificationById,
  getNotificationById,
  updateNotificationById,
  deleteNotificationById,
  deleteAllNotification,
  getUserInbox,
  archiveNotification,
};