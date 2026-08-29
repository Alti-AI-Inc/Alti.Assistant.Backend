import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { MonitorRunController } from './monitorRun.controller.js';
import { MonitorRunValidation } from './monitorRun.validation.js';

// mergeParams so :spaceId and :monitorId from parent routers are visible here
const router = express.Router({ mergeParams: true });

router.post(
  '/create-run',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(MonitorRunValidation.createMonitorRunZodSchema),
  MonitorRunController.createMonitorRunRecord
);

router.get(
  '/get-all',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorRunController.getAllMonitorRunRecords
);

router.get(
  '/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorRunController.getSingleMonitorRunRecord
);

router.patch(
  '/update-run/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(MonitorRunValidation.updateMonitorRunZodSchema),
  MonitorRunController.updateMonitorRunRecord
);

router.delete(
  '/delete-run/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorRunController.deleteMonitorRunRecord
);

export const MonitorRunRoutes = router;
