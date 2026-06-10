import { GoogleGenerativeAI } from '@google/generative-ai';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import redisClient from '../../../../shared/redis/redis.client.js';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  SYSTEM_PROMPTS,
  PLAN_GENERATOR_CONFIG,
  BRAINSTORM_ASPECTS,
} from '../plan_generator.constant.js';

// Enterprise Rate-Limiting & DDOS Guard Agent AI: Configuration
// Rate limiters are configured to protect expensive AI generation endpoints from abuse,
// DDOS attacks, and excessive cost. Limits are applied per user ID or IP address.
const rateLimiterOptions = {
  storeClient: redisClient,
  points: 10, // Default points
  duration: 60 * 60, // 1 hour in seconds
  blockDuration: 60 * 60, // Block for 1 hour
};

// Limiter for the comprehensive 'generateBrainstorm' function.
// Allows 10 requests per hour per user/IP. This is a costly operation.
const brainstormLimiter = new RateLimiterRedis({
  ...rateLimiterOptions,
  keyPrefix: 'rate_limit_brainstorm',
  points: 10,
});

// Limiter for the 'generateSWOT' function.
// Allows a higher rate of 30 requests per hour as it's a less intensive operation.
const swotLimiter = new RateLimiterRedis({
  ...rateLimiterOptions,
  keyPrefix: 'rate_limit_swot',
  points: 30,
});

/**
 * @constant {GoogleGenerativeAI} genAI
 * @description An instance of the Google Generative AI client, initialized with the secret key from the configuration.
 * This client is used to interact with the Gemini models.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generates a comprehensive brainstorming analysis for a given idea using a generative AI model.
 * This function constructs a detailed prompt including the idea, a pre-computed analysis, and requested aspects,
 * then calls the AI to get insights on SWOT, resource needs, and timelines.
 *
 * @async
 * @param {string} limiterKey - A unique identifier for the user or IP address to enforce rate limits.
 * @param {string} ideaText - The core idea or concept to be brainstormed.
 * @param {object} analysis - An object containing a pre-computed analysis of the idea.
 * @param {string} analysis.plan_type - The type of plan (e.g., 'Business Plan', 'Project Plan').
 * @param {string} analysis.complexity - The estimated complexity of the idea (e.g., 'High', 'Medium', 'Low').
 * @param {string[]} analysis.domains - An array of relevant domains (e.g., ['Technology', 'Marketing']).
 * @param {string[]} analysis.key_concepts - An array of key concepts identified in the idea.
 * @param {string[]} [requestedAspects=[]] - An optional array of specific aspects to focus on (from `BRAINSTORM_ASPECTS`). If empty, a default set is used.
 * @param {object} [contextData={}] - Optional additional context data, such as constraints.
 * @param {object} [contextData.constraints] - Specific constraints to consider during brainstorming.
 * @returns {Promise<object>} A promise that resolves to a structured JSON object containing the brainstorming results, including SWOT analysis, resource needs, timeline estimation, and key insights.
 * @throws {Error} Throws an error if the AI model fails to generate a response, if the response cannot be parsed into valid JSON, or if the rate limit is exceeded.
 */
export const generateBrainstorm = async (
  limiterKey,
  ideaText,
  analysis,
  requestedAspects = [],
  contextData = {}
) => {
  try {
    // Enterprise Rate-Limiting & DDOS Guard Agent AI: Enforcement
    // Consume one point for this operation. Throws an error if the limit is exceeded.
    await brainstormLimiter.consume(limiterKey);
  } catch (rateLimiterRes) {
    // If the error is not from the rate limiter, re-throw it.
    if (rateLimiterRes instanceof Error) {
      logger.error('Unexpected error during rate limit check:', rateLimiterRes);
      throw rateLimiterRes;
    }
    // Otherwise, throw a specific 429 Too Many Requests error.
    const err = new Error(
      'Too many brainstorm requests. Please try again in an hour.'
    );
    err.status = 429;
    throw err;
  }

  try {
    console.log('Starting brainstorming session:', {
      ideaLength: ideaText.length,
      aspects: requestedAspects.length,
    });

    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    // Determine which aspects to brainstorm - REDUCED for speed
    const aspects =
      requestedAspects.length > 0
        ? requestedAspects
        : [
            BRAINSTORM_ASPECTS.SWOT_ANALYSIS,
            BRAINSTORM_ASPECTS.RESOURCE_NEEDS,
            BRAINSTORM_ASPECTS.TIMELINE_ESTIMATION,
          ];

    const brainstormPrompt = `${SYSTEM_PROMPTS.BRAINSTORMING}

Idea: "${ideaText}"

Analysis Summary:
- Plan Type: ${analysis.plan_type}
- Complexity: ${analysis.complexity}
- Domains: ${analysis.domains.join(', ')}
- Key Concepts: ${analysis.key_concepts.join(', ')}

${contextData.constraints ? `Constraints: ${JSON.stringify(contextData.constraints)}` : ''}

Provide a CONCISE brainstorming analysis with these aspects:
${aspects.map((aspect) => `- ${aspect.replace(/_/g, ' ')}`).join('\n')}

Return ONLY this simplified JSON (keep it brief - max 3-5 items per array):
{
  "swot_analysis": {
    "strengths": ["<3-5 key strengths>"],
    "weaknesses": ["<3-5 key weaknesses>"],
    "opportunities": ["<3-5 key opportunities>"],
    "threats": ["<3-5 key threats>"]
  },
  "resource_needs": {
    "budget_estimate": "<rough range>",
    "key_roles": ["<3-5 essential roles>"],
    "essential_tools": ["<3-5 must-have tools>"]
  },
  "timeline_estimation": {
    "phases": [
      {"name": "<phase>", "duration": "<time>"}
    ],
    "total_duration": "<estimated total>"
  },
  "key_insights": ["<3-5 critical insights>"]
}

Only return valid JSON, no additional text. Keep responses concise.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: brainstormPrompt }] }],
      generationConfig: {
        temperature: PLAN_GENERATOR_CONFIG.TEMPERATURE_BRAINSTORM,
        maxOutputTokens: PLAN_GENERATOR_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const response = result.response;
    const brainstormText = response.text();
    console.log('Brainstorm Response Text:', brainstormText);
    // Extract JSON from response
    const jsonMatch = brainstormText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from brainstorm');
    }

    const brainstorm = JSON.parse(jsonMatch);

    logger.info('Brainstorming completed successfully');

    return brainstorm;
  } catch (error) {
    // Do not wrap rate limit errors, they are already handled.
    if (error.status === 429) {
      throw error;
    }
    logger.error('Error generating brainstorm:', error);
    throw error;
  }
};

/**
 * Generates a quick SWOT (Strengths, Weaknesses, Opportunities, Threats) analysis for a given idea.
 * This is a focused version of the main brainstormer, intended for rapid analysis.
 *
 * @async
 * @param {string} limiterKey - A unique identifier for the user or IP address to enforce rate limits.
 * @param {string} ideaText - The idea or concept to analyze.
 * @returns {Promise<object|null>} A promise that resolves to a JSON object with `strengths`, `weaknesses`, `opportunities`, and `threats` arrays. Returns `null` if an error occurs during generation or parsing. Throws an error if rate limit is exceeded.
 */
export const generateSWOT = async (limiterKey, ideaText) => {
  try {
    // Enterprise Rate-Limiting & DDOS Guard Agent AI: Enforcement
    // Consume one point for this operation. Throws an error if the limit is exceeded.
    await swotLimiter.consume(limiterKey);
  } catch (rateLimiterRes) {
    // If the error is not from the rate limiter, re-throw it.
    if (rateLimiterRes instanceof Error) {
      logger.error('Unexpected error during rate limit check:', rateLimiterRes);
      throw rateLimiterRes;
    }
    // Otherwise, throw a specific 429 Too Many Requests error.
    const err = new Error(
      'Too many SWOT requests. Please try again in an hour.'
    );
    err.status = 429;
    throw err;
  }

  try {
    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const prompt = `Perform a quick SWOT analysis for this idea:

"${ideaText}"

Return only JSON:
{
  "strengths": ["<array>"],
  "weaknesses": ["<array>"],
  "opportunities": ["<array>"],
  "threats": ["<array>"]
}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const response = result.response.text();
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (error) {
    // Do not wrap rate limit errors, they are already handled.
    if (error.status === 429) {
      throw error;
    }
    logger.error('Error generating SWOT:', error);
    return null;
  }
};

/**
 * Identifies and categorizes stakeholders based on the brainstorming output.
 * It processes the stakeholder list from the brainstorm data and sorts them into primary, secondary, internal, and external groups.
 *
 * @param {object} brainstorm - The brainstorming result object, typically from `generateBrainstorm`.
 * @param {object} [brainstorm.stakeholder_mapping] - An object containing stakeholder lists.
 * @param {string[]} [brainstorm.stakeholder_mapping.primary_stakeholders] - List of primary stakeholders.
 * @param {string[]} [brainstorm.stakeholder_mapping.secondary_stakeholders] - List of secondary stakeholders.
 * @param {object} analysis - The pre-computed analysis object (currently unused in this function but kept for future compatibility).
 * @returns {object} An object containing categorized stakeholder lists: `primary`, `secondary`, `internal`, and `external`.
 */
export const identifyStakeholders = (brainstorm, analysis) => {
  const stakeholders = {
    primary: brainstorm.stakeholder_mapping?.primary_stakeholders || [],
    secondary: brainstorm.stakeholder_mapping?.secondary_stakeholders || [],
    internal: [],
    external: [],
  };

  // Categorize stakeholders
  const allStakeholders = [...stakeholders.primary, ...stakeholders.secondary];

  allStakeholders.forEach((stakeholder) => {
    const lowerStakeholder = stakeholder.toLowerCase();
    if (
      lowerStakeholder.includes('team') ||
      lowerStakeholder.includes('employee') ||
      lowerStakeholder.includes('management') ||
      lowerStakeholder.includes('developer') ||
      lowerStakeholder.includes('designer')
    ) {
      stakeholders.internal.push(stakeholder);
    } else {
      stakeholders.external.push(stakeholder);
    }
  });

  return stakeholders;
};

/**
 * Defines success metrics based on the brainstorming output.
 * It extracts Key Performance Indicators (KPIs) and milestones. If none are provided by the AI, it populates the list with sensible defaults.
 *
 * @param {object} brainstorm - The brainstorming result object from `generateBrainstorm`.
 * @param {object} [brainstorm.success_metrics] - An object containing success metrics.
 * @param {object[]} [brainstorm.success_metrics.kpis] - An array of Key Performance Indicators.
 * @param {string[]} [brainstorm.success_metrics.milestones] - An array of project milestones.
 * @param {string} planType - The type of plan (currently unused but kept for future compatibility).
 * @returns {object} An object containing `kpis`, `milestones`, `measurement_frequency`, and `review_cycle`.
 */
export const defineSuccessMetrics = (brainstorm, planType) => {
  const metrics = {
    kpis: brainstorm.success_metrics?.kpis || [],
    milestones: brainstorm.success_metrics?.milestones || [],
    measurement_frequency: 'weekly',
    review_cycle: 'monthly',
  };

  // Add default metrics if none provided
  if (metrics.kpis.length === 0) {
    metrics.kpis = [
      {
        metric: 'Project Completion Rate',
        target: '100%',
        measurement: 'Track completed tasks vs total tasks',
      },
      {
        metric: 'Budget Adherence',
        target: 'Within 10% of budget',
        measurement: 'Actual spend vs budgeted amount',
      },
      {
        metric: 'Timeline Adherence',
        target: 'On schedule',
        measurement: 'Actual completion date vs planned date',
      },
    ];
  }

  return metrics;
};

/**
 * Estimates resource requirements based on the brainstorming output.
 * It extracts budget, team, tools, infrastructure, and timeline information.
 *
 * @param {object} brainstorm - The brainstorming result object from `generateBrainstorm`.
 * @param {object} [brainstorm.resource_needs] - An object detailing resource needs.
 * @param {string} [brainstorm.resource_needs.budget_estimate] - A string describing the estimated budget.
 * @param {string[]} [brainstorm.resource_needs.team_composition] - An array of required team roles.
 * @param {string[]} [brainstorm.resource_needs.tools_and_technology] - An array of necessary tools.
 * @param {string[]} [brainstorm.resource_needs.infrastructure] - An array of infrastructure requirements.
 * @param {object} [brainstorm.timeline_estimation] - An object detailing the estimated timeline.
 * @param {string} [brainstorm.timeline_estimation.total_duration] - A string describing the total project duration.
 * @param {string} complexity - The estimated complexity of the project (currently unused but kept for future compatibility).
 * @returns {object} An object containing estimated `budget`, `team`, `tools`, `infrastructure`, and `timeline`.
 */
export const estimateResources = (brainstorm, complexity) => {
  const resources = {
    budget: brainstorm.resource_needs?.budget_estimate || 'To be determined',
    team: brainstorm.resource_needs?.team_composition || [],
    tools: brainstorm.resource_needs?.tools_and_technology || [],
    infrastructure: brainstorm.resource_needs?.infrastructure || [],
    timeline:
      brainstorm.timeline_estimation?.total_duration || 'To be determined',
  };

  return resources;
};

/**
 * @constant {object} brainstormEngine
 * @description A service object that encapsulates all functions related to brainstorming and analyzing an idea.
 * This engine uses a generative AI to produce insights and then processes that data into a structured format.
 * @property {function} generateBrainstorm - Generates a comprehensive brainstorming analysis.
 * @property {function} generateSWOT - Generates a quick SWOT analysis.
 * @property {function} identifyStakeholders - Identifies and categorizes project stakeholders.
 * @property {function} defineSuccessMetrics - Defines success metrics and KPIs.
 * @property {function} estimateResources - Estimates required resources like budget, team, and tools.
 */
export const brainstormEngine = {
  generateBrainstorm,
  generateSWOT,
  identifyStakeholders,
  defineSuccessMetrics,
  estimateResources,
};