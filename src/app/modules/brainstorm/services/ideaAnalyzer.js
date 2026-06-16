import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  BRAINSTORM_INTENTS,
  BRAINSTORM_TYPES,
  PERSPECTIVES,
  TECHNIQUES,
  DEPTH_LEVELS,
  COMPLEXITY_LEVELS,
} from '../brainstorm.constant.js';
import { rateLimit } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../../../../shared/redis.js'; // Assuming a shared Redis client is available
import express from 'express';
import http from 'http';

// --- Rate Limiting & DDOS Protection Setup ---

/**
 * A Redis-backed store for the AI analysis rate limiter.
 * Using a shared Redis store ensures that rate limit counts are persisted
 * and shared across multiple server instances or processes, which is crucial
 * for accurate limiting in a scaled environment.
 * @type {RedisStore}
 */
const rateLimitStoreAnalysis = (redisClient && redisClient.isOpen)
  ? new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:brainstorm:analysis:',
    })
  : undefined;

/**
 * A Redis-backed store for the AI extraction rate limiter.
 * Using a shared Redis store ensures that rate limit counts are persisted
 * and shared across multiple server instances or processes.
 * @type {RedisStore}
 */
const rateLimitStoreExtraction = (redisClient && redisClient.isOpen)
  ? new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:brainstorm:extraction:',
    })
  : undefined;

/**
 * Custom key generator for rate limiting.
 * It prioritizes the authenticated user's ID to ensure the limit is applied
 * per-user, not per-IP, for logged-in users. This prevents a single user
 * from being blocked if they switch networks (IPs).
 * For anonymous (public) users, it falls back to the IP address.
 * @param {import('express').Request} req - The Express request object.
 * @returns {string} The identifier to use for rate limiting (user ID or IP).
 */
const keyGenerator = (req) => {
  // Assumes an authentication middleware (e.g., Passport.js, JWT) attaches
  // a `user` object with an `id` to the request for authenticated endpoints.
  if (req.user && req.user.id) {
    return `user:${req.user.id}`;
  }
  // Fallback for unauthenticated/public requests. `req.ip` is used, which requires
  // Express's 'trust proxy' setting to be configured correctly if behind a reverse proxy.
  return `ip:${req.ip}`;
};

/**
 * Rate limiter for core, expensive AI analysis functions (e.g., analyzeIntent, analyzeIdea).
 * This is a crucial defense against cost runaway from API abuse and DDOS attempts.
 * The limits are set to allow a reasonable brainstorming session for a legitimate user
 * while preventing rapid, automated requests. The limit is applied on a per-user basis
 * for authenticated users, or per-IP for anonymous users.
 *
 * - **Limit**: 100 requests per 15 minutes per user/IP.
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
export const aiAnalysisLimiter = rateLimit({
  store: rateLimitStoreAnalysis,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator,
  message: {
    status: 429,
    message: 'Too many analysis requests. Please wait a while before trying again.',
  },
});

/**
 * A slightly more lenient rate limiter for simpler, faster AI calls (e.g., extractIdea).
 * These calls are less resource-intensive but can still be abused in high volume.
 * This layered approach provides more granular control over resource consumption.
 * The limit is applied on a per-user basis for authenticated users, or per-IP for anonymous users.
 *
 * - **Limit**: 75 requests per 5 minutes per user/IP.
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
export const aiExtractionLimiter = rateLimit({
  store: rateLimitStoreExtraction,
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 75,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: {
    status: 429,
    message: 'Too many requests. Please slow down.',
  },
});

// --- End of Rate Limiting Setup ---

/**
 * The initialized Google Generative AI client instance.
 * Configured with the API key from the application's configuration.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Helper function to escape double quotes in user input for prompt embedding.
 * This prevents prompt injection by ensuring user input doesn't prematurely close
 * string literals within the AI prompt.
 * @param {string} text - The input string to escape.
 * @returns {string} The escaped string.
 */
const escapeQuotes = (text) => {
  if (typeof text !== 'string') {
    return text; // Return as is if not a string (e.g., null, undefined)
  }
  return text.replace(/"/g, '\\"');
};

/**
 * @typedef {object} IntentConstraints
 * @property {string|null} [budget] - Mentioned budget constraint.
 * @property {string|null} [timeline] - Mentioned timeline constraint.
 * @property {string[]} [technology] - Array of specific technologies mentioned.
 * @property {string|null} [targetAudience] - Mentioned target audience.
 */

/**
 * @typedef {object} IntentParameters
 * @property {string|null} brainstormType - The type of brainstorming identified (e.g., 'product_idea').
 * @property {string|null} idea - The extracted core idea or topic from the user message.
 * @property {string|null} technique - The brainstorming technique identified (e.g., 'free_association').
 * @property {string[]} perspectives - An array of perspectives to consider (e.g., ['business', 'user_centric']).
 * @property {string|null} depth - The desired depth level for brainstorming (e.g., 'standard').
 * @property {string[]} focusAreas - An array of specific focus areas (e.g., ['innovation', 'feasibility']).
 * @property {IntentConstraints} constraints - Specific constraints mentioned by the user.
 * @property {string|null} additionalInstructions - Any other specific instructions from the user.
 */

/**
 * @typedef {object} IntentAnalysisResult
 * @property {string} intent - The primary intent identified (e.g., 'generate_ideas').
 * @property {number} confidence - A confidence score for the identified intent (0.0-1.0).
 * @property {IntentParameters} parameters - An object containing extracted parameters for the intent.
 * @property {boolean} needsMoreInfo - True if more information is required from the user.
 * @property {string[]} missingInfo - An array of information still needed if `needsMoreInfo` is true.
 * @property {string} reasoning - A brief explanation for the analysis.
 */

/**
 * @typedef {object} IdeaAnalysisResult
 * @property {string} brainstormType - The categorized type of brainstorming for the idea (e.g., 'product_idea').
 * @property {string} complexity - The estimated complexity level of the idea (e.g., 'moderate').
 * @property {string[]} domains - An array of relevant domains or industries for the idea.
 * @property {string[]} keyThemes - An array of central themes or concepts within the idea.
 * @property {string[]} implicitRequirements - Any unstated but implied requirements for the idea.
 * @property {string[]} suggestedTechniques - Recommended brainstorming techniques for this idea.
 * @property {string[]} recommendedPerspectives - Recommended perspectives to analyze the idea from.
 * @property {string} recommendedDepth - The recommended depth level for exploring this idea.
 * @property {number} estimatedIdeaCount - An estimated number of ideas that might be generated for this topic.
 * @property {string} reasoning - A brief explanation for the analysis.
 */

/**
 * Analyzes a user's message to determine their primary intent, brainstorming type,
 * and extract relevant parameters for a brainstorming session. It leverages a
 * generative AI model to interpret natural language, considering conversation history
 * and already collected parameters.
 *
 * The function aims to be smart about defaults and only ask for more information
 * if the core idea is unclear or critical parameters are missing.
 *
 * @param {string} userMessage - The current message from the user.
 * @param {Array<{role: string, content: string}>} [conversationHistory=[]] - An array of previous messages in the conversation,
 *   each with a 'role' (e.g., 'user', 'model') and 'content'. Used to provide context.
 * @param {object} [existingParams={}] - An object of parameters already collected or inferred from previous interactions.
 *   This helps the AI build upon existing context.
 * @returns {Promise<IntentAnalysisResult>} A promise that resolves to an object containing the analysis result.
 */
const analyzeIntent = async (
  userMessage,
  conversationHistory = [],
  existingParams = {}
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    let historyContext = '';
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-4);
      // Escape content from conversation history to prevent prompt injection
      historyContext =
        '\n\nRecent conversation:\n' +
        recentMessages.map((msg) => `${msg.role}: ${escapeQuotes(msg.content)}`).join('\n');
    }

    let paramsContext = '';
    if (Object.keys(existingParams).length > 0) {
      // Stringify existingParams, assuming it's controlled by the backend or already sanitized.
      // If existingParams could contain user-controlled, unescaped strings, further sanitization would be needed.
      paramsContext = `\n\nAlready collected parameters: ${JSON.stringify(existingParams)}`;
    }

    const prompt = `You are an intent analyzer for a brainstorming assistant. Analyze the user's message and determine:
1. The primary intent (what they want to do)
2. The type of brainstorming needed
3. Any specific parameters mentioned
4. Whether you need more information

**IMPORTANT**: If the user provides a clear idea/topic, DO NOT ask for more information. Use smart defaults for missing parameters. Only set needsMoreInfo=true if the idea itself is completely unclear or missing.

Available intents:
- generate_ideas: User wants new ideas generated
- expand_idea: User wants to expand/elaborate on an idea
- analyze_idea: User wants analysis of an idea
- refine_idea: User wants to improve/refine an idea
- evaluate_idea: User wants evaluation/assessment
- compare_ideas: User wants to compare multiple ideas
- identify_risks: User wants risk analysis
- find_opportunities: User wants opportunity identification
- clarification: User asking questions or needs clarification
- unknown: Cannot determine intent

Brainstorm types:
- product_idea, business_strategy, marketing_campaign, technical_solution, creative_content, problem_solving, process_improvement, general

Techniques:
- scamper, mind_map, six_thinking_hats, swot, five_whys, reverse_brainstorm, brainwriting, free_association, starbursting, role_storming

Perspectives:
- business, technical, creative, user_centric, strategic, operational, financial, competitive

Depth levels:
- quick, standard, deep, comprehensive

Focus areas:
- innovation, feasibility, marketability, scalability, uniqueness, profitability, user_value, sustainability

${historyContext}${paramsContext}

User message: "${escapeQuotes(userMessage)}"

**Guidelines:**
- If user mentions an idea/topic (e.g., "app for pet owners", "fitness platform"), extract it and set needsMoreInfo=false
- Only ask for missing technique, depth, or constraints if user specifically asks for optimization
- Default to free_association technique if not specified
- Default to standard depth if not specified
- Use smart defaults rather than asking for everything

Respond in JSON format only:
{
  "intent": "intent_name",
  "confidence": 0.0-1.0,
  "parameters": {
    "brainstormType": "type or null",
    "idea": "extracted idea text or null",
    "technique": "technique or null",
    "perspectives": ["perspective1", "perspective2"] or [],
    "depth": "depth_level or null",
    "focusAreas": ["area1", "area2"] or [],
    "constraints": {
      "budget": "mentioned budget or null",
      "timeline": "mentioned timeline or null",
      "technology": ["tech1"] or [],
      "targetAudience": "audience or null"
    },
    "additionalInstructions": "any specific instructions or null"
  },
  "needsMoreInfo": false,
  "missingInfo": [],
  "reasoning": "brief explanation"
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let jsonString = text;
    // Attempt to strip common markdown code block wrappers (e.g., ```json ... ```)
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
      jsonString = markdownMatch[1];
    } else {
      // Fallback: try to find the first and last curly braces if no markdown block is found
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonString);
    } catch (parseError) {
      logger.error('Failed to parse AI response as JSON, attempting fallback or throwing:', parseError);
      // If parsing fails even after stripping markdown/regex, it's a critical issue.
      throw new Error('Invalid or unparseable JSON response from AI');
    }

    logger.info('Intent analysis completed', { intent: analysis.intent });

    return analysis;
  } catch (error) {
    logger.error('Error analyzing intent:', error);
    return {
      intent: BRAINSTORM_INTENTS.UNKNOWN,
      confidence: 0.5,
      parameters: {},
      needsMoreInfo: true,
      missingInfo: [
        'Please provide more details about what you want to brainstorm',
      ],
      reasoning: 'Failed to analyze intent',
    };
  }
};

/**
 * Analyzes a given idea text to categorize it, assess its complexity,
 * and suggest relevant brainstorming parameters like techniques, perspectives,
 * and depth levels. It uses a generative AI model to provide a structured
 * breakdown of the idea.
 *
 * @param {string} ideaText - The core idea or topic to be analyzed.
 * @returns {Promise<IdeaAnalysisResult>} A promise that resolves to an object containing the detailed analysis of the idea.
 */
const analyzeIdea = async (ideaText) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    });

    // Escape ideaText to prevent prompt injection
    const prompt = `Analyze the following idea and categorize it:

Idea: "${escapeQuotes(ideaText)}"

Provide analysis in JSON format:
{
  "brainstormType": "product_idea|business_strategy|marketing_campaign|technical_solution|creative_content|problem_solving|process_improvement|general",
  "complexity": "simple|moderate|complex|very_complex",
  "domains": ["domain1", "domain2"],
  "keyThemes": ["theme1", "theme2"],
  "implicitRequirements": ["req1", "req2"],
  "suggestedTechniques": ["technique1", "technique2"],
  "recommendedPerspectives": ["perspective1", "perspective2"],
  "recommendedDepth": "quick|standard|deep|comprehensive",
  "estimatedIdeaCount": number,
  "reasoning": "brief explanation"
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let jsonString = text;
    // Attempt to strip common markdown code block wrappers (e.g., ```json ... ```)
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
      jsonString = markdownMatch[1];
    } else {
      // Fallback: try to find the first and last curly braces if no markdown block is found
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonString);
    } catch (parseError) {
      logger.error('Failed to parse AI response as JSON, attempting fallback or throwing:', parseError);
      throw new Error('Invalid or unparseable JSON response from AI');
    }

    logger.info('Idea analysis completed', { type: analysis.brainstormType });

    return analysis;
  } catch (error) {
    logger.error('Error analyzing idea:', error);
    return {
      brainstormType: BRAINSTORM_TYPES.GENERAL,
      complexity: COMPLEXITY_LEVELS.MODERATE,
      domains: ['general'],
      keyThemes: [],
      implicitRequirements: [],
      suggestedTechniques: [TECHNIQUES.FREE_ASSOCIATION],
      recommendedPerspectives: [
        PERSPECTIVES.BUSINESS,
        PERSPECTIVES.USER_CENTRIC,
      ],
      recommendedDepth: DEPTH_LEVELS.STANDARD,
      estimatedIdeaCount: 20,
      reasoning: 'Default analysis due to error',
    };
  }
};

/**
 * Extracts the core idea statement from a natural language user message.
 * This function aims to isolate the central topic or concept the user wants to brainstorm about.
 *
 * @param {string} userMessage - The user's input message from which to extract the idea.
 * @returns {Promise<string>} A promise that resolves to the extracted core idea as a string.
 *   If extraction fails, it may return the original message or a default.
 */
const extractIdea = async (userMessage) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
      },
    });

    // Escape userMessage to prevent prompt injection
    const prompt = `Extract the core idea from this message. Return ONLY the idea statement, nothing else.

Message: "${escapeQuotes(userMessage)}"

Core idea:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const idea = response.text().trim();

    logger.info('Idea extracted from message');
    return idea;
  } catch (error) {
    logger.error('Error extracting idea:', error);
    return userMessage;
  }
};

/**
 * Determines if a given message or existing parameters contain a sufficiently
 * clear and substantial idea to proceed with brainstorming. It checks for
 * minimum length and the presence of common idea-related keywords.
 *
 * @param {string} message - The current user message to evaluate for an idea.
 * @param {object} [existingParams={}] - An object of parameters already collected, potentially containing an 'idea' field.
 * @param {string} [existingParams.idea] - An existing idea string from previous interactions.
 * @returns {boolean} True if a valid idea is detected, false otherwise.
 */
const hasValidIdea = (message, existingParams = {}) => {
  if (existingParams.idea && existingParams.idea.length >= 10) {
    return true;
  }

  const ideaKeywords = [
    'app',
    'platform',
    'service',
    'product',
    'solution',
    'system',
    'tool',
    'strategy',
    'campaign',
    'process',
    'feature',
    'business',
    'startup',
    'website',
    'software',
  ];

  const lowerMessage = message.toLowerCase();
  const hasKeyword = ideaKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
  const hasLength = message.length >= 15;

  return hasKeyword && hasLength;
};

/**
 * @module ideaAnalyzer
 * @description Provides a set of utility functions for analyzing user input and ideas
 *   using generative AI models, specifically for a brainstorming assistant.
 *   It includes functionalities for intent recognition, detailed idea analysis,
 *   idea extraction, and basic idea validation.
 */
export const ideaAnalyzer = {
  analyzeIntent,
  analyzeIdea,
  extractIdea,
  hasValidIdea,
};

// --- Server Setup & Cloud Run Lifecycle Management ---

/**
 * The Express application instance.
 * @type {import('express').Application}
 */
