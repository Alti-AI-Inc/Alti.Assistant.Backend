import { RateLimiterRedis } from 'rate-limiter-flexible';
import redisClient from '../../../../../config/redisClient.js'; // Assumes a configured Redis client is exported from here
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import config from '../../../../../config/index.js';

// --- Rate Limiting & DDOS Protection ---

// Rate limiter for authenticated requests (e.g., identified by a unique API key).
// Allows a reasonable number of requests for legitimate users to prevent abuse.
const authenticatedLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit:image_intent_auth',
  points: 50, // Max 50 requests
  duration: 60, // per minute
  blockDuration: 60 * 5, // Block for 5 minutes if limit is exceeded
});

// Stricter rate limiter for unauthenticated/shared key requests.
// This is a global limit to prevent abuse from a single source overwhelming the system.
// NOTE: For production, using the user's IP address (passed from the controller) as the key
// would be more effective than a single global key.
const anonymousLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit:image_intent_anon',
  points: 10, // Max 10 requests
  duration: 60, // per minute
  blockDuration: 60 * 10, // Block for 10 minutes if limit is exceeded
});

// --- End of Rate Limiting ---

// Define the image intent schema
const imageIntentSchema = z.object({
  isEditable: z
    .boolean()
    .describe('Whether the user wants to edit an existing image'),
  intent: z
    .enum(['edit', 'generate', 'unclear'])
    .describe("User's primary intent"),
  editType: z
    .string()
    .nullable()
    .describe(
      'Type of edit requested (background change, color adjustment, object removal, style transfer, etc.) or null if not editing'
    ),
  reasoning: z
    .string()
    .describe('Explanation of why this intent was determined'),
  needsMoreInfo: z
    .boolean()
    .describe('Whether more information is needed to proceed'),
  questions: z
    .array(z.string())
    .describe('Questions to ask user if more info is needed'),
});

const imageIntentParser =
  StructuredOutputParser.fromZodSchema(imageIntentSchema);

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
 * Analyzes user intent when an image is provided. This is a costly operation and is rate-limited.
 * @param {string} request - The user's text request
 * @param {boolean} hasImage - Whether an image is attached
 * @param {string} context - Conversation context/history
 * @param {Object} options - Configuration options
 * @param {string} [options.apiKey] - A unique key for the user/request, used for rate-limiting.
 * @param {string} [options.modelName] - The name of the model to use.
 * @param {string} [options.ip] - The user's IP address for more granular anonymous rate-limiting.
 * @returns {Promise<Object>} Intent analysis result
 * @throws {Error} Throws an error with status 429 if the rate limit is exceeded.
 */
export async function analyzeImageIntent(
  request,
  hasImage = false,
  context = 'No previous context.',
  options = {}
) {
  const {
    apiKey,
    modelName = 'gemini-3.5-flash',
    ip = 'global_anon_user',
  } = options;

  // --- Apply Rate Limiting ---
  // Choose the appropriate rate limiter and key.
  // If an apiKey is provided, we assume it's a unique identifier for an authenticated user.
  // Otherwise, we fall back to the user's IP for the stricter, anonymous limiter.
  const isAuthenticaded = !!apiKey;
  const limiter = isAuthenticaded ? authenticatedLimiter : anonymousLimiter;
  const rateLimitKey = isAuthenticaded ? apiKey : ip;

  try {
    // Consume a point from the rate limiter for the given key.
    await limiter.consume(rateLimitKey);
  } catch (rejRes) {
    // If rate limit is exceeded, rate-limiter-flexible rejects with a RateLimiterRes object.
    // We'll create and throw a standard HTTP 429 error to be handled by the Express error middleware.
    if (rejRes instanceof Error && rejRes.msBeforeNext) {
      const err = new Error(
        'Too many requests for image intent analysis. Please try again later.'
      );
      err.status = 429;
      // Add Retry-After header info for clients
      err.headers = { 'Retry-After': Math.ceil(rejRes.msBeforeNext / 1000) };
      throw err;
    }
    // Re-throw any other unexpected errors.
    throw rejRes;
  }
  // --- End of Rate Limiting ---

  console.log('Analyzing image intent for request using Vertex AI');
  const model = new ChatGoogleGenerativeAI({
    // Prioritize the apiKey passed in options, then config, then environment variable
    apiKey: apiKey || config.gemini_secret_key || process.env.GEMINI_API_KEY,
    model: modelName,
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
    temperature: 0,
  });

  const chain = imageIntentPromptTemplate.pipe(model).pipe(imageIntentParser);

  const result = await chain.invoke({
    request,
    hasImage: hasImage ? 'Yes' : 'No',
    context,
    format_instructions: imageIntentParser.getFormatInstructions(),
  });

  return result;
}