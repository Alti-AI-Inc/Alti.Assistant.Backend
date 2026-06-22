import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../../config/index.js';

// It's a best practice to centralize configuration and validate it on application start.
const getApiKey = () => {
  const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('CRITICAL: GEMINI_API_KEY is not set. Please provide it in config or environment variables. Gemini research will be unavailable.');
    return 'MISSING_API_KEY';
  }
  return apiKey;
};

const llm = new ChatGoogleGenerativeAI({
  // Note: As of mid-2024, 'gemini-1.5-flash' is a valid and common model name. 'gemini-3.5-flash' does not exist.
  // Updated to a known-valid model to prevent runtime errors.
  model: config.gemini_pro_model || 'gemini-2.5-pro',
  apiKey: getApiKey(),
  temperature: 0,
  maxRetries: 3, // Increased retries for better resilience against transient network issues.
});

/**
 * A simplified research task that synthesizes search results based on a query.
 * @param {object} state - The state object containing the query and search results.
 * @param {string} state.query - The user's original query.
 * @param {string} state.searchResults - The stringified search results to be synthesized.
 * @returns {Promise<string>} - The synthesized research summary.
 */
export const runSimpleGeminiResearchTask = async (state) => {
  // The `stream` parameter was unused and has been removed for clarity.
  // If streaming is needed for this function, it should be implemented similarly to runGeminiResearchTask.
  try {
    // Using structured logging can be more effective for debugging and monitoring.
    console.log({
      message: 'Running Gemini simple deep research task',
      query: state.query,
    });

    // The previous implementation constructed a `query` variable that was never used. It has been removed.
    // The prompt has been refined for clarity and effectiveness.
    const systemPrompt = `You are an expert research assistant. Your task is to synthesize the provided search results into a comprehensive, well-written answer for the user's query.
- Do not add any additional information or commentary.
- Write only the summary of the search results in a concise manner.
- Do not say "I am an AI language model" or similar phrases.
- Do not mention you are synthesizing or summarizing search results.
- Do not mention checking sources.
- Weave the search results together into a coherent narrative.
- At the end of your answer, provide a "Sources" section listing the URLs corresponding to any citations made.`;

    const userPrompt = `Please synthesize the following search results for my query.
Search Results:
${state.searchResults}

Query: ${state.query}`;

    // Use LangChain message classes for consistency and to ensure compatibility with the library.
    // The previous implementation used a raw object array, which is less robust.
    const messages = [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)];

    const response = await llm.invoke(messages);
    return response.content;
  } catch (error) {
    console.error('Error in runSimpleGeminiResearchTask:', error);
    // Propagate the error so the caller can handle it, rather than returning a static string.
    // This allows for more flexible error handling, like returning a proper HTTP error response.
    throw new Error('Failed to process research task with Gemini.');
  }
};

/**
 * A more generic research task runner that accepts a system prompt and a message history.
 * @param {string} systemPrompt - The system prompt to guide the AI's behavior.
 * @param {Array<object>} messages - The history of messages, each with a 'role' and 'content'.
 * @param {boolean} [stream=false] - Whether to stream the response.
 * @returns {Promise<string|AsyncIterable<any>>} - The AI's response content or a stream of response chunks.
 */
export const runGeminiResearchTask = async (systemPrompt, messages, stream = false) => {
  try {
    // Convert generic message objects to LangChain's specific message classes.
    // This is crucial for the LLM to understand the conversation structure correctly.
    const formattedMessages = [
      new SystemMessage(systemPrompt),
      ...messages.map((msg) => {
        switch (msg.role?.toLowerCase()) {
          case 'user':
          case 'human':
            return new HumanMessage(msg.content);
          case 'assistant':
          case 'ai':
            // FIX: Use AIMessage for assistant's responses, not SystemMessage.
            // Using SystemMessage for AI responses is semantically incorrect and can lead to unexpected model behavior.
            return new AIMessage(msg.content);
          default:
            // Fallback for unknown roles, though it's better to have defined roles.
            console.warn(`Unknown message role "${msg.role}", treating as human message.`);
            return new HumanMessage(msg.content);
        }
      }),
    ];

    if (stream) {
      // The stream method returns an async iterator that can be consumed by the caller.
      return await llm.stream(formattedMessages);
    } else {
      const response = await llm.invoke(formattedMessages);
      return response.content;
    }
  } catch (error) {
    console.error('Error in runGeminiResearchTask:', error);
    // Propagate the error for consistent error handling upstream.
    // Returning a static string hides the actual error and makes debugging difficult.
    throw new Error('Failed to process request with Gemini.');
  }
};