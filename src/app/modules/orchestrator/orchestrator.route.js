import express from 'express';
import { orchestratorController } from './orchestrator.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { shieldOfLight } from '../../middlewares/shieldOfLight.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';

const router = express.Router();

router.post(
  '/route-prompt',
  auth(), // Protect route with standard auth middleware
  shieldOfLight(), // Filter out malicious requests before processing
  createRateLimiter(20, 15), // 20 requests per 15 minutes — most expensive endpoint
  orchestratorController.routePrompt
);

export const orchestratorRoutes = router;
