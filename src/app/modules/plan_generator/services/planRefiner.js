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
 * Refine a specific section of the plan
 */
export const refineSection = async (plan, section, refinementRequest, context = {}) => {
  try {
    logger.info('Refining plan section:', { section, request: refinementRequest });

    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
 * Adjust plan based on new constraints
 */
export const adjustForConstraints = async (plan, newConstraints) => {
  try {
    logger.info('Adjusting plan for new constraints:', newConstraints);

    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
 * Add alternative approaches to existing plan
 */
export const addAlternatives = async (plan, ideaText) => {
  try {
    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
 * Optimize timeline
 */
export const optimizeTimeline = async (plan, targetDuration) => {
  try {
    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
 * Optimize budget
 */
export const optimizeBudget = async (plan, targetBudget) => {
  try {
    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
 * Expand specific section with more details
 */
export const expandSection = async (plan, section) => {
  try {
    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
 * Simplify plan for easier understanding
 */
export const simplifyPlan = async (plan) => {
  try {
    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
 * Apply iterative improvements based on feedback
 */
export const applyFeedback = async (plan, feedback, conversationHistory = []) => {
  try {
    logger.info('Applying feedback to plan:', { feedbackLength: feedback.length });

    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
