import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";

// Define the image intent schema
const imageIntentSchema = z.object({
  isEditable: z.boolean().describe("Whether the user wants to edit an existing image"),
  intent: z.enum(["edit", "generate", "unclear"]).describe("User's primary intent"),
  editType: z.string().nullable().describe("Type of edit requested (background change, color adjustment, object removal, style transfer, etc.) or null if not editing"),
  reasoning: z.string().describe("Explanation of why this intent was determined"),
  needsMoreInfo: z.boolean().describe("Whether more information is needed to proceed"),
  questions: z.array(z.string()).describe("Questions to ask user if more info is needed"),
});

const imageIntentParser = StructuredOutputParser.fromZodSchema(imageIntentSchema);

// Prompt template for image intent detection
const imageIntentPromptTemplate = PromptTemplate.fromTemplate(
  `You are an AI assistant that analyzes user requests to determine if they want to edit an existing image or generate a new one.

Editing indicators:
- User mentions: "change", "modify", "edit", "adjust", "remove", "add to this", "make it", "transform", "convert"
- References to existing elements: "this image", "the background", "the color", "remove the", "change this to"
- Transformation requests: "make it black and white", "add blur", "change style"

Generation indicators:
- User wants to "create", "generate", "make a new", "design"
- Describes a new scene or subject from scratch
- No reference to modifying existing content

Context:
{context}

User Request: {request}

Has Image Attached: {hasImage}

{format_instructions}

Analyze the request and determine the user's intent.`
);

/**
 * Analyzes user intent when an image is provided
 * @param {string} request - The user's text request
 * @param {boolean} hasImage - Whether an image is attached
 * @param {string} context - Conversation context/history
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Intent analysis result
 */
export async function analyzeImageIntent(
  request,
  hasImage = false,
  context = "No previous context.",
  { apiKey, modelName = "gemini-2.5-flash" } = {}
) {
  console.log("Analyzing image intent for request:", apiKey);
  const model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey,
    temperature: 0,
  });

  const chain = imageIntentPromptTemplate.pipe(model).pipe(imageIntentParser);

  const result = await chain.invoke({
    request,
    hasImage: hasImage ? "Yes" : "No",
    context,
    format_instructions: imageIntentParser.getFormatInstructions(),
  });

  return result;
}
