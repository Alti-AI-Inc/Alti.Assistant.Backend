import { GoogleGenerativeAI } from '@google/generative-ai';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { llm } from '../llm.js';
import config from '../../../../../config/index.js';

/**
 * A generic function to interact with a generative AI model for writing tasks.
 * This function acts as a wrapper, standardizing interaction with the configured model provider.
 * @param {string} systemPrompt - The system prompt to guide the model's behavior.
 * @param {string|Array} message - The conversation history or a single user query.
 * @param {boolean} stream - Whether to stream the response.
 * @param {object} [user=null] - The user object, for future use with usage tracking and limits.
 * @returns {Promise<any>} - The model's response text or an async generator for streaming.
 * @throws {Error} If the API call fails or an error occurs during processing.
 */
async function runGenerativeTask(systemPrompt, message, stream = false, user = null) {
  // TODO: Implement input/output token usage tracking for the user.
  // e.g., const usage = await usageService.recordUsage(user.id, 'gemini-2.5-flash', { inputTokens, outputTokens });
  try {
    const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt
    });

    // Sanitize and format the conversation history for the Gemini API.
    const contents = [];
    const messages = Array.isArray(message) ? message : [{ role: 'user', content: message }];

    for (const msg of messages) {
      let role = msg.role;
      if (role === 'assistant') {
        role = 'model';
      } else if (role !== 'user' && role !== 'model') {
        // Default unrecognized roles to 'user' to avoid API errors.
        role = 'user';
      }
      const text = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
      if (!text) continue; // Skip empty messages.

      // Gemini API requires alternating roles. Merge consecutive messages from the same role.
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts.push({ text });
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }

    // Gemini API requires the conversation to start with a 'user' role.
    if (contents.length > 0 && contents[0].role === 'model') {
      contents.unshift({ role: 'user', parts: [{ text: 'Continue the conversation.' }] });
    }

    if (stream) {
      const resultStream = await model.generateContentStream({ contents });
      
      // Adapt the Gemini stream to a generic format expected by the frontend/client.
      // This adapter mimics the Anthropic streaming format for compatibility.
      const adaptedStream = {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of resultStream.stream) {
            // Ensure chunk and text() exist to prevent runtime errors on empty chunks.
            const chunkText = chunk && typeof chunk.text === 'function' ? chunk.text() : '';
            if (chunkText) {
              yield {
                type: 'content_block_delta',
                delta: {
                  type: 'text_delta',
                  text: chunkText
                }
              };
            }
          }
        }
      };
      return adaptedStream;
    }

    const result = await model.generateContent({ contents });
    return result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    console.error('Error calling Generative AI API in writing service:', error);
    // Throw a new error with a user-friendly message.
    // The controller layer is responsible for catching this and sending the appropriate HTTP response.
    throw new Error('Sorry, I encountered an error while processing your request. Please try again.');
  }
}
/**
 * Analyzes the user's initial topic and generates clarifying questions.
 * @param {string} topic - The user's initial topic.
 * @param {object} user - The authenticated user object for usage tracking.
 * @returns {Promise<string[]>} - An array of questions.
 * @throws {Error} If the LLM call fails or the response cannot be parsed.
 */
export const generateWritingQuestions = async (topic, user) => {
  // TODO: Verify user has sufficient credits/permissions to perform this action.
  // e.g., if (!await usageService.canPerformAction(user.id, 'generate_writing_questions')) {
  //   throw new Error('Usage limit exceeded. Please upgrade your plan.');
  // }

  const prompt = `A user wants to write something about: "${topic}".
    To help them, generate 3-5 insightful, open-ended questions to understand their needs better.
    Consider asking about: target audience, desired format (e.g., essay, blog post, social media update), key points to include, and desired tone (e.g., formal, casual, persuasive).
    Return ONLY a JSON object with a single key "questions" which is an array of strings.`;

  try {
    const parser = new JsonOutputParser();
    const chain = llm.pipe(parser);
    const result = await chain.invoke(prompt);

    // TODO: Record the action in user usage metrics after a successful call.
    // e.g., await usageService.recordAction(user.id, 'generate_writing_questions', { ...usage_details });

    return result.questions || [];
  } catch (error) {
    console.error('Error generating writing questions:', error);
    throw new Error('Failed to generate clarifying questions. Please try again.');
  }
};

/**
 * Updates the writing brief with new details from the user.
 * @param {string} currentBrief - The existing writing brief.
 * @param {string} userResponse - The user's new input.
 * @param {Array} history - The conversation history for context.
 * @param {object} user - The authenticated user object for usage tracking.
 * @returns {Promise<string>} - The new, updated brief.
 * @throws {Error} If the LLM call fails.
 */
export const updateWritingBrief = async (
  currentBrief,
  userResponse,
  history,
  user
) => {
  // TODO: Verify user has sufficient credits/permissions.
  // e.g., if (!await usageService.canPerformAction(user.id, 'update_writing_brief')) {
  //   throw new Error('Usage limit exceeded.');
  // }

  const historyString = history
    .map((h) => `${h.role}: ${h.content}`)
    .join('\n');
  const prompt = `You are an AI assistant helping a user build a detailed brief for a writing task.
    The current brief is:
    ---
    ${currentBrief}
    ---
    The user has just provided new information: "${userResponse}".
    Integrate this new information into the brief, creating a more detailed and cohesive set of instructions for a writer.
    
    Full Conversation History (for context):
    ${historyString}

    Return ONLY the new, updated brief.`;
  
  try {
    const result = await llm.invoke(prompt);
    
    // TODO: Record the action in user usage metrics.
    // e.g., await usageService.recordAction(user.id, 'update_writing_brief', { ...usage_details });

    return result.content;
  } catch (error) {
    console.error('Error updating writing brief:', error);
    throw new Error('Failed to update the writing brief. Please try again.');
  }
};

/**
 * Generates the final written content based on a detailed brief.
 * @param {string} brief - The final, detailed writing brief.
 * @param {Array} history - The full conversation history to provide context.
 * @param {boolean} stream - Flag to indicate if the response should be streamed.
 * @param {object} user - The authenticated user object for usage tracking.
 * @returns {Promise<any>} - The generated content as a string or a stream.
 */
export const generateFinalContent = (brief, history, stream, user) => {
  // TODO: Verify user has sufficient credits/permissions for final generation.
  // This is a critical check as generation can be expensive.
  // e.g., if (!await usageService.canPerformAction(user.id, 'generate_final_content')) {
  //   throw new Error('Usage limit exceeded. Please upgrade your plan to generate content.');
  // }

  const systemPrompt = `You are an expert writer. Your task is to write a high-quality piece of content based on the user's detailed brief.
    Adhere strictly to all instructions in the brief regarding format, tone, audience, and key points.
    
    The final, detailed brief is:
    ---
    ${brief}
    ---
    
    Now, write the final piece.`;

  // The runGenerativeTask function handles its own try/catch and will throw on failure.
  return runGenerativeTask(systemPrompt, history, stream, user);
};