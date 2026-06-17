import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { logger } from '../../../shared/logger.js';

/**
 * Masks common PII patterns (emails, phone numbers) to protect user privacy.
 * @param {string} text The input text to mask.
 * @returns {string} The text with PII replaced.
 */
const maskPII = (text) => {
  if (!text || typeof text !== 'string') return text;

  let maskedText = text;

  // Mask email addresses
  maskedText = maskedText.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL_REDACTED]'
  );

  // Mask phone numbers
  maskedText = maskedText.replace(
    /(\+\d{1,3}[- ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/g,
    '[PHONE_REDACTED]'
  );

  return maskedText;
};

/**
 * Generates an AI response from Gemini 1.5 Flash.
 * @param {string} prompt The user's query.
 * @returns {Promise<string>} The generated text reply.
 */
const getResponseFromGemini = async (prompt) => {
  try {
    const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Gemini API Key is not configured in the application environment.'
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = config.gemini?.model_name || 'gemini-3.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    const maskedPrompt = maskPII(prompt);

    const result = await model.generateContent(maskedPrompt);
    const reply = result.response.text() || 'No response generated.';

    return reply;
  } catch (error) {
    logger.error('Error generating anonymous response via Gemini:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An error occurred while communicating with the AI service. Please try again.'
    );
  }
};

export const OpenAiService = {
  getResponseFromGemini,
};
