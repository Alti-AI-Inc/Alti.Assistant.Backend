import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import catchAsync from '../../utils/catchAsync.js';
import { openAIAiController } from './openAi.controller.js';

const router = express.Router();

// Route to get a response from GPT-4o Mini for authenticated users
router.post(
  '/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // Wrap the async controller function to catch any potential errors
  // and pass them to the global error handler.
  catchAsync(openAIAiController.Gpt4oMiniGetResponse)
);

// Route to get a response from GPT-4o Nano for authenticated users
router.post(
  '/4nano/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // Wrap the async controller function to catch any potential errors
  // and pass them to the global error handler.
  catchAsync(openAIAiController.Gpt4NanoGetResponse)
);

// Route to get a response anonymously (without authentication)
router.post(
  '/anonymous-response',
  // Wrap the async controller function to catch any potential errors
  // and pass them to the global error handler.
  catchAsync(openAIAiController.OpenAiGetResponseAnonymously)
);

export const openAIAiRoutes = router;