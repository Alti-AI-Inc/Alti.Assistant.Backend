import { GeminiAiService } from '../gemini/gemini.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Delegates OpenAI GPT-4o requests exclusively to Google Gemini 3.1 Flash on Google Cloud
 */
const openAiResponseService = async (prompt, userId, sessionId) => {
  logger.info(
    `Redirecting OpenAI GPT-4o Request to Google Gemini 3.1 Flash exclusively.`
  );
  return GeminiAiService.geminiService(sessionId, prompt, userId);
};

/**
 * Delegates OpenAI GPT-4.1 Nano requests exclusively to Google Gemini 3.1 Flash on Google Cloud
 */
const openAi4NanoResponseService = async (prompt, userId, sessionId) => {
  logger.info(
    `Redirecting OpenAI GPT-4.1 Nano Request to Google Gemini 3.1 Flash exclusively.`
  );
  return GeminiAiService.geminiService(sessionId, prompt, userId);
};

export const openAIAiServices = {
  openAiResponseService,
  openAi4NanoResponseService,
};
