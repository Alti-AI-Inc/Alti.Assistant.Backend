import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  DOCUMENT_ANALYSIS_CONFIG,
  SYSTEM_PROMPTS,
  ANALYSIS_TYPES,
  OUTPUT_FORMATS,
} from '../document_analysis.constant.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Build analysis prompt based on type and format
 */
const buildAnalysisPrompt = (content, analysisType, outputFormat, userMessage) => {
  const systemPrompt = SYSTEM_PROMPTS[analysisType] || SYSTEM_PROMPTS[ANALYSIS_TYPES.GENERAL];

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
 * Analyze content using Gemini 3.5 Flash
 */
const analyzeWithGemini = async (content, analysisType = ANALYSIS_TYPES.GENERAL, outputFormat = OUTPUT_FORMATS.NARRATIVE, userMessage = null) => {
  try {
    logger.info(`Starting analysis with type: ${analysisType}, format: ${outputFormat}`);

    // Initialize the model
    const model = genAI.getGenerativeModel({
      model: DOCUMENT_ANALYSIS_CONFIG.MODEL,
    });

    // Build the prompt
    const prompt = buildAnalysisPrompt(content, analysisType, outputFormat, userMessage);

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

    logger.info(`Analysis completed successfully (${analysisResult.length} characters)`);

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
 * Analyze content with conversation context
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
    const systemPrompt = SYSTEM_PROMPTS[analysisType] || SYSTEM_PROMPTS[ANALYSIS_TYPES.GENERAL];
    messages.push({
      role: 'user',
      parts: [{ text: `System Context: ${systemPrompt}` }],
    });
    messages.push({
      role: 'model',
      parts: [{ text: 'I understand. I will analyze content according to these guidelines.' }],
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
      history: messages.slice(0, -1),
      generationConfig: {
        temperature: DOCUMENT_ANALYSIS_CONFIG.TEMPERATURE,
        maxOutputTokens: DOCUMENT_ANALYSIS_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const result = await chat.sendMessage(currentPrompt);
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

export const textAnalyzer = {
  analyzeWithGemini,
  analyzeWithContext,
  buildAnalysisPrompt,
};
