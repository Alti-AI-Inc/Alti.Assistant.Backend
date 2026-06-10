import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import config from '../../../../../config/index.js';

/**
 * @typedef {object} IntentSchema
 * @property {'imagen4' | 'gemini2.5flash'} service - The image generation service to use.
 * @property {string} reasoning - Brief explanation for the choice of service.
 * @property {number} confidence - Confidence score (0-1) for the classification.
 */

/**
 * Defines the Zod schema for classifying user intent into an image generation service.
 * This schema ensures that the output from the AI model conforms to a predefined structure,
 * including the chosen service, a reasoning for the choice, and a confidence score.
 * @type {z.ZodObject<any, any, any, IntentSchema, any>}
 */
const intentSchema = z.object({
  service: z
    .enum(['imagen4', 'gemini2.5flash'])
    .describe('The image generation service to use'),
  reasoning: z.string().describe('Brief explanation for the choice'),
  confidence: z.number().min(0).max(1).describe('Confidence score (0-1)'),
});

/**
 * Creates a structured output parser from the `intentSchema`.
 * This parser is used to validate and transform the raw text output from the LLM
 * into a structured JavaScript object conforming to the `IntentSchema`.
 * @type {StructuredOutputParser<IntentSchema>}
 */
const parser = StructuredOutputParser.fromZodSchema(intentSchema);

/**
 * A simple in-memory class to manage conversation history for a single session.
 * It stores input/output pairs and can format them for use in prompts.
 */
class SimpleMemory {
  /**
   * Initializes a new instance of SimpleMemory with an empty history.
   */
  constructor() {
    /**
     * The array storing conversation history. Each item is an object with `input` and `output` properties.
     * @type {Array<{input: string, output: string}>}
     */
    this.history = [];
  }

  /**
   * Saves a new input and output pair to the conversation history.
   * @param {object} input - The input object, expected to have an `input` property.
   * @param {string} input.input - The user's input string.
   * @param {object} output - The output object, expected to have an `output` property.
   * @param {string} output.output - The assistant's output string.
   * @returns {Promise<void>} A promise that resolves once the context is saved.
   */
  async saveContext(input, output) {
    this.history.push({
      input: input.input,
      output: output.output,
    });
  }

  /**
   * Loads and formats the current conversation history.
   * @returns {Promise<{history: string}>} A promise that resolves to an object containing the formatted history string.
   *                                       Returns 'No previous conversation.' if history is empty.
   */
  async loadMemoryVariables() {
    if (this.history.length === 0) {
      return { history: 'No previous conversation.' };
    }

    const formatted = this.history
      .map(
        (item, idx) =>
          `${idx + 1}. User: ${item.input}\n   Assistant: ${item.output}`
      )
      .join('\n');

    return { history: formatted };
  }

  /**
   * Clears the entire conversation history.
   * @returns {void}
   */
  clear() {
    this.history = [];
  }
}

/**
 * In-memory store for user-specific conversation histories.
 * Using a Map keyed by a session ID ensures that each user's conversation
 * is isolated and not shared with others, which is critical for a multi-user environment.
 * @type {Map<string, SimpleMemory>}
 */
const userMemoryStore = new Map();

/**
 * Defines the prompt template used for the intent classification model.
 * This template instructs the AI on its role, provides rules for service selection,
 * includes a placeholder for conversation history, the current user request,
 * and instructions for output formatting.
 * @type {PromptTemplate}
 */
const promptTemplate = PromptTemplate.fromTemplate(
  `You are an AI assistant that determines which image generation service to use based on user requests.

Rules:
- Use "imagen4" if the user wants: photoreal, high-fidelity, marketing-quality, professional photography, realistic images, or high-quality output
- Use "gemini2.5flash" if the user wants: image editing, image-to-image transformation, brand consistency, style transfer, fast generation, quick results, or modifications to existing images

Conversation History:
{history}

User Request: {userRequest}

{format_instructions}

Analyze the request and determine the appropriate service based on the current request and conversation context.`
);

/**
 * Classifies user intent to determine which image generation service to use based on the request
 * and conversation history specific to the user's session.
 * @param {string} userRequest - The user's image generation request or query.
 * @param {object} options - Configuration options for the classification.
 * @param {string} options.sessionId - A unique identifier for the user's session. This is REQUIRED to maintain isolated conversation histories.
 * @param {string} [options.apiKey] - Google API key. Defaults to configured value.
 * @param {string} [options.modelName='gemini-1.5-flash'] - The name of the Google Generative AI model to use for classification.
 * @returns {Promise<IntentSchema>} A promise that resolves to an object containing the classified service, reasoning, and confidence score.
 * @throws {Error} If `sessionId` is not provided, the API key is missing, or the model fails to respond.
 */
export async function classifyImageGenIntent(
  userRequest,
  { sessionId, apiKey, modelName = 'gemini-1.5-flash' }
) {
  if (!sessionId) {
    throw new Error(
      'A sessionId is required to maintain conversation context and ensure data isolation.'
    );
  }

  const resolvedApiKey =
    apiKey || config.gemini_secret_key || process.env.GEMINI_API_KEY;
  if (!resolvedApiKey) {
    throw new Error(
      'Google Generative AI API key is missing. Please provide it in the options or configure it in the environment.'
    );
  }

  try {
    const model = new ChatGoogleGenerativeAI({
      apiKey: resolvedApiKey,
      model: modelName,
      project: config.google.gcp_project_id,
      location: config.google.vertex_ai_region || 'us-central1',
      temperature: 0,
    });

    // Get or create a memory instance for the specific user session
    if (!userMemoryStore.has(sessionId)) {
      userMemoryStore.set(sessionId, new SimpleMemory());
    }
    const activeMemory = userMemoryStore.get(sessionId);

    // Get conversation history for the current session
    const historyContext = await activeMemory.loadMemoryVariables({});
    const history = historyContext.history || 'No previous conversation.';

    const chain = promptTemplate.pipe(model).pipe(parser);

    const result = await chain.invoke({
      userRequest,
      history,
      format_instructions: parser.getFormatInstructions(),
    });

    // Save the new interaction to the session's memory
    await activeMemory.saveContext(
      { input: userRequest },
      {
        output: `Selected service: ${result.service}. Reasoning: ${result.reasoning}`,
      }
    );

    return result;
  } catch (error) {
    // Provide more context on failure for better debugging.
    console.error(
      `[IntentClassifier] Failed to classify intent for session ${sessionId}:`,
      error
    );
    throw new Error(
      `Failed to get a response from the classification model. Reason: ${error.message}`
    );
  }
}

/**
 * Routes an image generation request by classifying the user's intent
 * and returning a structured decision on which service to use.
 * This function wraps `classifyImageGenIntent` and adds convenience boolean flags.
 * @param {string} userRequest - The user's image generation request.
 * @param {object} options - Configuration options passed directly to `classifyImageGenIntent`, including the required `sessionId`.
 * @param {string} options.sessionId - A unique identifier for the user's session.
 * @returns {Promise<object>} A promise that resolves to an object containing:
 *   - `service`: The recommended image generation service ('imagen4' or 'gemini2.5flash').
 *   - `reasoning`: A brief explanation for the service choice.
 *   - `confidence`: The confidence score (0-1) of the classification.
 *   - `shouldUseImagen4`: Boolean indicating if 'imagen4' should be used.
 *   - `shouldUseGemini25Flash`: Boolean indicating if 'gemini2.5flash' should be used.
 */
export async function routeImageGenRequest(userRequest, options) {
  const intent = await classifyImageGenIntent(userRequest, options);

  return {
    ...intent,
    shouldUseImagen4: intent.service === 'imagen4',
    shouldUseGemini25Flash: intent.service === 'gemini2.5flash',
  };
}

/**
 * Resets the conversation memory for a specific user session.
 * @param {string} sessionId - The unique identifier for the user's session to be reset.
 * @returns {void}
 */
export function resetConversationMemory(sessionId) {
  if (sessionId) {
    userMemoryStore.delete(sessionId);
  }
}

/**
 * Clears all conversation memories from the store.
 * Useful for testing or application restarts.
 * @returns {void}
 */
export function clearAllConversationMemories() {
  userMemoryStore.clear();
}

/**
 * Retrieves the current formatted conversation history for a specific user session.
 * @param {string} sessionId - The unique identifier for the user's session.
 * @returns {Promise<string>} A promise that resolves to the formatted conversation history string.
 */
export async function getConversationHistory(sessionId) {
  if (!sessionId || !userMemoryStore.has(sessionId)) {
    return 'No conversation history.';
  }
  const memory = userMemoryStore.get(sessionId);
  const context = await memory.loadMemoryVariables({});
  return context.history || 'No conversation history.';
}