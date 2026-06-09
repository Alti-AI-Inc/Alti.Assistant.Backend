import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  SYSTEM_PROMPTS,
  PLAN_GENERATOR_CONFIG,
  PLAN_SECTIONS,
} from '../plan_generator.constant.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Refines a specific section of a given plan based on a refinement request using a generative AI model.
 * The AI attempts to update the specified section while maintaining its original JSON structure.
 *
 * @param {object} plan - The overall plan object containing various sections.
 * @param {string} section - The name of the section to refine (e.g., 'phases', 'resources', 'introduction').
 * @param {string} refinementRequest - The specific request or instruction for refinement (e.g., "Make this section more detailed", "Adjust the timeline in this phase").
 * @param {object} [context={}] - Optional additional context for the refinement. Currently not directly used in the prompt but can be extended.
 * @returns {Promise<object>} A promise that resolves to the refined section object.
 * @throws {Error} If the specified section is not found in the plan, if the AI response does not contain valid JSON, or if the AI generation fails.
 */
export const refineSection = async (
  plan,
  section,
  refinementRequest,
  context = {}
) => {
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
    const refinedText = response.text();

    // Extract JSON from response
    const jsonMatch = refinedText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from refinement');
    }

    const refinedSection = JSON.parse(jsonMatch[0]);

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
 * @returns {Promise<object>} A promise that resolves to the adjusted plan object.
 * @throws {Error} If the AI response does not contain valid JSON or if the AI generation fails.
 */
export const adjustForConstraints = async (plan, newConstraints) => {
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
    const adjustedText = response.text();

    // Extract JSON from response
    const jsonMatch = adjustedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from adjusted plan');
    }

    const adjustedPlan = JSON.parse(jsonMatch[0]);

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
 * @returns {Promise<Array<object>>} A promise that resolves to an array of alternative approach objects.
 *   Each object typically has properties like `approach`, `pros`, `cons`, `estimated_timeline`, and `estimated_budget`.
 *   Returns an empty array if an error occurs or if no valid JSON alternatives can be extracted.
 */
export const addAlternatives = async (plan, ideaText) => {
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

    const response = result.response.text();
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    return jsonMatch ? JSON.parse(jsonMatch[0]).alternatives : [];
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
 * @returns {Promise<Array<object>>} A promise that resolves to an array of optimized phase objects.
 *   Returns the original `plan.phases` array if an error occurs or if no valid JSON can be extracted.
 */
export const optimizeTimeline = async (plan, targetDuration) => {
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

    const response = result.response.text();
    const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);

    return jsonMatch ? JSON.parse(jsonMatch[0]) : plan.phases;
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
 * @returns {Promise<object>} A promise that resolves to an object representing the optimized resources.
 *   Returns the original `plan.resources` object if an error occurs or if no valid JSON can be extracted.
 */
export const optimizeBudget = async (plan, targetBudget) => {
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

    const response = result.response.text();
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    return jsonMatch ? JSON.parse(jsonMatch[0]) : plan.resources;
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
 * @returns {Promise<object|Array>} A promise that resolves to the expanded section content (can be an object or an array depending on the section).
 *   Returns the original `plan[section]` content if an error occurs or if no valid JSON can be extracted.
 */
export const expandSection = async (plan, section) => {
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

    const response = result.response.text();
    const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);

    return jsonMatch ? JSON.parse(jsonMatch[0]) : plan[section];
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
 * @returns {Promise<object>} A promise that resolves to the simplified plan object.
 *   Returns the original plan object if an error occurs or if no valid JSON can be extracted.
 */
export const simplifyPlan = async (plan) => {
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

    const response = result.response.text();
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    return jsonMatch ? JSON.parse(jsonMatch[0]) : plan;
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
 * @param {Array<object>} [conversationHistory=[]] - Optional array of previous conversation turns, where each turn is an object with `role` and `parts` (e.g., `[{ role: 'user', parts: [{ text: '...' }] }, { role: 'model', parts: [{ text: '...' }] }]`).
 * @returns {Promise<object>} A promise that resolves to the improved plan object.
 * @throws {Error} If the AI response does not contain valid JSON or if the AI generation fails.
 */
export const applyFeedback = async (
  plan,
  feedback,
  conversationHistory = []
) => {
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
    const improvedText = response.text();

    // Extract JSON from response
    const jsonMatch = improvedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from improved plan');
    }

    const improvedPlan = JSON.parse(jsonMatch[0]);

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
 * @property {function(object, object): Promise<object>} adjustForConstraints - Adjusts the entire plan based on new constraints.
 * @property {function(object, string): Promise<Array<object>>} addAlternatives - Generates alternative approaches for an idea within a plan.
 * @property {function(object, string): Promise<Array<object>>} optimizeTimeline - Optimizes the plan's timeline to meet a target duration.
 * @property {function(object, string): Promise<object>} optimizeBudget - Optimizes the plan's budget to meet a target.
 * @property {function(object, string): Promise<object|Array>} expandSection - Expands a specific section of the plan with more details.
 * @property {function(object): Promise<object>} simplifyPlan - Simplifies the entire plan for easier understanding.
 * @property {function(object, string, Array<object>=): Promise<object>} applyFeedback - Applies user feedback to iteratively improve the plan.
 */

/**
 * An object consolidating all plan refinement and adjustment functions.
 * This service provides various utilities for modifying, optimizing, and enhancing project plans
 * using generative AI capabilities.
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