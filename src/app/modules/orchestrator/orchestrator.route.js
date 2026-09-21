import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { OrchestratorController } from './orchestrator.controller.js';

const router = express.Router();

// Public: route catalog discovery
router.get('/routes', OrchestratorController.listRoutes);

// Authenticated endpoints
router.use(auth());

// Core orchestration
router.post('/orchestrate', OrchestratorController.orchestrate);
router.post('/stream', OrchestratorController.streamOrchestrate);
router.post('/classify', OrchestratorController.classify);
router.post('/execute', OrchestratorController.executeRoute);

// Observability
router.get('/telemetry', OrchestratorController.getTelemetry);

export const OrchestratorRoutes = router;
export default OrchestratorRoutes;
