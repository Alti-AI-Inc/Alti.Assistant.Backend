import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import promptLimiter from '../../middlewares/promptLimiter.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { OrchestratorValidation } from './orchestrator.validation.js';
import { OrchestratorController } from './orchestrator.controller.js';
import { SovereignRouterController } from './sovereignRouter.controller.js';

const router = express.Router();

// Public: route catalog discovery
router.get('/routes', OrchestratorController.listRoutes);

// Authenticated endpoints
router.use(auth());

// Core sovereign orchestration — validated + prompt-limited
router.post('/route-prompt', validateRequest(OrchestratorValidation.routePromptSchema), promptLimiter, SovereignRouterController.routePrompt);
router.post('/stream', validateRequest(OrchestratorValidation.routePromptSchema), promptLimiter, SovereignRouterController.routePrompt);
router.post('/orchestrate', validateRequest(OrchestratorValidation.routePromptSchema), promptLimiter, OrchestratorController.orchestrate);
router.post('/classify', validateRequest(OrchestratorValidation.classifySchema), OrchestratorController.classify);
router.post('/execute', validateRequest(OrchestratorValidation.routePromptSchema), promptLimiter, OrchestratorController.executeRoute);

// Observability
router.get('/telemetry', OrchestratorController.getTelemetry);

export const OrchestratorRoutes = router;
export default OrchestratorRoutes;
