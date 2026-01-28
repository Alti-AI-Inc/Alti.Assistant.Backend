import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { NotificationController } from './notification.controller.js';
const router = express.Router();

router.route('/user/:userId').post(extractTenantContext, NotificationController.sendNotificationById);

router
  .route('/get-notification/:userId')
  .get(extractTenantContext, NotificationController.getNotificationById);

router
  .route('/update/:notificationId')
  .put(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.updateNotificationById,
  );

router
  .route('/delete/:notificationId')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.deleteNotificationById,
  );

router
  .route('/delete-all')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN),
    extractTenantContext,
    NotificationController.deleteAllNotification,
  );

router
  .route('/send-notification-all')
  .post(auth(ENUM_USER_ROLE.ADMIN), NotificationController.sendNotification);

router.route('/get-all').get(NotificationController.getNotification);

export const notificationRoutes = router;
