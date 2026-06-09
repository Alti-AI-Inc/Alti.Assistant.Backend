import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
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
 * @returns {Promise<object>} A promise that resolves to a JSON object containing structured brainstorm data,
 *   including main ideas, sub-ideas, opportunities, risks, next steps, and a summary.
 * @throws {Error} If there is an error during AI content generation or if the AI response format is invalid.
 */
const generateIdeas = async (params) => {
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
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const brainstormData = JSON.parse(jsonMatch[0]);
    logger.info('Brainstorm ideas generated', {
      mainIdeas: brainstormData.mainIdeas?.length || 0,
      subIdeas: brainstormData.subIdeas?.length || 0,
    });

    return brainstormData;
  } catch (error) {
    logger.error('Error generating brainstorm ideas:', error);
    throw error;
  }
};

/**
 * Applies the SCAMPER technique to a given idea to generate new variations and improvements.
 * SCAMPER is a mnemonic that stands for Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, and Reverse/Rearrange.
 *
 * @async
 * @function applySCAMPER
 * @param {string} idea - The original idea to apply the SCAMPER technique to.
 * @returns {Promise<object>} A promise that resolves to a JSON object with arrays of ideas for each SCAMPER element.
 *   Returns an empty object if an error occurs or the AI response is malformed.
 * @example
 * // Example return:
 * {
 *   "substitute": ["idea1", "idea2"],
 *   "combine": ["idea1", "idea2"],
 *   "adapt": ["idea1", "idea2"],
 *   "modify": ["idea1", "idea2"],
 *   "putToOtherUses": ["idea1", "idea2"],
 *   "eliminate": ["idea1", "idea2"],
 *   "reverse": ["idea1", "idea2"]
 * }
 */
const applySCAMPER = async (idea) => {
  try {
    const model = genAI.getGenerativeModel({
      model: BRAINSTORM_CONFIG.MODEL,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 4096,
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
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (error) {
    logger.error('Error applying SCAMPER:', error);
    return {};
  }
};

/**
 * Performs a SWOT (Strengths, Weaknesses, Opportunities, Threats) analysis for a given idea.
 * This helps in understanding the internal and external factors affecting the idea.
 *
 * @async
 * @function performSWOT
 * @param {string} idea - The idea for which to perform the SWOT analysis.
 * @returns {Promise<object>} A promise that resolves to a JSON object containing the SWOT analysis.
 *   Returns an empty object if an error occurs or the AI response is malformed.
 * @example
 * // Example return:
 * {
 *   "strengths": [{"title": "...", "description": "...", "impact": "high|medium|low"}],
 *   "weaknesses": [{"title": "...", "description": "...", "severity": "high|medium|low"}],
 *   "opportunities": [{"title": "...", "description": "...", "potential": "high|medium|low"}],
 *   "threats": [{"title": "...", "description": "...", "risk": "high|medium|low"}]
 * }
 */
const performSWOT = async (idea) => {
  try {
    const model = genAI.getGenerativeModel({
      model: BRAINSTORM_CONFIG.MODEL,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 3072,
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
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (error) {
    logger.error('Error performing SWOT:', error);
    return {};
  }
};

/**
 * Refines an existing idea based on provided feedback and specific focus areas.
 * It generates improved versions, enhancements, and alternative approaches.
 *
 * @async
 * @function refineIdea
 * @param {string} originalIdea - The original idea to be refined.
 * @param {string} feedback - Feedback or context for refining the idea.
 * @param {string[]} [focusOn=[]] - Specific aspects or areas to focus on during refinement.
 * @returns {Promise<object>} A promise that resolves to a JSON object containing refined ideas,
 *   enhancements, and alternative approaches. Returns an empty object if an error occurs or the AI response is malformed.
 * @example
 * // Example return:
 * {
 *   "refinedIdeas": [
 *     {
 *       "title": "refined version title",
 *       "description": "improved description",
 *       "improvements": ["what was improved"],
 *       "reasoning": "why this refinement is better"
 *     }
 *   ],
 *   "enhancements": [
 *     {
 *       "aspect": "what aspect to enhance",
 *       "suggestion": "specific enhancement",
 *       "impact": "expected impact"
 *     }
 *   ],
 *   "alternativeApproaches": [
 *     {
 *       "approach": "alternative approach",
 *       "description": "description",
 *       "pros": ["pro1"],
 *       "cons": ["con1"]
 *     }
 *   ]
 * }
 */
const refineIdea = async (originalIdea, feedback, focusOn = []) => {
  try {
    const model = genAI.getGenerativeModel({
      model: BRAINSTORM_CONFIG.MODEL,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
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
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (error) {
    logger.error('Error refining idea:', error);
    return {};
  }
};

/**
 * Analyzes a given idea from multiple specified perspectives.
 * For each perspective, it provides key considerations, opportunities, challenges, and recommendations.
 *
 * @async
 * @function analyzeFromPerspectives
 * @param {string} idea - The idea to be analyzed.
 * @param {string[]} perspectives - An array of perspectives to analyze the idea from (e.g., 'business', 'technical', 'user').
 * @returns {Promise<object>} A promise that resolves to a JSON object where keys are perspectives
 *   and values are objects containing considerations, opportunities, challenges, and recommendations for that perspective.
 *   Returns an empty object if an error occurs or the AI response is malformed.
 * @example
 * // Example return:
 * {
 *   "business": {
 *     "considerations": ["..."],
 *     "opportunities": ["..."],
 *     "challenges": ["..."],
 *     "recommendations": ["..."]
 *   },
 *   "technical": {
 *     "considerations": ["..."],
 *     "opportunities": ["..."],
 *     "challenges": ["..."],
 *     "recommendations": ["..."]
 *   }
 * }
 */
const analyzeFromPerspectives = async (idea, perspectives) => {
  try {
    const model = genAI.getGenerativeModel({
      model: BRAINSTORM_CONFIG.MODEL,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 4096,
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
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (error) {
    logger.error('Error analyzing perspectives:', error);
    return {};
  }
};

/**
 * @typedef {object} BrainstormEngine
 * @property {function(object): Promise<object>} generateIdeas - Function to generate brainstorm ideas.
 * @property {function(string): Promise<object>} applySCAMPER - Function to apply the SCAMPER technique.
 * @property {function(string): Promise<object>} performSWOT - Function to perform a SWOT analysis.
 * @property {function(string, string, string[]): Promise<object>} refineIdea - Function to refine an existing idea.
 * @property {function(string, string[]): Promise<object>} analyzeFromPerspectives - Function to analyze an idea from multiple perspectives.
 */

/**
 * Exports a collection of functions related to brainstorming and idea generation.
 * These functions leverage Google Generative AI to assist with various stages of the brainstorming process.
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