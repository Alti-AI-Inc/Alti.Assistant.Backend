import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import catchAsync from '../../utils/catchAsync.js';
import { openAIAiController } from './openAi.controller.js';

const router = express.Router();

/**
 * @openapi
 * tags:
 *   name: OpenAI
 *   description: Endpoints for interacting with OpenAI models.
 */

/**
 * @openapi
 * /api/v1/openai/get-response:
 *   post:
 *     summary: Get a response from GPT-4o Mini
 *     description: Submits a prompt to the GPT-4o Mini model and receives a response. Requires user authentication.
 *     tags: [OpenAI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The user's prompt or message to the AI.
 *               conversationHistory:
 *                 type: array
 *                 description: Optional. The history of the conversation to provide context.
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *             required:
 *               - prompt
 *     responses:
 *       200:
 *         description: Successful response from the AI model.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       403:
 *         description: Forbidden. User does not have the required role (ADMIN or USER).
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // Wrap the async controller function to catch any potential errors
  // and pass them to the global error handler.
  catchAsync(openAIAiController.Gpt4oMiniGetResponse)
);

/**
 * @openapi
 * /api/v1/openai/4nano/get-response:
 *   post:
 *     summary: Get a response from GPT-4o Nano
 *     description: Submits a prompt to the GPT-4o Nano model and receives a response. Requires user authentication. This is a faster, more lightweight model.
 *     tags: [OpenAI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The user's prompt or message to the AI.
 *               conversationHistory:
 *                 type: array
 *                 description: Optional. The history of the conversation to provide context.
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *             required:
 *               - prompt
 *     responses:
 *       200:
 *         description: Successful response from the AI model.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       403:
 *         description: Forbidden. User does not have the required role (ADMIN or USER).
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/4nano/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // Wrap the async controller function to catch any potential errors
  // and pass them to the global error handler.
  catchAsync(openAIAiController.Gpt4NanoGetResponse)
);

/**
 * @openapi
 * /api/v1/openai/anonymous-response:
 *   post:
 *     summary: Get an anonymous response from the AI
 *     description: Submits a prompt to the AI model and receives a response without requiring user authentication. This endpoint may be rate-limited or use a different, potentially less powerful, model.
 *     tags: [OpenAI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The user's prompt or message to the AI.
 *               conversationHistory:
 *                 type: array
 *                 description: Optional. The history of the conversation to provide context.
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *             required:
 *               - prompt
 *     responses:
 *       200:
 *         description: Successful response from the AI model.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/anonymous-response',
  // Wrap the async controller function to catch any potential errors
  // and pass them to the global error handler.
  catchAsync(openAIAiController.OpenAiGetResponseAnonymously)
);

/**
 * Express router for OpenAI related endpoints.
 * @type {express.Router}
 */
export const openAIAiRoutes = router;