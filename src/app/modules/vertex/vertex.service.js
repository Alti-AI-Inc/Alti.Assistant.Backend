import { GoogleGenAI } from '@google/genai';
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
 * Generates an AI response from Gemini 1.5 Flash via Vertex AI.
 * @param {string} prompt The user's query.
 * @returns {Promise<string>} The generated text reply.
 */
const getResponseFromGemini = async (prompt) => {
  try {
    const ai = new GoogleGenAI({ vertexai: { location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1' } });
    const modelName = config.gemini?.model_name || 'gemini-1.5-flash-002';

    const maskedPrompt = maskPII(prompt);

    const result = await ai.models.generateContent({
      model: modelName,
      contents: maskedPrompt,
    });
    
    const reply = result.text || 'No response generated.';

    return reply;
  } catch (error) {
    logger.error('Error generating anonymous response via Gemini:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An error occurred while communicating with the AI service. Please try again.'
    );
  }
};

export const VertexService = {
  getResponseFromGemini,
};
