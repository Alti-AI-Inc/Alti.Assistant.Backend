import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { geminiClient } from './llm.js';

/**
 * Extracts a URL from a user's text input using an AI model (Gemini).
 * It also determines if the extracted URL is a YouTube link.
 * The function is designed to handle cases where no URL is found or an error occurs during AI processing.
 * @async
 * @function getUrlFromUserInputUsingAi
 * @param {string} userInput - The raw text input from the user, which may contain a URL.
 * @returns {Promise<{url: string|null, isYoutubeUrl: boolean}>} A promise that resolves to an object containing the extracted URL (or null if not found) and a boolean indicating if it's a YouTube URL.
 */
export const getUrlFromUserInputUsingAi = async (userInput) => {
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

  // BUG FIX: The prompt instructs the AI to return JSON, but the output was not parsed.
  // We need to pipe the output through JsonOutputParser to ensure the result is a JavaScript object.
  // Also, added error handling for robustness against AI processing failures.
  const chain = prompt.pipe(geminiClient).pipe(new JsonOutputParser());

  try {
    const result = await chain.invoke({ user_input: userInput });
    // With JsonOutputParser, 'result' is already the parsed JSON object.
    return result;
  } catch (error) {
    // Log the error for debugging.
    console.error('Error processing AI request to extract URL:', error);
    // In case of an AI processing error, return the specified "no URL found" structure.
    // Depending on the application's error handling strategy, rethrowing the error
    // or returning a more specific error object might be preferred.
    return { url: null, isYoutubeUrl: false };
  }
};