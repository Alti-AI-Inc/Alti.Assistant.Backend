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
 * A simple in-memory class to manage conversation history.
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
 * Global instance of SimpleMemory to maintain conversation history across calls
 * if no specific memory instance is provided to `classifyImageGenIntent`.
 * It is initialized to `null` and created on the first use or reset.
 * @type {SimpleMemory | null}
 */
let conversationMemory = null;

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
 * and optional conversation history. It leverages a Google Generative AI model.
 * @param {string} userRequest - The user's image generation request or query.
 * @param {object} [options] - Configuration options for the classification.
 * @param {string} [options.apiKey] - Google API key. Defaults to `config.gemini_secret_key` or `process.env.GEMINI_API_KEY`.
 * @param {string} [options.modelName='gemini-3.5-flash'] - The name of the Google Generative AI model to use.
 * @param {SimpleMemory} [options.memory=null] - An optional custom memory instance to use for conversation history.
 *                                               If not provided, the global `conversationMemory` is used or initialized.
 * @returns {Promise<IntentSchema>} A promise that resolves to an object containing the classified service,
 *                                  reasoning, and confidence score.
 * @throws {Error} If the API key is missing or the model fails to respond.
 */
export async function classifyImageGenIntent(
  userRequest,
  { apiKey, modelName = 'gemini-3.5-flash', memory = null } = {}
) {
  const model = new ChatGoogleGenerativeAI({
    apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY,
    model: modelName,
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
    temperature: 0,
  });

  // Use provided memory or create a new one
  const activeMemory = memory || conversationMemory || new SimpleMemory();

  // Store memory for subsequent calls if it's the first time
  if (!conversationMemory) {
    conversationMemory = activeMemory;
  }

  // Get conversation history
  const historyContext = await activeMemory.loadMemoryVariables({});
  const history = historyContext.history || 'No previous conversation.';

  const chain = promptTemplate.pipe(model).pipe(parser);

  const result = await chain.invoke({
    userRequest,
    history,
    format_instructions: parser.getFormatInstructions(),
  });

  // Save to memory
  await activeMemory.saveContext(
    { input: userRequest },
    {
      output: `Selected service: ${result.service}. Reasoning: ${result.reasoning}`,
    }
  );

  return result;
}

/**
 * Routes an image generation request by classifying the user's intent
 * and returning a structured decision on which service to use.
 * This function wraps `classifyImageGenIntent` and adds convenience boolean flags.
 * @param {string} userRequest - The user's image generation request.
 * @param {object} [options] - Configuration options passed directly to `classifyImageGenIntent`.
 * @returns {Promise<object>} A promise that resolves to an object containing:
 *   - `service`: The recommended image generation service ('imagen4' or 'gemini2.5flash').
 *   - `reasoning`: A brief explanation for the service choice.
 *   - `confidence`: The confidence score (0-1) of the classification.
 *   - `shouldUseImagen4`: Boolean indicating if 'imagen4' should be used.
 *   - `shouldUseGemini25Flash`: Boolean indicating if 'gemini2.5flash' should be used.
 */
export async function routeImageGenRequest(userRequest, options = {}) {
  const intent = await classifyImageGenIntent(userRequest, options);

  return {
    service: intent.service,
    reasoning: intent.reasoning,
    confidence: intent.confidence,
    shouldUseImagen4: intent.service === 'imagen4',
    shouldUseGemini25Flash: intent.service === 'gemini2.5flash',
  };
}

/**
 * Resets the global conversation memory, effectively starting a new conversation
 * for subsequent calls to `classifyImageGenIntent` that do not provide a custom memory instance.
 * @returns {void}
 */
export function resetConversationMemory() {
  conversationMemory = new SimpleMemory();
}

/**
 * Retrieves the current formatted conversation history from the global memory instance.
 * If no conversation has occurred or the memory is not initialized, it returns a default message.
 * @returns {Promise<string>} A promise that resolves to the formatted conversation history string.
 */
export async function getConversationHistory() {
  if (!conversationMemory) return 'No conversation history.';
  const context = await conversationMemory.loadMemoryVariables({});
  return context.history || 'No conversation history.';
}