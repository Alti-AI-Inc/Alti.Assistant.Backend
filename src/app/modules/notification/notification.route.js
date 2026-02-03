import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { NotificationController } from './notification.controller.js';
const router = express.Router();

router.route('/user/:userId').post(NotificationController.sendNotificationById);

router
  .route('/get-notification/:userId')
  .get(NotificationController.getNotificationById);

router
  .route('/update/:notificationId')
  .put(
    auth(ENUM_USER_ROLE.ADMIN),
    NotificationController.updateNotificationById,
  );

router
  .route('/delete/:notificationId')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN),
    NotificationController.deleteNotificationById,
  );

router
  .route('/delete-all')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN),
    NotificationController.deleteAllNotification,
  );

router
  .route('/send-notification-all')
  .post(auth(ENUM_USER_ROLE.ADMIN), NotificationController.sendNotification);

router.route('/get-all').get(NotificationController.getNotification);

export const notificationRoutes = router;
