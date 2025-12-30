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

Only return valid JSON, no additional text. Make the plan detailed, actionable, and professional.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: planPrompt }] }],
      generationConfig: {
        temperature: PLAN_GENERATOR_CONFIG.TEMPERATURE_PLANNING,
        maxOutputTokens: 6144,
      },
    });

    const response = result.response;
    const planText = response.text();

    // Extract JSON from response
    const jsonMatch = planText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from plan');
    }

    const plan = JSON.parse(jsonMatch[0]);

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

    const response = result.response.text();
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    return jsonMatch ? JSON.parse(jsonMatch[0]).action_items : [];
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
