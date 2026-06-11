import { GeminiAiService } from '../gemini/gemini.service.js';
import { logger } from '../../../shared/logger.js';

// VERTEX_AI_AGENT: Added a PII redaction utility.
// This function masks common PII patterns like emails and phone numbers
// before the data is sent to the generative model, enhancing user privacy and data security.
// For production systems, consider using the Google Cloud DLP API for more robust PII detection.
const maskPii = (text) => {
  if (typeof text !== 'string' || !text) {
    return text;
  }
  // Mask email addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;
  // Mask phone numbers (various common formats)
  const phoneRegex = /\b(?:\+?1[ -]?)?(?:\(?\d{3}\)?|\d{3})[ -]?\d{3}[ -]?\d{4}\b/g;
  // Mask Social Security Numbers (SSN)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;

  let maskedText = text.replace(emailRegex, '[EMAIL_REDACTED]');
  maskedText = maskedText.replace(phoneRegex, '[PHONE_REDACTED]');
  maskedText = maskedText.replace(ssnRegex, '[SSN_REDACTED]');

  return maskedText;
};

/**
 * Delegates OpenAI GPT-4o requests exclusively to Google Gemini 3.1 Flash on Google Cloud.
 * This service acts as a proxy, redirecting requests intended for OpenAI's GPT-4o model
 * to the Gemini AI service, ensuring all AI processing is handled by Google Gemini.
 *
 * @param {string} prompt - The user's prompt or query to be processed by the AI.
 * @param {string} userId - The unique identifier for the user making the request.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @returns {Promise<string>} A promise that resolves with the AI's generated response as a string.
 * @throws {Error} Throws an error if the delegation to the Gemini service fails for any reason.
 */
const openAiResponseService = async (prompt, userId, sessionId) => {
  // GCP-AUDITOR-AGENT: Replaced simple string with a structured JSON object.
  // This format is automatically parsed by Google Cloud Logging, enabling powerful filtering and monitoring.
  // The 'severity' is automatically set to INFO by the logger.info() call.
  logger.info({
    message: 'Redirecting OpenAI GPT-4o request to Google Gemini 3.1 Flash.',
    context: {
      sourceModel: 'GPT-4o',
      targetModel: 'Gemini 3.1 Flash',
      userId,
      sessionId,
    },
  });
  try {
    // VERTEX_AI_AGENT: Added PII masking to the user prompt.
    // This step is crucial for data privacy and security, ensuring that sensitive
    // user information is redacted before being processed by the AI model.
    const sanitizedPrompt = maskPii(prompt);

    // Await the Gemini service call to ensure the promise resolves and errors are caught
    return await GeminiAiService.geminiService(sessionId, sanitizedPrompt, userId);
  } catch (error) {
    // GCP-AUDITOR-AGENT: Replaced string concatenation with a structured JSON object for error logging.
    // This provides detailed context for debugging in Google Cloud Logging and preserves the full error stack.
    // The 'severity' is automatically set to ERROR by the logger.error() call.
    logger.error({
      message: `Error redirecting OpenAI GPT-4o request to Gemini.`,
      context: {
        userId,
        sessionId,
        sourceModel: 'GPT-4o',
      },
      // Including the error object's properties ensures the stack trace is captured.
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
    // Re-throw the error so the calling service can handle it appropriately
    throw error;
  }
};

/**
 * Delegates OpenAI GPT-4.1 Nano requests exclusively to Google Gemini 3.1 Flash on Google Cloud.
 * Similar to `openAiResponseService`, this function redirects requests for the GPT-4.1 Nano model
 * to the Gemini AI service, maintaining a consistent AI backend.
 *
 * @param {string} prompt - The user's prompt or query to be processed by the AI.
 * @param {string} userId - The unique identifier for the user making the request.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @returns {Promise<string>} A promise that resolves with the AI's generated response as a string.
 * @throws {Error} Throws an error if the delegation to the Gemini service fails for any reason.
 */
const openAi4NanoResponseService = async (prompt, userId, sessionId) => {
  // GCP-AUDITOR-AGENT: Replaced simple string with a structured JSON object.
  // This format is automatically parsed by Google Cloud Logging, enabling powerful filtering and monitoring.
  // The 'severity' is automatically set to INFO by the logger.info() call.
  logger.info({
    message: 'Redirecting OpenAI GPT-4.1 Nano request to Google Gemini 3.1 Flash.',
    context: {
      sourceModel: 'GPT-4.1 Nano',
      targetModel: 'Gemini 3.1 Flash',
      userId,
      sessionId,
    },
  });
  try {
    // VERTEX_AI_AGENT: Added PII masking to the user prompt.
    // This step is crucial for data privacy and security, ensuring that sensitive
    // user information is redacted before being processed by the AI model.
    const sanitizedPrompt = maskPii(prompt);

    // Await the Gemini service call to ensure the promise resolves and errors are caught
    return await GeminiAiService.geminiService(sessionId, sanitizedPrompt, userId);
  } catch (error) {
    // GCP-AUDITOR-AGENT: Replaced string concatenation with a structured JSON object for error logging.
    // This provides detailed context for debugging in Google Cloud Logging and preserves the full error stack.
    // The 'severity' is automatically set to ERROR by the logger.error() call.
    logger.error({
      message: `Error redirecting OpenAI GPT-4.1 Nano request to Gemini.`,
      context: {
        userId,
        sessionId,
        sourceModel: 'GPT-4.1 Nano',
      },
      // Including the error object's properties ensures the stack trace is captured.
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
    // Re-throw the error so the calling service can handle it appropriately
    throw error;
  }
};

/**
 * @typedef {object} OpenAIAiServices
 * @property {function(string, string, string): Promise<string>} openAiResponseService - Service for handling OpenAI GPT-4o requests, redirected to Gemini.
 * @property {function(string, string, string): Promise<string>} openAi4NanoResponseService - Service for handling OpenAI GPT-4.1 Nano requests, redirected to Gemini.
 */

/**
 * An object containing various AI service functions designed to handle requests
 * originally intended for OpenAI models (GPT-4o, GPT-4.1 Nano) by redirecting them
 * exclusively to Google Gemini 3.1 Flash. This centralizes AI processing through Gemini.
 *
 * @type {OpenAIAiServices}
 */
export const openAIAiServices = {
  openAiResponseService,
  openAi4NanoResponseService,
};