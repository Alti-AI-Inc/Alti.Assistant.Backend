/**
 * @file Utility functions for evaluating and enhancing image generation prompts using Google Generative AI.
 * @module promptEvaluator
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import config from '../../../../../config/index.js';

/**
 * @typedef {object} PromptQualityAssessment
 * @property {boolean} isComplete - Whether the prompt has enough detail to generate a good image.
 * @property {string[]} missingElements - List of missing or unclear elements that should be clarified.
 * @property {string[]} suggestions - Specific questions to ask the user to improve the prompt.
 * @property {number} score - Prompt quality score (0-100).
 */

/**
 * Zod schema defining the structure for prompt quality assessment.
 * This schema is used to validate and parse the output from the LLM.
 * @type {z.ZodObject<any, any, any, PromptQualityAssessment, any>}
 */
const promptQualitySchema = z.object({
  isComplete: z
    .boolean()
    .describe('Whether the prompt has enough detail to generate a good image'),
  missingElements: z
    .array(z.string())
    .describe('List of missing or unclear elements that should be clarified'),
  suggestions: z
    .array(z.string())
    .describe('Specific questions to ask the user to improve the prompt'),
  score: z.number().min(0).max(100).describe('Prompt quality score (0-100)'),
});

/**
 * Structured output parser for the prompt quality assessment.
 * It uses the `promptQualitySchema` to parse and validate the LLM's JSON output.
 * @type {StructuredOutputParser<typeof promptQualitySchema>}
 */
const qualityParser = StructuredOutputParser.fromZodSchema(promptQualitySchema);

/**
 * Prompt template for assessing the quality of an image generation prompt.
 * It instructs the LLM to act as an expert prompt engineer and provide
 * a quality score and actionable suggestions.
 * @type {PromptTemplate}
 */
const qualityPromptTemplate = PromptTemplate.fromTemplate(
  `You are an expert prompt engineer for image generation. Analyze the following prompt and determine if it has enough detail to generate a high-quality image.

A complete prompt should typically include:
- Subject/main focus (what to generate)
- Style or quality level (photorealistic, artistic, etc.)
- Key details about the subject
- Setting/environment (optional but helpful)
- Lighting/mood (optional but helpful)
- Colors or visual elements (optional but helpful)
- Composition or perspective (optional but helpful)

Conversation History:
{history}

Current User Prompt: {prompt}

{format_instructions}

Analyze the prompt quality and provide specific, actionable suggestions if it's incomplete.`
);

/**
 * Evaluates the quality of a user's image generation prompt and provides suggestions for improvement.
 * It uses a Google Generative AI model to assess completeness, identify missing elements,
 * and suggest specific questions to enhance the prompt.
 *
 * @param {string} prompt - The user's image generation prompt to be evaluated.
 * @param {string} [history='No previous conversation.'] - Optional conversation history relevant to the prompt.
 * @param {object} [options={}] - Configuration options for the AI model.
 * @param {string} [options.modelName='gemini-3.5-flash'] - The name of the Google Generative AI model to use (e.g., 'gemini-pro', 'gemini-3.5-flash').
 * @returns {Promise<PromptQualityAssessment>} A promise that resolves to an object containing the prompt quality assessment.
 * @throws {Error} If there's a critical error during LLM invocation or parsing that cannot be gracefully handled.
 */
export async function evaluatePromptQuality(
  prompt,
  history = 'No previous conversation.',
  { modelName = 'gemini-3.5-flash' } = {}
) {
  const model = new ChatGoogleGenerativeAI({
    apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY,
    model: modelName,
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
    temperature: 0,
  });

  const chain = qualityPromptTemplate.pipe(model).pipe(qualityParser);
  console.log('Evaluating prompt quality for prompt:', prompt);
  console.log('Conversation history:', history);
  try {
    const result = await chain.invoke({
      prompt,
      history,
      format_instructions: qualityParser.getFormatInstructions(),
    });

    return result;
  } catch (error) {
    // Handle parsing errors by extracting JSON from markdown code blocks
    // LangChain's OutputParserException typically has the raw LLM output in the 'output' property.
    if (error.message && error.message.includes('Failed to parse')) {
      try {
        // Extract the raw LLM output string that failed to parse
        const llmOutput = error.output || '';

        // Remove markdown code blocks
        let jsonString = llmOutput
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        // Try to find and fix common JSON errors
        // Remove any trailing text after the last closing brace
        const lastBraceIndex = jsonString.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
          jsonString = jsonString.substring(0, lastBraceIndex + 1);
        }

        // Parse the cleaned JSON
        const parsed = JSON.parse(jsonString);

        // Validate against schema
        return promptQualitySchema.parse(parsed);
      } catch (fallbackError) {
        // If all parsing fails, return a safe default response
        console.error(
          'Failed to parse LLM output, returning default:',
          fallbackError
        );
        return {
          isComplete: false,
          missingElements: ['Unable to fully evaluate prompt quality'],
          suggestions: ['Please try again with a clearer prompt description'],
          score: 50,
        };
      }
    }
    throw error;
  }
}

/**
 * Prompt template for building an enhanced image generation prompt.
 * It instructs the LLM to consolidate conversation history into a single,
 * comprehensive prompt.
 * @type {PromptTemplate}
 */
const enhancePromptTemplate = PromptTemplate.fromTemplate(
  `You are an expert prompt engineer. Based on the conversation below, create a single, comprehensive image generation prompt that incorporates all the details the user has provided.

The prompt should be clear, detailed, and optimized for image generation.

Conversation:
{conversation}

Generate a complete, well-structured image generation prompt:`
);

/**
 * Builds a single, comprehensive image generation prompt by consolidating
 * details from a conversation history. It uses a Google Generative AI model
 * to act as an expert prompt engineer.
 *
 * @param {string[]} conversationHistory - An array of strings, where each string is a user input from the conversation.
 * @param {object} [options={}] - Configuration options for the AI model.
 * @param {string} [options.modelName='gemini-3.5-flash'] - The name of the Google Generative AI model to use (e.g., 'gemini-pro', 'gemini-3.5-flash').
 * @returns {Promise<string>} A promise that resolves to the enhanced, consolidated image generation prompt.
 */
export async function buildEnhancedPrompt(
  conversationHistory,
  { modelName = 'gemini-3.5-flash' } = {}
) {
  const model = new ChatGoogleGenerativeAI({
    apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY,
    model: modelName,
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
    temperature: 0.3,
  });

  const chain = enhancePromptTemplate.pipe(model);

  const conversation = conversationHistory
    .map((item, idx) => `${idx + 1}. ${item}`)
    .join('\n');

  const result = await chain.invoke({ conversation });

  return result.content;
}