/**
 * @file This service provides functionalities for analyzing text content using Google Gemini AI.
 * It includes methods for general analysis and analysis with conversation context.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  DOCUMENT_ANALYSIS_CONFIG,
  SYSTEM_PROMPTS,
  ANALYSIS_TYPES,
  OUTPUT_FORMATS,
} from '../document_analysis.constant.js';

/**
 * @constant {GoogleGenerativeAI} genAI - Initializes the Google Generative AI client using the API key from the configuration.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Builds a comprehensive prompt for the Gemini AI based on the content, desired analysis type,
 * output format, and an optional user-specific message.
 *
 * @param {string} content - The main text content to be analyzed.
 * @param {ANALYSIS_TYPES} analysisType - The type of analysis to perform (e.g., GENERAL, SUMMARY, KEYWORDS).
 * @param {OUTPUT_FORMATS} outputFormat - The desired format for the AI's output (e.g., NARRATIVE, STRUCTURED).
 * @param {string | null} userMessage - An optional specific request or instruction from the user to guide the analysis.
 * @returns {string} The complete prompt string ready to be sent to the Gemini AI.
 */
const buildAnalysisPrompt = (
  content,
  analysisType,
  outputFormat,
  userMessage
) => {
  const systemPrompt =
    SYSTEM_PROMPTS[analysisType] || SYSTEM_PROMPTS[ANALYSIS_TYPES.GENERAL];

  let prompt = `${systemPrompt}\n\n`;

  if (userMessage) {
    prompt += `User Request: ${userMessage}\n\n`;
  }

  prompt += `Content to Analyze:\n${content}\n\n`;

  if (outputFormat === OUTPUT_FORMATS.STRUCTURED) {
    prompt += `Please provide your analysis in a well-structured format with clear headings and sections.`;
  } else {
    prompt += `Please provide your analysis in a clear, narrative format.`;
  }

  return prompt;
};

/**
 * Analyzes the provided content using the Google Gemini AI model (configured as Gemini 3.5 Flash).
 * It constructs a prompt based on the analysis type and output format, then sends it to the AI.
 *
 * @async
 * @param {string} content - The text content to be analyzed.
 * @param {ANALYSIS_TYPES} [analysisType=ANALYSIS_TYPES.GENERAL] - The type of analysis to perform. Defaults to general analysis.
 * @param {OUTPUT_FORMATS} [outputFormat=OUTPUT_FORMATS.NARRATIVE] - The desired format for the AI's output. Defaults to narrative.
 * @param {string | null} [userMessage=null] - An optional specific request from the user.
 * @returns {Promise<object>} An object containing the analysis result, success status, and metadata.
 * @returns {boolean} return.success - True if the analysis was successful, false otherwise.
 * @returns {string} return.analysis - The text result of the analysis from Gemini.
 * @returns {object} return.metadata - Additional information about the analysis, including model, type, format, and timestamp.
 * @throws {Error} If the analysis fails due to an API error or other issues.
 */
const analyzeWithGemini = async (
  content,
  analysisType = ANALYSIS_TYPES.GENERAL,
  outputFormat = OUTPUT_FORMATS.NARRATIVE,
  userMessage = null
) => {
  try {
    logger.info(
      `Starting analysis with type: ${analysisType}, format: ${outputFormat}`
    );

    // Initialize the model
    const model = genAI.getGenerativeModel({
      model: DOCUMENT_ANALYSIS_CONFIG.MODEL,
    });

    // Build the prompt
    const prompt = buildAnalysisPrompt(
      content,
      analysisType,
      outputFormat,
      userMessage
    );

    // Generate content
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: DOCUMENT_ANALYSIS_CONFIG.TEMPERATURE,
        maxOutputTokens: DOCUMENT_ANALYSIS_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const response = result.response;
    const analysisResult = response.text();

    logger.info(
      `Analysis completed successfully (${analysisResult.length} characters)`
    );

    return {
      success: true,
      analysis: analysisResult,
      metadata: {
        model: DOCUMENT_ANALYSIS_CONFIG.MODEL,
        analysisType,
        outputFormat,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error analyzing content with Gemini:', error);
    throw new Error(`Analysis failed: ${error.message}`);
  }
};

/**
 * Analyzes content using Gemini AI, incorporating a conversation history for contextual understanding.
 * This function builds a chat history including a system prompt, recent user/model exchanges,
 * and the current content/user message, then sends it to the AI.
 *
 * @async
 * @param {string} content - The main text content to be analyzed in the current turn.
 * @param {Array<object>} conversationHistory - An array of previous messages in the conversation.
 *   Each object should have `role` ('user' or 'model') and `content` (the message text).
 * @param {ANALYSIS_TYPES} analysisType - The type of analysis to perform for the current turn.
 * @param {OUTPUT_FORMATS} outputFormat - The desired format for the AI's output.
 * @param {string | null} userMessage - An optional specific request from the user for the current turn.
 * @returns {Promise<object>} An object containing the analysis result, success status, and metadata.
 * @returns {boolean} return.success - True if the analysis was successful, false otherwise.
 * @returns {string} return.analysis - The text result of the contextual analysis from Gemini.
 * @returns {object} return.metadata - Additional information about the analysis, including model, type, format, context flag, and timestamp.
 * @throws {Error} If the contextual analysis fails due to an API error or other issues.
 */
const analyzeWithContext = async (
  content,
  conversationHistory,
  analysisType,
  outputFormat,
  userMessage
) => {
  try {
    logger.info('Starting analysis with conversation context');

    const model = genAI.getGenerativeModel({
      model: DOCUMENT_ANALYSIS_CONFIG.MODEL,
    });

    // Build conversation history for context
    const messages = [];

    // Add system prompt
    const systemPrompt =
      SYSTEM_PROMPTS[analysisType] || SYSTEM_PROMPTS[ANALYSIS_TYPES.GENERAL];
    messages.push({
      role: 'user',
      parts: [{ text: `System Context: ${systemPrompt}` }],
    });
    messages.push({
      role: 'model',
      parts: [
        {
          text: 'I understand. I will analyze content according to these guidelines.',
        },
      ],
    });

    // Add recent conversation history (last 5 exchanges)
    const recentHistory = conversationHistory.slice(-5);
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      });
    });

    // Add current request
    let currentPrompt = '';
    if (content) {
      currentPrompt = `Content to Analyze:\n${content}\n\n`;
    }
    if (userMessage) {
      currentPrompt += `User Request: ${userMessage}`;
    }

    messages.push({
      role: 'user',
      parts: [{ text: currentPrompt }],
    });

    // Start chat and get response
    const chat = model.startChat({
      history: messages.slice(0, -1), // All messages except the last one (current prompt) form the history
      generationConfig: {
        temperature: DOCUMENT_ANALYSIS_CONFIG.TEMPERATURE,
        maxOutputTokens: DOCUMENT_ANALYSIS_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const result = await chat.sendMessage(currentPrompt); // Send the last message (current prompt)
    const analysisResult = result.response.text();

    logger.info(`Contextual analysis completed successfully`);

    return {
      success: true,
      analysis: analysisResult,
      metadata: {
        model: DOCUMENT_ANALYSIS_CONFIG.MODEL,
        analysisType,
        outputFormat,
        withContext: true,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error in contextual analysis:', error);
    throw new Error(`Contextual analysis failed: ${error.message}`);
  }
};

/**
 * @namespace textAnalyzer
 * @description Provides a collection of functions for performing text analysis using Google Gemini AI,
 * including general analysis and analysis with conversation context.
 */
export const textAnalyzer = {
  analyzeWithGemini,
  analyzeWithContext,
  buildAnalysisPrompt,
};