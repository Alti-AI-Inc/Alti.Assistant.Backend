import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { MonitorRunRoutes } from './monitorRun.route.js';
import { MonitorController } from './monitor.controller.js';
import { MonitorValidation } from './monitor.validation.js';

// mergeParams so :spaceId from the parent router is visible here
const router = express.Router({ mergeParams: true });

router.post(
  '/create-monitor',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(MonitorValidation.createMonitorZodSchema),
  MonitorController.createMonitorRecord
);

router.get(
  '/get-all-monitors',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorController.getAllMonitorRecords
);

router.get(
  '/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorController.getSingleMonitorRecord
);

router.patch(
  '/update-monitor/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(MonitorValidation.updateMonitorZodSchema),
  MonitorController.updateMonitorRecord
);

router.delete(
  '/delete-monitor/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorController.deleteMonitorRecord
);

// -----------------------------------------------------------------------
// Run history — /spaces/:spaceId/monitors/:monitorId/runs/...
// -----------------------------------------------------------------------
router.use('/:monitorId/runs', MonitorRunRoutes);

export const MonitorRoutes = router;
