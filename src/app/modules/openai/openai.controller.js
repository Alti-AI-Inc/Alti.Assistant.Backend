import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { OpenAiService } from './openai.service.js';
import { rateLimiter } from '../../../shared/rateLimiter.js';

/**
 * Controller for handling public, unauthenticated chat requests.
 * Uses an IP rate limiter to protect the endpoint from spam and abuse.
 */
const getAnonymousResponse = catchAsync(async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt is required and must be a string.',
      data: null,
    });
  }

  // Enforce IP-based rate limiting: max 15 requests per 5 minutes per IP
  await rateLimiter.limitByIp(req, {
    maxPoints: 15,
    duration: 300,
    errorMessage: 'Too many anonymous chat requests. Please register or try again later.',
  });

  const reply = await OpenAiService.getResponseFromGemini(prompt);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response generated successfully.',
    data: {
      reply,
    },
  });
});

export const OpenAiController = {
  getAnonymousResponse,
};
