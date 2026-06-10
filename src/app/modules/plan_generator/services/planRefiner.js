/**
 * @fileoverview This service module provides functions for refining and modifying project plans using a generative AI model (Google Gemini).
 * It includes capabilities for refining specific sections, adjusting for new constraints, generating alternatives, optimizing timelines and budgets,
 * expanding sections, simplifying the overall plan, and applying iterative feedback.
 * All AI-powered operations are rate-limited to prevent abuse and manage costs.
 *
 * @requires rate-limiter-flexible - For rate limiting API requests.
 * @requires redis - For the rate limiter's distributed store.
 * @requires @google/generative-ai - The official Google Gemini AI SDK.
 * @requires ../../../../../config/index.js - Application configuration.
 * @requires ../../../../shared/logger.js - The application's logger.
 * @requires ../plan_generator.constant.js - Constants specific to the plan generator module.
 */

import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  SYSTEM_PROMPTS,
  PLAN_GENERATOR_CONFIG,
  PLAN_SECTIONS,
} from '../plan_generator.constant.js';

// -- Rate Limiting & DDOS Protection Setup --

/**
 * Redis client instance for the rate limiter.
 * Connects to the Redis server specified in the application configuration.
 * It includes an error listener to log any connection or operational issues.
 * @type {import('redis').RedisClientType}
 */
const redisClient = createClient({
  url: config.redis_url,
  enable_offline_queue: false,
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error for Rate Limiting', err);
});

// Asynchronously connect to Redis. The rate limiter library handles connection readiness.
redisClient.connect().catch((err) => logger.error('Failed to connect to Redis:', err));

/**
 * Rate limiter for expensive AI generation and refinement tasks.
 * This limiter is configured to prevent abuse and control API costs by restricting
 * the number of requests per user ID or IP address within a specific time window.
 * @type {RateLimiterRedis}
 */
const aiApiLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl_plan_refiner', // Unique prefix for this set of limiters
  points: 20, // Max 20 requests
  duration: 60, // per 60 seconds (1 minute)
  blockDuration: 60 * 5, // Block for 5 minutes if the limit is exceeded
});

/**
 * Middleware-like function to consume a point from the rate limiter for a given user/IP.
 * @param {object} context - The context object, expected to contain `userId` or `ip`.
 * @param {string} [context.userId] - The ID of the user making the request.
 * @param {string} [context.ip] - The IP address of the user making the request.
 * @throws {Error} Throws a 429 "Too Many Requests" error if the rate limit is exceeded.
 * @throws {Error} Throws a 500 error if no user/IP identifier is found in the context.
 */
const applyRateLimit = async (context) => {
  // A user ID or IP must be provided in the context for effective rate limiting.
  const key = context?.userId || context?.ip;
  if (!key) {
    // Fail-safe: If no identifier is provided, we can't apply user-specific limits.
    // For security, we throw an error to enforce that the calling code provides context.
    logger.warn('Rate limit check failed: No userId or ip in context.');
    throw new Error('Cannot process request without a user or IP identifier for rate limiting.');
  }
  try {
    await aiApiLimiter.consume(key);
  } catch (rejRes) {
    // This block executes when the user has consumed all their points.
    logger.warn('Rate limit exceeded for plan refinement', { key });
    const retryAfter = Math.ceil(rejRes.msBeforeNext / 1000);
    const error = new Error(`Too many requests. Please try again in ${retryAfter} seconds.`);
    error.status = 429; // This status can be used by the controller to send the correct HTTP response.
    throw error;
  }
};

// -- End of Rate Limiting Setup --

/**
 * Google Generative AI client instance.
 * Initialized with the secret key from the application configuration.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Safely extracts and parses JSON from LLM responses, handling markdown blocks and trailing commas.
 * @param {string} text - The raw text response from the model.
 * @returns {any} The parsed JSON object or array.
 * @throws {Error} If no valid JSON structure is found or parsing fails.
 */
const parseRobustJson = (text) => {
  if (!text) {
    throw new Error('Empty response received from model');
  }

  // Remove markdown code blocks if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('No valid JSON structure found in response');
  }

  const jsonStr = jsonMatch[0];

  try {
    return JSON.parse(jsonStr);
  } catch (firstError) {
    // Attempt to clean trailing commas (common LLM syntax error)
    try {
      const cleanedJsonStr = jsonStr
        .replace(/,\s*([\]}])/g, '$1') // remove trailing commas before closing brackets/braces
        .replace(/[\u201C\u201D]/g, '"'); // replace smart quotes with standard double quotes
      return JSON.parse(cleanedJsonStr);
    } catch (secondError) {
      logger.error('Failed to parse JSON even after cleaning:', {
        originalError: firstError.message,
        cleaningError: secondError.message,
        textSnippet: text.substring(0, 200),
      });
      throw new Error(`JSON parsing failed: ${firstError.message}`);
    }
  }
};

/**
 * Logs token usage metrics from the Gemini response metadata.
 * @param {object} response - The Gemini response object.
 * @param {string} action - The name of the action being performed.
 */
const logUsage = (response, action) => {
  if (response && response.usageMetadata) {
    logger.info(`Gemini token usage for ${action}:`, response.usageMetadata);
  }
};

/**
 * Refines a specific section of a given plan based on a refinement request using a generative AI model.
 * The AI attempts to update the specified section while maintaining its original JSON structure.
 *
 * @param {object} plan - The overall plan object containing various sections.
 * @param {string} section - The name of the section to refine (e.g., 'phases', 'resources', 'introduction').
 * @param {string} refinementRequest - The specific request or instruction for refinement (e.g., "Make this section more detailed", "Adjust the timeline in this phase").
 * @param {object} [context={}] - Optional context, must include `userId` or `ip` for rate limiting.
 * @returns {Promise<object>} A promise that resolves to the refined section object.
 * @throws {Error} If the specified section is not found in the plan, if the AI response does not contain valid JSON, or if the AI generation fails.
 */
export const refineSection = async (
  plan,
  section,
  refinementRequest,
  context = {}
) => {
  await applyRateLimit(context); // Apply rate limiting before proceeding
  try {
    logger.info('Refining plan section:', {
      section,
      request: refinementRequest,
    });

    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const currentSection = plan[section];
    if (!currentSection) {
      throw new Error(`Section '${section}' not found in plan`);
    }

    const refinePrompt = `${SYSTEM_PROMPTS.REFINEMENT}

Current Plan Title: ${plan.title}

Section to Refine: ${section}

Current Content:
${JSON.stringify(currentSection, null, 2)}

Refinement Request: "${refinementRequest}"

Full Plan Context (for reference):
${JSON.stringify(plan, null, 2)}

Please refine this section based on the request. Return the updated section in the same JSON structure format as the original. Only return the refined section as valid JSON, no additional text.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: refinePrompt }] }],
      generationConfig: {
        temperature: PLAN_GENERATOR_CONFIG.TEMPERATURE_PLANNING,
        maxOutputTokens: 8192,
      },
    });

    const response = result.response;
    logUsage(response, `refineSection (${section})`);
    const refinedText = response.text();

    const refinedSection = parseRobustJson(refinedText);

    logger.info('Section refined successfully:', { section });

    return refinedSection;
  } catch (error) {
    logger.error('Error refining section:', error);
    throw error;
  }
};

/**
 * Adjusts the entire plan to accommodate new constraints using a generative AI model.
 * The AI will consider various aspects like timeline, budget, resources, and priorities to integrate the new constraints.
 *
 * @param {object} plan - The current plan object to be adjusted.
 * @param {object} newConstraints - An object detailing the new constraints (e.g., `{ budget: "$5000", timeline: "2 months" }`).
 * @param {object} [context={}] - Optional context, must include `userId` or `ip` for rate limiting.
 * @returns {Promise<object>} A promise that resolves to the adjusted plan object.
 * @throws {Error} If the AI response does not contain valid JSON or if the AI generation fails.
 */
export const adjustForConstraints = async (plan, newConstraints, context = {}) => {
  await applyRateLimit(context); // Apply rate limiting before proceeding
  try {
    logger.info('Adjusting plan for new constraints:', newConstraints);

    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const adjustPrompt = `${SYSTEM_PROMPTS.REFINEMENT}

Current Plan:
${JSON.stringify(plan, null, 2)}

New Constraints:
${JSON.stringify(newConstraints, null, 2)}

Please adjust the plan to accommodate these new constraints. Consider:
1. Timeline adjustments
2. Budget reallocation
3. Resource optimization
4. Priority changes
5. Scope adjustments if necessary

Return the complete updated plan in the same JSON structure. Only return valid JSON, no additional text.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: adjustPrompt }] }],
      generationConfig: {
        temperature: PLAN_GENERATOR_CONFIG.TEMPERATURE_PLANNING,
        maxOutputTokens: PLAN_GENERATOR_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const response = result.response;
    logUsage(response, 'adjustForConstraints');
    const adjustedText = response.text();

    const adjustedPlan = parseRobustJson(adjustedText);

    logger.info('Plan adjusted successfully');

    return adjustedPlan;
  } catch (error) {
    logger.error('Error adjusting plan:', error);
    throw error;
  }
};

/**
 * Generates 2-3 alternative approaches or variations for a given idea within the context of an existing plan.
 * Each alternative includes a description, pros, cons, estimated timeline, and estimated budget.
 *
 * @param {object} plan - The current plan object, used as context for generating relevant alternatives.
 * @param {string} ideaText - The specific idea or concept for which alternatives are to be generated.
 * @param {object} [context={}] - Optional context, must include `userId` or `ip` for rate limiting.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of alternative approach objects.
 *   Each object typically has properties like `approach`, `pros`, `cons`, `estimated_timeline`, and `estimated_budget`.
 *   Returns an empty array if an error occurs or if no valid JSON alternatives can be extracted.
 */
export const addAlternatives = async (plan, ideaText, context = {}) => {
  await applyRateLimit(context); // Apply rate limiting before proceeding
  try {
    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const altPrompt = `Based on this plan:

${JSON.stringify(plan, null, 2)}

For the idea: "${ideaText}"

Generate 2-3 alternative approaches or variations. Return only JSON:
{
  "alternatives": [
    {
      "approach": "<description>",
      "pros": ["<advantages>"],
      "cons": ["<disadvantages>"],
      "estimated_timeline": "<timeline>",
      "estimated_budget": "<budget>"
    }
  ]
}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: altPrompt }] }],
      generationConfig: {
        temperature: PLAN_GENERATOR_CONFIG.TEMPERATURE_BRAINSTORM,
        maxOutputTokens: 4096,
      },
    });

    const response = result.response;
    logUsage(response, 'addAlternatives');
    const responseText = response.text();

    try {
      const parsedResponse = parseRobustJson(responseText);
      if (parsedResponse && Array.isArray(parsedResponse.alternatives)) {
        return parsedResponse.alternatives;
      } else if (Array.isArray(parsedResponse)) {
        return parsedResponse;
      }
    } catch (parseError) {
      logger.error('Failed to parse JSON for alternatives or invalid structure:', parseError);
    }
    return [];
  } catch (error) {
    logger.error('Error adding alternatives:', error);
    return [];
  }
};

/**
 * Optimizes the timeline (phases) of a plan to meet a specified target duration.
 * The AI considers factors like parallel tasks, critical path, resource allocation, and scope adjustments.
 *
 * @param {object} plan - The current plan object, expected to have a `phases` property.
 * @param {string} targetDuration - The desired target duration for the plan (e.g., "3 months", "6 weeks", "end of Q4").
 * @param {object} [context={}] - Optional context, must include `userId` or `ip` for rate limiting.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of optimized phase objects.
 *   Returns the original `plan.phases` array if an error occurs or if no valid JSON can be extracted.
 */
export const optimizeTimeline = async (plan, targetDuration, context = {}) => {
  await applyRateLimit(context); // Apply rate limiting before proceeding
  try {
    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const optimizePrompt = `Current plan phases:
${JSON.stringify(plan.phases, null, 2)}

Target Duration: ${targetDuration}

Optimize the timeline to meet this target. Consider:
- Parallel tasks
- Critical path optimization
- Resource allocation
- Scope adjustments if needed

Return optimized phases in same JSON format.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: optimizePrompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 4096,
      },
    });

    const response = result.response;
    logUsage(response, 'optimizeTimeline');
    const responseText = response.text();

    try {
      const parsedResponse = parseRobustJson(responseText);
      if (Array.isArray(parsedResponse)) {
        return parsedResponse;
      } else if (parsedResponse && Array.isArray(parsedResponse.phases)) {
        return parsedResponse.phases;
      }
    } catch (parseError) {
      logger.error('Failed to parse JSON for optimized timeline or invalid structure:', parseError);
    }
    return plan.phases;
  } catch (error) {
    logger.error('Error optimizing timeline:', error);
    return plan.phases;
  }
};

/**
 * Optimizes the resource allocation of a plan to meet a specified target budget.
 * The AI will suggest adjustments to resources to align with the financial constraint.
 *
 * @param {object} plan - The current plan object, expected to have a `resources` property.
 * @param {string} targetBudget - The desired target budget for the plan (e.g., "$10,000", "5000 USD", "within 15k").
 * @param {object} [context={}] - Optional context, must include `userId` or `ip` for rate limiting.
 * @returns {Promise<object>} A promise that resolves to an object representing the optimized resources.
 *   Returns the original `plan.resources` object if an error occurs or if no valid JSON can be extracted.
 */
export const optimizeBudget = async (plan, targetBudget, context = {}) => {
  await applyRateLimit(context); // Apply rate limiting before proceeding
  try {
    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const optimizePrompt = `Current plan resources:
${JSON.stringify(plan.resources, null, 2)}

Target Budget: ${targetBudget}

Optimize resource allocation to meet this budget. Return optimized resources in same JSON format.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: optimizePrompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 4096,
      },
    });

    const response = result.response;
    logUsage(response, 'optimizeBudget');
    const responseText = response.text();

    try {
      const parsedResponse = parseRobustJson(responseText);
      if (parsedResponse && parsedResponse.resources) {
        return parsedResponse.resources;
      }
      return parsedResponse || plan.resources;
    } catch (parseError) {
      logger.error('Failed to parse JSON for optimized budget:', parseError);
      return plan.resources;
    }
  } catch (error) {
    logger.error('Error optimizing budget:', error);
    return plan.resources;
  }
};

/**
 * Expands a specific section of the plan with more detailed information using a generative AI model.
 * The AI will provide a more comprehensive version of the specified section, maintaining its JSON structure.
 *
 * @param {object} plan - The overall plan object.
 * @param {string} section - The name of the section to expand (e.g., 'introduction', 'phases', 'risks').
 * @param {object} [context={}] - Optional context, must include `userId` or `ip` for rate limiting.
 * @returns {Promise<object|Array>} A promise that resolves to the expanded section content (can be an object or an array depending on the section).
 *   Returns the original `plan[section]` content if an error occurs or if no valid JSON can be extracted.
 */
export const expandSection = async (plan, section, context = {}) => {
  await applyRateLimit(context); // Apply rate limiting before proceeding
  try {
    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const expandPrompt = `Expand this section with more details:

Section: ${section}
Current Content:
${JSON.stringify(plan[section], null, 2)}

Plan Context:
${JSON.stringify(plan, null, 2)}

Provide a more detailed, comprehensive version. Return in same JSON format.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: expandPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    });

    const response = result.response;
    logUsage(response, `expandSection (${section})`);
    const responseText = response.text();

    try {
      const parsedResponse = parseRobustJson(responseText);
      if (parsedResponse && parsedResponse[section]) {
        return parsedResponse[section];
      }
      return parsedResponse || plan[section];
    } catch (parseError) {
      logger.error('Failed to parse JSON for expanded section:', parseError);
      return plan[section];
    }
  } catch (error) {
    logger.error('Error expanding section:', error);
    return plan[section];
  }
};

/**
 * Simplifies the entire plan to make it more concise and easier to understand.
 * The AI will rephrase and condense the plan while retaining all essential information and its original JSON structure.
 *
 * @param {object} plan - The current plan object to be simplified.
 * @param {object} [context={}] - Optional context, must include `userId` or `ip` for rate limiting.
 * @returns {Promise<object>} A promise that resolves to the simplified plan object.
 *   Returns the original plan object if an error occurs or if no valid JSON can be extracted.
 */
export const simplifyPlan = async (plan, context = {}) => {
  await applyRateLimit(context); // Apply rate limiting before proceeding
  try {
    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const simplifyPrompt = `Simplify this plan to make it more concise and easier to understand:

${JSON.stringify(plan, null, 2)}

Keep all essential information but make it more accessible. Return in same JSON format.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: simplifyPrompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: PLAN_GENERATOR_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const response = result.response;
    logUsage(response, 'simplifyPlan');
    const responseText = response.text();

    try {
      return parseRobustJson(responseText);
    } catch (parseError) {
      logger.error('Failed to parse JSON for simplified plan:', parseError);
      return plan;
    }
  } catch (error) {
    logger.error('Error simplifying plan:', error);
    return plan;
  }
};

/**
 * Applies user feedback to an existing plan, iteratively improving it using a generative AI model.
 * The AI considers the current plan, the specific feedback, and optionally previous conversation history to make appropriate changes.
 *
 * @param {object} plan - The current plan object.
 * @param {string} feedback - The user's feedback or instructions for improvement (e.g., "Make the budget more realistic", "Add a contingency plan").
 * @param {Array<object>} [conversationHistory=[]] - Optional array of previous conversation turns.
 * @param {object} [context={}] - Optional context, must include `userId` or `ip` for rate limiting.
 * @returns {Promise<object>} A promise that resolves to the improved plan object.
 * @throws {Error} If the AI response does not contain valid JSON or if the AI generation fails.
 */
export const applyFeedback = async (
  plan,
  feedback,
  conversationHistory = [],
  context = {}
) => {
  await applyRateLimit(context); // Apply rate limiting before proceeding
  try {
    logger.info('Applying feedback to plan:', {
      feedbackLength: feedback.length,
    });

    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const feedbackPrompt = `${SYSTEM_PROMPTS.REFINEMENT}

Current Plan:
${JSON.stringify(plan, null, 2)}

User Feedback: "${feedback}"

${conversationHistory.length > 0 ? `Previous Conversation:\n${JSON.stringify(conversationHistory, null, 2)}` : ''}

Apply this feedback to improve the plan. Consider what the user is asking for and make appropriate changes. Return the complete updated plan in the same JSON structure.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: feedbackPrompt }] }],
      generationConfig: {
        temperature: PLAN_GENERATOR_CONFIG.TEMPERATURE_PLANNING,
        maxOutputTokens: PLAN_GENERATOR_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const response = result.response;
    logUsage(response, 'applyFeedback');
    const improvedText = response.text();

    const improvedPlan = parseRobustJson(improvedText);

    logger.info('Feedback applied successfully');

    return improvedPlan;
  } catch (error) {
    logger.error('Error applying feedback:', error);
    throw error;
  }
};

/**
 * @typedef {object} PlanRefinerService
 * @property {function(object, string, string, object=): Promise<object>} refineSection - Refines a specific section of a plan.
 * @property {function(object, object, object=): Promise<object>} adjustForConstraints - Adjusts the entire plan based on new constraints.
 * @property {function(object, string, object=): Promise<Array<object>>} addAlternatives - Generates alternative approaches for an idea within a plan.
 * @property {function(object, string, object=): Promise<Array<object>>} optimizeTimeline - Optimizes the plan's timeline to meet a target duration.
 * @property {function(object, string, object=): Promise<object>} optimizeBudget - Optimizes the plan's budget to meet a target.
 * @property {function(object, string, object=): Promise<object|Array>} expandSection - Expands a specific section of the plan with more details.
 * @property {function(object, object=): Promise<object>} simplifyPlan - Simplifies the entire plan for easier understanding.
 * @property {function(object, string, Array<object>=, object=): Promise<object>} applyFeedback - Applies user feedback to iteratively improve the plan.
 */

/**
 * An object consolidating all plan refinement and adjustment functions.
 * This service provides various utilities for modifying, optimizing, and enhancing project plans
 * using generative AI capabilities. All functions are rate-limited to prevent abuse.
 * @type {PlanRefinerService}
 */
export const planRefiner = {
  refineSection,
  adjustForConstraints,
  addAlternatives,
  optimizeTimeline,
  optimizeBudget,
  expandSection,
  simplifyPlan,
  applyFeedback,
};