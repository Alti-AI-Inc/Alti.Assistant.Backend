import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  ERROR_MESSAGES,
} from '../translation.constant.js';

/**
 * @typedef {Object} LanguageDetectionResult
 * @property {boolean} success - Indicates if the detection was successful.
 * @property {string} languageCode - The detected ISO 639-1 language code (e.g., 'en', 'es').
 * @property {string} languageName - The full name of the detected language (e.g., 'English', 'Spanish').
 * @property {number} confidence - A confidence score for the detection (0.0 to 1.0).
 * @property {boolean} isSupported - True if the detected language is one of the {@link SUPPORTED_LANGUAGES}.
 */

/**
 * @typedef {Object} TranslationResult
 * @property {boolean} success - Indicates if the translation was successful.
 * @property {string} originalText - The original text that was translated.
 * @property {string} translatedText - The translated text.
 * @property {string} sourceLanguage - The ISO 639-1 code of the source language.
 * @property {string} sourceLanguageName - The full name of the source language.
 * @property {string} targetLanguage - The ISO 639-1 code of the target language.
 * @property {string} targetLanguageName - The full name of the target language.
 * @property {number} characterCount - The character count of the original text.
 * @property {'llm'|'llm-chunked'} method - The method used for translation (e.g., 'llm' for direct, 'llm-chunked' for large texts).
 * @property {number} [chunks] - The number of chunks if `method` is 'llm-chunked'.
 */

/**
 * @typedef {Object} BatchTranslationItem
 * @property {string} originalText - The original text.
 * @property {string} translatedText - The translated text.
 */

/**
 * @typedef {Object} BatchTranslationResult
 * @property {boolean} success - Indicates if the batch translation was successful.
 * @property {BatchTranslationItem[]} translations - An array of original and translated text pairs.
 * @property {string} targetLanguage - The ISO 639-1 code of the target language for all translations.
 * @property {string} targetLanguageName - The full name of the target language.
 * @property {number} count - The number of texts translated in the batch.
 * @property {'llm'} method - The method used for translation.
 */

/**
 * @typedef {Object} SupportedLanguage
 * @property {string} code - The ISO 639-1 language code.
 * @property {string} name - The full name of the language.
 */

/**
 * @typedef {Object} SupportedLanguagesResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {SupportedLanguage[]} languages - An array of supported language objects.
 * @property {number} count - The number of supported languages.
 */

/**
 * Translation API Client using Gemini LLM.
 * Provides context-aware, high-quality translations and language detection capabilities.
 * It leverages Google's Gemini model for robust natural language processing.
 */
class TranslationAPIClient {
  /**
   * Initializes the TranslationAPIClient.
   * Sets up two instances of `ChatGoogleGenerativeAI`:
   * - `model`: For general translation tasks, configured for higher output tokens and moderate temperature.
   * - `detectionModel`: For faster language detection, configured with lower output tokens and temperature.
   * Logs initialization status or errors.
   */
  constructor() {
    try {
      // Initialize Gemini model for translation
      this.model = new ChatGoogleGenerativeAI({
        model: 'gemini-3.5-flash',
        apiKey: config.gemini_secret_key,
        temperature: 0.3, // Lower temperature for consistent translations
        maxOutputTokens: 32000, // Increased for large documents
      });

      // Separate model for language detection (faster)
      this.detectionModel = new ChatGoogleGenerativeAI({
        model: 'gemini-3.5-flash',
        apiKey: config.gemini_secret_key,
        temperature: 0.1,
        maxOutputTokens: 200,
      });

      logger.info('Gemini LLM Translation API initialized');
    } catch (error) {
      logger.error('Failed to initialize Translation API:', error);
      this.model = null;
      this.detectionModel = null;
    }
  }

  /**
   * Validates if a given language code is supported by the application.
   * The check is case-insensitive.
   * @private
   * @param {string} code - The ISO 639-1 language code to validate (e.g., 'en', 'es').
   * @returns {boolean} - True if the language code is supported, false otherwise.
   */
  _isValidLanguageCode(code) {
    const supportedCodes = Object.values(SUPPORTED_LANGUAGES);
    return supportedCodes.includes(code.toLowerCase());
  }

  /**
   * Splits a large text into smaller chunks to accommodate LLM token limits.
   * It attempts to split by paragraphs first, then by sentences if paragraphs are too large.
   * This helps maintain context within chunks while respecting API constraints.
   * @private
   * @param {string} text - The large text string to be chunked.
   * @param {number} [maxChunkSize=20000] - The maximum desired character length for each chunk.
   * @returns {string[]} - An array of text chunks.
   */
  _chunkText(text, maxChunkSize = 20000) {
    // If text is small enough, return as single chunk
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      // If single paragraph is too large, split by sentences
      if (paragraph.length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > maxChunkSize) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
          } else {
            currentChunk += sentence;
          }
        }
      } else if ((currentChunk + paragraph).length > maxChunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph + '\n\n';
      } else {
        currentChunk += paragraph + '\n\n';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    logger.info('Text chunked for translation', {
      totalLength: text.length,
      chunks: chunks.length,
      avgChunkSize: Math.round(text.length / chunks.length),
    });

    return chunks;
  }

  /**
   * Detects the language of a given text using the Gemini LLM.
   * It sends a prompt to the LLM to identify the language and returns a structured result.
   * @param {string} text - The text to detect the language for.
   * @returns {Promise<LanguageDetectionResult>} - A promise that resolves to a {@link LanguageDetectionResult} object.
   * @throws {Error} If the Translation API is not initialized, text is empty, or LLM response is invalid.
   */
  async detectLanguage(text) {
    try {
      if (!this.detectionModel) {
        throw new Error('Translation API not initialized');
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Text is required for language detection');
      }

      logger.info('Detecting language with LLM', {
        textLength: text.length,
      });

      const prompt = `Detect the language of the following text. Respond ONLY with a JSON object in this exact format:
{
  "languageCode": "ISO 639-1 code (e.g., en, es, fr)",
  "languageName": "Full language name",
  "confidence": 0.95
}

Text: "${text.substring(0, 500)}"

JSON response:`;

      const response = await this.detectionModel.invoke(prompt);
      const content = response.content.trim();
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format from LLM');
      }

      const detection = JSON.parse(jsonMatch[0]);
      const languageCode = detection.languageCode.toLowerCase();

      logger.info('Language detected with LLM', {
        language: languageCode,
        languageName: detection.languageName,
        confidence: detection.confidence,
      });

      return {
        success: true,
        languageCode,
        languageName: LANGUAGE_NAMES[languageCode] || detection.languageName,
        confidence: detection.confidence || 0.95,
        isSupported: this._isValidLanguageCode(languageCode),
      };
    } catch (error) {
      logger.error('Language detection failed:', error);
      throw new Error(ERROR_MESSAGES.LANGUAGE_DETECTION_FAILED);
    }
  }

  /**
   * Translates a given text from a source language to a target language using the Gemini LLM.
   * If the source language is not provided or set to 'auto', it will be auto-detected.
   * For very large texts, it delegates to `_translateLargeText` for chunked processing.
   * @param {string} text - The text to translate.
   * @param {string} targetLanguage - The ISO 639-1 code of the target language (e.g., 'es' for Spanish).
   * @param {string} [sourceLanguage=null] - The ISO 639-1 code of the source language (e.g., 'en' for English).
   *                                         If 'auto' or null, the language will be detected.
   * @returns {Promise<TranslationResult>} - A promise that resolves to a {@link TranslationResult} object.
   * @throws {Error} If the Translation API is not initialized, text is empty, target language is missing or invalid,
   *                 or source language is invalid.
   */
  async translateText(text, targetLanguage, sourceLanguage = null) {
    try {
      if (!this.model) {
        throw new Error('Translation API not initialized');
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Text is required for translation');
      }

      if (!targetLanguage) {
        throw new Error(ERROR_MESSAGES.MISSING_TARGET_LANGUAGE);
      }

      // Validate target language
      if (!this._isValidLanguageCode(targetLanguage)) {
        throw new Error(ERROR_MESSAGES.INVALID_LANGUAGE);
      }

      // Validate source language if provided
      if (
        sourceLanguage &&
        sourceLanguage !== 'auto' &&
        !this._isValidLanguageCode(sourceLanguage)
      ) {
        throw new Error(ERROR_MESSAGES.INVALID_LANGUAGE);
      }

      logger.info('Translating text with LLM', {
        textLength: text.length,
        targetLanguage,
        sourceLanguage: sourceLanguage || 'auto-detect',
      });

      // Check if text needs to be chunked (roughly 80k characters = ~20k tokens)
      if (text.length > 80000) {
        return await this._translateLargeText(
          text,
          targetLanguage,
          sourceLanguage
        );
      }

      // Determine the actual source language, detecting if 'auto' or null
      let actualSourceLanguage = sourceLanguage;
      if (!sourceLanguage || sourceLanguage === 'auto') {
        const detection = await this.detectLanguage(text);
        actualSourceLanguage = detection.languageCode;
        logger.info('Source language auto-detected for translation', {
          language: actualSourceLanguage,
        });
      }

      const targetLanguageName = LANGUAGE_NAMES[targetLanguage];
      const sourceLanguageName =
        actualSourceLanguage && actualSourceLanguage !== 'auto'
          ? LANGUAGE_NAMES[actualSourceLanguage]
          : null;

      // Build translation prompt using the determined source language
      const prompt = sourceLanguageName
        ? `Translate the following text from ${sourceLanguageName} to ${targetLanguageName}.

IMPORTANT INSTRUCTIONS:
1. Provide ONLY the translated text, no explanations or notes
2. Preserve the original formatting (line breaks, punctuation)
3. Maintain the tone and style of the original
4. Keep proper nouns unchanged unless they have standard translations
5. For technical terms, use industry-standard translations

Text to translate:
"""
${text}
"""

Translated text:`
        : `Translate the following text to ${targetLanguageName}.

IMPORTANT INSTRUCTIONS:
1. Provide ONLY the translated text, no explanations or notes
2. Preserve the original formatting (line breaks, punctuation)
3. Maintain the tone and style of the original
4. Keep proper nouns unchanged unless they have standard translations
5. For technical terms, use industry-standard translations

Text to translate:
"""
${text}
"""

Translated text:`;

      const response = await this.model.invoke(prompt);
      const translation = response.content.trim();

      logger.info('Translation completed with LLM', {
        sourceLanguage: actualSourceLanguage,
        targetLanguage,
        originalLength: text.length,
        translatedLength: translation.length,
      });

      return {
        success: true,
        originalText: text,
        translatedText: translation,
        sourceLanguage: actualSourceLanguage,
        sourceLanguageName:
          LANGUAGE_NAMES[actualSourceLanguage] || actualSourceLanguage,
        targetLanguage,
        targetLanguageName: LANGUAGE_NAMES[targetLanguage],
        characterCount: text.length,
        method: 'llm', // Indicate translation method
      };
    } catch (error) {
      logger.error('Translation failed:', error);
      throw new Error(error.message || ERROR_MESSAGES.TRANSLATION_FAILED);
    }
  }

  /**
   * Handles the translation of very large texts by first chunking them into smaller, manageable pieces,
   * then translating each chunk individually, and finally reassembling the translated chunks.
   * This method is called internally by `translateText` when the input text exceeds a certain size.
   * @private
   * @param {string} text - The large text string to be translated.
   * @param {string} targetLanguage - The ISO 639-1 code of the target language.
   * @param {string} [sourceLanguage=null] - The ISO 639-1 code of the source language. If 'auto' or null, it will be detected.
   * @returns {Promise<TranslationResult>} - A promise that resolves to a {@link TranslationResult} object for the entire text.
   * @throws {Error} If any part of the chunked translation process fails.
   */
  async _translateLargeText(text, targetLanguage, sourceLanguage = null) {
    try {
      logger.info('Translating large text with chunking', {
        textLength: text.length,
        targetLanguage,
      });

      // Detect source language once for the entire text
      let detectedSourceLanguage = sourceLanguage;
      if (!sourceLanguage || sourceLanguage === 'auto') {
        // Use a substring for detection to save tokens and time
        const detection = await this.detectLanguage(text.substring(0, 5000));
        detectedSourceLanguage = detection.languageCode;
        logger.info('Source language detected for large text', {
          language: detectedSourceLanguage,
        });
      }

      // Split text into chunks
      const chunks = this._chunkText(text, 80000);
      logger.info(`Processing ${chunks.length} chunks`);

      // Translate each chunk
      const translatedChunks = [];
      for (let i = 0; i < chunks.length; i++) {
        logger.info(`Translating chunk ${i + 1}/${chunks.length}`, {
          chunkLength: chunks[i].length,
        });

        const targetLanguageName = LANGUAGE_NAMES[targetLanguage];
        const sourceLanguageName = LANGUAGE_NAMES[detectedSourceLanguage];

        const prompt = `Translate the following text from ${sourceLanguageName} to ${targetLanguageName}.

IMPORTANT INSTRUCTIONS:
1. Provide ONLY the translated text, no explanations or notes
2. Preserve the original formatting (line breaks, punctuation)
3. Maintain the tone and style of the original
4. Keep proper nouns unchanged unless they have standard translations
5. For technical terms, use industry-standard translations
6. This is part ${i + 1} of ${chunks.length} of a larger document - maintain consistency

Text to translate:
"""
${chunks[i]}
"""

Translated text:`;

        const response = await this.model.invoke(prompt);
        translatedChunks.push(response.content.trim());

        // Small delay between chunks to avoid rate limits
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Combine translated chunks
      const fullTranslation = translatedChunks.join('\n\n');

      logger.info('Large text translation completed', {
        sourceLanguage: detectedSourceLanguage,
        targetLanguage,
        originalLength: text.length,
        translatedLength: fullTranslation.length,
        chunks: chunks.length,
      });

      return {
        success: true,
        originalText: text,
        translatedText: fullTranslation,
        sourceLanguage: detectedSourceLanguage,
        sourceLanguageName:
          LANGUAGE_NAMES[detectedSourceLanguage] || detectedSourceLanguage,
        targetLanguage,
        targetLanguageName: LANGUAGE_NAMES[targetLanguage],
        characterCount: text.length,
        method: 'llm-chunked',
        chunks: chunks.length,
      };
    } catch (error) {
      logger.error('Large text translation failed:', error);
      throw new Error(error.message || ERROR_MESSAGES.TRANSLATION_FAILED);
    }
  }

  /**
   * Translates an array of texts (batch translation) using the Gemini LLM.
   * Each text in the array is translated individually to ensure high quality,
   * as direct LLM batch translation can sometimes be less reliable.
   * @param {string[]} texts - An array of text strings to translate.
   * @param {string} targetLanguage - The ISO 639-1 code of the target language for all texts.
   * @param {string} [sourceLanguage=null] - The ISO 639-1 code of the source language. If 'auto' or null, it will be detected for each text.
   * @returns {Promise<BatchTranslationResult>} - A promise that resolves to a {@link BatchTranslationResult} object.
   * @throws {Error} If the Translation API is not initialized, texts array is empty, or target language is missing or invalid.
   */
  async translateBatch(texts, targetLanguage, sourceLanguage = null) {
    try {
      if (!this.model) {
        throw new Error('Translation API not initialized');
      }

      if (!texts || texts.length === 0) {
        throw new Error('Texts array is required for batch translation');
      }

      if (!targetLanguage) {
        throw new Error(ERROR_MESSAGES.MISSING_TARGET_LANGUAGE);
      }

      if (!this._isValidLanguageCode(targetLanguage)) {
        throw new Error(ERROR_MESSAGES.INVALID_LANGUAGE);
      }

      logger.info('Batch translating texts with LLM', {
        count: texts.length,
        targetLanguage,
      });

      // Translate each text individually for better quality
      // LLM batch translation is less reliable than individual calls
      const results = await Promise.all(
        texts.map(async (text) => {
          const result = await this.translateText(
            text,
            targetLanguage,
            sourceLanguage
          );
          return {
            originalText: text,
            translatedText: result.translatedText,
          };
        })
      );

      logger.info('Batch translation completed with LLM', {
        count: results.length,
      });

      return {
        success: true,
        translations: results,
        targetLanguage,
        targetLanguageName: LANGUAGE_NAMES[targetLanguage],
        count: results.length,
        method: 'llm',
      };
    } catch (error) {
      logger.error('Batch translation failed:', error);
      throw new Error(error.message || ERROR_MESSAGES.TRANSLATION_FAILED);
    }
  }

  /**
   * Retrieves a list of all languages supported by the translation service.
   * This list is derived from the `LANGUAGE_NAMES` constant.
   * @returns {Promise<SupportedLanguagesResult>} - A promise that resolves to a {@link SupportedLanguagesResult} object.
   * @throws {Error} If there's an unexpected error during retrieval.
   */
  async getSupportedLanguages() {
    try {
      const languages = Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({
        code,
        name,
      }));

      logger.info('Retrieved supported languages', {
        count: languages.length,
      });

      return {
        success: true,
        languages,
        count: languages.length,
      };
    } catch (error) {
      logger.error('Failed to get supported languages:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance of the TranslationAPIClient.
 * This instance is used throughout the application to perform translation and language detection tasks.
 * @type {TranslationAPIClient}
 */
export const translationAPIClient = new TranslationAPIClient();