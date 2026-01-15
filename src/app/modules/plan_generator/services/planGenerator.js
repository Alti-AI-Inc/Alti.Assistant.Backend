import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  SYSTEM_PROMPTS,
  PLAN_GENERATOR_CONFIG,
  PLAN_DEPTH,
} from '../plan_generator.constant.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generate a comprehensive plan from brainstorming insights
 */
export const generatePlan = async (ideaText, analysis, brainstorm, planDepth = PLAN_DEPTH.STANDARD, constraints = {}) => {
  try {
    logger.info('Generating plan:', { planDepth, complexity: analysis.complexity });

    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
      logger.error('Failed to find valid JSON boundaries in response:', planText.substring(0, 500));
      throw new Error('Failed to extract JSON from plan');
    }

    const jsonString = planText.substring(firstBrace, lastBrace + 1);

    let plan;
    try {
      plan = JSON.parse(jsonString);
    } catch (parseError) {
      logger.error('JSON parse error:', parseError.message);
      logger.error('JSON string length:', jsonString.length);
      logger.error('Attempted to parse (first 1000 chars):', jsonString.substring(0, 1000));
      logger.error('Attempted to parse (last 500 chars):', jsonString.substring(jsonString.length - 500));

      // Attempt to repair common JSON issues
      logger.info('Attempting to repair JSON...');
      try {
        // Remove trailing commas before } or ]
        let repairedJson = jsonString
          .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
          .replace(/([}\]])(\s*)([{"\w])/g, '$1,$2$3')  // Add missing commas between objects
          .replace(/\n/g, ' ')  // Remove newlines that might break strings
          .replace(/\r/g, '');  // Remove carriage returns

        plan = JSON.parse(repairedJson);
        logger.info('JSON repair successful!');
      } catch (repairError) {
        logger.error('JSON repair also failed:', repairError.message);

        // Save the problematic JSON to a file for debugging
        const fs = await import('fs/promises');
        const debugPath = `./logs/failed-json-${Date.now()}.txt`;
        await fs.writeFile(debugPath, jsonString, 'utf-8');
        logger.error('Problematic JSON saved to:', debugPath);

        throw new Error('Failed to parse JSON from plan: ' + parseError.message);
      }
    }

    logger.info('Plan generated successfully:', { title: plan.title });

    return plan;
  } catch (error) {
    logger.error('Error generating plan:', error);
    throw error;
  }
};

/**
 * Generate quick action items from idea
 */
export const generateQuickActionItems = async (ideaText, analysis) => {
  try {
    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

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
      return [];
    }

    const jsonString = response.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonString);
    return parsed.action_items || [];
  } catch (error) {
    logger.error('Error generating quick action items:', error);
    return [];
  }
};

/**
 * Create a phased timeline
 */
export const createPhasedTimeline = (brainstorm, complexity) => {
  const phases = brainstorm.timeline_estimation?.phases || [];

  if (phases.length === 0) {
    // Create default phases based on complexity
    const defaultPhases = [
      {
        name: 'Planning & Preparation',
        duration: '2-4 weeks',
        key_activities: ['Define requirements', 'Assemble team', 'Set up infrastructure'],
      },
      {
        name: 'Execution',
        duration: '4-12 weeks',
        key_activities: ['Implement core features', 'Regular testing', 'Iterate based on feedback'],
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
 * Prioritize tasks
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
 * Calculate critical path
 */
export const calculateCriticalPath = (actionItems, phases) => {
  const criticalTasks = actionItems
    .filter((item) => item.priority === 'high' || item.dependencies?.length > 0)
    .map((item) => item.task);

  return criticalTasks;
};

/**
 * Format plan for presentation
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

export const planGenerator = {
  generatePlan,
  generateQuickActionItems,
  createPhasedTimeline,
  prioritizeTasks,
  calculateCriticalPath,
  formatPlanForPresentation,
};
