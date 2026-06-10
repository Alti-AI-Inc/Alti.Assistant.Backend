import { Storage } from '@google-cloud/storage';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
// FIX: Import usage service to enforce limits and track tenant-specific usage.
import { usageService } from '../../usage/usage.service.js';
import { ServiceError } from '../../../../shared/errors/service.error.js';
import {
  SYSTEM_PROMPTS,
  PLAN_GENERATOR_CONFIG,
  PLAN_DEPTH,
} from '../plan_generator.constant.js';

/**
 * @typedef {object} UserContext
 * @property {string} userId - The ID of the user making the request.
 * @property {string} workspaceId - The ID of the workspace to scope the request.
 * @property {'super_admin'|'admin'|'manager'|'user'} role - The role of the user.
 */

/**
 * @typedef {object} PlanAnalysis
 * @property {string} plan_type - The type of plan (e.g., "Project Plan", "Product Roadmap").
 * @property {string} complexity - The estimated complexity of the idea (e.g., "low", "medium", "high").
 * @property {string[]} domains - An array of domains or areas the idea touches.
 */

/**
 * @typedef {object} PlanObjective
 * @property {string} objective - A SMART objective statement.
 * @property {string} description - A brief description of the objective.
 * @property {'high'|'medium'|'low'} priority - The priority level of the objective.
 * @property {string} timeline - The estimated timeline to achieve the objective.
 */

/**
 * @typedef {object} PlanPhase
 * @property {number} phase_number - The sequential number of the phase.
 * @property {string} name - The name of the phase.
 * @property {string} duration - The estimated duration of the phase.
 * @property {string[]} deliverables - An array of key deliverables for the phase.
 */

/**
 * @typedef {object} PlanActionItem
 * @property {string} task - The description of the action item.
 * @property {'high'|'medium'|'low'} priority - The priority level of the action item.
 * @property {string} estimated_effort - The estimated time or effort for the action item.
 * @property {string[]} [dependencies] - Optional array of tasks this item depends on.
 */

/**
 * @typedef {object} PlanResources
 * @property {string} budget_estimate - An estimate of the total budget required.
 * @property {string[]} team_roles - An array of key team roles needed.
 * @property {string[]} tools - An array of essential tools required.
 */

/**
 * @typedef {object} PlanRisk
 * @property {string} risk - Description of the potential risk.
 * @property {'high'|'medium'|'low'} probability - The probability of the risk occurring.
 * @property {string} mitigation - Strategy to mitigate the risk.
 */

/**
 * @typedef {object} PlanSuccessMetrics
 * @property {string[]} kpis - An array of Key Performance Indicators.
 * @property {string[]} milestones - An array of major project milestones.
 */

/**
 * @typedef {object} PlanTimeline
 * @property {string} estimated_completion - The estimated total completion duration.
 * @property {string[]} critical_path - An array of critical tasks or milestones.
 */

/**
 * @typedef {object} GeneratedPlan
 * @property {string} title - The title of the generated plan.
 * @property {string} executive_summary - A 1-2 paragraph overview of the plan.
 * @property {PlanObjective[]} objectives - An array of SMART objectives.
 * @property {PlanPhase[]} phases - An array of project phases.
 * @property {PlanActionItem[]} action_items - An array of actionable tasks.
 * @property {PlanResources} resources - Details about required resources.
 * @property {PlanRisk[]} risks - An array of identified risks and their mitigation strategies.
 * @property {PlanSuccessMetrics} success_metrics - Metrics and milestones for success.
 * @property {PlanTimeline} timeline - Overall project timeline details.
 * @property {string[]} next_steps - Immediate next actions to take.
 */

/**
 * Initializes the Google Generative AI client.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Initializes the Google Cloud Storage client.
 * Assumes Application Default Credentials are available in the environment.
 */
const storage = new Storage();

/**
 * Generates a comprehensive project plan based on an idea, analysis, brainstorming insights, and optional constraints.
 * It leverages the Google Generative AI model to create a structured JSON plan.
 *
 * CRITICAL INTEGRATION: This function now requires a `userContext` to enforce tenant boundaries and usage limits.
 *
 * @param {UserContext} userContext - The context of the user making the request, for authorization and usage tracking.
 * @param {string} ideaText - The core idea or problem statement for which the plan is being generated.
 * @param {PlanAnalysis} analysis - An object containing the initial analysis of the idea.
 * @param {object} brainstorm - Detailed brainstorming insights and raw data, which can be any JSON structure.
 * @param {string} [planDepth=PLAN_DEPTH.STANDARD] - The desired depth or level of detail for the plan. Defaults to standard.
 * @param {object} [constraints={}] - Optional constraints or limitations to consider during plan generation.
 * @returns {Promise<GeneratedPlan>} A promise that resolves to a structured JSON object representing the generated plan.
 * @throws {ServiceError} If the user exceeds their usage limits.
 * @throws {Error} If there is an error during plan generation, API call, or JSON parsing.
 */
export const generatePlan = async (
  userContext,
  ideaText,
  analysis,
  brainstorm,
  planDepth = PLAN_DEPTH.STANDARD,
  constraints = {}
) => {
  // FIX: Enforce usage limits and role-based access before making an expensive API call.
  // This prevents resource abuse and ensures actions are tracked against the correct tenant/workspace.
  await usageService.checkUsageLimits(userContext, 'planGeneration');

  try {
    logger.info('Generating plan:', {
      workspaceId: userContext.workspaceId,
      userId: userContext.userId,
      planDepth,
      complexity: analysis.complexity,
    });

    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const planPrompt = `${SYSTEM_PROMPTS.PLAN_GENERATION}

Idea: "${ideaText}"

Analysis:
- Plan Type: ${analysis.plan_type}
- Complexity: ${analysis.complexity}
- Domains: ${analysis.domains.join(', ')}

Brainstorming Insights:
${JSON.stringify(brainstorm, null, 2)}

Constraints:
${JSON.stringify(constraints, null, 2)}

Plan Depth: ${planDepth}

Create a concise, actionable plan in the following JSON format (be brief and focused):

{
  "title": "<plan title>",
  "executive_summary": "<1-2 paragraph overview>",
  "objectives": [
    {
      "objective": "<SMART objective>",
      "description": "<brief description>",
      "priority": "<high/medium/low>",
      "timeline": "<when to achieve>"
    }
  ],
  "phases": [
    {
      "phase_number": 1,
      "name": "<phase name>",
      "duration": "<duration>",
      "deliverables": ["<key deliverables>"]
    }
  ],
  "action_items": [
    {
      "task": "<task>",
      "priority": "<high/medium/low>",
      "estimated_effort": "<time>"
    }
  ],
  "resources": {
    "budget_estimate": "<total estimate>",
    "team_roles": ["<key roles needed>"],
    "tools": ["<essential tools>"]
  },
  "risks": [
    {
      "risk": "<risk>",
      "probability": "<high/medium/low>",
      "mitigation": "<strategy>"
    }
  ],
  "success_metrics": {
    "kpis": ["<key metrics>"],
    "milestones": ["<major milestones>"]
  },
  "timeline": {
    "estimated_completion": "<duration>",
    "critical_path": ["<critical tasks>"]
  },
  "next_steps": ["<immediate actions>"]
}

CRITICAL INSTRUCTIONS:
- Output ONLY valid JSON - no markdown, no code blocks, no explanatory text
- Ensure all strings are properly quoted
- NO trailing commas before } or ]
- All property names must be in double quotes
- All string values must be in double quotes
- Escape any quotes inside strings with backslash
- Validate JSON syntax before returning

Only return the JSON object itself.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: planPrompt }] }],
      generationConfig: {
        temperature: PLAN_GENERATOR_CONFIG.TEMPERATURE_PLANNING,
        // maxOutputTokens: 6144,
      },
    });

    const response = result.response;
    let planText = response.text();

    // Remove markdown code block markers if present
    planText = planText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    // Extract JSON from response - find first { and last }
    const firstBrace = planText.indexOf('{');
    const lastBrace = planText.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      logger.error(
        'Failed to find valid JSON boundaries in response:',
        planText.substring(0, 500)
      );
      throw new Error('Failed to extract JSON from plan');
    }

    const jsonString = planText.substring(firstBrace, lastBrace + 1);

    let plan;
    try {
      plan = JSON.parse(jsonString);
    } catch (parseError) {
      logger.error('JSON parse error:', parseError.message);
      logger.error('JSON string length:', jsonString.length);
      logger.error(
        'Attempted to parse (first 1000 chars):',
        jsonString.substring(0, 1000)
      );
      logger.error(
        'Attempted to parse (last 500 chars):',
        jsonString.substring(jsonString.length - 500)
      );

      // Attempt to repair common JSON issues
      logger.info('Attempting to repair JSON...');
      try {
        // NOTE: This repair logic is basic and may not cover all LLM formatting errors.
        let repairedJson = jsonString
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/([}\]])(\s*)([{"\w])/g, '$1,$2$3') // Add missing commas between objects
          .replace(/\n/g, ' ') // Remove newlines that might break strings
          .replace(/\r/g, ''); // Remove carriage returns

        plan = JSON.parse(repairedJson);
        logger.info('JSON repair successful!');
      } catch (repairError) {
        logger.error('JSON repair also failed:', repairError.message);

        // Save the problematic JSON to Google Cloud Storage for debugging instead of the local filesystem.
        try {
          // Ensure a debug bucket is configured before attempting to write.
          if (config.gcs_debug_bucket_name) {
            const bucket = storage.bucket(config.gcs_debug_bucket_name);
            const destination = `plan-generator-failures/failed-json-${Date.now()}.txt`;
            const file = bucket.file(destination);

            // Create a buffer from the string and upload it.
            const contents = Buffer.from(jsonString, 'utf-8');
            await file.save(contents, {
              contentType: 'text/plain; charset=utf-8',
            });

            const gcsPath = `gs://${config.gcs_debug_bucket_name}/${destination}`;
            logger.error('Problematic JSON saved to GCS:', gcsPath);
          } else {
            logger.warn(
              'GCS debug bucket not configured (gcs_debug_bucket_name). Cannot save failed JSON.'
            );
          }
        } catch (gcsError) {
          // Log the GCS error but do not let it hide the original parsing error.
          logger.error('Failed to save problematic JSON to GCS:', gcsError);
        }

        throw new Error(
          'Failed to parse JSON from plan: ' + parseError.message
        );
      }
    }

    // FIX: Record the successful usage against the user and workspace.
    // This ensures accurate billing and allows for hierarchical usage reporting (user -> manager -> admin).
    await usageService.recordUsage(userContext, 'planGeneration', 1);

    logger.info('Plan generated successfully:', { title: plan.title });

    return plan;
  } catch (error) {
    // Do not record usage if the generation failed.
    logger.error('Error generating plan:', {
      error,
      workspaceId: userContext.workspaceId,
    });
    // Re-throw the original error to be handled by the controller.
    throw error;
  }
};

/**
 * Generates a list of immediate, quick action items for a given idea using the Generative AI model.
 *
 * CRITICAL INTEGRATION: This function now requires a `userContext` to enforce tenant boundaries and usage limits.
 *
 * @param {UserContext} userContext - The context of the user making the request, for authorization and usage tracking.
 * @param {string} ideaText - The core idea for which action items are needed.
 * @param {PlanAnalysis} analysis - An object containing the initial analysis of the idea (currently not directly used in prompt but kept for consistency).
 * @returns {Promise<PlanActionItem[]>} A promise that resolves to an array of action item objects.
 * @throws {ServiceError} If the user exceeds their usage limits.
 * @throws {Error} If there is an error during action item generation or API call.
 */
export const generateQuickActionItems = async (userContext, ideaText, analysis) => {
  // FIX: Enforce usage limits before making an expensive API call.
  await usageService.checkUsageLimits(userContext, 'quickActions');

  try {
    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

    const prompt = `Generate 5-10 immediate action items for this idea:

"${ideaText}"

Return only JSON:
{
  "action_items": [
    {
      "task": "<task>",
      "priority": "<high/medium/low>",
      "estimated_effort": "<time>"
    }
  ]
}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 2048,
      },
    });

    let response = result.response.text();
    response = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    const firstBrace = response.indexOf('{');
    const lastBrace = response.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      // BUG FIX: If no valid JSON is found, throw an error instead of returning an empty array.
      // This allows the caller to distinguish between a failed generation and a valid empty result.
      throw new Error('Failed to generate valid action items JSON.');
    }

    const jsonString = response.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonString);

    // FIX: Record successful usage after the operation completes.
    await usageService.recordUsage(userContext, 'quickActions', 1);

    return parsed.action_items || [];
  } catch (error) {
    logger.error('Error generating quick action items:', {
      error,
      workspaceId: userContext.workspaceId,
    });
    // BUG FIX: Re-throw the error instead of swallowing it and returning an empty array.
    // The calling function needs to know that the operation failed.
    throw error;
  }
};

/**
 * Creates a phased timeline for a project. If brainstorming insights provide phases, they are used;
 * otherwise, default phases are generated based on project complexity.
 *
 * @param {object} brainstorm - Detailed brainstorming insights, potentially containing a 'timeline_estimation' property.
 * @param {object[]} [brainstorm.timeline_estimation.phases] - An array of predefined phases from brainstorming.
 * @param {string} complexity - The estimated complexity of the project (e.g., "low", "medium", "high").
 * @returns {Array<object>} An array of phase objects, each with a name, duration, and key activities.
 * @returns {string} return.name - The name of the phase.
 * @returns {string} return.duration - The estimated duration of the phase.
 * @returns {string[]} return.key_activities - An array of key activities within the phase.
 */
export const createPhasedTimeline = (brainstorm, complexity) => {
  const phases = brainstorm.timeline_estimation?.phases || [];

  if (phases.length === 0) {
    // Create default phases based on complexity
    const defaultPhases = [
      {
        name: 'Planning & Preparation',
        duration: '2-4 weeks',
        key_activities: [
          'Define requirements',
          'Assemble team',
          'Set up infrastructure',
        ],
      },
      {
        name: 'Execution',
        duration: '4-12 weeks',
        key_activities: [
          'Implement core features',
          'Regular testing',
          'Iterate based on feedback',
        ],
      },
      {
        name: 'Launch & Deployment',
        duration: '1-2 weeks',
        key_activities: ['Final testing', 'Launch', 'Monitor performance'],
      },
      {
        name: 'Post-Launch',
        duration: 'Ongoing',
        key_activities: ['Gather feedback', 'Optimize', 'Scale as needed'],
      },
    ];

    return defaultPhases;
  }

  return phases;
};

/**
 * Prioritizes a list of action items into high, medium, and low categories based on their `priority` property.
 * Items without a specified priority default to 'medium'.
 *
 * @param {PlanActionItem[]} actionItems - An array of action item objects.
 * @returns {object} An object containing arrays of action items categorized by priority.
 * @returns {PlanActionItem[]} return.high - Action items with high priority.
 * @returns {PlanActionItem[]} return.medium - Action items with medium priority.
 * @returns {PlanActionItem[]} return.low - Action items with low priority.
 */
export const prioritizeTasks = (actionItems) => {
  const prioritized = {
    high: [],
    medium: [],
    low: [],
  };

  actionItems.forEach((item) => {
    const priority = item.priority?.toLowerCase() || 'medium';
    if (prioritized[priority]) {
      prioritized[priority].push(item);
    } else {
      prioritized.medium.push(item);
    }
  });

  return prioritized;
};

/**
 * Identifies critical tasks from a list of action items. Tasks are considered critical if they have
 * 'high' priority or if they explicitly list dependencies.
 *
 * @param {PlanActionItem[]} actionItems - An array of action item objects.
 * @param {PlanPhase[]} phases - An array of phase objects (currently not directly used in logic but can provide context).
 * @returns {string[]} An array of task descriptions identified as critical.
 */
export const calculateCriticalPath = (actionItems, phases) => {
  const criticalTasks = actionItems
    .filter((item) => item.priority === 'high' || item.dependencies?.length > 0)
    .map((item) => item.task);

  return criticalTasks;
};

/**
 * Formats a structured plan object into a human-readable Markdown string suitable for presentation.
 *
 * @param {GeneratedPlan} plan - The structured plan object generated by the AI.
 * @returns {string} A Markdown formatted string representing the plan.
 */
export const formatPlanForPresentation = (plan) => {
  let markdown = `# ${plan.title}\n\n`;
  markdown += `## Executive Summary\n\n${plan.executive_summary}\n\n`;

  markdown += `## Objectives\n\n`;
  plan.objectives?.forEach((obj, index) => {
    markdown += `${index + 1}. **${obj.objective}** (${obj.priority} priority)\n`;
    markdown += `   ${obj.description}\n`;
    markdown += `   Timeline: ${obj.timeline}\n\n`;
  });

  markdown += `## Phases\n\n`;
  plan.phases?.forEach((phase) => {
    markdown += `### Phase ${phase.phase_number}: ${phase.name}\n`;
    markdown += `Duration: ${phase.duration}\n\n`;
    markdown += `**Deliverables:**\n`;
    phase.deliverables?.forEach((deliverable) => {
      markdown += `- ${deliverable}\n`;
    });
    markdown += `\n`;
  });

  markdown += `## Next Steps\n\n`;
  plan.next_steps?.forEach((step, index) => {
    markdown += `${index + 1}. ${step}\n`;
  });

  return markdown;
};

/**
 * An object consolidating all plan generation and related utility functions.
 * This serves as a single export point for the plan generator module's services.
 * @namespace
 * @property {function(UserContext, string, PlanAnalysis, object, string, object): Promise<GeneratedPlan>} generatePlan - Function to generate a comprehensive plan.
 * @property {function(UserContext, string, PlanAnalysis): Promise<PlanActionItem[]>} generateQuickActionItems - Function to generate quick action items.
 * @property {function(object, string): Array<object>} createPhasedTimeline - Function to create a phased timeline.
 * @property {function(PlanActionItem[]): object} prioritizeTasks - Function to prioritize action items.
 * @property {function(PlanActionItem[], PlanPhase[]): string[]} calculateCriticalPath - Function to calculate the critical path.
 * @property {function(GeneratedPlan): string} formatPlanForPresentation - Function to format a plan into Markdown.
 */
export const planGenerator = {
  generatePlan,
  generateQuickActionItems,
  createPhasedTimeline,
  prioritizeTasks,
  calculateCriticalPath,
  formatPlanForPresentation,
};