import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import { CONTRACT_REVIEW_INTENTS, INTENT_KEYWORDS } from '../legal_contract_review.constant.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Analyze user intent from message for legal contract review
 */
const analyzeIntent = async (userMessage, conversationHistory = [], existingParams = {}) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    // Build context from conversation history
    let historyContext = '';
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-3);
      historyContext = '\n\nRecent conversation:\n' +
        recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }

    // Build existing parameters context
    let paramsContext = '';
    if (Object.keys(existingParams).length > 0) {
      paramsContext = `\n\nAlready collected parameters: ${JSON.stringify(existingParams)}`;
    }

    const prompt = `You are an intent analyzer for a legal contract review assistant. Analyze the user's message and determine:
1. The primary intent (what kind of contract review they want)
2. Any specific parameters mentioned (review depth, contract type, aspects to focus on)

Available intents:
- general_review: Comprehensive legal contract review
- clause_analysis: Detailed analysis of specific clauses
- risk_assessment: Identify and assess legal/financial/operational risks
- compliance_check: Review for legal compliance and regulatory requirements
- fairness_evaluation: Assess fairness and balance of contract terms
- terminology_check: Review legal terminology and definitions
- amendment_suggestions: Suggest contract improvements and amendments
- comparison: Compare multiple contracts or versions
- summary: Provide executive summary of the contract
- clarification: User asking questions or seeking clarification
- unknown: Cannot determine intent

Contract review aspects that can be mentioned:
- obligations, rights, liabilities, termination, payment_terms, confidentiality, intellectual_property, indemnification, dispute_resolution, force_majeure, governing_law, warranties, jurisdiction, notice_provisions

Review depth levels:
- quick: Quick overview of key clauses and red flags
- standard: Comprehensive review (default)
- detailed: Detailed clause-by-clause analysis
- comprehensive: Most thorough with risk matrix

Contract types:
- employment, nda, service_agreement, sales, lease, partnership, licensing, purchase, vendor, independent_contractor, franchise, general

${historyContext}${paramsContext}

User message: "${userMessage}"

Respond in JSON format only:
{
  "intent": "intent_name",
  "confidence": 0.0-1.0,
  "parameters": {
    "reviewType": "intent_name or null",
    "reviewDepth": "quick/standard/detailed/comprehensive or null",
    "contractType": "type or null",
    "aspects": ["aspect1", "aspect2"] or [],
    "additionalInstructions": "any specific instructions or null"
  },
  "reasoning": "brief explanation"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Could not parse intent analysis response');
      return {
        intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
        confidence: 0.5,
        parameters: {},
        reasoning: 'Default fallback',
      };
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Clean up parameters - remove null values
    const cleanedParams = {};
    for (const [key, value] of Object.entries(analysis.parameters || {})) {
      if (value !== null && value !== 'null' &&
        !(Array.isArray(value) && value.length === 0)) {
        cleanedParams[key] = value;
      }
    }

    logger.info('Legal contract intent analysis:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      parameters: cleanedParams,
    });

    return {
      intent: analysis.intent || CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
      confidence: analysis.confidence || 0.5,
      parameters: cleanedParams,
      reasoning: analysis.reasoning || '',
    };
  } catch (error) {
    logger.error('Error analyzing legal contract intent:', error);

    // Fallback: Simple keyword-based intent detection
    const lowerMessage = userMessage.toLowerCase();

    // Check for specific intents based on keywords
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          logger.info('Using fallback keyword-based intent detection', { intent });
          return {
            intent,
            confidence: 0.6,
            parameters: {},
            reasoning: `Detected keyword: ${keyword}`,
          };
        }
      }
    }

    // Ultimate fallback
    return {
      intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
      confidence: 0.5,
      parameters: {},
      reasoning: 'Fallback - error in analysis',
    };
  }
};

/**
 * Determine if more information is needed based on intent and collected params
 */
const needsMoreInfo = (intent, collectedParams, requiredParams) => {
  if (!requiredParams || requiredParams.length === 0) {
    return false;
  }

  for (const param of requiredParams) {
    if (!collectedParams[param]) {
      return true;
    }
  }

  return false;
};

export const legalContractAnalyzer = {
  analyzeIntent,
  needsMoreInfo,
};
