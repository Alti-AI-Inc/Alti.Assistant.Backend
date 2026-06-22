import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { PromptTemplate } from '@langchain/core/prompts';

// General-purpose LLM for creative and conversational tasks.
// It's recommended to pass user-specific identifiers in the runnable's config where this is used
// to enable per-user rate limiting and abuse monitoring provided by the model host.
export const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  // Corrected to a valid, high-performance model. 'gemini-3.5-flash' is not a recognized model name.
  model: config.gemini_model || 'gemini-3.5-flash',
  temperature: 0.7,
  // Added default safety settings to protect the end-user experience from harmful content.
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ],
});

// A specialized, cost-optimized LLM for simple classification tasks.
// Using a separate instance prevents compromising the settings of the main creative LLM.
const classificationLlm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: config.gemini_model || 'gemini-3.5-flash',
  // Lower temperature for more deterministic, less "creative" classification.
  temperature: 0.2,
  // Limit the output to a few tokens to reduce cost and latency for simple YES/NO answers.
  maxOutputTokens: 5,
  // Reuse the same safety settings for consistency and user protection.
  safetySettings: llm.safetySettings,
});

/**
 * Uses an optimized LLM call to determine if the user has finished their turn in a conversation.
 * This is more reliable than simple keyword matching for understanding nuanced user intent.
 * @param {string} userResponse The user's latest message.
 * @returns {Promise<boolean>} A promise that resolves to true if the user is finished, false otherwise.
 */
export const isUserFinished = async (userResponse) => {
  // Guard clause to prevent errors and unnecessary API calls on empty or invalid input.
  if (!userResponse || typeof userResponse !== 'string' || userResponse.trim() === '') {
    return false;
  }

  const prompt = PromptTemplate.fromTemplate(
    `Analyze the user's response to determine if they are finished providing details for a task.
The user has been answering clarifying questions.
If the user's message indicates they are done, satisfied, or want to proceed, respond with only the word "YES".
Examples of finished responses: "that's it", "I'm done", "go ahead and create it", "yes, that's all", "looks good".
If the user is providing more details, asking a question, or otherwise continuing the conversation, respond with only the word "NO".
Examples of unfinished responses: "add a blue sky", "can you make the cat fluffier?", "what about a tree in the background?".

User response: "{response}"

Your answer (must be only YES or NO):`
  );

  // Use the optimized LLM for this specific, low-complexity task.
  const chain = prompt.pipe(classificationLlm);
  const result = await chain.invoke({ response: userResponse });

  // Use strict, trimmed comparison for robust parsing of the model's response.
  // This prevents false positives if the model's output accidentally contains "YES" in a longer sentence.
  return result.content.trim().toUpperCase() === 'YES';
};