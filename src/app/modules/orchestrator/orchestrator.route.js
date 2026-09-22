import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import promptLimiter from '../../middlewares/promptLimiter.js';
import { OrchestratorController } from './orchestrator.controller.js';
import { SovereignRouterController } from './sovereignRouter.controller.js';

const router = express.Router();

// Public: route catalog discovery
router.get('/routes', OrchestratorController.listRoutes);

// Authenticated endpoints
router.use(auth());

// Core sovereign orchestration — prompt-limited (1 prompt = 1 input + 1 output)
router.post('/route-prompt', promptLimiter, SovereignRouterController.routePrompt);
router.post('/stream', promptLimiter, SovereignRouterController.routePrompt);
router.post('/orchestrate', promptLimiter, OrchestratorController.orchestrate);
router.post('/classify', OrchestratorController.classify);
router.post('/execute', promptLimiter, OrchestratorController.executeRoute);

// Observability
router.get('/telemetry', OrchestratorController.getTelemetry);

export const OrchestratorRoutes = router;
export default OrchestratorRoutes;
