import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
// CRITICAL INTEGRATION: Import services for usage tracking and custom error handling.
import { usageService } from '../../../../services/usageService.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import {
  BRAINSTORM_CONFIG,
  TECHNIQUES,
  PERSPECTIVES,
  DEPTH_LEVELS,
  DEFAULT_PARAMS,
  SYSTEM_PROMPTS,
  TECHNIQUE_DESCRIPTIONS,
} from '../brainstorm.constant.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generates creative brainstorm ideas based on a given concept and various parameters.
 * It leverages the Google Generative AI model to produce structured brainstorm output.
 *
 * @async
 * @function generateIdeas
 * @param {object} params - The parameters for generating ideas.
 * @param {string} params.idea - The core idea or concept to brainstorm around.
 * @param {string} params.brainstormType - The type of brainstorm (e.g., "product feature", "marketing campaign").
 * @param {string} [params.technique=TECHNIQUES.FREE_ASSOCIATION] - The brainstorming technique to use (e.g., 'SCAMPER', 'Mind Mapping').
 * @param {string[]} [params.perspectives=[PERSPECTIVES.BUSINESS, PERSPECTIVES.USER_CENTRIC]] - An array of perspectives to analyze the idea from (e.g., 'Business', 'User-Centric', 'Technical').
 * @param {string} [params.depth=DEPTH_LEVELS.STANDARD] - The desired depth of the brainstorm, influencing the number of ideas generated ('Shallow', 'Standard', 'Deep').
 * @param {string[]} [params.focusAreas=[]] - Specific areas or themes to prioritize during brainstorming.
 * @param {object} [params.constraints={}] - An object defining various constraints for the ideas.
 * @param {string} [params.constraints.budget] - Budget constraints (e.g., "$10,000").
 * @param {string} [params.constraints.timeline] - Timeline constraints (e.g., "3 months").
 * @param {string[]} [params.constraints.technology] - Specific technologies to consider or avoid.
 * @param {string} [params.constraints.targetAudience] - The target audience for the ideas.
 * @param {string} [params.constraints.industry] - The industry context for the ideas.
 * @param {string[]} [params.constraints.competitors] - Competitors to consider.
 * @param {string} [params.additionalInstructions=''] - Any additional instructions or context for the AI.
 * @param {object} context - CRITICAL INTEGRATION: The user and tenant context for the request.
 * @param {object} context.user - The user making the request.
 * @param {object} context.workspace - The workspace the request belongs to.
 * @returns {Promise<object>} A promise that resolves to a JSON object containing structured brainstorm data.
 * @throws {AppError} If context is missing, limits are exceeded, or an internal error occurs.
 */
const generateIdeas = async (params, context) => {
  // CRITICAL INTEGRATION: Validate that the request has proper user and workspace context.
  if (!context || !context.user || !context.workspace) {
    // This check prevents unauthenticated or context-less access to the AI service.
    throw new AppError('Unauthorized: Missing user or workspace context.', 401);
  }

  try {
    const {
      idea,
      brainstormType,
      technique = TECHNIQUES.FREE_ASSOCIATION,
      perspectives = [PERSPECTIVES.BUSINESS, PERSPECTIVES.USER_CENTRIC],
      depth = DEPTH_LEVELS.STANDARD,
      focusAreas = [],
      constraints = {},
      additionalInstructions = '',
    } = params;

    const ideaCount = DEFAULT_PARAMS.ideaCount[depth] || 20;

    const model = genAI.getGenerativeModel({
      model: BRAINSTORM_CONFIG.MODEL,
      generationConfig: {
        temperature: BRAINSTORM_CONFIG.TEMPERATURE,
        maxOutputTokens: BRAINSTORM_CONFIG.MAX_OUTPUT_TOKENS,
        // BUG FIX & SECURITY: Enforce JSON output from the model for reliability and to mitigate prompt injection.
        responseMimeType: 'application/json',
      },
    });

    const techniqueInfo =
      TECHNIQUE_DESCRIPTIONS[technique] ||
      TECHNIQUE_DESCRIPTIONS[TECHNIQUES.FREE_ASSOCIATION];

    let constraintsText = '';
    if (Object.keys(constraints).length > 0) {
      constraintsText = '\n\nConsider these constraints:\n';
      if (constraints.budget)
        constraintsText += `- Budget: ${constraints.budget}\n`;
      if (constraints.timeline)
        constraintsText += `- Timeline: ${constraints.timeline}\n`;
      if (constraints.technology?.length)
        constraintsText += `- Technology: ${constraints.technology.join(', ')}\n`;
      if (constraints.targetAudience)
        constraintsText += `- Target Audience: ${constraints.targetAudience}\n`;
      if (constraints.industry)
        constraintsText += `- Industry: ${constraints.industry}\n`;
      if (constraints.competitors?.length)
        constraintsText += `- Competitors: ${constraints.competitors.join(', ')}\n`;
    }

    let focusText = '';
    if (focusAreas.length > 0) {
      focusText = `\n\nPrioritize these focus areas: ${focusAreas.join(', ')}`;
    }

    const prompt = `${SYSTEM_PROMPTS.MAIN_ASSISTANT}

Task: Generate creative brainstorm ideas for the following concept.

Original Idea: ${idea}

Brainstorm Type: ${brainstormType}
Technique: ${techniqueInfo.name} - ${techniqueInfo.description}
Analyze from these perspectives: ${perspectives.join(', ')}
Depth Level: ${depth} (generate approximately ${ideaCount} ideas)${constraintsText}${focusText}

${additionalInstructions ? `Additional Instructions: ${additionalInstructions}\n` : ''}

Generate a comprehensive brainstorm response in the following JSON structure:
{
  "mainIdeas": [
    {
      "id": number,
      "title": "concise title",
      "description": "detailed description",
      "category": "category name",
      "reasoning": "why this idea works",
      "perspective": "which perspective this represents",
      "priority": "high|medium|low"
    }
  ],
  "subIdeas": [
    {
      "id": number,
      "parentId": number,
      "title": "title",
      "description": "brief description"
    }
  ],
  "opportunities": [
    {
      "title": "opportunity title",
      "description": "description",
      "impact": "high|medium|low"
    }
  ],
  "risks": [
    {
      "title": "risk title",
      "description": "description",
      "severity": "high|medium|low",
      "mitigation": "how to address"
    }
  ],
  "nextSteps": [
    "actionable next step 1",
    "actionable next step 2"
  ],
  "summary": "brief summary of the brainstorm session"
}

Be creative, specific, and actionable. Generate at least ${ideaCount} ideas across mainIdeas and subIdeas combined.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // CRITICAL INTEGRATION: Track token usage against workspace/user limits before returning the response.
    // This call will throw an AppError if limits are exceeded, which is caught and handled below.
    if (response.usageMetadata) {
      await usageService.trackAndVerify({
        workspaceId: context.workspace.id,
        userId: context.user.id,
        feature: 'brainstorm_generate',
        tokens: {
          prompt: response.usageMetadata.promptTokenCount,
          completion: response.usageMetadata.candidatesTokenCount,
          total: response.usageMetadata.totalTokenCount,
        },
      });
    }

    const text = response.text();
    // BUG FIX: Replaced fragile regex with direct JSON.parse, enabled by responseMimeType.
    const brainstormData = JSON.parse(text);

    logger.info('Brainstorm ideas generated successfully', {
      // INTEGRATION: Add context to logs for better traceability.
      workspaceId: context.workspace.id,
      userId: context.user.id,
      mainIdeas: brainstormData.mainIdeas?.length || 0,
      subIdeas: brainstormData.subIdeas?.length || 0,
    });

    return brainstormData;
  } catch (error) {
    // CRITICAL INTEGRATION & BUG FIX: Differentiate between application errors (like limits) and system errors.
    if (error instanceof AppError) {
      throw error; // Re-throw application errors (e.g., LimitExceededError) to be handled by the controller.
    }
    logger.error('Error generating brainstorm ideas:', {
      // INTEGRATION: Add context to error logs for faster debugging.
      workspaceId: context?.workspace?.id,
      userId: context?.user?.id,
      error: error.message,
    });
    // BUG FIX: Throw a generic, safe error to the client instead of leaking implementation details.
    throw new AppError('Failed to generate brainstorm ideas due to an internal error.', 500);
  }
};

/**
 * Applies the SCAMPER technique to a given idea to generate new variations and improvements.
 *
 * @async
 * @function applySCAMPER
 * @param {string} idea - The original idea to apply the SCAMPER technique to.
 * @param {object} context - CRITICAL INTEGRATION: The user and tenant context for the request.
 * @returns {Promise<object>} A promise that resolves to a JSON object with arrays of ideas for each SCAMPER element.
 * @throws {AppError} If context is missing, limits are exceeded, or an internal error occurs.
 */
const applySCAMPER = async (idea, context) => {
  // CRITICAL INTEGRATION: Validate that the request has proper user and workspace context.
  if (!context || !context.user || !context.workspace) {
    throw new AppError('Unauthorized: Missing user or workspace context.', 401);
  }

  try {
    const model = genAI.getGenerativeModel({
      model: BRAINSTORM_CONFIG.MODEL,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 4096,
        // BUG FIX & SECURITY: Enforce JSON output.
        responseMimeType: 'application/json',
      },
    });

    const prompt = `Apply the SCAMPER technique to this idea:

Idea: ${idea}

SCAMPER stands for:
- Substitute: What can be substituted?
- Combine: What can be combined?
- Adapt: What can be adapted?
- Modify: What can be modified/magnified/minimized?
- Put to other uses: What other uses?
- Eliminate: What can be eliminated?
- Reverse/Rearrange: What can be reversed or rearranged?

Generate ideas for each SCAMPER element. Return JSON:
{
  "substitute": ["idea1", "idea2"],
  "combine": ["idea1", "idea2"],
  "adapt": ["idea1", "idea2"],
  "modify": ["idea1", "idea2"],
  "putToOtherUses": ["idea1", "idea2"],
  "eliminate": ["idea1", "idea2"],
  "reverse": ["idea1", "idea2"]
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // CRITICAL INTEGRATION: Track token usage.
    if (response.usageMetadata) {
      await usageService.trackAndVerify({
        workspaceId: context.workspace.id,
        userId: context.user.id,
        feature: 'brainstorm_scamper',
        tokens: {
          prompt: response.usageMetadata.promptTokenCount,
          completion: response.usageMetadata.candidatesTokenCount,
          total: response.usageMetadata.totalTokenCount,
        },
      });
    }

    const text = response.text();
    // BUG FIX: Replaced fragile regex with direct JSON.parse.
    return JSON.parse(text);
  } catch (error) {
    // BUG FIX: Proper error handling. Do not swallow errors by returning {}.
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Error applying SCAMPER:', {
      workspaceId: context?.workspace?.id,
      userId: context?.user?.id,
      error: error.message,
    });
    throw new AppError('Failed to apply SCAMPER due to an internal error.', 500);
  }
};

/**
 * Performs a SWOT (Strengths, Weaknesses, Opportunities, Threats) analysis for a given idea.
 *
 * @async
 * @function performSWOT
 * @param {string} idea - The idea for which to perform the SWOT analysis.
 * @param {object} context - CRITICAL INTEGRATION: The user and tenant context for the request.
 * @returns {Promise<object>} A promise that resolves to a JSON object containing the SWOT analysis.
 * @throws {AppError} If context is missing, limits are exceeded, or an internal error occurs.
 */
const performSWOT = async (idea, context) => {
  // CRITICAL INTEGRATION: Validate that the request has proper user and workspace context.
  if (!context || !context.user || !context.workspace) {
    throw new AppError('Unauthorized: Missing user or workspace context.', 401);
  }

  try {
    const model = genAI.getGenerativeModel({
      model: BRAINSTORM_CONFIG.MODEL,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 3072,
        // BUG FIX & SECURITY: Enforce JSON output.
        responseMimeType: 'application/json',
      },
    });

    const prompt = `Perform a SWOT analysis for this idea:

Idea: ${idea}

Analyze:
- Strengths: Internal positive attributes
- Weaknesses: Internal limitations
- Opportunities: External favorable conditions
- Threats: External challenges

Return JSON:
{
  "strengths": [{"title": "...", "description": "...", "impact": "high|medium|low"}],
  "weaknesses": [{"title": "...", "description": "...", "severity": "high|medium|low"}],
  "opportunities": [{"title": "...", "description": "...", "potential": "high|medium|low"}],
  "threats": [{"title": "...", "description": "...", "risk": "high|medium|low"}]
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // CRITICAL INTEGRATION: Track token usage.
    if (response.usageMetadata) {
      await usageService.trackAndVerify({
        workspaceId: context.workspace.id,
        userId: context.user.id,
        feature: 'brainstorm_swot',
        tokens: {
          prompt: response.usageMetadata.promptTokenCount,
          completion: response.usageMetadata.candidatesTokenCount,
          total: response.usageMetadata.totalTokenCount,
        },
      });
    }

    const text = response.text();
    // BUG FIX: Replaced fragile regex with direct JSON.parse.
    return JSON.parse(text);
  } catch (error) {
    // BUG FIX: Proper error handling. Do not swallow errors by returning {}.
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Error performing SWOT:', {
      workspaceId: context?.workspace?.id,
      userId: context?.user?.id,
      error: error.message,
    });
    throw new AppError('Failed to perform SWOT analysis due to an internal error.', 500);
  }
};

/**
 * Refines an existing idea based on provided feedback and specific focus areas.
 *
 * @async
 * @function refineIdea
 * @param {string} originalIdea - The original idea to be refined.
 * @param {string} feedback - Feedback or context for refining the idea.
 * @param {string[]} [focusOn=[]] - Specific aspects or areas to focus on during refinement.
 * @param {object} context - CRITICAL INTEGRATION: The user and tenant context for the request.
 * @returns {Promise<object>} A promise that resolves to a JSON object containing refined ideas.
 * @throws {AppError} If context is missing, limits are exceeded, or an internal error occurs.
 */
const refineIdea = async (originalIdea, feedback, focusOn = [], context) => {
  // CRITICAL INTEGRATION: Validate that the request has proper user and workspace context.
  if (!context || !context.user || !context.workspace) {
    throw new AppError('Unauthorized: Missing user or workspace context.', 401);
  }

  try {
    const model = genAI.getGenerativeModel({
      model: BRAINSTORM_CONFIG.MODEL,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        // BUG FIX & SECURITY: Enforce JSON output.
        responseMimeType: 'application/json',
      },
    });

    let focusText = '';
    if (focusOn.length > 0) {
      focusText = `\n\nFocus refinement on: ${focusOn.join(', ')}`;
    }

    const prompt = `${SYSTEM_PROMPTS.IDEA_REFINER}

Original Idea: ${originalIdea}

Feedback/Context: ${feedback}${focusText}

Provide refined ideas and improvements in JSON format:
{
  "refinedIdeas": [
    {
      "title": "refined version title",
      "description": "improved description",
      "improvements": ["what was improved"],
      "reasoning": "why this refinement is better"
    }
  ],
  "enhancements": [
    {
      "aspect": "what aspect to enhance",
      "suggestion": "specific enhancement",
      "impact": "expected impact"
    }
  ],
  "alternativeApproaches": [
    {
      "approach": "alternative approach",
      "description": "description",
      "pros": ["pro1"],
      "cons": ["con1"]
    }
  ]
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // CRITICAL INTEGRATION: Track token usage.
    if (response.usageMetadata) {
      await usageService.trackAndVerify({
        workspaceId: context.workspace.id,
        userId: context.user.id,
        feature: 'brainstorm_refine',
        tokens: {
          prompt: response.usageMetadata.promptTokenCount,
          completion: response.usageMetadata.candidatesTokenCount,
          total: response.usageMetadata.totalTokenCount,
        },
      });
    }

    const text = response.text();
    // BUG FIX: Replaced fragile regex with direct JSON.parse.
    return JSON.parse(text);
  } catch (error) {
    // BUG FIX: Proper error handling. Do not swallow errors by returning {}.
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Error refining idea:', {
      workspaceId: context?.workspace?.id,
      userId: context?.user?.id,
      error: error.message,
    });
    throw new AppError('Failed to refine idea due to an internal error.', 500);
  }
};

/**
 * Analyzes a given idea from multiple specified perspectives.
 *
 * @async
 * @function analyzeFromPerspectives
 * @param {string} idea - The idea to be analyzed.
 * @param {string[]} perspectives - An array of perspectives to analyze the idea from.
 * @param {object} context - CRITICAL INTEGRATION: The user and tenant context for the request.
 * @returns {Promise<object>} A promise that resolves to a JSON object with analysis for each perspective.
 * @throws {AppError} If context is missing, limits are exceeded, or an internal error occurs.
 */
const analyzeFromPerspectives = async (idea, perspectives, context) => {
  // CRITICAL INTEGRATION: Validate that the request has proper user and workspace context.
  if (!context || !context.user || !context.workspace) {
    throw new AppError('Unauthorized: Missing user or workspace context.', 401);
  }

  try {
    const model = genAI.getGenerativeModel({
      model: BRAINSTORM_CONFIG.MODEL,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 4096,
        // BUG FIX & SECURITY: Enforce JSON output.
        responseMimeType: 'application/json',
      },
    });

    const prompt = `Analyze this idea from multiple perspectives:

Idea: ${idea}

Perspectives to analyze: ${perspectives.join(', ')}

For each perspective, provide:
- Key considerations
- Opportunities
- Challenges
- Recommendations

Return JSON with perspective as keys:
{
  "business": {
    "considerations": ["..."],
    "opportunities": ["..."],
    "challenges": ["..."],
    "recommendations": ["..."]
  },
  "technical": {...},
  ...
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // CRITICAL INTEGRATION: Track token usage.
    if (response.usageMetadata) {
      await usageService.trackAndVerify({
        workspaceId: context.workspace.id,
        userId: context.user.id,
        feature: 'brainstorm_perspectives',
        tokens: {
          prompt: response.usageMetadata.promptTokenCount,
          completion: response.usageMetadata.candidatesTokenCount,
          total: response.usageMetadata.totalTokenCount,
        },
      });
    }

    const text = response.text();
    // BUG FIX: Replaced fragile regex with direct JSON.parse.
    return JSON.parse(text);
  } catch (error) {
    // BUG FIX: Proper error handling. Do not swallow errors by returning {}.
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Error analyzing perspectives:', {
      workspaceId: context?.workspace?.id,
      userId: context?.user?.id,
      error: error.message,
    });
    throw new AppError('Failed to analyze perspectives due to an internal error.', 500);
  }
};

/**
 * @typedef {object} BrainstormEngine
 * @property {function(object, object): Promise<object>} generateIdeas - Function to generate brainstorm ideas.
 * @property {function(string, object): Promise<object>} applySCAMPER - Function to apply the SCAMPER technique.
 * @property {function(string, object): Promise<object>} performSWOT - Function to perform a SWOT analysis.
 * @property {function(string, string, string[], object): Promise<object>} refineIdea - Function to refine an existing idea.
 * @property {function(string, string[], object): Promise<object>} analyzeFromPerspectives - Function to analyze an idea from multiple perspectives.
 */

/**
 * Exports a collection of functions related to brainstorming and idea generation.
 * These functions are integrated with the application's security and usage tracking context.
 *
 * @type {BrainstormEngine}
 */
export const brainstormEngine = {
  generateIdeas,
  applySCAMPER,
  performSWOT,
  refineIdea,
  analyzeFromPerspectives,
};