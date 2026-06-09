import { GeminiAiService } from '../gemini/gemini.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Delegates OpenAI GPT-4o requests exclusively to Google Gemini 3.1 Flash on Google Cloud
 */
const openAiResponseService = async (prompt, userId, sessionId) => {
  logger.info(
    `Redirecting OpenAI GPT-4o Request to Google Gemini 3.1 Flash exclusively.`
  );
  try {
    // Await the Gemini service call to ensure the promise resolves and errors are caught
    return await GeminiAiService.geminiService(sessionId, prompt, userId);
  } catch (error) {
    // Log the error for debugging and operational visibility
    logger.error(
      `Error redirecting OpenAI GPT-4o request to Gemini for userId: ${userId}, sessionId: ${sessionId}. Error: ${error.message}`,
      error
    );
    // Re-throw the error so the calling service can handle it appropriately
    throw error;
  }
};

/**
 * Delegates OpenAI GPT-4.1 Nano requests exclusively to Google Gemini 3.1 Flash on Google Cloud
 */
const openAi4NanoResponseService = async (prompt, userId, sessionId) => {
  logger.info(
    `Redirecting OpenAI GPT-4.1 Nano Request to Google Gemini 3.1 Flash exclusively.`
  );
  try {
    // Await the Gemini service call to ensure the promise resolves and errors are caught
    return await GeminiAiService.geminiService(sessionId, prompt, userId);
  } catch (error) {
    // Log the error for debugging and operational visibility
    logger.error(
      `Error redirecting OpenAI GPT-4.1 Nano request to Gemini for userId: ${userId}, sessionId: ${sessionId}. Error: ${error.message}`,
      error
    );
    // Re-throw the error so the calling service can handle it appropriately
    throw error;
  }
};

export const openAIAiServices = {
  openAiResponseService,
  openAi4NanoResponseService,
};