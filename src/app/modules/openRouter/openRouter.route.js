import express from 'express';
import { OpenRouterController } from './openRouter.controller.js';
const router = express.Router();

router.post('/support-model-details', OpenRouterController.getModelDetails);
router.post('/support-model-list', OpenRouterController.getSupportedModelName);
router.post('/chat', OpenRouterController.sendPrompt);
router.get('/session/:sessionId', OpenRouterController.getSessionHistory);
router.delete('/session/:sessionId', OpenRouterController.deleteSessionData);

export const openRouterRoutes = router;
