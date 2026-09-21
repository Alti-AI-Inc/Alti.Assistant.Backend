import express from 'express';
import { TraceController } from './traces.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

router.use(auth());

router.get('/', TraceController.listTraces);
router.get('/dashboard', TraceController.getDashboard);
router.get('/agents/:agentId/analytics', TraceController.getAgentAnalytics);
router.get('/agents/:agentId/costs', TraceController.getAgentCosts);
router.get('/export', TraceController.exportTraces);

// IMPORTANT: Parameterized routes last
router.get('/:runId', TraceController.getTrace);
router.post('/:runId/feedback', TraceController.addFeedback);
router.delete('/:runId', TraceController.deleteTrace);

export const TraceRoutes = router;
