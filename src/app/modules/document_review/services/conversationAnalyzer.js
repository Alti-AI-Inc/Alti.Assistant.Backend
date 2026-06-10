import { GoogleGenerativeAI } from '@google-generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import { REVIEW_INTENTS } from '../document_review.constant.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Analyzes the user's message to determine their primary intent and extract specific parameters
 * related to document review. It leverages a Generative AI model to understand natural language
 * and contextualize the request based on conversation history and already collected parameters.
 *
 * The function aims to identify the type of review requested (e.g., grammar check, content analysis)
 * and any specific details like review depth, document type, or aspects to focus on.
 *
 * @param {string} userMessage - The current message from the user to be analyzed.
 * @param {Array<Object>} [conversationHistory=[]] - An array of previous messages in the conversation.
 *   Each object should have `role` (e.g., 'user', 'model') and `content` (the message text).
 *   Example: `[{ role: 'user', content: 'Can you check my essay?' }, { role: 'model', content: 'Sure, what kind of review?' }]`
 * @param {Object} [existingParams={}] - An object containing parameters that have already been collected
 *   or inferred in the current session. These parameters provide additional context to the AI.
 *   Example: `{ reviewType: 'grammar_check', documentType: 'academic' }`
 * @returns {Promise<Object>} A promise that resolves to an object containing the analysis result.
 *   The object has the following structure:
 *   - `intent`: {string} The primary intent identified (e.g., 'general_review', 'grammar_check', 'unknown').
 *     Defaults to `REVIEW_INTENTS.GENERAL_REVIEW` on error or parsing failure.
 *   - `confidence`: {number} A confidence score (0.0-1.0) for the identified intent.
 *     Defaults to 0.5 on error or parsing failure.
 *   - `parameters`: {Object} An object containing extracted parameters. Null or empty values are removed.
 *     - `reviewType`: {string|null} The specific type of review requested (e.g., 'grammar_check', 'content_analysis').
 *     - `reviewDepth`: {string|null} The desired depth of the review ('quick', 'standard', 'detailed', 'comprehensive').
 *     - `documentType`: {string|null} The type of document being reviewed ('academic', 'business', 'technical', etc.).
 *     - `aspects`: {Array<string>} An array of specific aspects to focus on (e.g., ['grammar', 'clarity', 'structure']).
 *     - `additionalInstructions`: {string|null} Any other specific instructions or requests from the user.
 *   - `reasoning`: {string} A brief explanation from the AI about its intent determination.
 *     Defaults to an empty string or an error message on failure.
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

    const prompt = `You are an intent analyzer for a document review assistant. Analyze the user's message and determine:
1. The primary intent (what kind of review they want)
2. Any specific parameters mentioned (review depth, document type, aspects to focus on)

Available intents:
- general_review: General comprehensive review
- grammar_check: Focus on grammar and language
- content_analysis: Analyze content quality and structure
- summary: Create a summary of the document
- suggest_improvements: Provide improvement suggestions
- fact_check: Check factual accuracy
- tone_analysis: Analyze tone and style
- formatting_review: Review formatting and structure
- clarification: User asking questions or clarifying
- unknown: Cannot determine intent

Review aspects that can be mentioned:
- grammar, spelling, clarity, coherence, structure, tone, formatting, factual_accuracy, completeness, consistency

Review depth levels:
- quick: Brief overview
- standard: Normal review
- detailed: In-depth analysis
- comprehensive: Most thorough

Document types:
- academic, business, technical, creative, legal, marketing, general

${historyContext}${paramsContext}

User message: "${userMessage}"

Respond in JSON format only:
{
  "intent": "intent_name",
  "confidence": 0.0-1.0,
  "parameters": {
    "reviewType": "intent_name or null",
    "reviewDepth": "quick/standard/detailed/comprehensive or null",
    "documentType": "type or null",
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
        intent: REVIEW_INTENTS.GENERAL_REVIEW,
        confidence: 0.5,
        parameters: {},
        reasoning: 'Default fallback',
      };
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Clean up parameters - remove null values
    const cleanedParams = {};
    for (const [key, value] of Object.entries(analysis.parameters || {})) {
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value) && value.length > 0) {
          cleanedParams[key] = value;
        } else if (!Array.isArray(value)) {
          cleanedParams[key] = value;
        }
      }
    }

    logger.info('Intent analysis completed', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      parametersFound: Object.keys(cleanedParams).length,
    });

    return {
      intent: analysis.intent || REVIEW_INTENTS.GENERAL_REVIEW,
      confidence: analysis.confidence || 0.5,
      parameters: cleanedParams,
      reasoning: analysis.reasoning || '',
    };
  } catch (error) {
    logger.error('Error analyzing intent:', error);
    // Return default intent on error
    return {
      intent: REVIEW_INTENTS.GENERAL_REVIEW,
      confidence: 0.5,
      parameters: {},
      reasoning: 'Error occurred, using default',
    };
  }
};

/**
 * Summarizes the ongoing conversation history to extract key context relevant to document review.
 * This helps in reducing token usage for subsequent AI calls by providing a concise overview
 * of what has been discussed so far, including user requests and collected parameters.
 *
 * @param {Array<Object>} conversationHistory - An array of previous messages in the conversation.
 *   Each object should have `role` (e.g., 'user', 'model') and `content` (the message text).
 *   Example: `[{ role: 'user', content: 'I uploaded a report.' }, { role: 'model', content: 'What kind of review?' }]`
 * @param {Object} collectedParams - An object containing parameters that have been collected
 *   or inferred during the conversation. These are explicitly included in the prompt to ensure
 *   they are part of the summary.
 *   Example: `{ reviewType: 'content_analysis', documentType: 'business' }`
 * @returns {Promise<string>} A promise that resolves to a concise summary of the conversation
 *   (maximum 200 words). Returns a generic fallback string on error.
 */
const summarizeConversation = async (conversationHistory, collectedParams) => {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });

    const historyText = conversationHistory
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    const prompt = `Summarize the following conversation about document review. Focus on:
1. What document was uploaded (if mentioned)
2. What type of review was requested
3. Key parameters or preferences mentioned
4. Any specific concerns or focus areas
5. Important context for future responses

Conversation:
${historyText}

Collected parameters: ${JSON.stringify(collectedParams)}

Provide a concise summary (max 200 words) that captures the essential context:`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    logger.info('Conversation summarized', {
      originalLength: historyText.length,
      summaryLength: summary.length,
    });

    return summary;
  } catch (error) {
    logger.error('Error summarizing conversation:', error);
    return 'Previous conversation about document review.';
  }
};

/**
 * @typedef {Object} ConversationAnalyzer
 * @property {function(string, Array<Object>, Object): Promise<Object>} analyzeIntent - Function to analyze user intent and extract parameters.
 * @property {function(Array<Object>, Object): Promise<string>} summarizeConversation - Function to summarize conversation history.
 */

/**
 * An object containing utility functions for analyzing user conversations
 * and extracting relevant information for document review processes.
 * It leverages Google's Generative AI models for natural language understanding.
 *
 * @type {ConversationAnalyzer}
 */
export const conversationAnalyzer = {
  analyzeIntent,
  summarizeConversation,
};