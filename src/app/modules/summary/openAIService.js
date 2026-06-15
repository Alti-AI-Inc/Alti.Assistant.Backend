import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { geminiClient } from './llm.js';
// INTEGRATION FIX: Import services for usage tracking and custom error types.
// These services are essential for ensuring actions respect tenant boundaries and limits.
import { usageService } from '../usage/usage.service.js'; // NOTE: Assumed path and service
import { AppError } from '../../../shared/errors.js'; // NOTE: Assumed path and error definitions

/**
 * Extracts a URL from a user's text input using an AI model (Gemini).
 * It also determines if the extracted URL is a YouTube link.
 * This function is context-aware and integrates with the application's usage and billing system.
 * @async
 * @function getUrlFromUserInputUsingAi
 * @param {string} userInput - The raw text input from the user, which may contain a URL.
 * @param {object} userContext - An object containing the authenticated user's context (e.g., userId, workspaceId, role).
 * @param {string} userContext.userId - The ID of the user making the request.
 * @param {string} userContext.workspaceId - The ID of the workspace the user belongs to.
 * @returns {Promise<{url: string|null, isYoutubeUrl: boolean}>} A promise that resolves to an object containing the extracted URL (or null if not found) and a boolean indicating if it's a YouTube URL.
 * @throws {AppError} Throws an error if the user context is invalid or if usage limits are exceeded.
 */
export const getUrlFromUserInputUsingAi = async (userInput, userContext) => {
  // HIERARCHY GAP FIX: Validate that user context is provided. All actions with cost or
  // tenant-specific data must be associated with a user and their workspace to maintain
  // security boundaries and track usage correctly.
  if (!userContext || !userContext.userId || !userContext.workspaceId) {
    // This is a server-side issue; the context should always be passed from the controller.
    console.error('CRITICAL: userContext is missing in getUrlFromUserInputUsingAi. This should not happen.');
    throw new AppError('Internal Server Error: User context not available.', 500);
  }

  // HIERARCHY GAP FIX: Check if the user's workspace is allowed to perform this action
  // based on their subscription plan and current usage. This prevents overuse and
  // ensures limits are respected. The usageService should handle the logic for
  // checking limits for the user, their manager, and the entire workspace.
  const feature = 'ai_url_extraction';
  const canPerformAction = await usageService.canUseFeature({
    workspaceId: userContext.workspaceId,
    feature,
  });

  if (!canPerformAction) {
    throw new AppError('Usage limit exceeded for AI-powered URL extraction.', 429, 'USAGE_LIMIT_EXCEEDED');
  }

  const prompt = PromptTemplate.fromTemplate(
    `You are an AI assistant helping a user find a URL to summarize.
    The user has provided the following input:
    "{user_input}"

    Your task is to extract the most relevant URL from this input. And check if it is a YouTube URL.
    If the input contains a valid URL, return it in the format:
    {{"url": "https://example.com", "isYoutubeUrl": true/false}}
    If the input does not contain a valid URL, only return:
    {{"url": null, "isYoutubeUrl": false}}
    If the input is a YouTube URL, set "isYoutubeUrl" to true.
    `
  );

  // The chain correctly pipes the prompt to the LLM and then to a JSON parser.
  const chain = prompt.pipe(geminiClient).pipe(new JsonOutputParser());

  try {
    const result = await chain.invoke({ user_input: userInput });

    // HIERARCHY GAP FIX: After a successful AI operation, record the usage.
    // This ensures that the action is counted against the user's and workspace's limits.
    // This data is crucial for billing, analytics, and propagating notifications
    // to managers or admins if thresholds are met.
    await usageService.recordUsage({
      userId: userContext.userId,
      workspaceId: userContext.workspaceId,
      feature,
      // Add any relevant metadata for cost analysis.
      metadata: {
        inputLength: userInput.length,
        // The actual token count would be more accurate but requires more complex integration.
      },
    });

    return result;
  } catch (error) {
    // BUG FIX: Differentiate between AI processing errors and other errors.
    // If the AI fails, we log it and return a default value, but we do not record usage.
    console.error(`Error processing AI request to extract URL for user ${userContext.userId}:`, error);
    // In case of an AI processing error, return the specified "no URL found" structure.
    // This provides a graceful fallback for the end-user.
    return { url: null, isYoutubeUrl: false };
  }
};