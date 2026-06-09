/**
 * @file This file contains the ConversationAnalyzer class, which uses Google Gemini AI to analyze user messages
 *       within a translation context, extract intent, parameters, and manage conversation flow.
 * @module modules/translation/services/conversationAnalyzer
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  TRANSLATION_INTENTS,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
} from '../translation.constant.js';

// Token limits
const MAX_TOKENS_FOR_CONTEXT = 6000;
const SUMMARIZATION_THRESHOLD = 5000;

/**
 * @typedef {Object} ChatMessage
 * @property {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The content of the message.
 */

/**
 * @typedef {Object} ExtractedParams
 * @property {string} [text] - The text to be translated, if provided inline.
 * @property {string} [targetLanguage] - The ISO 639-1 code of the target language.
 * @property {string} [sourceLanguage] - The ISO 639-1 code of the source language, or 'auto'.
 * @property {boolean} [preserveFormatting] - Whether to preserve formatting during translation.
 * @property {boolean} [hasFile] - Indicates if a file is involved in the translation request.
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string} intent - The detected intent of the user's message (e.g., 'translate_text', 'translate_file').
 * @property {ExtractedParams} extractedParams - Parameters extracted from the user's message.
 * @property {string[]} missingParams - A list of required parameters that are still missing.
 * @property {boolean} needsMoreInfo - True if more information is needed from the user to fulfill the request.
 * @property {string|null} followUpQuestion - A question to ask the user if more information is needed.
 * @property {string} assistantResponse - A friendly response generated for the user.
 * @property {number} confidence - A confidence score (0.0-1.0) for the analysis result.
 */

/**
 * @typedef {Object} DocumentMetadata
 * @property {string} id - Unique identifier for the document.
 * @property {string} originalName - The original name of the uploaded file.
 * @property {Date} uploadedAt - Timestamp when the document was uploaded.
 * @property {number} size - Size of the document in bytes.
 * @property {string} [mimeType] - MIME type of the document.
 * @property {string} [filePath] - Path to the stored document.
 */

/**
 * AI-powered conversation analyzer for translation.
 * Uses Google Gemini models to understand user intent, extract parameters,
 * summarize conversations, and select files based on natural language.
 */
class ConversationAnalyzer {
  /**
   * Initializes the ConversationAnalyzer with two Gemini AI models:
   * one for general intent analysis and parameter extraction, and another for conversation summarization.
   */
  constructor() {
    /**
     * The primary AI model for intent analysis and parameter extraction.
     * @type {ChatGoogleGenerativeAI}
     */
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: config.gemini_secret_key,
      temperature: 0.3, // Lower temperature for more deterministic output
      maxOutputTokens: 2048,
    });

    /**
     * A separate AI model specifically for summarizing conversation history.
     * @type {ChatGoogleGenerativeAI}
     */
    this.summarizerModel = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: config.gemini_secret_key,
      temperature: 0.5, // Slightly higher temperature for more creative summarization
      maxOutputTokens: 1000,
    });
  }

  /**
   * Estimates the token count for a given text string.
   * This is a rough estimation based on common tokenization rules (e.g., 1 token ~ 4 characters).
   * @private
   * @param {string} text - The text to estimate tokens for.
   * @returns {number} The estimated number of tokens.
   */
  _estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculates the total estimated token count for the entire conversation context,
   * including history, existing parameters, and a buffer for the system prompt.
   * @private
   * @param {ChatMessage[]} conversationHistory - An array of previous chat messages.
   * @param {ExtractedParams} existingParams - An object containing parameters already extracted.
   * @returns {number} The total estimated token count.
   */
  _calculateConversationTokens(conversationHistory, existingParams) {
    let totalTokens = 0;
    conversationHistory.forEach((msg) => {
      totalTokens += this._estimateTokens(msg.content);
    });
    totalTokens += this._estimateTokens(JSON.stringify(existingParams));
    totalTokens += 800; // Buffer for system prompt and other overhead
    return totalTokens;
  }

  /**
   * Summarizes the conversation history using an AI model.
   * This helps in reducing the context window size for subsequent intent analysis.
   * @param {ChatMessage[]} conversationHistory - An array of previous chat messages.
   * @param {ExtractedParams} existingParams - An object containing parameters already extracted.
   * @returns {Promise<string>} A promise that resolves to a brief summary of the conversation.
   */
  async summarizeConversation(conversationHistory, existingParams) {
    try {
      const conversationText = conversationHistory
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');

      const prompt = `Summarize this translation conversation. Focus on:
1. What the user wants to translate
2. Source and target languages
3. Any specific requirements or preferences
4. Current stage of the conversation

Conversation:
${conversationText}

Parameters collected:
${JSON.stringify(existingParams, null, 2)}

Brief summary (max 200 words):`;

      const response = await this.summarizerModel.invoke(prompt);
      const summary = response.content.trim();

      logger.info('Conversation summarized', {
        originalMessages: conversationHistory.length,
        summaryLength: summary.length,
        estimatedTokens: this._estimateTokens(summary),
      });

      return summary;
    } catch (error) {
      logger.error('Error summarizing conversation:', error);
      // Fallback summary in case of an error
      return `Translation conversation. Parameters: ${JSON.stringify(existingParams)}`;
    }
  }

  /**
   * Builds the system prompt for the AI model, defining its role, capabilities,
   * supported languages, intent types, critical rules, and the expected JSON output format.
   * @private
   * @returns {string} The complete system prompt string.
   */
  _buildSystemPrompt() {
    const languageList = Object.entries(LANGUAGE_NAMES)
      .map(([code, name]) => `${name} (${code})`)
      .join(', ');

    return `You are an AI assistant helping users with document and text translation.

Your capabilities:
1. Translate text or documents between languages
2. Detect the source language automatically
3. Support various document formats (txt, docx, pdf, html, md, json, csv, xlsx)
4. Preserve formatting when translating

Supported languages: ${languageList}

Intent types:
- translate_text: User wants to translate text directly
- translate_file: User has uploaded or wants to upload a document to translate
- detect_language: User wants to identify the language of some text
- get_supported_languages: User asks what languages are supported
- general_question: General questions about translation

CRITICAL RULES:
1. Always extract the target language (what language to translate TO)
2. Source language is optional (can be auto-detected)
3. If user says "translate to Spanish", targetLanguage should be "es"
4. If user uploads a file or mentions a file, intent is "translate_file"
5. If user provides text inline, intent is "translate_text"
6. Language codes must use ISO 639-1 format (e.g., en, es, fr, de)

You must respond with a valid JSON object with this exact structure:
{
  "intent": "translate_text|translate_file|detect_language|get_supported_languages|general_question",
  "extractedParams": {
    "text": "text to translate (if provided inline)",
    "targetLanguage": "ISO 639-1 language code",
    "sourceLanguage": "ISO 639-1 code or 'auto'",
    "preserveFormatting": true/false,
    "hasFile": true/false
  },
  "missingParams": ["list", "of", "missing", "required", "params"],
  "needsMoreInfo": true/false,
  "followUpQuestion": "Question to ask user if info is missing",
  "assistantResponse": "Friendly response to the user",
  "confidence": 0.0-1.0
}`;
  }

  /**
   * Builds the user prompt, incorporating the current message, conversation history,
   * existing parameters, and an optional conversation summary.
   * @private
   * @param {string} userMessage - The current message from the user.
   * @param {ChatMessage[]} conversationHistory - An array of previous chat messages.
   * @param {ExtractedParams} existingParams - An object containing parameters already extracted.
   * @param {string|null} conversationSummary - An optional summary of the conversation history.
   * @returns {string} The complete user prompt string.
   */
  _buildUserPrompt(
    userMessage,
    conversationHistory,
    existingParams,
    conversationSummary
  ) {
    let contextSection = '';

    if (conversationSummary) {
      contextSection = `Previous conversation summary:\n${conversationSummary}\n\n`;
    } else if (conversationHistory.length > 0) {
      // Use only recent history if no summary is available
      const recentHistory = conversationHistory.slice(-5);
      contextSection = `Recent conversation:\n${recentHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n')}\n\n`;
    }

    const paramsSection =
      Object.keys(existingParams).length > 0
        ? `Parameters collected so far:\n${JSON.stringify(existingParams, null, 2)}\n\n`
        : '';

    return `${contextSection}${paramsSection}Current user message: "${userMessage}"

Analyze this message and respond with the JSON structure specified in the system prompt.`;
  }

  /**
   * Analyzes a user's message to determine their intent and extract relevant parameters
   * for translation tasks. It leverages conversation history and existing parameters
   * to maintain context.
   * @param {string} userMessage - The current message from the user.
   * @param {ChatMessage[]} [conversationHistory=[]] - An array of previous chat messages.
   * @param {ExtractedParams} [existingParams={}] - An object containing parameters already extracted from previous turns.
   * @param {string|null} [conversationSummary=null] - An optional summary of the conversation history, used to reduce token usage.
   * @returns {Promise<AnalysisResult>} A promise that resolves to an object containing the detected intent, extracted parameters, and other conversational cues.
   */
  async analyzeIntent(
    userMessage,
    conversationHistory = [],
    existingParams = {},
    conversationSummary = null
  ) {
    try {
      const estimatedTokens = this._calculateConversationTokens(
        conversationHistory,
        existingParams
      );

      logger.info('Token estimation', {
        estimatedTokens,
        threshold: SUMMARIZATION_THRESHOLD,
        willUseSummary: conversationSummary ? true : false,
        historyLength: conversationHistory.length,
      });

      const systemPrompt = this._buildSystemPrompt();
      const userPrompt = this._buildUserPrompt(
        userMessage,
        conversationHistory,
        existingParams,
        conversationSummary
      );

      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      logger.info('Analyzing translation intent', {
        userMessage: userMessage.substring(0, 100),
        existingParamsCount: Object.keys(existingParams).length,
      });

      const response = await this.model.invoke(fullPrompt);
      let analysisResult = this._parseAnalysisResponse(response.content);

      // Validate and normalize language codes
      if (analysisResult.extractedParams?.targetLanguage) {
        analysisResult.extractedParams.targetLanguage =
          this._normalizeLanguageCode(
            analysisResult.extractedParams.targetLanguage
          );
      }
      if (
        analysisResult.extractedParams?.sourceLanguage &&
        analysisResult.extractedParams.sourceLanguage !== 'auto'
      ) {
        analysisResult.extractedParams.sourceLanguage =
          this._normalizeLanguageCode(
            analysisResult.extractedParams.sourceLanguage
          );
      }

      logger.info('Intent analysis result', {
        intent: analysisResult.intent,
        confidence: analysisResult.confidence,
        needsMoreInfo: analysisResult.needsMoreInfo,
        hasParams: Object.keys(analysisResult.extractedParams).length > 0,
      });

      return analysisResult;
    } catch (error) {
      logger.error('Error analyzing intent:', error);
      return this._getFallbackResponse(userMessage);
    }
  }

  /**
   * Parses the raw AI response content, extracting the JSON object
   * and providing a structured `AnalysisResult`.
   * @private
   * @param {string} content - The raw string content from the AI model's response.
   * @returns {AnalysisResult} The parsed analysis result object.
   * @throws {Error} If no valid JSON object can be found or parsed from the content.
   */
  _parseAnalysisResponse(content) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        intent: parsed.intent || TRANSLATION_INTENTS.GENERAL_QUESTION,
        extractedParams: parsed.extractedParams || {},
        missingParams: parsed.missingParams || [],
        needsMoreInfo: parsed.needsMoreInfo || false,
        followUpQuestion: parsed.followUpQuestion || null,
        assistantResponse:
          parsed.assistantResponse || 'How can I help you with translation?',
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      logger.error('Error parsing analysis response:', error);
      throw error;
    }
  }

  /**
   * Normalizes a given language input (e.g., "Spanish", "es") to its
   * standard ISO 639-1 language code.
   * @private
   * @param {string} languageInput - The language string to normalize.
   * @returns {string} The normalized ISO 639-1 language code, or the original input if no match is found.
   */
  _normalizeLanguageCode(languageInput) {
    const input = languageInput.toLowerCase().trim();

    // Check if it's already a valid code
    if (Object.values(SUPPORTED_LANGUAGES).includes(input)) {
      return input;
    }

    // Try to match by language name
    const entry = Object.entries(LANGUAGE_NAMES).find(
      ([code, name]) => name.toLowerCase() === input
    );

    if (entry) {
      return entry[0];
    }

    // Return as-is and let validation handle it further up the chain if needed
    return input;
  }

  /**
   * Provides a fallback `AnalysisResult` in case the AI model fails to analyze the intent.
   * It typically prompts the user for the target language.
   * @private
   * @param {string} userMessage - The original user message that caused the fallback.
   * @returns {AnalysisResult} A predefined fallback analysis result.
   */
  _getFallbackResponse(userMessage) {
    return {
      intent: TRANSLATION_INTENTS.GENERAL_QUESTION,
      extractedParams: {},
      missingParams: ['targetLanguage'],
      needsMoreInfo: true,
      followUpQuestion: 'What language would you like to translate to?',
      assistantResponse:
        'I can help you translate text or documents. Please specify the target language.',
      confidence: 0.3,
    };
  }

  /**
   * Selects the most appropriate file from a list of multiple documents based on the user's message.
   * This method uses an LLM to intelligently interpret user intent (e.g., "the latest PDF", "the second document").
   * In case of parsing errors or LLM failure, it falls back to selecting the most recently uploaded file.
   * @param {string} userMessage - The user's message referring to one of the documents.
   * @param {DocumentMetadata[]} documents - An array of available document metadata.
   * @returns {Promise<{selectedDocument: DocumentMetadata, selectedIndex: number, confidence: number, reason: string}>}
   *          A promise that resolves to an object containing the selected document, its index,
   *          a confidence score, and a reason for selection.
   */
  async selectFileFromMultiple(userMessage, documents) {
    try {
      const documentList = documents.map((doc, index) => ({
        index: index,
        id: doc.id,
        name: doc.originalName,
        uploadedAt: doc.uploadedAt,
        size: `${(doc.size / 1024).toFixed(2)} KB`,
      }));

      const prompt = `You are helping a user select which file they want to translate from multiple uploaded files.

User's message: "${userMessage}"

Available files:
${documentList.map((doc, i) => `${i + 1}. "${doc.name}" (uploaded: ${new Date(doc.uploadedAt).toLocaleDateString()}, size: ${doc.size})`).join('\n')}

Analyze the user's message and determine which file they are referring to. Look for:
- Explicit file name mentions (e.g., "translate the contract", "the agreement document")
- Positional references (e.g., "first file", "last document", "second one")
- Implicit context (e.g., if they just say "translate to Spanish", use the most recent file)
- File type mentions (e.g., "the PDF", "the Word document")

Respond with ONLY a JSON object:
{
  "selectedIndex": <0-based index of the file>,
  "confidence": <0.0 to 1.0>,
  "reason": "<brief explanation of why this file was selected>"
}`;

      logger.info('Selecting file from multiple documents using LLM', {
        userMessage,
        totalDocuments: documents.length,
      });

      const response = await this.model.invoke(prompt);
      let result;

      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }

        // Validate the response
        if (
          typeof result.selectedIndex === 'number' &&
          result.selectedIndex >= 0 &&
          result.selectedIndex < documents.length
        ) {
          logger.info('File selected by LLM', {
            selectedIndex: result.selectedIndex,
            selectedFile: documents[result.selectedIndex].originalName,
            confidence: result.confidence,
            reason: result.reason,
          });

          return {
            selectedDocument: documents[result.selectedIndex],
            selectedIndex: result.selectedIndex,
            confidence: result.confidence,
            reason: result.reason,
          };
        } else {
          throw new Error('Invalid selectedIndex in response');
        }
      } catch (parseError) {
        logger.warn(
          'Failed to parse LLM file selection response, using most recent',
          {
            error: parseError.message,
            response: response.content,
          }
        );

        // Fallback to most recent file
        return {
          selectedDocument: documents[documents.length - 1],
          selectedIndex: documents.length - 1,
          confidence: 0.5,
          reason: 'Fallback to most recent file due to parsing error',
        };
      }
    } catch (error) {
      logger.error('Error in LLM file selection:', error);

      // Fallback to most recent file
      return {
        selectedDocument: documents[documents.length - 1],
        selectedIndex: documents.length - 1,
        confidence: 0.3,
        reason: 'Fallback to most recent file due to error',
      };
    }
  }
}

/**
 * An instance of the ConversationAnalyzer class, ready for use throughout the application.
 * @type {ConversationAnalyzer}
 */
export const conversationAnalyzer = new ConversationAnalyzer();