import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { AdminController } from './admin.controller.js';
const router = express.Router();

router.put(
  '/update-user-role/:id',
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  AdminController.updateUserRole,
);

router.delete(
  '/delete-user/:objectId',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.deleteUser,
);

router.get(
  '/buyer/all-user',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllBuyer,
);

router.get(
  '/all-user',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllUsers,
);

router.get(
  '/all-payment',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllPayment,
);

router.get('/admin/:email', AdminController.getAdmin);

router.get(
  '/all-user/statistics',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getUserStatisticsByMonth,
);

export const adminRoutes = router;
