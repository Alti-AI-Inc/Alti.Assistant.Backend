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
 * AI-powered conversation analyzer for translation
 * Uses Gemini to understand user intent and extract parameters
 */
class ConversationAnalyzer {
  constructor() {
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: config.gemini_secret_key,
      temperature: 0.3,
      maxOutputTokens: 2048,
    });

    this.summarizerModel = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: config.gemini_secret_key,
      temperature: 0.5,
      maxOutputTokens: 1000,
    });
  }

  /**
   * Estimate token count
   */
  _estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate total tokens for conversation
   */
  _calculateConversationTokens(conversationHistory, existingParams) {
    let totalTokens = 0;
    conversationHistory.forEach(msg => {
      totalTokens += this._estimateTokens(msg.content);
    });
    totalTokens += this._estimateTokens(JSON.stringify(existingParams));
    totalTokens += 800; // System prompt
    return totalTokens;
  }

  /**
   * Summarize conversation history
   */
  async summarizeConversation(conversationHistory, existingParams) {
    try {
      const conversationText = conversationHistory
        .map(msg => `${msg.role}: ${msg.content}`)
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
        estimatedTokens: this._estimateTokens(summary)
      });

      return summary;
    } catch (error) {
      logger.error('Error summarizing conversation:', error);
      return `Translation conversation. Parameters: ${JSON.stringify(existingParams)}`;
    }
  }

  /**
   * Build system prompt
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
   * Build user prompt
   */
  _buildUserPrompt(userMessage, conversationHistory, existingParams, conversationSummary) {
    let contextSection = '';

    if (conversationSummary) {
      contextSection = `Previous conversation summary:\n${conversationSummary}\n\n`;
    } else if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-5);
      contextSection = `Recent conversation:\n${recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\n`;
    }

    const paramsSection = Object.keys(existingParams).length > 0
      ? `Parameters collected so far:\n${JSON.stringify(existingParams, null, 2)}\n\n`
      : '';

    return `${contextSection}${paramsSection}Current user message: "${userMessage}"

Analyze this message and respond with the JSON structure specified in the system prompt.`;
  }

  /**
   * Analyze user message and extract intent + parameters
   */
  async analyzeIntent(userMessage, conversationHistory = [], existingParams = {}, conversationSummary = null) {
    try {
      const estimatedTokens = this._calculateConversationTokens(conversationHistory, existingParams);

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
          this._normalizeLanguageCode(analysisResult.extractedParams.targetLanguage);
      }
      if (analysisResult.extractedParams?.sourceLanguage &&
        analysisResult.extractedParams.sourceLanguage !== 'auto') {
        analysisResult.extractedParams.sourceLanguage =
          this._normalizeLanguageCode(analysisResult.extractedParams.sourceLanguage);
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
   * Parse AI response
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
        assistantResponse: parsed.assistantResponse || 'How can I help you with translation?',
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      logger.error('Error parsing analysis response:', error);
      throw error;
    }
  }

  /**
   * Normalize language codes to ISO 639-1
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

    // Return as-is and let validation handle it
    return input;
  }

  /**
   * Fallback response if analysis fails
   */
  _getFallbackResponse(userMessage) {
    return {
      intent: TRANSLATION_INTENTS.GENERAL_QUESTION,
      extractedParams: {},
      missingParams: ['targetLanguage'],
      needsMoreInfo: true,
      followUpQuestion: 'What language would you like to translate to?',
      assistantResponse: 'I can help you translate text or documents. Please specify the target language.',
      confidence: 0.3,
    };
  }
}

export const conversationAnalyzer = new ConversationAnalyzer();
