import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../config/index.js';
import { GoogleGenAI } from '@google/genai';

/**
 * Initializes the Google Generative AI client with the API key from the configuration.
 * This client is used to interact with Google's Gemini models.
 * @type {GoogleGenAI}
 * @private
 */
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

/**
 * Executes a task using the Gemini API, handling chat history and content.
 * It constructs the conversation history in the format expected by the Gemini API
 * and sends a request to the 'gemini-2.5-flash' model.
 *
 * @private
 * @param {string} content - The current user's input or prompt for the Gemini model.
 * @param {Array<Object>} history - An array of previous chat messages to provide context.
 * @param {string} history[].role - The role of the message sender ('user' or 'assistant').
 * @param {string} history[].content - The content of the message.
 * @returns {Promise<string>} A promise that resolves to the response text from the Gemini model,
 *                            or an error message if the API call fails.
 */
async function runGeminiTask(content, history) {
  const contents = [
    ...history.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })),
    {
      role: 'user',
      parts: [{ text: content }],
    },
  ];
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        maxOutputTokens: 4096,
        temperature: 0.7,
        topP: 0.95,
      },
    });

    return response.text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
  }
}

/**
 * An asynchronous function that acts as a summarizer using the Gemini AI model.
 * Despite the name `claudeSummarizer`, this function utilizes the `runGeminiTask`
 * helper to interact with Google's Gemini API for summarization.
 * It provides a system prompt to guide the AI in generating clear, concise, and accurate summaries.
 *
 * @param {Array<Object>} history - An array of previous chat messages, providing conversational context.
 * @param {string} history[].role - The role of the message sender ('user' or 'assistant').
 * @param {string} history[].content - The content of the message.
 * @param {string} content - The specific content string that needs to be summarized.
 * @returns {Promise<string>} A promise that resolves to the generated summary from the Gemini model,
 *                            or an error message if the summarization process encounters an issue.
 */
export const claudeSummarizer = async (history, content) => {
  const systemPrompt = `You are an expert summarization assistant. Your task is to provide a clear, concise, and accurate summary of the provided content.
- Identify the key points, main arguments, and important conclusions.
- The summary should be neutral and objective.
- Structure the summary in well-organized paragraphs.
    `;
  // The system prompt is currently not directly used in runGeminiTask,
  // as runGeminiTask expects the prompt to be part of the 'content' parameter
  // or implicitly handled by the model's instruction following.
  // For a true system prompt integration, runGeminiTask would need modification
  // to accept and prepend a system message to the conversation.
  return runGeminiTask(content, history);
};