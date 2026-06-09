import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import UserModel from '../auth/auth.model.js';
import { NotificationService } from './notification.service.js';

/**
 * @swagger
 * /api/v1/notifications:
 *   post:
 *     summary: Send a general notification
 *     description: Sends a notification to all relevant recipients based on the provided data.
 *     tags:
 *       - Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: The title of the notification.
 *                 example: "New Update Available"
 *               message:
 *                 type: string
 *                 description: The main content of the notification.
 *                 example: "Version 2.0 of our app is now live!"
 *               type:
 *                 type: string
 *                 enum: [info, warning, error, success, announcement]
 *                 description: The type of notification.
 *                 example: "announcement"
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional list of user IDs to send the notification to. If empty, it might be broadcast.
 *                 example: ["60c72b2f9b1e8b001c8e4a1a"]
 *               link:
 *                 type: string
 *                 description: An optional link associated with the notification.
 *                 example: "/app/updates"
 *             required:
 *               - title
 *               - message
 *               - type
 *     responses:
 *       201:
 *         description: Notification sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Send Notification Successfully"
 *                 data:
 *                   type: object
 *                   description: The created notification object.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for sending a general notification.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const sendNotification = catchAsync(async (req, res) => {
  const { userId } = req.params; // This userId is not used in the current implementation, consider removing if not needed.
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

/**
 * @swagger
 * /api/v1/notifications:
 *   get:
 *     summary: Get all notifications
 *     description: Retrieves a list of all notifications available in the system.
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Get Notification Successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: A notification object.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for getting all notifications.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getNotification = catchAsync(async (req, res) => {
  const result = await NotificationService.getNotificationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Notification Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/notifications/{userId}:
 *   post:
 *     summary: Send notification to a specific user
 *     description: Sends a notification directly to a user identified by their ID.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to whom the notification will be sent.
 *         example: "60c72b2f9b1e8b001c8e4a1a"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: The title of the notification.
 *                 example: "Welcome to Alti.Assistant!"
 *               message:
 *                 type: string
 *                 description: The main content of the notification.
 *                 example: "We're excited to have you on board."
 *               type:
 *                 type: string
 *                 enum: [info, warning, error, success, announcement]
 *                 description: The type of notification.
 *                 example: "success"
 *               link:
 *                 type: string
 *                 description: An optional link associated with the notification.
 *                 example: "/dashboard"
 *             required:
 *               - title
 *               - message
 *               - type
 *     responses:
 *       201:
 *         description: Notification sent successfully to the specified user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Send Notification By Id Successfull"
 *                 data:
 *                   type: object
 *                   description: The created notification object.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for sending a notification to a specific user by ID.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const sendNotificationById = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const data = req.body;
  // Optimize: Use .lean() for read-only queries to get plain JavaScript objects instead of Mongoose documents.
  const user = await UserModel.findOne({ _id: userId }).lean();
  if (!user) {
    throw new Error('User not found');
  }
  const result = await NotificationService.sendNotificationByIdService(
    userId,
    data
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Send Notification By Id Successfull',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/notifications/{userId}:
 *   get:
 *     summary: Get notifications for a specific user
 *     description: Retrieves all notifications associated with a given user ID.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user whose notifications are to be retrieved.
 *         example: "60c72b2f9b1e8b001c8e4a1a"
 *     responses:
 *       200:
 *         description: Notifications for the user retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Get Notification By Id Successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: A notification object.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for getting notifications by user ID.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getNotificationById = catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Optimize: Use .lean() for read-only queries to get plain JavaScript objects instead of Mongoose documents.
  const user = await UserModel.findOne({ _id: userId }).lean();
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

/**
 * @swagger
 * /api/v1/notifications/{notificationId}:
 *   patch:
 *     summary: Update a notification by ID
 *     description: Updates the details of a specific notification identified by its ID.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the notification to update.
 *         example: "60c72b2f9b1e8b001c8e4a1b"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: The new title of the notification.
 *                 example: "Important Update (Revised)"
 *               message:
 *                 type: string
 *                 description: The new message content.
 *                 example: "Version 2.1 is now available with critical bug fixes."
 *               read:
 *                 type: boolean
 *                 description: Whether the notification has been read.
 *                 example: true
 *               archived:
 *                 type: boolean
 *                 description: Whether the notification has been archived.
 *                 example: false
 *             minProperties: 1
 *     responses:
 *       200:
 *         description: Notification updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Update Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledged:
 *                       type: boolean
 *                       example: true
 *                     modifiedCount:
 *                       type: number
 *                       example: 1
 *                   description: Update operation result.
 *       404:
 *         description: Notification not found or no changes made.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Notification not found or no changes made"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for updating a notification by ID.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const updateNotificationById = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  const data = req.body;

  const result = await NotificationService.updateNotificationByIdService(
    notificationId,
    data
  );

  if (!result || result.modifiedCount === 0) { // Check for null/undefined result or no modifications
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

/**
 * @swagger
 * /api/v1/notifications/{notificationId}:
 *   delete:
 *     summary: Delete a notification by ID
 *     description: Deletes a specific notification identified by its ID.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the notification to delete.
 *         example: "60c72b2f9b1e8b001c8e4a1b"
 *     responses:
 *       200:
 *         description: Notification deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Delete Notification Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledged:
 *                       type: boolean
 *                       example: true
 *                     deletedCount:
 *                       type: number
 *                       example: 1
 *                   description: Delete operation result.
 *       400:
 *         description: Could not delete the notification.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "fail"
 *                 error:
 *                   type: string
 *                   example: "Could't delete the notification"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for deleting a notification by ID.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const deleteNotificationById = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  // logger.info(notificationId, 'notificationId')

  const result =
    await NotificationService.deleteNotificationByIdService(notificationId);
  if (!result || !result.deletedCount) { // Check for null/undefined result or no deletions
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

/**
 * @swagger
 * /api/v1/notifications:
 *   delete:
 *     summary: Delete all notifications
 *     description: Deletes all notifications from the system. Use with caution.
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: All notifications deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Delete All Notification Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledged:
 *                       type: boolean
 *                       example: true
 *                     deletedCount:
 *                       type: number
 *                       example: 5
 *                   description: Delete operation result.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for deleting all notifications.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const deleteAllNotification = catchAsync(async (req, res) => {
  const result = await NotificationService.deleteAllNotificationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Delete All Notification Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/notifications/inbox/{userId}:
 *   get:
 *     summary: Get user inbox notifications
 *     description: Retrieves the inbox notifications for a specific user, with optional filtering by category and archive status.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user whose inbox is to be retrieved.
 *         example: "60c72b2f9b1e8b001c8e4a1a"
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Optional. Filter notifications by category (e.g., 'system', 'promotional').
 *         example: "system"
 *       - in: query
 *         name: archived
 *         schema:
 *           type: boolean
 *         description: Optional. Filter notifications by archive status. Defaults to `false` (unarchived).
 *         example: false
 *     responses:
 *       200:
 *         description: User inbox notifications retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Get User Inbox Successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: A notification object from the user's inbox.
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for getting a user's inbox notifications.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getUserInbox = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { category, archived } = req.query;
  
  // By default, only show active (unarchived) inbox items unless archived=true is passed
  const isArchived = archived === 'true' ? true : archived === 'false' ? false : false;

  // Optimize: Use .lean() for read-only queries to get plain JavaScript objects instead of Mongoose documents.
  const user = await UserModel.findOne({ _id: userId }).lean();
  if (!user) {
    throw new Error('User not found');
  }

  const result = await NotificationService.getUserInboxService(
    userId,
    category,
    isArchived,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get User Inbox Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/notifications/archive/{notificationId}:
 *   patch:
 *     summary: Archive or unarchive a notification
 *     description: Sets the archive status of a specific notification.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the notification to archive or unarchive.
 *         example: "60c72b2f9b1e8b001c8e4a1b"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               archived:
 *                 type: boolean
 *                 description: Set to `true` to archive, `false` to unarchive. If omitted, defaults to `true`.
 *                 example: true
 *             required:
 *               - archived
 *     responses:
 *       200:
 *         description: Notification archive status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Archive Notification Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledged:
 *                       type: boolean
 *                       example: true
 *                     modifiedCount:
 *                       type: number
 *                       example: 1
 *                   description: Update operation result.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for archiving or unarchiving a notification.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const archiveNotification = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  const { archived } = req.body;
  const isArchived = archived === undefined ? true : !!archived;

  const result = await NotificationService.archiveNotificationService(
    notificationId,
    isArchived,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: isArchived ? 'Archive Notification Successfully' : 'Unarchive Notification Successfully',
    data: result,
  });
});

/**
 * @typedef {object} NotificationController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} sendNotification - Controller for sending a general notification.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getNotification - Controller for getting all notifications.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} sendNotificationById - Controller for sending a notification to a specific user by ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getNotificationById - Controller for getting notifications by user ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} updateNotificationById - Controller for updating a notification by ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} deleteNotificationById - Controller for deleting a notification by ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} deleteAllNotification - Controller for deleting all notifications.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getUserInbox - Controller for getting a user's inbox notifications.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} archiveNotification - Controller for archiving or unarchiving a notification.
 */
/**
 * Exports all notification controller functions.
 * @type {NotificationController}
 */
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