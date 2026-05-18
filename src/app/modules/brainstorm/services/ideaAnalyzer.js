import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  BRAINSTORM_INTENTS,
  BRAINSTORM_TYPES,
  PERSPECTIVES,
  TECHNIQUES,
  DEPTH_LEVELS,
  COMPLEXITY_LEVELS,
} from '../brainstorm.constant.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Analyze user intent from message
 */
const analyzeIntent = async (
  userMessage,
  conversationHistory = [],
  existingParams = {}
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    let historyContext = '';
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-4);
      historyContext =
        '\n\nRecent conversation:\n' +
        recentMessages.map((msg) => `${msg.role}: ${msg.content}`).join('\n');
    }

    let paramsContext = '';
    if (Object.keys(existingParams).length > 0) {
      paramsContext = `\n\nAlready collected parameters: ${JSON.stringify(existingParams)}`;
    }

    const prompt = `You are an intent analyzer for a brainstorming assistant. Analyze the user's message and determine:
1. The primary intent (what they want to do)
2. The type of brainstorming needed
3. Any specific parameters mentioned
4. Whether you need more information

**IMPORTANT**: If the user provides a clear idea/topic, DO NOT ask for more information. Use smart defaults for missing parameters. Only set needsMoreInfo=true if the idea itself is completely unclear or missing.

Available intents:
- generate_ideas: User wants new ideas generated
- expand_idea: User wants to expand/elaborate on an idea
- analyze_idea: User wants analysis of an idea
- refine_idea: User wants to improve/refine an idea
- evaluate_idea: User wants evaluation/assessment
- compare_ideas: User wants to compare multiple ideas
- identify_risks: User wants risk analysis
- find_opportunities: User wants opportunity identification
- clarification: User asking questions or needs clarification
- unknown: Cannot determine intent

Brainstorm types:
- product_idea, business_strategy, marketing_campaign, technical_solution, creative_content, problem_solving, process_improvement, general

Techniques:
- scamper, mind_map, six_thinking_hats, swot, five_whys, reverse_brainstorm, brainwriting, free_association, starbursting, role_storming

Perspectives:
- business, technical, creative, user_centric, strategic, operational, financial, competitive

Depth levels:
- quick, standard, deep, comprehensive

Focus areas:
- innovation, feasibility, marketability, scalability, uniqueness, profitability, user_value, sustainability

${historyContext}${paramsContext}

User message: "${userMessage}"

**Guidelines:**
- If user mentions an idea/topic (e.g., "app for pet owners", "fitness platform"), extract it and set needsMoreInfo=false
- Only ask for missing technique, depth, or constraints if user specifically asks for optimization
- Default to free_association technique if not specified
- Default to standard depth if not specified
- Use smart defaults rather than asking for everything

Respond in JSON format only:
{
  "intent": "intent_name",
  "confidence": 0.0-1.0,
  "parameters": {
    "brainstormType": "type or null",
    "idea": "extracted idea text or null",
    "technique": "technique or null",
    "perspectives": ["perspective1", "perspective2"] or [],
    "depth": "depth_level or null",
    "focusAreas": ["area1", "area2"] or [],
    "constraints": {
      "budget": "mentioned budget or null",
      "timeline": "mentioned timeline or null",
      "technology": ["tech1"] or [],
      "targetAudience": "audience or null"
    },
    "additionalInstructions": "any specific instructions or null"
  },
  "needsMoreInfo": false,
  "missingInfo": [],
  "reasoning": "brief explanation"
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    logger.info('Intent analysis completed', { intent: analysis.intent });

    return analysis;
  } catch (error) {
    logger.error('Error analyzing intent:', error);
    return {
      intent: BRAINSTORM_INTENTS.UNKNOWN,
      confidence: 0.5,
      parameters: {},
      needsMoreInfo: true,
      missingInfo: [
        'Please provide more details about what you want to brainstorm',
      ],
      reasoning: 'Failed to analyze intent',
    };
  }
};

/**
 * Analyze and categorize an idea
 */
const analyzeIdea = async (ideaText) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    });

    const prompt = `Analyze the following idea and categorize it:

Idea: "${ideaText}"

Provide analysis in JSON format:
{
  "brainstormType": "product_idea|business_strategy|marketing_campaign|technical_solution|creative_content|problem_solving|process_improvement|general",
  "complexity": "simple|moderate|complex|very_complex",
  "domains": ["domain1", "domain2"],
  "keyThemes": ["theme1", "theme2"],
  "implicitRequirements": ["req1", "req2"],
  "suggestedTechniques": ["technique1", "technique2"],
  "recommendedPerspectives": ["perspective1", "perspective2"],
  "recommendedDepth": "quick|standard|deep|comprehensive",
  "estimatedIdeaCount": number,
  "reasoning": "brief explanation"
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    logger.info('Idea analysis completed', { type: analysis.brainstormType });

    return analysis;
  } catch (error) {
    logger.error('Error analyzing idea:', error);
    return {
      brainstormType: BRAINSTORM_TYPES.GENERAL,
      complexity: COMPLEXITY_LEVELS.MODERATE,
      domains: ['general'],
      keyThemes: [],
      implicitRequirements: [],
      suggestedTechniques: [TECHNIQUES.FREE_ASSOCIATION],
      recommendedPerspectives: [
        PERSPECTIVES.BUSINESS,
        PERSPECTIVES.USER_CENTRIC,
      ],
      recommendedDepth: DEPTH_LEVELS.STANDARD,
      estimatedIdeaCount: 20,
      reasoning: 'Default analysis due to error',
    };
  }
};

/**
 * Extract idea from natural language message
 */
const extractIdea = async (userMessage) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
      },
    });

    const prompt = `Extract the core idea from this message. Return ONLY the idea statement, nothing else.

Message: "${userMessage}"

Core idea:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const idea = response.text().trim();

    logger.info('Idea extracted from message');
    return idea;
  } catch (error) {
    logger.error('Error extracting idea:', error);
    return userMessage;
  }
};

/**
 * Determine if message contains sufficient idea information
 */
const hasValidIdea = (message, existingParams = {}) => {
  if (existingParams.idea && existingParams.idea.length >= 10) {
    return true;
  }

  const ideaKeywords = [
    'app',
    'platform',
    'service',
    'product',
    'solution',
    'system',
    'tool',
    'strategy',
    'campaign',
    'process',
    'feature',
    'business',
    'startup',
    'website',
    'software',
  ];

  const lowerMessage = message.toLowerCase();
  const hasKeyword = ideaKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
  const hasLength = message.length >= 15;

  return hasKeyword && hasLength;
};

export const ideaAnalyzer = {
  analyzeIntent,
  analyzeIdea,
  extractIdea,
  hasValidIdea,
};
