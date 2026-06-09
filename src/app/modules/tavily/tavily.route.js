import express from 'express';
import { TavilyAiController } from './tavily.controller.js';

const router = express.Router();

// Utility function to catch errors in async route handlers and pass them to Express's error middleware.
// This prevents unhandled promise rejections from crashing the application and ensures proper error handling.
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router
  .route('/get-response-anonymously')
  .post(catchAsync(TavilyAiController.TavilyAiGetResponseAnonymously));

export const tavilyAiRoutes = router;