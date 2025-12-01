import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";

// Define the prompt quality schema
const promptQualitySchema = z.object({
  isComplete: z.boolean().describe("Whether the prompt has enough detail to generate a good image"),
  missingElements: z.array(z.string()).describe("List of missing or unclear elements that should be clarified"),
  suggestions: z.array(z.string()).describe("Specific questions to ask the user to improve the prompt"),
  score: z.number().min(0).max(100).describe("Prompt quality score (0-100)"),
});

const qualityParser = StructuredOutputParser.fromZodSchema(promptQualitySchema);

// Prompt template for quality assessment
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
 * Evaluates prompt quality and suggests improvements
 * @param {string} prompt - The user's image generation prompt
 * @param {string} history - Conversation history
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Prompt quality assessment
 */
export async function evaluatePromptQuality(
  prompt,
  history = "No previous conversation.",
  { apiKey, modelName = "gemini-2.5-flash" } = {}
) {
  const model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey,
    temperature: 0,
  });

  const chain = qualityPromptTemplate.pipe(model).pipe(qualityParser);
  console.log("Evaluating prompt quality for prompt:", prompt);
  console.log("Conversation history:", history);
  try {
    const result = await chain.invoke({
      prompt,
      history,
      format_instructions: qualityParser.getFormatInstructions(),
    });

    return result;
  } catch (error) {
    // Handle parsing errors by extracting JSON from markdown code blocks
    if (error.message && error.message.includes('Failed to parse')) {
      try {
        // Extract the raw LLM output
        const llmOutput = error.llmOutput || '';

        // Remove markdown code blocks
        let jsonString = llmOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

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
        console.error('Failed to parse LLM output, returning default:', fallbackError);
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
 * Builds an improved prompt from conversation history
 * @param {Array} conversationHistory - Array of user inputs
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} Enhanced prompt
 */
export async function buildEnhancedPrompt(
  conversationHistory,
  { apiKey, modelName = "gemini-2.5-flash" } = {}
) {
  const model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey,
    temperature: 0.3,
  });

  const enhancePromptTemplate = PromptTemplate.fromTemplate(
    `You are an expert prompt engineer. Based on the conversation below, create a single, comprehensive image generation prompt that incorporates all the details the user has provided.

The prompt should be clear, detailed, and optimized for image generation.

Conversation:
{conversation}

Generate a complete, well-structured image generation prompt:`
  );

  const chain = enhancePromptTemplate.pipe(model);

  const conversation = conversationHistory
    .map((item, idx) => `${idx + 1}. ${item}`)
    .join("\n");

  const result = await chain.invoke({ conversation });

  return result.content;
}
