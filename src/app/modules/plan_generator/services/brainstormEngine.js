import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  SYSTEM_PROMPTS,
  PLAN_GENERATOR_CONFIG,
  BRAINSTORM_ASPECTS,
} from '../plan_generator.constant.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generate comprehensive brainstorming insights for an idea
 */
export const generateBrainstorm = async (
  ideaText,
  analysis,
  requestedAspects = [],
  contextData = {}
) => {
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
    logger.error('Error generating brainstorm:', error);
    throw error;
  }
};

/**
 * Generate quick SWOT analysis
 */
export const generateSWOT = async (ideaText) => {
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
    logger.error('Error generating SWOT:', error);
    return null;
  }
};

/**
 * Identify stakeholders for the idea
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
 * Generate success metrics based on brainstorm
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
 * Estimate resource requirements
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

export const brainstormEngine = {
  generateBrainstorm,
  generateSWOT,
  identifyStakeholders,
  defineSuccessMetrics,
  estimateResources,
};
