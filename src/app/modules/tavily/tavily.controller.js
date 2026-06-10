/**
 * @file This file contains the controller logic for handling AI-related requests,
 * specifically for generating responses using Google Gemini with Google Search Grounding.
 * It integrates with the Google GenAI service, manages user chat history, and provides
 * an endpoint for AI interactions.
 */

import { GoogleGenAI } from '@google/genai';
import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import generateSessionId from '../../../shared/sessionGenerate.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';

/**
 * @type {GoogleGenAI}
 * @description Initializes the GoogleGenAI client with the API key from configuration.
 * This client is used to interact with Google's Gemini AI models.
 */
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

/**
 * @swagger
 * /api/v1/gemini/get-response:
 *   post:
 *     summary: Get AI-generated response (Gemini with Google Search Grounding)
 *     description: Processes a user's prompt using the Google Gemini AI model, which includes Google Search Grounding for enhanced responses. It also manages conversation history for the user.
 *     tags:
 *       - AI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The user's prompt for the AI.
 *                 example: "What is the capital of France?"
 *               sessionId:
 *                 type: string
 *                 description: An optional session ID to continue an existing conversation. If not provided, a new one will be generated.
 *                 example: "some_existing_session_id"
 *     responses:
 *       200:
 *         description: Response processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Response processed successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       description: The session ID used for the conversation.
 *                       example: "new_generated_session_id"
 *                     reply:
 *                       type: string
 *                       description: The AI-generated response.
 *                       example: "The capital of France is Paris."
 *       400:
 *         description: Validation Error or AI model failed to generate a reply.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Validation Error"
 *                 errorMessages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: string
 *                       message:
 *                         type: string
 *       401:
 *         description: Unauthorized. User ID is missing or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized: User ID is missing."
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User not found."
 *       500:
 *         description: Internal Server Error or AI model processing failed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "AI model processing failed."
 */
/**
 * @function
 * @description Handles the request to get an AI-generated response using Google Gemini with Google Search Grounding.
 * It processes a user's prompt, interacts with the Gemini API, and stores the conversation history.
 * @param {import('express').Request} req - The Express request object, containing the prompt and an optional session ID in the body.
 *                                          Assumes `req.user.id` is populated by authentication middleware.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 */
const GeminiAiGetResponse = catchAsync(async (req, res) => {
  const prompt = req.body?.prompt;
  // SECURITY FIX: Prevent Insecure Direct Object Reference (IDOR).
  // The userId should come from the authenticated user's session/token (e.g., req.user.id),
  // not directly from the request body, to ensure a user can only access/modify their own data.
  // This assumes an authentication middleware populates `req.user`.
  const userId = req.user?.id;
  const sessionId = req.body?.sessionId;
  const currentSessionId = sessionId || generateSessionId(24);

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Unauthorized: User ID is missing.',
    });
  }

  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Validation Error',
      errorMessages: [{ path: 'prompt', message: 'Prompt is required.' }],
    });
  }

  // Optimization: Use .lean() as we only check for user existence and don't modify the user object here.
  // This avoids hydrating a full Mongoose document, reducing memory overhead.
  const user = await UserModel.findById(userId).lean();
  if (!user) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'User not found.',
    });
  }

  try {
    // Use Gemini with Google Search Grounding — replaces Tavily + Groq
    // BUG FIX: The `contents` field for `generateContent` typically expects an array of Part objects.
    // Using `[{ text: prompt }]` is more explicit and robust for the Gemini API.
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ text: prompt }],
      generationConfig: { // Renamed config to generationConfig for clarity and consistency with GenAI SDK
        temperature: 0.1,
      },
      tools: [{ googleSearch: {} }], // Tools are typically outside generationConfig
    });

    const candidate = result.candidates?.[0];
    const reply = candidate?.content?.parts
      ?.filter((part) => part.text && !part.thought)
      ?.map((part) => part.text)
      ?.join('') || 'No reply generated';

    if (!reply || reply === 'No reply generated') {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Validation Error',
        errorMessages: [
          {
            path: 'message',
            message: 'Reply could not be generated by the AI model.',
          },
        ],
      });
    }

    const responseData = {
      prompt,
      model: 'gemini-2.5-flash-grounded',
      reply,
      // BUG FIX: Renamed 'total_time' to 'total_tokens' as it stores token count, not time.
      total_tokens: result.usageMetadata?.totalTokenCount || 0,
    };

    // Performance Hint: For faster lookups on ChatHistory, consider adding a compound index
    // to the ChatHistory model: `schema.index({ user: 1, sessionId: 1 });`
    let chatSession = await ChatHistory.findOne({
      user: userId,
      sessionId: currentSessionId,
    });

    if (chatSession) {
      chatSession.responses.push(responseData);
      await chatSession.save();
    } else {
      chatSession = await ChatHistory.create({
        user: userId,
        sessionId: currentSessionId,
        responses: [responseData],
      });

      // BUG FIX: Renamed 'llamaAiSessions' to 'aiSessions' for consistency with Gemini model usage.
      // This assumes the UserModel schema has been updated to use 'aiSessions' instead of 'llamaAiSessions'.
      await UserModel.findByIdAndUpdate(userId, {
        $push: { aiSessions: chatSession._id },
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response processed successfully.',
      data: { sessionId: currentSessionId, reply },
    });
  } catch (error) {
    console.error('Error:', error.message);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'AI model processing failed.',
    });
  }
});

/**
 * @description Controller for handling AI-related requests, specifically for generating responses using Google Gemini.
 * This object exports various handler functions for AI interactions.
 * @type {object}
 * @property {function(import('express').Request, import('express').Response): Promise<void>} GeminiAiGetResponse - Handles the AI response generation.
 */
// NAMING FIX: Renamed controller to reflect the use of Google Gemini, not Tavily.
export const GeminiAiController = {
  GeminiAiGetResponse,
};