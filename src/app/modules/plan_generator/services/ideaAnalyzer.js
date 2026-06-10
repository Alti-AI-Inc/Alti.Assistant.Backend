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

/**
 * @constant {GoogleGenerativeAI} genAI - Initializes the Google Generative AI client using the API key from configuration.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Analyzes a user's idea to determine its clarity, potential plan type, complexity, and missing information.
 * It uses a Generative AI model to process the idea and provide a structured JSON analysis.
 *
 * @param {string} ideaText - The raw text of the user's idea.
 * @param {object} [contextData={}] - Optional context data, such as previous conversation messages, user context, and tenant/workspace details.
 * @param {Array<object>} [contextData.previousMessages] - An array of previous message objects in the conversation.
 * @param {object} [contextData.user] - The user object containing id, role, tenantId, workspaceId, managerId, and email.
 * @param {string} [contextData.tenantId] - The target tenant ID for context validation.
 * @param {string} [contextData.workspaceId] - The target workspace ID for context validation.
 * @param {function} [contextData.usageLimitCheck] - Optional function to check usage limits.
 * @param {function} [contextData.propagateUsage] - Optional function to propagate usage details.
 * @param {function} [contextData.notifyHierarchy] - Optional function to send notifications up the hierarchy.
 * @returns {Promise<object>} A promise that resolves to a structured analysis object in JSON format.
 * @throws {Error} If validation fails, the AI model fails to generate content, or if the response cannot be parsed.
 */
export const analyzeIdea = async (ideaText, contextData = {}) => {
  try {
    logger.info('Analyzing idea:', { ideaLength: ideaText.length });

    // CRITICAL INTEGRATION: Validate tenant context and user roles
    const { user, tenantId, workspaceId, usageLimitCheck } = contextData;

    if (!user || !user.role || !tenantId) {
      logger.error('Security Violation: Missing user context or tenant ID');
      throw new Error('Unauthorized: Tenant context and user role validation failed.');
    }

    const validRoles = ['super_admin', 'admin', 'manager', 'user'];
    if (!validRoles.includes(user.role)) {
      logger.error('Security Violation: Invalid user role', { role: user.role });
      throw new Error('Forbidden: Invalid user role.');
    }

    // Respect tenant context boundaries
    if (user.role !== 'super_admin' && user.tenantId !== tenantId) {
      logger.error('Security Violation: Tenant boundary violation', {
        userTenantId: user.tenantId,
        targetTenantId: tenantId,
      });
      throw new Error('Forbidden: Tenant boundary violation.');
    }

    // Respect workspace context boundaries for non-platform/non-workspace owners
    if (
      user.role !== 'super_admin' &&
      user.role !== 'admin' &&
      user.workspaceId &&
      workspaceId &&
      user.workspaceId !== workspaceId
    ) {
      logger.error('Security Violation: Workspace boundary violation', {
        userWorkspaceId: user.workspaceId,
        targetWorkspaceId: workspaceId,
      });
      throw new Error('Forbidden: Workspace boundary violation.');
    }

    // Check usage limits before proceeding with AI generation
    if (usageLimitCheck) {
      const hasLimit = await usageLimitCheck(tenantId, workspaceId, user);
      if (!hasLimit) {
        logger.warn('Usage limit exceeded for tenant/workspace', { tenantId, workspaceId });
        throw new Error('PaymentRequired: AI analysis limit exceeded for this workspace.');
      }
    }

    const model = genAI.getGenerativeModel({
      model: PLAN_GENERATOR_CONFIG.MODEL,
    });

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
    analysisText = analysisText
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '');

    // Extract JSON from response - find first { and last }
    const firstBrace = analysisText.indexOf('{');
    const lastBrace = analysisText.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      logger.error(
        'Failed to find valid JSON boundaries in response:',
        analysisText.substring(0, 200)
      );
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

    // Propagate usage details, limits, and notifications up to managers and administrators
    const usageDetails = {
      userId: user.id,
      role: user.role,
      managerId: user.managerId,
      tenantId,
      workspaceId,
      action: 'idea_analysis',
      timestamp: new Date(),
      details: {
        ideaLength: ideaText.length,
        model: PLAN_GENERATOR_CONFIG.MODEL,
      },
    };

    logger.info('Propagating usage details to administrators and managers:', usageDetails);

    if (contextData.propagateUsage) {
      await contextData.propagateUsage(usageDetails);
    }

    if (contextData.notifyHierarchy) {
      await contextData.notifyHierarchy({
        recipientRoles: ['super_admin', 'admin', 'manager'],
        managerId: user.managerId,
        tenantId,
        workspaceId,
        message: `User ${user.email || user.id} performed an idea analysis.`,
        type: 'USAGE_ALERT',
      });
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
 * Determines if further clarification is needed from the user based on the idea analysis.
 * This is decided by the clarity score and the readiness for planning status.
 *
 * @param {object} analysis - The structured analysis object returned by `analyzeIdea`.
 * @param {number} analysis.clarity_score - A numerical score indicating the clarity of the idea (0-1).
 * @param {string} analysis.readiness_for_planning - A string indicating the readiness for planning ('ready', 'needs_minor_clarification', 'needs_major_clarification').
 * @returns {boolean} True if more clarification is needed, false otherwise.
 */
export const needsClarification = (analysis) => {
  return (
    analysis.clarity_score < CLARITY_THRESHOLDS.CLEAR ||
    analysis.readiness_for_planning === 'needs_major_clarification' ||
    analysis.readiness_for_planning === 'needs_minor_clarification'
  );
};

/**
 * Generates a list of strategic clarifying questions based on the idea analysis.
 * It prioritizes questions generated by the AI, then adds questions based on missing information,
 * and finally fills up with general or plan-type specific template questions.
 *
 * @param {object} analysis - The structured analysis object returned by `analyzeIdea`.
 * @param {Array<string>} [analysis.clarifying_questions] - Questions directly suggested by the AI.
 * @param {Array<string>} [analysis.missing_information] - Critical pieces of information identified as missing.
 * @param {string} [analysis.plan_type] - The identified type of plan (e.g., 'business_plan', 'general').
 * @returns {Array<string>} An array of up to 5 clarifying questions.
 */
export const generateClarifyingQuestions = (analysis) => {
  const questions = [];

  // Use analysis-generated questions first
  if (
    analysis.clarifying_questions &&
    analysis.clarifying_questions.length > 0
  ) {
    questions.push(...analysis.clarifying_questions);
  }

  // Add template questions based on plan type
  const planType = analysis.plan_type || PLAN_TYPES.GENERAL;
  const templateQuestions =
    CLARIFICATION_QUESTIONS[planType.toUpperCase()] ||
    CLARIFICATION_QUESTIONS.GENERAL;

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
 * Extracts key requirements and constraints for a plan based on the idea text,
 * its analysis, and any user-provided constraints.
 *
 * @param {string} ideaText - The original idea text (though not directly used in this implementation, kept for signature consistency).
 * @param {object} analysis - The structured analysis object returned by `analyzeIdea`.
 * @param {string} [analysis.plan_type] - The identified type of plan.
 * @param {string} [analysis.complexity] - The identified complexity level.
 * @param {Array<string>} [analysis.domains] - Relevant domains for the idea.
 * @param {string} [analysis.estimated_timeline] - AI's estimated timeline.
 * @param {Array<string>} [analysis.key_concepts] - Main concepts extracted from the idea.
 * @param {object} [userConstraints={}] - Additional constraints provided by the user.
 * @param {string} [userConstraints.timeline] - User-specified timeline.
 * @param {string|number} [userConstraints.budget] - User-specified budget.
 * @param {string|number} [userConstraints.teamSize] - User-specified team size.
 * @param {Array<string>} [userConstraints.resources] - User-specified resources.
 * @returns {object} An object containing extracted requirements and constraints.
 */
export const extractRequirements = (
  ideaText,
  analysis,
  userConstraints = {}
) => {
  const requirements = {
    planType: analysis.plan_type || PLAN_TYPES.GENERAL,
    complexity: analysis.complexity || COMPLEXITY_LEVELS.MODERATE,
    domains: analysis.domains || [],
    timeline:
      analysis.estimated_timeline ||
      userConstraints.timeline ||
      'Not specified',
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
 * Assesses the feasibility of an idea based on its analysis and provided constraints.
 * It evaluates technical, financial, timeline, and resource feasibility,
 * providing an overall score, concerns, and recommendations.
 *
 * @param {object} analysis - The structured analysis object returned by `analyzeIdea`.
 * @param {string} [analysis.complexity] - The identified complexity level of the idea.
 * @param {Array<string>} [analysis.domains] - Relevant domains for the idea.
 * @param {object} [constraints={}] - Additional constraints, such as budget.
 * @param {number|string} [constraints.budget] - The estimated or specified budget for the idea.
 * @returns {object} An object detailing the feasibility assessment.
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
    feasibility.concerns.push(
      'Enterprise-level complexity requires significant resources and time'
    );
  }

  // Check if budget is sufficient (rough estimate)
  if (constraints.budget) {
    const budgetNum =
      typeof constraints.budget === 'number' ? constraints.budget : 0;
    if (budgetNum < 10000 && analysis.complexity !== COMPLEXITY_LEVELS.SIMPLE) {
      feasibility.financial_feasibility -= 0.3;
      feasibility.concerns.push(
        'Budget may be insufficient for the complexity level'
      );
    }
  }

  // Domain expertise check
  if (analysis.domains && analysis.domains.length > 3) {
    feasibility.resource_feasibility -= 0.2;
    feasibility.recommendations.push(
      'Consider building a diverse team with expertise in multiple domains'
    );
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

/**
 * @namespace ideaAnalyzer
 * @description A collection of services for analyzing user ideas, determining clarity,
 * generating clarifying questions, extracting requirements, and assessing feasibility.
 */
export const ideaAnalyzer = {
  analyzeIdea,
  needsClarification,
  generateClarifyingQuestions,
  extractRequirements,
  assessFeasibility,
};