import { JsonOutputParser, StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { llm } from './llm.js';
// FIX: Import usage tracking service to handle authorization, limits, and hierarchical notifications.
// This service is responsible for enforcing tenant/workspace boundaries and role-based permissions.
import { recordUsage, USAGE_UNITS } from '../usage/usageService.js';

/**
 * @typedef {Object} UserContext
 * @property {string} id - The ID of the user performing the action.
 * @property {string} role - The role of the user (e.g., 'user', 'manager', 'admin').
 * @property {string} workspaceId - The ID of the workspace the user belongs to.
 * @property {string} tenantId - The ID of the tenant (platform customer) the user belongs to.
 */

/**
 * @typedef {Object} HistoryItem
 * @property {string} type - The type of the message sender (e.g., 'user', 'assistant').
 * @property {string} message - The content of the message.
 */

/**
 * @typedef {Object} ExtractedUrlResult
 * @property {string|null} url - The extracted URL, or null if none found.
 * @property {boolean} isYoutubeUrl - True if the extracted URL is from YouTube, false otherwise.
 */

/**
 * Analyzes the user's initial prompt and generates clarifying questions.
 * Uses LangChain's PromptTemplate and JsonOutputParser to prompt the LLM
 * for 3 to 5 open-ended questions to help build a more detailed image prompt.
 *
 * @async
 * @param {string} initialPrompt - The user's first input describing their image idea.
 * @param {UserContext} userContext - The context of the user making the request for authorization and usage tracking.
 * @returns {Promise<string[]>} An array of clarifying questions. Returns a default set of questions on failure.
 */
export const generateClarifyingQuestions = async (initialPrompt, userContext) => {
  // BUGFIX: Integration Gap - Lack of Authorization, Usage Tracking, and Tenant Context.
  // This function previously had no concept of the user making the request.
  // It now requires a `userContext` object to enforce permissions and usage limits.
  // The `recordUsage` service call ensures the user belongs to an active workspace/tenant,
  // has the necessary permissions, and is within their usage quota before calling the LLM.
  // This service is also responsible for propagating usage data and notifications up the hierarchy (to managers/admins).
  // An error will be thrown by recordUsage if the action is not permitted, which is handled by the controller layer.
  await recordUsage({
    userContext,
    feature: USAGE_UNITS.LLM_PROMPT_HELPER_CALL,
    quantity: 1,
  });

  const parser = new JsonOutputParser();
  const prompt = PromptTemplate.fromTemplate(
    `A user wants to generate an image. Their initial idea is: "{prompt}".
    
    Your task is to generate 3-5 relevant, clarifying questions to help build a more detailed image prompt.
    The questions should be open-ended and encourage descriptive answers.
    
    Return ONLY a JSON object with a single key "questions" which is an array of strings.
    Example: {{"questions": ["What is the primary subject?", "What style should the image be in (e.g., photorealistic, cartoon, watercolor)?", "What is the desired mood or atmosphere?"]}}
    
    {format_instructions}`
  );

  const chain = prompt.pipe(llm).pipe(parser);
  try {
    const result = await chain.invoke({
      prompt: initialPrompt,
      format_instructions: parser.getFormatInstructions(),
    });
    // Ensure result.questions is an array, even if LLM returns null/undefined for it
    return result?.questions || [];
  } catch (error) {
    console.error('Error generating clarifying questions:', error);
    // Return a default set of questions on error to maintain functionality
    return [
      'Can you describe the main subject of the image?',
      'What art style are you imagining (e.g., photorealistic, anime, abstract)?',
      'What is the overall mood or feeling you want to convey?',
    ];
  }
};

/**
 * Analyzes the user's response to see if they are finished providing details.
 * Evaluates whether the user's message indicates completion (e.g., "that's it", "I'm done").
 *
 * @async
 * @param {string} userResponse - The latest message from the user.
 * @param {UserContext} userContext - The context of the user making the request for authorization and usage tracking.
 * @returns {Promise<boolean>} True if the user indicates they are finished, false otherwise.
 */
export const isUserFinished = async (userResponse, userContext) => {
  // BUGFIX: Integration Gap - Added user context for authorization and usage tracking.
  await recordUsage({
    userContext,
    feature: USAGE_UNITS.LLM_PROMPT_HELPER_CALL,
    quantity: 1,
  });

  if (!userResponse) return false;
  const prompt = PromptTemplate.fromTemplate(
    `Analyze the user's response to determine if they are finished providing details for the image.
        The user has been answering clarifying questions.
        If the user's message indicates they are done, satisfied, or want to proceed, respond with "YES".
        Examples of finished responses: "that's it", "I'm done", "go ahead and create it", "yes, that's all", "no more questions", "I'm finished", "i am okay".
        If the user is providing more details or answering a question, respond with "NO".

        User response: "{response}"
        
        Your answer (must be YES or NO):`
  );
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  try {
    const result = await chain.invoke({ response: userResponse });
    console.log('User finished analysis result:', result);
    return result?.toUpperCase().includes('YES') || false;
  } catch (error) {
    console.error('Error determining if user is finished:', error);
    // On error, assume user is not finished to allow for retry or further interaction
    return false;
  }
};

/**
 * Updates the image prompt with new details from the user.
 * This acts as the core memory mechanism, integrating new details into the existing prompt
 * while maintaining context from the conversation history.
 *
 * @async
 * @param {string} currentPrompt - The current version of the detailed prompt.
 * @param {string} userResponse - The new information or answer from the user.
 * @param {HistoryItem[]} history - The conversation history for context.
 * @param {UserContext} userContext - The context of the user making the request for authorization and usage tracking.
 * @returns {Promise<string>} The updated, cohesive prompt paragraph.
 */
export const updateRefinedPrompt = async (
  currentPrompt,
  userResponse,
  history,
  userContext
) => {
  // BUGFIX: Integration Gap - Added user context for authorization and usage tracking.
  // This is a more resource-intensive call, so it's tracked as a separate feature.
  await recordUsage({
    userContext,
    feature: USAGE_UNITS.LLM_PROMPT_REFINEMENT_CALL,
    quantity: 1,
  });

  const historyString = (history || [])
    .map((h) => `${h.type}: ${h.message}`)
    .join('\n');
  const prompt = PromptTemplate.fromTemplate(
    `You are an AI assistant helping a user create a detailed image prompt.
    The user's current idea for the prompt is:
    ---
    {current_prompt}
    ---

    The user has just provided the following new information or answer:
    ---
    {user_response}
    ---

    Based on this new information, update and refine the image prompt.
    Integrate the new details smoothly into the existing prompt. If the new information contradicts something, use your best judgment to resolve it or incorporate the latest user preference.
    The goal is to build a single, cohesive, and detailed paragraph.

    Full Conversation History (for context):
    {history}

    Return ONLY the new, updated prompt paragraph. Do not add any conversational text around it.`
  );
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  try {
    const result = await chain.invoke({
      current_prompt: currentPrompt,
      user_response: userResponse,
      history: historyString,
    });
    return result || currentPrompt;
  } catch (error) {
    console.error('Error updating refined prompt:', error);
    // On error, return the current prompt to avoid losing information
    return currentPrompt;
  }
};

/**
 * Compiles all gathered details into a final, rich prompt for image generation.
 * Currently returns the refined prompt directly, but serves as a placeholder for final polishing.
 *
 * @async
 * @param {string} finalRefinedPrompt - The final version of the refined prompt.
 * @returns {Promise<string>} The final, detailed prompt.
 */
export const compileFinalPrompt = async (finalRefinedPrompt) => {
  // The refined prompt is already well-structured, so we can often use it directly.
  // This function can be used for a final polish if needed.
  // NOTE: This function does not make an LLM call, so it does not require usage tracking.
  return finalRefinedPrompt;
};

/**
 * Extracts a URL from user input using AI and checks if it's a YouTube URL.
 * Uses LangChain's JsonOutputParser to parse the structured JSON response from the LLM.
 *
 * @async
 * @param {string} userInput - The raw input string from the user.
 * @param {UserContext} userContext - The context of the user making the request for authorization and usage tracking.
 * @returns {Promise<ExtractedUrlResult>} An object containing the extracted URL and a flag indicating if it's a YouTube URL.
 */
export const getUrlFromUserInputUsingAi = async (userInput, userContext) => {
  // BUGFIX: Integration Gap - Added user context for authorization and usage tracking.
  await recordUsage({
    userContext,
    feature: USAGE_UNITS.LLM_UTILITY_CALL,
    quantity: 1,
  });

  const parser = new JsonOutputParser(); // Add JsonOutputParser to parse the LLM's JSON string output
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
    
    {format_instructions} // Include format instructions for the parser
    `
  );
  const chain = prompt.pipe(llm).pipe(parser); // Pipe the LLM output through the JSON parser
  try {
    const result = await chain.invoke({
      user_input: userInput,
      format_instructions: parser.getFormatInstructions(), // Pass format instructions to the LLM
    });
    // Ensure the result structure is as expected, even if LLM deviates slightly
    return {
      url: result?.url || null,
      isYoutubeUrl: result?.isYoutubeUrl || false,
    };
  } catch (error) {
    console.error('Error extracting URL from user input:', error);
    // Return a default error object on failure to ensure consistent return type
    return { url: null, isYoutubeUrl: false };
  }
};