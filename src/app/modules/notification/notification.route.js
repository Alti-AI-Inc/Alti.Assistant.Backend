import express from 'express';
// GCP Pub/Sub client for asynchronous task offloading.
import { PubSub } from '@google-cloud/pubsub';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { NotificationController } from './notification.controller.js';

// Instantiate the GCP Pub/Sub client.
// In a production environment, projectId should be configured externally.
const pubSubClient = new PubSub();

/**
 * Express router for notification-related endpoints.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @openapi
 * /notifications/user/{userId}:
 *   post:
 *     summary: Send a notification to a specific user
 *     description: Asynchronously sends a notification to a single user identified by their ID. The request is queued for background processing. Requires ADMIN privileges.
 *     tags:
 *       - Notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the user to notify.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "New Task Assigned"
 *               message:
 *                 type: string
 *                 example: "You have been assigned a new task: 'Complete project proposal'."
 *               type:
 *                 type: string
 *                 enum: [info, warning, error, success]
 *                 example: "info"
 *     responses:
 *       '202':
 *         description: Notification request accepted and is being processed.
 *       '400':
 *         description: Bad request, invalid input data.
 *       '401':
 *         description: Unauthorized, token is missing or invalid.
 *       '403':
 *         description: Forbidden, user does not have ADMIN role.
 *       '404':
 *         description: User not found.
 *       '500':
 *         description: Internal server error, failed to queue notification.
 */
router
  .route('/user/:userId')
  .post(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    // Replaced direct controller call with a Pub/Sub publisher.
    // This offloads the notification sending (which may involve external services like email, SMS, or push notifications)
    // to a background worker, ensuring the API responds quickly and is resilient to downstream failures.
    async (req, res, next) => {
      try {
        const { userId } = req.params;
        const { tenantId } = req.tenant; // from extractTenantContext middleware
        const notificationData = req.body;

        // The topic for sending single-user notifications.
        const topicName = 'send-notification-to-user';
        const messagePayload = {
          tenantId,
          userId,
          notification: notificationData,
        };

        // Publish a message to the Pub/Sub topic.
        await pubSubClient.topic(topicName).publishMessage({ json: messagePayload });

        res.status(202).json({
          message:
            'Notification request has been accepted and is being processed.',
        });
      } catch (error) {
        // Pass any errors to the Express error handling middleware.
        console.error('Failed to publish notification message:', error);
        next(error);
      }
    }
  );

/**
 * @openapi
 * /notifications/get-notification/{userId}:
 *   get:
 *     summary: Get all notifications for a specific user
 *     description: Retrieves all notifications for a given user. A user can only retrieve their own notifications.
 *     tags:
 *       - Notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the user. Must match the authenticated user's ID.
 *     responses:
 *       '200':
 *         description: A list of notifications for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 *       '401':
 *         description: Unauthorized, token is missing or invalid.
 *       '403':
 *         description: Forbidden, user is trying to access another user's notifications.
 *       '404':
 *         description: User not found.
 */
router
  .route('/get-notification/:userId')
  .get(
    auth(ENUM_USER_ROLE.USER),
    extractTenantContext,
    NotificationController.getNotificationById
  );

/**
 * @openapi
 * /notifications/update/{notificationId}:
 *   put:
 *     summary: Update a notification by ID
 *     description: Updates the content or status of a specific notification. Requires ADMIN privileges.
 *     tags:
 *       - Notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the notification to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               isRead:
 *                 type: boolean
 *     responses:
 *       '200':
 *         description: Notification updated successfully.
 *       '400':
 *         description: Bad request, invalid input data.
 *       '401':
 *         description: Unauthorized, token is missing or invalid.
 *       '403':
 *         description: Forbidden, user does not have ADMIN role.
 *       '404':
 *         description: Notification not found.
 */
router
  .route('/update/:notificationId')
  .put(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.updateNotificationById
  );

/**
 * @openapi
 * /notifications/delete/{notificationId}:
 *   delete:
 *     summary: Delete a notification by ID
 *     description: Permanently deletes a specific notification. Requires ADMIN privileges.
 *     tags:
 *       - Notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the notification to delete.
 *     responses:
 *       '200':
 *         description: Notification deleted successfully.
 *       '401':
 *         description: Unauthorized, token is missing or invalid.
 *       '403':
 *         description: Forbidden, user does not have ADMIN role.
 *       '404':
 *         description: Notification not found.
 */
router
  .route('/delete/:notificationId')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.deleteNotificationById
  );

/**
 * @openapi
 * /notifications/delete-all:
 *   delete:
 *     summary: Delete all notifications for the tenant
 *     description: Asynchronously deletes all notifications within the current tenant's context. The request is queued for background processing. Requires ADMIN privileges.
 *     tags:
 *       - Notification
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '202':
 *         description: Request to delete all notifications has been accepted and is being processed.
 *       '401':
 *         description: Unauthorized, token is missing or invalid.
 *       '403':
 *         description: Forbidden, user does not have ADMIN role.
 *       '500':
 *         description: Internal server error, failed to queue deletion task.
 */
router
  .route('/delete-all')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    // Replaced direct controller call with a Pub/Sub publisher.
    // Deleting all notifications for a tenant can be a long-running database operation.
    // Offloading this to a background worker prevents API timeouts and improves responsiveness.
    async (req, res, next) => {
      try {
        const { tenantId } = req.tenant; // from extractTenantContext middleware

        // The topic for deleting all notifications for a tenant.
        const topicName = 'delete-all-notifications';
        const messagePayload = { tenantId };

        // Publish a message to the Pub/Sub topic.
        await pubSubClient
          .topic(topicName)
          .publishMessage({ json: messagePayload });

        res.status(202).json({
          message:
            'Request to delete all notifications has been accepted and is being processed.',
        });
      } catch (error) {
        // Pass any errors to the Express error handling middleware.
        console.error(
          'Failed to publish delete-all-notifications message:',
          error
        );
        next(error);
      }
    }
  );

/**
 * @openapi
 * /notifications/send-notification-all:
 *   post:
 *     summary: Send a notification to all users in the tenant
 *     description: Asynchronously sends a notification to all users within the current tenant's context. The request is queued for background processing. Requires ADMIN privileges.
 *     tags:
 *       - Notification
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "System Maintenance"
 *               message:
 *                 type: string
 *                 example: "The system will be down for maintenance tonight from 10 PM to 11 PM."
 *               type:
 *                 type: string
 *                 enum: [info, warning, error, success]
 *                 example: "warning"
 *     responses:
 *       '202':
 *         description: Broadcast notification request accepted and is being processed.
 *       '400':
 *         description: Bad request, invalid input data.
 *       '401':
 *         description: Unauthorized, token is missing or invalid.
 *       '403':
 *         description: Forbidden, user does not have ADMIN role.
 *       '500':
 *         description: Internal server error, failed to queue broadcast.
 */
router
  .route('/send-notification-all')
  .post(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    // Replaced direct controller call with a Pub/Sub publisher.
    // Sending a notification to all users is a classic fan-out operation that is unsuitable for a synchronous API request.
    // This handler now publishes a single event, and a background worker will handle the distribution to all users.
    async (req, res, next) => {
      try {
        const { tenantId } = req.tenant; // from extractTenantContext middleware
        const notificationData = req.body;

        // The topic for broadcasting notifications to all users in a tenant.
        const topicName = 'broadcast-notification';
        const messagePayload = {
          tenantId,
          notification: notificationData,
        };

        // Publish a message to the Pub/Sub topic.
        await pubSubClient
          .topic(topicName)
          .publishMessage({ json: messagePayload });

        res.status(202).json({
          message:
            'Broadcast notification request has been accepted and is being processed.',
        });
      } catch (error) {
        // Pass any errors to the Express error handling middleware.
        console.error('Failed to publish broadcast message:', error);
        next(error);
      }
    }
  );

/**
 * @openapi
 * /notifications/get-all:
 *   get:
 *     summary: Get all notifications for the tenant
 *     description: Retrieves all notifications within the current tenant's context. Requires ADMIN privileges.
 *     tags:
 *       - Notification
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: A list of all notifications for the tenant.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 *       '401':
 *         description: Unauthorized, token is missing or invalid.
 *       '403':
 *         description: Forbidden, user does not have ADMIN role.
 */
router
  .route('/get-all')
  .get(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.getNotification
  );

/**
 * @openapi
 * /notifications/user/{userId}/inbox:
 *   get:
 *     summary: Get a user's inbox (unread notifications)
 *     description: Retrieves all unread notifications for a specific user. A user can only retrieve their own inbox.
 *     tags:
 *       - Notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the user. Must match the authenticated user's ID.
 *     responses:
 *       '200':
 *         description: A list of unread notifications for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 *       '401':
 *         description: Unauthorized, token is missing or invalid.
 *       '403':
 *         description: Forbidden, user is trying to access another user's inbox.
 *       '404':
 *         description: User not found.
 */
router
  .route('/user/:userId/inbox')
  .get(
    auth(ENUM_USER_ROLE.USER),
    extractTenantContext,
    NotificationController.getUserInbox
  );

/**
 * @openapi
 * /notifications/archive/{notificationId}:
 *   put:
 *     summary: Archive a notification
 *     description: Marks a specific notification as read (archives it) for the authenticated user. A user can only archive their own notifications.
 *     tags:
 *       - Notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique identifier of the notification to archive.
 *     responses:
 *       '200':
 *         description: Notification archived successfully.
 *       '401':
 *         description: Unauthorized, token is missing or invalid.
 *       '403':
 *         description: Forbidden, user is trying to archive a notification that does not belong to them.
 *       '404':
 *         description: Notification not found.
 */
router
  .route('/archive/:notificationId')
  .put(
    auth(ENUM_USER_ROLE.USER),
    extractTenantContext,
    NotificationController.archiveNotification
  );

/**
 * The collection of notification-related routes.
 * @type {express.Router}
 */
export const notificationRoutes = router;