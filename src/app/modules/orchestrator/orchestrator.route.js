import express from 'express';
import { orchestratorController } from './orchestrator.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

router.post(
  '/route-prompt',
  auth(), // Protect route with standard auth middleware
  orchestratorController.routePrompt
);

export const orchestratorRoutes = router;
