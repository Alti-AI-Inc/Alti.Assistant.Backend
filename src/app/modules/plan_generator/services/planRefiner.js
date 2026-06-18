import { RateLimiterRedis } from 'rate-limiter-flexible';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import { RedisClient, redisClient } from '../../../../shared/redis.js';
import {
  SYSTEM_PROMPTS,
  PLAN_GENERATOR_CONFIG,
  PLAN_SECTIONS,
} from '../plan_generator.constant.js';
// BUG FIX: Import services and custom errors for authorization, usage tracking, and better error handling.
import { UsageService } from '../../usage/usage.service.js';
import {
  AuthorizationError,
  InsufficientCreditsError,
  RateLimitError,
  ServiceError,
} from '../../../../shared/errors.js';

// Rate limiter for expensive AI generation/refinement tasks.
// Limits are applied per user ID or IP address to prevent abuse and cost overruns.
const aiApiLimiter = RedisClient.isEnabled
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_plan_refiner', // Unique prefix for this set of limiters
      points: 20, // Max 20 requests
      duration: 60, // per 60 seconds (1 minute)
      blockDuration: 60 * 5, // Block for 5 minutes if the limit is exceeded
    })
  : null;

/**
 * Middleware-like function to consume a point from the rate limiter for a given user/IP.
 * @param {object} context - The context object, expected to contain `user.id` or `ip`.
 * @throws {RateLimitError} Throws a 429 "Too Many Requests" error if the rate limit is exceeded.
 * @throws {ServiceError} Throws a 500 error if no user/IP identifier is found in the context.
 */
const applyRateLimit = async (context) => {
  // SECURITY FIX: Prioritize authenticated user ID for rate limiting over IP.
  const key = context?.user?.id || context?.ip;
  if (!key) {
    // Fail-safe: If no identifier is provided, we can't apply user-specific limits.
    // For security, we throw an error to enforce that the calling code provides context.
    logger.error('Rate limit check failed: No user.id or ip in context.');
    throw new ServiceError('Cannot process request without a user or IP identifier for rate limiting.');
  }
  if (aiApiLimiter && RedisClient.isReady) {
    try {
      await aiApiLimiter.consume(key);
    } catch (rejRes) {
      if (rejRes instanceof Error) {
        logger.error('Rate limiter Redis failure in planRefiner, bypassing:', rejRes);
        return; // Fail open
      }
      // This block executes when the user has consumed all their points.
      logger.warn('Rate limit exceeded for plan refinement', { key });
      const retryAfter = Math.ceil((rejRes.msBeforeNext || 0) / 1000);
      // BUG FIX: Use a specific error type for rate limiting.
      throw new RateLimitError(`Too many requests. Please try again in ${retryAfter} seconds.`);
    }
  }
};

// -- End of Rate Limiting Setup --

// -- Authorization and Usage Tracking --

/**
 * Authorizes a user action against a plan, ensuring they belong to the correct workspace.
 * This prevents Insecure Direct Object Reference (IDOR) vulnerabilities.
 * @param {object} plan - The plan object, must contain a `workspaceId`.
 * @param {object} context - The user context, must contain `user.workspaceId` and `user.role`.
 * @throws {AuthorizationError} If the user is not authorized to access or modify the plan.
 */
const authorizeAction = (plan, context) => {
  // INTEGRATION FIX: Ensure a valid user context from an authentication middleware exists.
  if (!context?.user?.workspaceId || !context?.user?.id) {
    throw new AuthorizationError('User context is missing or invalid.');
  }
  // INTEGRATION FIX: Ensure the plan object has the necessary data for authorization.
  if (!plan?.workspaceId) {
    logger.error('Authorization check failed: Plan object is missing workspaceId.', { planId: plan?.id });
    throw new ServiceError('Plan object is malformed and cannot be authorized.');
  }
  // SECURITY FIX (IDOR): Ensure the user's workspace matches the plan's workspace.
  if (plan.workspaceId !== context.user.workspaceId) {
    logger.warn('Authorization failed: User from one workspace attempted to access a plan from another.', {
      userId: context.user.id,
      userWorkspaceId: context.user.workspaceId,
      planWorkspaceId: plan.workspaceId,
    });
    throw new AuthorizationError('You do not have permission to access this resource.');
  }
  // INTEGRATION POINT: Role-specific logic can be added here.
  // For example, if 'user' roles have restrictions on certain refinement types.
  // const { role } = context.user;
  // if (role === 'user' && some_condition) {
  //   throw new AuthorizationError('Your role does not permit this action.');
  // }
};

/**
 * Records token usage metrics from the Gemini response and propagates it to the workspace level.
 * @param {object} response - The Gemini response object.
 * @param {string} action - The name of the action being performed.
 * @param {object} context - The user context.
 */
const recordUsage = async (response, action, context) => {
  if (response && response.usageMetadata) {
    const usageData = {
      ...response.usageMetadata,
      userId: context.user.id,
      workspaceId: context.user.workspaceId,
    };
    logger.info(`Gemini token usage for ${action}:`, usageData);

    // INTEGRATION FIX: Propagate usage details up to the workspace/tenant for billing and limits.
    try {
      await UsageService.recordTokens(context.user.workspaceId, response.usageMetadata);
    } catch (error) {
      // This failure is critical for billing/limits but should not fail the user's request.
      // It must be monitored closely by an external system.
      logger.error('CRITICAL: Failed to record token usage to database', {
        error: error.message,
        workspaceId: context.user.workspaceId,
        usage: response.usageMetadata,
      });
    }
  }
};

// -- End of Authorization and Usage Tracking --

// Initialize Gemini client
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
 * Refines a specific section of a given plan based on a refinement request using a generative AI model.
 * The AI attempts to update the specified section while maintaining its original JSON structure.
 *
 * @param {object} plan - The overall plan object containing various sections and a `workspaceId`.
 * @param {string} section - The name of the section to refine (e.g., 'phases', 'resources', 'introduction').
 * @param {string} refinementRequest - The specific request or instruction for refinement (e.g., "Make this section more detailed", "Adjust the timeline in this phase").
 * @param {object} context - Context object, must include `user: {id, workspaceId, role}` and `ip`.
 * @returns {Promise<object>} A promise that resolves to the refined section object.
 * @throws {Error} If the specified section is not found in the plan, if the AI response does not contain valid JSON, or if the AI generation fails.
 */
export const refineSection = async (
  plan,
  section,
  refinementRequest,
  context
) => {
  // INTEGRATION FIX: Perform authorization and check usage limits before any processing.
  authorizeAction(plan, context);
  await UsageService.checkHasSufficientCredits(context.user.workspaceId);
  await applyRateLimit(context);

  try {
    logger.info('Refining plan section:', {
      section,
      userId: context.user.id,
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
    // INTEGRATION FIX: Record usage after a successful AI call.
    await recordUsage(response, `refineSection (${section})`, context);
    const refinedText = response.text();

    const refinedSection = parseRobustJson(refinedText);

    logger.info('Section refined successfully:', { section, userId: context.user.id });

    return refinedSection;
  } catch (error) {
    logger.error('Error refining section:', { error: error.message, userId: context.user.id });
    throw error;
  }
};

/**
 * Adjusts the entire plan to accommodate new constraints using a generative AI model.
 * The AI will consider various aspects like timeline, budget, resources, and priorities to integrate the new constraints.
 *
 * @param {object} plan - The current plan object to be adjusted, must include `workspaceId`.
 * @param {object} newConstraints - An object detailing the new constraints (e.g., `{ budget: "$5000", timeline: "2 months" }`).
 * @param {object} context - Context object, must include `user: {id, workspaceId, role}` and `ip`.
 * @returns {Promise<object>} A promise that resolves to the adjusted plan object.
 * @throws {Error} If the AI response does not contain valid JSON or if the AI generation fails.
 */
export const adjustForConstraints = async (plan, newConstraints, context) => {
  authorizeAction(plan, context);
  await UsageService.checkHasSufficientCredits(context.user.workspaceId);
  await applyRateLimit(context);

  try {
    logger.info('Adjusting plan for new constraints:', { newConstraints, userId: context.user.id });

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
    await recordUsage(response, 'adjustForConstraints', context);
    const adjustedText = response.text();

    const adjustedPlan = parseRobustJson(adjustedText);

    logger.info('Plan adjusted successfully', { userId: context.user.id });

    return adjustedPlan;
  } catch (error) {
    logger.error('Error adjusting plan:', { error: error.message, userId: context.user.id });
    throw error;
  }
};

/**
 * Generates 2-3 alternative approaches or variations for a given idea within the context of an existing plan.
 * Each alternative includes a description, pros, cons, estimated timeline, and estimated budget.
 *
 * @param {object} plan - The current plan object, used as context for generating relevant alternatives, must include `workspaceId`.
 * @param {string} ideaText - The specific idea or concept for which alternatives are to be generated.
 * @param {object} context - Context object, must include `user: {id, workspaceId, role}` and `ip`.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of alternative approach objects.
 *   Returns an empty array if an error occurs or if no valid JSON alternatives can be extracted.
 */
export const addAlternatives = async (plan, ideaText, context) => {
  authorizeAction(plan, context);
  // BUG FIX: Unhandled promise. Added await.
  await UsageService.checkHasSufficientCredits(context.user.workspaceId);
  await applyRateLimit(context);

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
    await recordUsage(response, 'addAlternatives', context);
    const responseText = response.text();

    try {
      const parsedResponse = parseRobustJson(responseText);
      if (parsedResponse && Array.isArray(parsedResponse.alternatives)) {
        return parsedResponse.alternatives;
      } else if (Array.isArray(parsedResponse)) {
        return parsedResponse;
      }
    } catch (parseError) {
      logger.error('Failed to parse JSON for alternatives or invalid structure:', { error: parseError.message, userId: context.user.id });
    }
    return [];
  } catch (error) {
    // BUG FIX: Do not throw errors that should be handled gracefully (e.g., credit/rate limit errors).
    if (error instanceof AuthorizationError || error instanceof InsufficientCreditsError || error instanceof RateLimitError) {
        throw error;
    }
    logger.error('Error adding alternatives:', { error: error.message, userId: context.user.id });
    return [];
  }
};

/**
 * Optimizes the timeline (phases) of a plan to meet a specified target duration.
 * The AI considers factors like parallel tasks, critical path, resource allocation, and scope adjustments.
 *
 * @param {object} plan - The current plan object, expected to have a `phases` property and a `workspaceId`.
 * @param {string} targetDuration - The desired target duration for the plan (e.g., "3 months", "6 weeks", "end of Q4").
 * @param {object} context - Context object, must include `user: {id, workspaceId, role}` and `ip`.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of optimized phase objects.
 *   Returns the original `plan.phases` array if an error occurs or if no valid JSON can be extracted.
 */
export const optimizeTimeline = async (plan, targetDuration, context) => {
  authorizeAction(plan, context);
  await UsageService.checkHasSufficientCredits(context.user.workspaceId);
  await applyRateLimit(context);

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
    await recordUsage(response, 'optimizeTimeline', context);
    const responseText = response.text();

    try {
      const parsedResponse = parseRobustJson(responseText);
      if (Array.isArray(parsedResponse)) {
        return parsedResponse;
      } else if (parsedResponse && Array.isArray(parsedResponse.phases)) {
        return parsedResponse.phases;
      }
    } catch (parseError) {
      logger.error('Failed to parse JSON for optimized timeline or invalid structure:', { error: parseError.message, userId: context.user.id });
    }
    return plan.phases;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof InsufficientCreditsError || error instanceof RateLimitError) {
        throw error;
    }
    logger.error('Error optimizing timeline:', { error: error.message, userId: context.user.id });
    return plan.phases;
  }
};

/**
 * Optimizes the resource allocation of a plan to meet a specified target budget.
 * The AI will suggest adjustments to resources to align with the financial constraint.
 *
 * @param {object} plan - The current plan object, expected to have a `resources` property and a `workspaceId`.
 * @param {string} targetBudget - The desired target budget for the plan (e.g., "$10,000", "5000 USD", "within 15k").
 * @param {object} context - Context object, must include `user: {id, workspaceId, role}` and `ip`.
 * @returns {Promise<object>} A promise that resolves to an object representing the optimized resources.
 *   Returns the original `plan.resources` object if an error occurs or if no valid JSON can be extracted.
 */
export const optimizeBudget = async (plan, targetBudget, context) => {
  authorizeAction(plan, context);
  await UsageService.checkHasSufficientCredits(context.user.workspaceId);
  await applyRateLimit(context);

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
    await recordUsage(response, 'optimizeBudget', context);
    const responseText = response.text();

    try {
      const parsedResponse = parseRobustJson(responseText);
      if (parsedResponse && parsedResponse.resources) {
        return parsedResponse.resources;
      }
      return parsedResponse || plan.resources;
    } catch (parseError) {
      logger.error('Failed to parse JSON for optimized budget:', { error: parseError.message, userId: context.user.id });
      return plan.resources;
    }
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof InsufficientCreditsError || error instanceof RateLimitError) {
        throw error;
    }
    logger.error('Error optimizing budget:', { error: error.message, userId: context.user.id });
    return plan.resources;
  }
};

/**
 * Expands a specific section of the plan with more detailed information using a generative AI model.
 * The AI will provide a more comprehensive version of the specified section, maintaining its JSON structure.
 *
 * @param {object} plan - The overall plan object, must include `workspaceId`.
 * @param {string} section - The name of the section to expand (e.g., 'introduction', 'phases', 'risks').
 * @param {object} context - Context object, must include `user: {id, workspaceId, role}` and `ip`.
 * @returns {Promise<object|Array>} A promise that resolves to the expanded section content (can be an object or an array depending on the section).
 *   Returns the original `plan[section]` content if an error occurs or if no valid JSON can be extracted.
 */
export const expandSection = async (plan, section, context) => {
  authorizeAction(plan, context);
  await UsageService.checkHasSufficientCredits(context.user.workspaceId);
  await applyRateLimit(context);

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
    await recordUsage(response, `expandSection (${section})`, context);
    const responseText = response.text();

    try {
      const parsedResponse = parseRobustJson(responseText);
      if (parsedResponse && parsedResponse[section]) {
        return parsedResponse[section];
      }
      return parsedResponse || plan[section];
    } catch (parseError) {
      logger.error('Failed to parse JSON for expanded section:', { error: parseError.message, userId: context.user.id });
      return plan[section];
    }
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof InsufficientCreditsError || error instanceof RateLimitError) {
        throw error;
    }
    logger.error('Error expanding section:', { error: error.message, userId: context.user.id });
    return plan[section];
  }
};

/**
 * Simplifies the entire plan to make it more concise and easier to understand.
 * The AI will rephrase and condense the plan while retaining all essential information and its original JSON structure.
 *
 * @param {object} plan - The current plan object to be simplified, must include `workspaceId`.
 * @param {object} context - Context object, must include `user: {id, workspaceId, role}` and `ip`.
 * @returns {Promise<object>} A promise that resolves to the simplified plan object.
 *   Returns the original plan object if an error occurs or if no valid JSON can be extracted.
 */
export const simplifyPlan = async (plan, context) => {
  authorizeAction(plan, context);
  await UsageService.checkHasSufficientCredits(context.user.workspaceId);
  await applyRateLimit(context);

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
    await recordUsage(response, 'simplifyPlan', context);
    const responseText = response.text();

    try {
      return parseRobustJson(responseText);
    } catch (parseError) {
      logger.error('Failed to parse JSON for simplified plan:', { error: parseError.message, userId: context.user.id });
      return plan;
    }
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof InsufficientCreditsError || error instanceof RateLimitError) {
        throw error;
    }
    logger.error('Error simplifying plan:', { error: error.message, userId: context.user.id });
    return plan;
  }
};

/**
 * Applies user feedback to an existing plan, iteratively improving it using a generative AI model.
 * The AI considers the current plan, the specific feedback, and optionally previous conversation history to make appropriate changes.
 *
 * @param {object} plan - The current plan object, must include `workspaceId`.
 * @param {string} feedback - The user's feedback or instructions for improvement (e.g., "Make the budget more realistic", "Add a contingency plan").
 * @param {Array<object>} [conversationHistory=[]] - Optional array of previous conversation turns.
 * @param {object} context - Context object, must include `user: {id, workspaceId, role}` and `ip`.
 * @returns {Promise<object>} A promise that resolves to the improved plan object.
 * @throws {Error} If the AI response does not contain valid JSON or if the AI generation fails.
 */
export const applyFeedback = async (
  plan,
  feedback,
  conversationHistory = [],
  context
) => {
  authorizeAction(plan, context);
  await UsageService.checkHasSufficientCredits(context.user.workspaceId);
  await applyRateLimit(context);

  try {
    logger.info('Applying feedback to plan:', {
      feedbackLength: feedback.length,
      userId: context.user.id,
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
    await recordUsage(response, 'applyFeedback', context);
    const improvedText = response.text();

    const improvedPlan = parseRobustJson(improvedText);

    logger.info('Feedback applied successfully', { userId: context.user.id });

    return improvedPlan;
  } catch (error) {
    logger.error('Error applying feedback:', { error: error.message, userId: context.user.id });
    throw error;
  }
};

/**
 * @typedef {object} PlanRefinerService
 * @property {function(object, string, string, object): Promise<object>} refineSection - Refines a specific section of a plan.
 * @property {function(object, object, object): Promise<object>} adjustForConstraints - Adjusts the entire plan based on new constraints.
 * @property {function(object, string, object): Promise<Array<object>>} addAlternatives - Generates alternative approaches for an idea within a plan.
 * @property {function(object, string, object): Promise<Array<object>>} optimizeTimeline - Optimizes the plan's timeline to meet a target duration.
 * @property {function(object, string, object): Promise<object>} optimizeBudget - Optimizes the plan's budget to meet a target.
 * @property {function(object, string, object): Promise<object|Array>} expandSection - Expands a specific section of the plan with more details.
 * @property {function(object, object): Promise<object>} simplifyPlan - Simplifies the entire plan for easier understanding.
 * @property {function(object, string, Array<object>=, object): Promise<object>} applyFeedback - Applies user feedback to iteratively improve the plan.
 */

/**
 * An object consolidating all plan refinement and adjustment functions.
 * This service provides various utilities for modifying, optimizing, and enhancing project plans
 * using generative AI capabilities. All functions are rate-limited, authorized, and usage-tracked to prevent abuse,
 * enforce tenant boundaries, and respect business limits.
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