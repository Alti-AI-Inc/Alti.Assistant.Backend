import express from 'express';
import { createImageController } from '../controllers/imageController.js';

// Utility function to wrap async route handlers and catch errors.
// This prevents unhandled promise rejections from crashing the application
// and ensures errors are passed to the Express error handling middleware.
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const createImageRoutes = (
  sessionManager,
  imageService,
  promptService
) => {
  const router = express.Router();
  const controller = createImageController(
    sessionManager,
    imageService,
    promptService
  );

  // Wrap async controller methods with asyncHandler to catch potential errors
  // and pass them to the Express error handling middleware, preventing unhandled promise rejections.
  router.post('/edit', asyncHandler(controller.editImage));
  router.post('/generate', asyncHandler(controller.generateImage));
  router.post('/generate-direct', asyncHandler(controller.generateImageDirect));

  return router;
};