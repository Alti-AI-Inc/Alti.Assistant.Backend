import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../../../shared/logger.js';
import config from '../../../../../config/index.js';
import {
  DOCUMENT_CONFIG,
  DOCUMENT_INTENTS,
  DOCUMENT_TYPES,
  OUTPUT_FORMATS,
  TONES,
  LENGTH_OPTIONS,
} from '../document.constant.js';

/**
 * @constant {GoogleGenerativeAI} genAI - Initializes the Google Generative AI client with the API key.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);
/**
 * @constant {GenerativeModel} model - The generative model instance configured for document drafting.
 */
const model = genAI.getGenerativeModel({ model: DOCUMENT_CONFIG.MODEL });

/**
 * Analyzes the user's message and conversation history to determine intent, extract document parameters,
 * and suggest a response. It uses a Generative AI model to understand the user's needs for document drafting.
 *
 * The function constructs a detailed prompt including conversation summary, recent history, and existing parameters
 * to guide the AI in extracting relevant information such as document type, tone, length, and specific content.
 * It also determines if the system can proceed with a draft and suggests improvement questions.
 *
 * @async
 * @param {string} userMessage - The current message from the user.
 * @param {Array<Object>} [conversationHistory=[]] - An array of previous messages in the conversation.
 *   Each object should have `role` (e.g., 'user', 'model') and `content` properties.
 * @param {Object} [existingParams={}] - An object containing parameters already collected or inferred for the document.
 * @param {string|null} [conversationSummary=null] - A concise summary of the previous conversation, if available.
 * @returns {Promise<Object>} A promise that resolves to an object containing the AI's analysis:
 *   - `intent` {string}: The determined intent (e.g., 'draft', 'edit', 'refine').
 *   - `confidence` {number}: A confidence score (0.0-1.0) for the determined intent.
 *   - `parameters` {Object}: An object containing extracted document parameters (e.g., `content`, `documentType`, `tone`).
 *   - `improvementQuestions` {Array<string>}: A list of questions to ask the user to refine the document.
 *   - `canProceed` {boolean}: Indicates if the system has enough information to proceed with a draft.
 *   - `suggestedResponse` {string}: A helpful response to the user based on the analysis.
 * @throws {Error} If the AI response does not contain valid JSON.
 *
 * @example
 * const userMsg = "Write a professional email about a project update.";
 * const history = [{ role: 'user', content: 'Hi' }, { role: 'model', content: 'How can I help?' }];
 * const analysis = await analyzeIntent(userMsg, history);
 * // analysis will be similar to:
 * // {
 * //   intent: 'draft',
 * //   confidence: 0.9,
 * //   parameters: {
 * //     content: 'project update',
 * //     documentType: 'email',
 * //     tone: 'professional'
 * //   },
 * //   improvementQuestions: ['Who is the recipient?', 'What are the key updates?'],
 * //   canProceed: true,
 * //   suggestedResponse: "I can draft a professional email about a project update. What are the key points?"
 * // }
 */
const analyzeIntent = async (
  userMessage,
  conversationHistory = [],
  existingParams = {},
  conversationSummary = null
) => {
  try {
    logger.info('Analyzing document intent with AI', {
      messageLength: userMessage.length,
      historyLength: conversationHistory.length,
      hasSummary: !!conversationSummary,
    });

    // Prepare context
    let contextPrompt = '';

    if (conversationSummary) {
      contextPrompt += `Previous conversation summary: ${conversationSummary}\n\n`;
    } else if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-5);
      contextPrompt += 'Recent conversation:\n';
      recentMessages.forEach((msg) => {
        contextPrompt += `${msg.role}: ${msg.content}\n`;
      });
      contextPrompt += '\n';
    }

    if (Object.keys(existingParams).length > 0) {
      contextPrompt += `Previously collected information:\n${JSON.stringify(existingParams, null, 2)}\n\n`;
    }

    const prompt = `${contextPrompt}Current user message: "${userMessage}"

You are an intelligent document drafting assistant. Analyze the user's message and determine:

1. INTENT: What does the user want?
   - draft: Create a new document
   - edit: Modify existing document
   - refine: Improve document quality
   - expand: Add more content
   - summarize: Make document shorter
   - rewrite: Change tone/style
   - format: Change output format
   - export: Generate file in specific format
   - clarify: User asking questions
   - info: General information request

2. PARAMETERS: Extract any document parameters mentioned:
   - content: Main topic or existing content
   - documentType: ${Object.values(DOCUMENT_TYPES).join(', ')}
   - outputFormat: ${Object.values(OUTPUT_FORMATS).join(', ')}
   - tone: ${Object.values(TONES).join(', ')}
   - length: ${Object.values(LENGTH_OPTIONS).join(', ')}
   - wordCount: Specific word count if mentioned
   - title: Document title if mentioned
   - includeTitle: Should include a title
   - includeDate: Should include date
   - language: Document language (default: en)
   - additionalInstructions: Any specific requirements

3. CONFIDENCE: Rate 0-1 how confident you are about the intent

4. CAN_PROCEED: For DRAFT intent - almost ALWAYS set this to true if user provides ANY topic/content, even minimal. We will generate a draft and then offer to refine it. Only set false if the user's message is completely unclear or is just asking general questions.

5. IMPROVEMENT_QUESTIONS: For drafts, list questions that could improve the document (these will be offered AFTER generating the initial draft)

6. SUGGESTED_RESPONSE: A helpful response to the user

IMPORTANT: This is a DRAFTING assistant. If user wants to draft/write/create ANY document and provides even minimal information, set canProceed=true. Generate the draft first, then offer refinement questions. Don't block on missing details.

Respond in JSON format:
{
  "intent": "draft|edit|refine|expand|summarize|rewrite|format|export|clarify|info",
  "confidence": 0.0-1.0,
  "parameters": {
    "content": "extracted or inferred content",
    "documentType": "type if mentioned",
    "outputFormat": "format if mentioned",
    "tone": "tone if mentioned",
    "length": "length if mentioned",
    "wordCount": number,
    "title": "title if mentioned",
    "includeTitle": boolean,
    "includeDate": boolean,
    "language": "en",
    "additionalInstructions": "any specific requirements"
  },
  "improvementQuestions": ["question1", "question2", "question3"],
  "canProceed": boolean,
  "suggestedResponse": "helpful response text"
}

Be smart about inferring intent and parameters from context. If the user asks to "write a professional letter about...", infer documentType=letter, tone=professional. For draft intent, be permissive - generate drafts with minimal info.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    logger.info('Raw AI response:', response.substring(0, 500));

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    logger.info('Intent analysis completed:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      canProceed: analysis.canProceed,
    });

    return analysis;
  } catch (error) {
    logger.error('Error analyzing intent:', error);

    // Fallback analysis
    return {
      intent: DOCUMENT_INTENTS.DRAFT,
      confidence: 0.5,
      parameters: { content: userMessage },
      improvementQuestions: [
        'What specific details would you like me to include?',
        'Should I adjust the tone or style in any way?',
        'Would you like me to expand on any particular section?',
      ],
      canProceed: true,
      suggestedResponse:
        "I'll create a draft for you based on what you've provided.",
    };
  }
};

/**
 * Summarizes a long conversation history related to document drafting.
 * This function helps in maintaining context for the AI by providing a concise overview
 * of previous interactions and collected parameters.
 *
 * @async
 * @param {Array<Object>} conversationHistory - An array of previous messages in the conversation.
 *   Each object should have `role` (e.g., 'user', 'model') and `content` properties.
 * @param {Object} [collectedParams={}] - An object containing parameters that have been collected
 *   or inferred during the conversation.
 * @returns {Promise<string>} A promise that resolves to a concise summary of the conversation.
 *   Returns a default fallback string if an error occurs during summarization.
 *
 * @example
 * const history = [
 *   { role: 'user', content: 'I need a formal letter.' },
 *   { role: 'model', content: 'About what topic?' },
 *   { role: 'user', content: 'A job application.' }
 * ];
 * const params = { documentType: 'letter', tone: 'formal' };
 * const summary = await summarizeConversation(history, params);
 * // summary might be: "User wants a formal job application letter. Key requirements: formal tone, job application."
 */
const summarizeConversation = async (
  conversationHistory,
  collectedParams = {}
) => {
  try {
    logger.info('Summarizing conversation', {
      messageCount: conversationHistory.length,
    });

    const messagesText = conversationHistory
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    const prompt = `Summarize this document drafting conversation concisely (max 300 words). Focus on:
1. What document the user wants to create
2. Key requirements and specifications
3. Any feedback or changes requested
4. Current state of the document

Conversation:
${messagesText}

Collected parameters:
${JSON.stringify(collectedParams, null, 2)}

Provide a concise summary:`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    logger.info('Conversation summarized', {
      summaryLength: summary.length,
    });

    return summary;
  } catch (error) {
    logger.error('Error summarizing conversation:', error);
    return 'Previous conversation about document drafting.';
  }
};

/**
 * Calculates an estimated token count for the given conversation history and parameters.
 * This is a rough estimate based on character count, assuming approximately 4 characters per token.
 * Useful for monitoring API usage or staying within token limits.
 *
 * @param {Array<Object>} conversationHistory - An array of messages in the conversation.
 *   Each object should have a `content` property.
 * @param {Object} [params={}] - An object containing additional parameters that might contribute to token count.
 * @returns {number} The estimated number of tokens.
 *
 * @example
 * const history = [{ content: 'Hello' }, { content: 'How are you?' }];
 * const currentParams = { documentType: 'email' };
 * const tokens = calculateConversationTokens(history, currentParams);
 * // tokens will be a number like 10-20, depending on string length.
 */
const calculateConversationTokens = (conversationHistory, params = {}) => {
  const messagesText = conversationHistory.map((msg) => msg.content).join(' ');
  const paramsText = JSON.stringify(params);

  // Rough estimate: ~4 chars per token
  const estimatedTokens = (messagesText.length + paramsText.length) / 4;

  return estimatedTokens;
};

/**
 * @namespace conversationAnalyzer
 * @description Provides services for analyzing user conversations to determine intent,
 * extract document parameters, and summarize conversation history using Generative AI.
 */
export const conversationAnalyzer = {
  /**
   * @function analyzeIntent
   * @memberof conversationAnalyzer
   * @description Analyzes the user's message and conversation history to determine intent and extract document parameters.
   * @see {@link analyzeIntent} for detailed documentation.
   */
  analyzeIntent,
  /**
   * @function summarizeConversation
   * @memberof conversationAnalyzer
   * @description Summarizes a long conversation history related to document drafting.
   * @see {@link summarizeConversation} for detailed documentation.
   */
  summarizeConversation,
  /**
   * @function _calculateConversationTokens
   * @memberof conversationAnalyzer
   * @description Calculates an estimated token count for the given conversation history and parameters.
   *   This is an internal utility function.
   * @see {@link calculateConversationTokens} for detailed documentation.
   */
  _calculateConversationTokens: calculateConversationTokens,
};