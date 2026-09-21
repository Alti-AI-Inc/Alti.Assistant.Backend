import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import { TemporalController } from './temporal.controller.js';

const router = express.Router();

router.use(auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.USER));

router.post('/workflows/start', TemporalController.startWorkflow);
router.get('/workflows/:workflowId', TemporalController.getWorkflow);
router.post('/workflows/:workflowId/signal', TemporalController.signalWorkflow);
router.post('/workflows/:workflowId/terminate', TemporalController.terminateWorkflow);

router.get('/schedules', TemporalController.listSchedules);

export const TemporalRoutes = router;
export default TemporalRoutes;
