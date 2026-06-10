import express from 'express';
import { createPromptController } from '../controllers/promptController.js';

// Utility to wrap async route handlers to catch errors and pass them to Express's error handling middleware.
// This prevents unhandled promise rejections from crashing the application or leading to silent failures,
// addressing a common source of bugs and potential denial-of-service.
const catchAsync = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const createPromptRoutes = (sessionManager, promptService) => {
  const router = express.Router();
  const controller = createPromptController(sessionManager, promptService);

  // All routes should ideally be protected by authentication middleware to prevent unauthorized access.
  // Assuming sessionManager provides an 'authenticate' middleware function that verifies user sessions.
  // This addresses a critical security vulnerability (missing authentication).
  router.post('/evaluate', sessionManager.authenticate, catchAsync(controller.evaluatePrompt));
  router.post('/add-detail', sessionManager.authenticate, catchAsync(controller.addDetail));
  router.post('/finalize', sessionManager.authenticate, catchAsync(controller.finalizePrompt));

  return router;
};