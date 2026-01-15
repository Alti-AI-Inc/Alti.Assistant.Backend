import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  PLAN_TYPES,
  COMPLEXITY_LEVELS,
  CLARITY_THRESHOLDS,
  CLARIFICATION_QUESTIONS,
  SYSTEM_PROMPTS,
  PLAN_GENERATOR_CONFIG,
} from '../plan_generator.constant.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Analyze user's idea to determine clarity, type, and required information
 */
export const analyzeIdea = async (ideaText, contextData = {}) => {
  try {
    logger.info('Analyzing idea:', { ideaLength: ideaText.length });

    const model = genAI.getGenerativeModel({ model: PLAN_GENERATOR_CONFIG.MODEL });

    const analysisPrompt = `${SYSTEM_PROMPTS.IDEA_ANALYSIS}

Analyze the following idea and provide a structured analysis in JSON format:

Idea: "${ideaText}"

${contextData.previousMessages ? `Previous conversation context: ${JSON.stringify(contextData.previousMessages)}` : ''}

Provide your analysis in the following JSON format:
{
  "clarity_score": <number between 0-1>,
  "plan_type": "<one of: business_plan, project_plan, product_launch, event_plan, marketing_campaign, research_plan, content_strategy, startup_plan, general>",
  "complexity": "<one of: simple, moderate, complex, enterprise>",
  "domains": ["<array of relevant domains: technical, business, marketing, financial, operations, legal, design, hr>"],
  "key_concepts": ["<array of main concepts extracted from the idea>"],
  "missing_information": ["<array of critical missing pieces>"],
  "clarifying_questions": ["<3-5 strategic questions to better understand the idea>"],
  "estimated_timeline": "<rough estimate like '2-4 weeks', '3-6 months', etc.>",
  "readiness_for_planning": "<ready, needs_minor_clarification, needs_major_clarification>",
  "summary": "<brief 1-2 sentence summary of the idea>"
}

Only return valid JSON, no additional text.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: analysisPrompt }] }],
      generationConfig: {
        temperature: PLAN_GENERATOR_CONFIG.TEMPERATURE_PLANNING,
        maxOutputTokens: 4096,
      },
    });

    const response = result.response;
    let analysisText = response.text();
    console.log('Analysis Response Text:', analysisText);

    // Remove markdown code block markers if present
    analysisText = analysisText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    // Extract JSON from response - find first { and last }
    const firstBrace = analysisText.indexOf('{');
    const lastBrace = analysisText.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      logger.error('Failed to find valid JSON boundaries in response:', analysisText.substring(0, 200));
      throw new Error('Failed to extract JSON from analysis');
    }

    const jsonString = analysisText.substring(firstBrace, lastBrace + 1);

    let analysis;
    try {
      analysis = JSON.parse(jsonString);
    } catch (parseError) {
      logger.error('JSON parse error:', parseError.message);
      logger.error('Attempted to parse:', jsonString.substring(0, 500));
      throw new Error('Failed to parse JSON from analysis');
    }

    logger.info('Idea analysis completed:', {
      clarityScore: analysis.clarity_score,
      planType: analysis.plan_type,
      complexity: analysis.complexity,
    });

    return analysis;
  } catch (error) {
    logger.error('Error analyzing idea:', error);
    throw error;
  }
};

/**
 * Determine if we need more clarification from the user
 */
export const needsClarification = (analysis) => {
  return (
    analysis.clarity_score < CLARITY_THRESHOLDS.CLEAR ||
    analysis.readiness_for_planning === 'needs_major_clarification' ||
    analysis.readiness_for_planning === 'needs_minor_clarification'
  );
};

/**
 * Generate clarifying questions based on idea analysis
 */
export const generateClarifyingQuestions = (analysis) => {
  const questions = [];

  // Use analysis-generated questions first
  if (analysis.clarifying_questions && analysis.clarifying_questions.length > 0) {
    questions.push(...analysis.clarifying_questions);
  }

  // Add template questions based on plan type
  const planType = analysis.plan_type || PLAN_TYPES.GENERAL;
  const templateQuestions = CLARIFICATION_QUESTIONS[planType.toUpperCase()] || CLARIFICATION_QUESTIONS.GENERAL;

  // Add missing information as questions
  if (analysis.missing_information && analysis.missing_information.length > 0) {
    analysis.missing_information.forEach((missing) => {
      questions.push(`Can you provide details about ${missing}?`);
    });
  }

  // Add template questions if we don't have enough
  if (questions.length < 3) {
    questions.push(...templateQuestions.slice(0, 5 - questions.length));
  }

  return questions.slice(0, 5); // Return top 5 questions
};

/**
 * Extract key requirements and constraints from idea text and context
 */
export const extractRequirements = (ideaText, analysis, userConstraints = {}) => {
  const requirements = {
    planType: analysis.plan_type || PLAN_TYPES.GENERAL,
    complexity: analysis.complexity || COMPLEXITY_LEVELS.MODERATE,
    domains: analysis.domains || [],
    timeline: analysis.estimated_timeline || userConstraints.timeline || 'Not specified',
    budget: userConstraints.budget || 'Not specified',
    teamSize: userConstraints.teamSize || 'Not specified',
    resources: userConstraints.resources || [],
    keyConcepts: analysis.key_concepts || [],
    objectives: [],
    constraints: [],
  };

  return requirements;
};

/**
 * Assess idea feasibility
 */
export const assessFeasibility = (analysis, constraints = {}) => {
  const feasibility = {
    overall_score: 0.7, // Default medium feasibility
    technical_feasibility: 0.7,
    financial_feasibility: 0.7,
    timeline_feasibility: 0.7,
    resource_feasibility: 0.7,
    concerns: [],
    recommendations: [],
  };

  // Adjust based on complexity
  if (analysis.complexity === COMPLEXITY_LEVELS.ENTERPRISE) {
    feasibility.overall_score -= 0.2;
    feasibility.concerns.push('Enterprise-level complexity requires significant resources and time');
  }

  // Check if budget is sufficient (rough estimate)
  if (constraints.budget) {
    const budgetNum = typeof constraints.budget === 'number' ? constraints.budget : 0;
    if (budgetNum < 10000 && analysis.complexity !== COMPLEXITY_LEVELS.SIMPLE) {
      feasibility.financial_feasibility -= 0.3;
      feasibility.concerns.push('Budget may be insufficient for the complexity level');
    }
  }

  // Domain expertise check
  if (analysis.domains && analysis.domains.length > 3) {
    feasibility.resource_feasibility -= 0.2;
    feasibility.recommendations.push('Consider building a diverse team with expertise in multiple domains');
  }

  // Calculate overall score
  feasibility.overall_score =
    (feasibility.technical_feasibility +
      feasibility.financial_feasibility +
      feasibility.timeline_feasibility +
      feasibility.resource_feasibility) /
    4;

  return feasibility;
};

export const ideaAnalyzer = {
  analyzeIdea,
  needsClarification,
  generateClarifyingQuestions,
  extractRequirements,
  assessFeasibility,
};
