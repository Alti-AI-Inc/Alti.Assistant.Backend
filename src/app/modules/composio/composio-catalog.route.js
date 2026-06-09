import express from 'express';
import { ComposioCatalogController } from './composio-catalog.controller.js';
// Assuming an authentication middleware exists for protecting routes.
// Adjust the path to your actual authentication middleware file.
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Utility to wrap asynchronous route handlers.
// This ensures that any errors (including rejected promises) from async functions
// are caught and passed to Express's error handling middleware, preventing unhandled promise rejections.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Apply authentication middleware to all routes for security.
// This prevents unauthorized access to API endpoints.
// If specific routes are intended to be public, remove `authMiddleware` from those routes.
router.get('/repositories', authMiddleware, asyncHandler(ComposioCatalogController.getRepositories));
router.get('/stats', authMiddleware, asyncHandler(ComposioCatalogController.getStats));
router.post('/import', authMiddleware, asyncHandler(ComposioCatalogController.importSubmodule));

export const composioCatalogRoutes = router;