// Note: This file is named claudeService.js but implements functionality using Google's Gemini API.
// Consider renaming the file to geminiService.js for better code clarity and maintainability.
import config from '../../../../config/index.js';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';

/**
 * Initializes the Google Generative AI client with the API key from the configuration.
 * This client is used to interact with Google's Gemini models.
 * @type {GoogleGenerativeAI}
 * @private
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Executes a task using the Gemini API, handling chat history and content.
 * It constructs the conversation history, applies a system prompt, and sends a request
 * to the 'gemini-1.5-flash' model.
 *
 * @private
 * @param {string} content - The current user's input or prompt for the Gemini model.
 * @param {Array<Object>} history - An array of previous chat messages to provide context.
 * @param {string} history[].role - The role of the message sender ('user' or 'assistant').
 * @param {string} history[].content - The content of the message.
 * @param {string} [systemPrompt=null] - An optional system prompt to guide the AI's behavior, which will be passed as a system instruction.
 * @returns {Promise<string>} A promise that resolves to the response text from the Gemini model,
 *                            or an error message if the API call fails.
 */
async function runGeminiTask(content, history, systemPrompt = null) {
  // Note: User-level limits (e.g., daily prompt caps, token usage tracking) should be
  // enforced in the calling service or middleware before invoking this function.
  // This function is responsible only for the interaction with the AI model.

  // Note: The total size of the history and new content should be monitored to avoid
  // exceeding the model's input token limit, which could result in an API error.

  // Map the provided history to the Gemini API's expected format.
  // 'assistant' roles are mapped to 'model'.
  const conversationHistory = history.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  try {
    // Get the generative model instance.
    // Using gemini-1.5-flash as it's a recent, fast, and capable model.
    const model = genAI.getGenerativeModel({
      model: config.gemini_model || 'gemini-3.5-flash',
      // The systemInstruction provides high-level guidance for the model's behavior.
      ...(systemPrompt && { systemInstruction: { parts: [{ text: systemPrompt }] } }),
    });

    // Start a chat session with the existing history.
    // This is the recommended, robust way to handle multi-turn conversations.
    const chat = model.startChat({
      history: conversationHistory,
      // Configuration for the generation process.
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7,
        topP: 0.95,
      },
      // Safety settings to prevent the generation of harmful content.
      // Adjust these thresholds based on the application's specific requirements.
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    // Send the new user message to the model.
    const result = await chat.sendMessage(content);

    // The result object has a `response` property which contains the generated content.
    // The `text()` method extracts the generated text from the response.
    const responseText = result.response.text();
    return responseText;
  } catch (error) {
    // Enhanced error logging for better diagnostics during development.
    console.error('Error calling Gemini API:', error);
    if (error.response) {
      console.error('Gemini API Response Error:', error.response.data);
    }
    // Provide a consistent, user-friendly error message.
    return 'Sorry, I encountered an error while processing your request with the AI model. Please try again.';
  }
}

/**
 * An asynchronous function that acts as a summarizer using the Gemini AI model.
 * This function utilizes the `runGeminiTask` helper to interact with Google's Gemini API for summarization.
 * It provides a system prompt to guide the AI in generating clear, concise, and accurate summaries.
 *
 * @param {Array<Object>} history - An array of previous chat messages, providing conversational context.
 * @param {string} history[].role - The role of the message sender ('user' or 'assistant').
 * @param {string} history[].content - The content of the message.
 * @param {string} content - The specific content string that needs to be summarized.
 * @returns {Promise<string>} A promise that resolves to the generated summary from the Gemini model,
 *                            or an error message if the summarization process encounters an issue.
 */
// The filename is claudeService.js, but the implementation uses Gemini.
// This function name correctly reflects the underlying service.
export const geminiSummarizer = async (history, content) => {
  const systemPrompt = `You are an expert summarization assistant. Your task is to provide a clear, concise, and accurate summary of the provided content.
- Identify the key points, main arguments, and important conclusions.
- The summary should be neutral and objective.
- Structure the summary in well-organized paragraphs.
    `;
  // The system prompt is passed to runGeminiTask to ensure the model follows summarization instructions.
  return runGeminiTask(content, history, systemPrompt);
};

export const claudeSummarizer = async (messages, systemPrompt) => {
  const historyCopy = [...messages];
  const lastMessage = historyCopy.pop();
  const content = lastMessage ? lastMessage.content : '';
  return runGeminiTask(content, historyCopy, systemPrompt);
};