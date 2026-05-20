import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';

// Define the output schema
const intentSchema = z.object({
  service: z
    .enum(['imagen4', 'gemini2.5flash'])
    .describe('The image generation service to use'),
  reasoning: z.string().describe('Brief explanation for the choice'),
  confidence: z.number().min(0).max(1).describe('Confidence score (0-1)'),
});

const parser = StructuredOutputParser.fromZodSchema(intentSchema);

// Simple in-memory conversation history
class SimpleMemory {
  constructor() {
    this.history = [];
  }

  async saveContext(input, output) {
    this.history.push({
      input: input.input,
      output: output.output,
    });
  }

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

  clear() {
    this.history = [];
  }
}

// Create memory instance for conversation history
let conversationMemory = null;

// Create the prompt template
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
 * Classifies user intent to determine which image generation service to use
 * @param {string} userRequest - The user's image generation request
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Google API key
 * @param {string} options.modelName - Model name (default: "gemini-3.5-flash")
 * @returns {Promise<Object>} Intent classification result
 */
export async function classifyImageGenIntent(
  userRequest,
  { apiKey, modelName = 'gemini-3.5-flash', memory = null } = {}
) {
  const model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey,
    temperature: 0,
  });

  // Use provided memory or create a new one
  const activeMemory = memory || conversationMemory || new SimpleMemory();

  // Store memory for subsequent calls
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
 * Example usage and simple router
 * @param {string} userRequest - The user's request
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Routing decision
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
 * Reset conversation memory
 */
export function resetConversationMemory() {
  conversationMemory = new SimpleMemory();
}

/**
 * Get conversation history
 * @returns {Promise<string>} Conversation history
 */
export async function getConversationHistory() {
  if (!conversationMemory) return 'No conversation history.';
  const context = await conversationMemory.loadMemoryVariables({});
  return context.history || 'No conversation history.';
}
