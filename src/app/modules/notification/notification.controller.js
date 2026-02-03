import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import UserModel from '../auth/auth.model.js';
import { NotificationService } from './notification.service.js';

// Controller for sending notification
const sendNotification = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const data = req.body;
  //   const user = await UserModel.findOne({ _id: userId });
  //   if (!user) {
  //     throw new Error('User not found');
  //   }
  const result = await NotificationService.sendNotificationService(data);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Send Notification Successfully',
    data: result,
  });
});

// Controller for getting notifications
const getNotification = catchAsync(async (req, res) => {
  const result = await NotificationService.getNotificationService();
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Notification Successfully',
    data: result,
  });
});

// Controller for sending notification by id
const sendNotificationById = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const data = req.body;
  const user = await UserModel.findOne({ _id: userId });
  if (!user) {
    throw new Error('User not found');
  }
  const result = await NotificationService.sendNotificationByIdService(
    userId,
    data,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Send Notification By Id Successfull',
    data: result,
  });
});

// Controller for getting notifications by id
const getNotificationById = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const user = await UserModel.findOne({ _id: userId });
  if (!user) {
    throw new Error('User not found');
  }

  const notifications =
    await NotificationService.getNotificationByIdService(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Notification By Id Successfully',
    data: notifications,
  });
});

// Controller for updating notification by id
const updateNotificationById = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  const data = req.body;

  const result = await NotificationService.updateNotificationByIdService(
    notificationId,
    data,
  );

  if (!result.modifiedCount === 1) {
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

// Controller for deleting notification
const deleteNotificationById = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  // logger.info(notificationId, 'notificationId')

  const result =
    await NotificationService.deleteNotificationByIdService(notificationId);
  if (!result.deletedCount) {
    return res.status(400).json({
      status: 'fail',
      error: "Could't delete the notification",
    });
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Delete Notification Successfully',
    data: result,
  });
});

// Controller for deleting notification
const deleteAllNotification = catchAsync(async (req, res) => {
  const result = await NotificationService.deleteAllNotificationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Delete All Notification Successfully',
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
};
