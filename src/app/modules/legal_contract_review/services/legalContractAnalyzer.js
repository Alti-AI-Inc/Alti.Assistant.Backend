import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  CONTRACT_REVIEW_INTENTS,
  INTENT_KEYWORDS,
} from '../legal_contract_review.constant.js';

/**
 * Google Generative AI instance initialized with the API key from configuration.
 * Used to interact with the Gemini models for AI-powered tasks.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Analyzes the user's message to determine their primary intent and extract specific parameters
 * related to legal contract review. It leverages the Google Gemini AI model for natural language understanding.
 * Includes a fallback mechanism using keyword detection if the AI analysis fails or encounters an error.
 *
 * The AI prompt is carefully constructed to guide the model to identify:
 * 1. Primary intent (e.g., general_review, clause_analysis, risk_assessment).
 * 2. Specific parameters like review depth, contract type, and aspects to focus on.
 * It also incorporates recent conversation history and already collected parameters for better context.
 *
 * @param {string} userMessage - The current message from the user.
 * @param {Array<Object>} [conversationHistory=[]] - An array of previous messages in the conversation,
 *   each object having `role` (e.g., 'user', 'model') and `content` properties.
 * @param {Object} [existingParams={}] - An object containing parameters already collected or known
 *   from previous interactions. These are used to provide context to the AI.
 * @returns {Promise<Object>} A promise that resolves to an object containing:
 *   - `intent` {string}: The determined primary intent (e.g., 'general_review', 'clause_analysis').
 *     Defaults to `CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW` on failure.
 *   - `confidence` {number}: A confidence score (0.0-1.0) for the determined intent.
 *     Defaults to 0.5 on failure.
 *   - `parameters` {Object}: An object containing extracted parameters like `reviewType`, `reviewDepth`,
 *     `contractType`, `aspects`, `additionalInstructions`. Null or empty values are cleaned.
 *   - `reasoning` {string}: A brief explanation for the determined intent and parameters.
 * @throws {Error} If there's a critical error during AI model interaction or response parsing
 *   that cannot be handled by the internal fallback mechanisms.
 */
const analyzeIntent = async (
  userMessage,
  conversationHistory = [],
  existingParams = {}
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    // Build context from conversation history
    let historyContext = '';
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-3);
      historyContext =
        '\n\nRecent conversation:\n' +
        recentMessages.map((msg) => `${msg.role}: ${msg.content}`).join('\n');
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
      if (
        value !== null &&
        value !== 'null' &&
        !(Array.isArray(value) && value.length === 0)
      ) {
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
          logger.info('Using fallback keyword-based intent detection', {
            intent,
          });
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
 * Determines if more information is needed from the user based on the current intent
 * and the parameters already collected. It checks if any of the `requiredParams` are
 * missing from the `collectedParams`.
 *
 * @param {string} intent - The current determined intent. While not directly used in the
 *   current implementation of the function's logic, it provides context and can be used
 *   for future enhancements where required parameters might vary by intent.
 * @param {Object} collectedParams - An object containing parameters that have been collected so far.
 *   Keys are parameter names (e.g., 'contractType', 'reviewDepth'), and values are the collected data.
 * @param {Array<string>} requiredParams - An array of strings, where each string is the name of a
 *   parameter that is considered essential for the current intent to proceed.
 * @returns {boolean} True if any of the `requiredParams` are missing (i.e., not present or falsy)
 *   from `collectedParams`, indicating that more information is needed. Returns false otherwise.
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

/**
 * @namespace legalContractAnalyzer
 * @description Provides services for analyzing user intent and managing information
 *   collection related to legal contract review processes. This module encapsulates
 *   AI-powered intent detection and utility functions for conversational flow management.
 */
export const legalContractAnalyzer = {
  analyzeIntent,
  needsMoreInfo,
};