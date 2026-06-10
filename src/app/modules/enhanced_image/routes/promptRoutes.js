import express from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createPromptController } from '../controllers/promptController.js';

// Utility to wrap async route handlers to catch errors and pass them to Express's error handling middleware.
// This prevents unhandled promise rejections from crashing the application or leading to silent failures,
// addressing a common source of bugs and potential denial-of-service.
const catchAsync = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const createPromptRoutes = (sessionManager, promptService, redisClient) => {
  const router = express.Router();
  const controller = createPromptController(sessionManager, promptService);

  // Enterprise-grade rate limiter for costly AI prompt generation endpoints.
  // This is critical to prevent cost runaway, API abuse, and denial-of-service attacks
  // from a single authenticated user spamming the service.
  // It uses a Redis store to ensure limits are applied consistently across a distributed system.
  const promptApiLimiter = rateLimit({
    store: new RedisStore({
      // The `rate-limit-redis` library needs a function that can send commands to Redis.
      // `redisClient.sendCommand` is the recommended approach for `node-redis` v4+.
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    windowMs: 60 * 1000, // 1 minute window
    max: 30, // Limit each authenticated user to 30 prompt-related requests per minute.
    keyGenerator: (req) => {
      // Key the rate limit by the authenticated user's ID. This is more precise than IP-based limiting for logged-in users.
      // It's assumed that `sessionManager.authenticate` populates `req.user.id`.
      if (!req.user?.id) {
        // This case should not be hit if authentication middleware is working, but serves as a safeguard.
        console.warn('Rate-limiting fallback to IP address due to missing user ID.');
        return req.ip;
      }
      return req.user.id;
    },
    handler: (req, res /*, next */) => {
      res.status(429).json({
        message: 'You have sent too many requests in a short period. Please wait a minute and try again.',
      });
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });


  // All routes should ideally be protected by authentication middleware to prevent unauthorized access.
  // Assuming sessionManager provides an 'authenticate' middleware function that verifies user sessions.
  // This addresses a critical security vulnerability (missing authentication).
  // The `promptApiLimiter` is added to protect the expensive operations behind these routes.
  router.post('/evaluate', sessionManager.authenticate, promptApiLimiter, catchAsync(controller.evaluatePrompt));
  router.post('/add-detail', sessionManager.authenticate, promptApiLimiter, catchAsync(controller.addDetail));
  router.post('/finalize', sessionManager.authenticate, promptApiLimiter, catchAsync(controller.finalizePrompt));

  return router;
};