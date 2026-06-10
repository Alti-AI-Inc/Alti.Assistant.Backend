import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { NotificationController } from './notification.controller.js';
const router = express.Router();

router
  .route('/user/:userId')
  // BUG: Missing authentication. Any unauthenticated user can send a notification to any userId.
  // FIX: Add auth middleware to restrict access. Assuming only ADMINs can send notifications to specific users.
  .post(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.sendNotificationById
  );

router
  .route('/get-notification/:userId')
  // BUG: Missing authentication. Any user can retrieve notifications for any userId (IDOR vulnerability).
  // FIX: Add auth middleware. A user should only be able to get their own notifications.
  // The controller must verify req.user.id matches userId to prevent IDOR.
  .get(
    auth(ENUM_USER_ROLE.USER),
    extractTenantContext,
    NotificationController.getNotificationById
  );

router
  .route('/update/:notificationId')
  .put(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.updateNotificationById
  );

router
  .route('/delete/:notificationId')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.deleteNotificationById
  );

router
  .route('/delete-all')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.deleteAllNotification
  );

router
  .route('/send-notification-all')
  // BUG: Missing extractTenantContext. If sending to all users within a tenant, tenant context is crucial.
  // FIX: Add extractTenantContext.
  .post(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext, // Added for tenant-specific "send all" functionality
    NotificationController.sendNotification
  );

router
  .route('/get-all')
  // BUG: Missing authentication and tenant context. Any unauthenticated user can get all notifications (data leak).
  // FIX: Add auth middleware (likely ADMIN) and extractTenantContext for tenant-specific "get all".
  .get(
    auth(ENUM_USER_ROLE.ADMIN), // Assuming only ADMINs can retrieve all notifications
    extractTenantContext, // Added for tenant-specific "get all" functionality
    NotificationController.getNotification
  );

router
  .route('/user/:userId/inbox')
  // BUG: Missing authentication. Any user can retrieve the inbox of any userId (IDOR vulnerability).
  // FIX: Add auth middleware. A user should only be able to get their own inbox.
  // The controller must verify req.user.id matches userId to prevent IDOR.
  .get(
    auth(ENUM_USER_ROLE.USER),
    extractTenantContext,
    NotificationController.getUserInbox
  );

router
  .route('/archive/:notificationId')
  // BUG: Missing authentication. Any user can archive any notificationId (IDOR, unauthorized modification).
  // FIX: Add auth middleware. A user should only be able to archive their own notifications.
  // The controller must verify ownership of the notification to prevent IDOR.
  .put(
    auth(ENUM_USER_ROLE.USER),
    extractTenantContext,
    NotificationController.archiveNotification
  );

export const notificationRoutes = router;