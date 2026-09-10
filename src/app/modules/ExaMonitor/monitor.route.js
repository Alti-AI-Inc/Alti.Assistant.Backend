import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
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
// NEW: actually starts a run on Exa right now instead of waiting for
// the interval schedule. Nothing like this existed before — you had
// no way to trigger a run except by typing a fake run record directly
// into your own database.
router.post(
  '/trigger/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorController.triggerMonitorRecord
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
// Monitor Run
// -----------------------------------------------------------------------


router.post(
  '/:monitorId/runs/create-run',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(MonitorValidation.createMonitorRunZodSchema),
  MonitorController.createMonitorRunRecord
);

router.get(
  '/:monitorId/runs/get-all',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorController.getAllMonitorRunRecords
);

router.get(
  '/:monitorId/runs/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorController.getSingleMonitorRunRecord
);

router.patch(
  '/:monitorId/runs/update-run/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(MonitorValidation.updateMonitorRunZodSchema),
  MonitorController.updateMonitorRunRecord
);

router.delete(
  '/:monitorId/runs/delete-run/:id',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  MonitorController.deleteMonitorRunRecord
);

export const MonitorRoutes = router;
