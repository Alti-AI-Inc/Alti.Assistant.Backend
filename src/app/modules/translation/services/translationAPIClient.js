import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  ERROR_MESSAGES,
} from '../translation.constant.js';

/**
 * Translation API Client using Gemini LLM
 * Provides context-aware, high-quality translations
 */
class TranslationAPIClient {
  constructor() {
    try {
      // Initialize Gemini model for translation
      this.model = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash',
        apiKey: config.gemini_secret_key,
        temperature: 0.3, // Lower temperature for consistent translations
        maxOutputTokens: 32000, // Increased for large documents
      });

      // Separate model for language detection (faster)
      this.detectionModel = new ChatGoogleGenerativeAI({
        model: 'gemini-2.5-flash',
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
   * Validate language code
   * @private
   */
  _isValidLanguageCode(code) {
    const supportedCodes = Object.values(SUPPORTED_LANGUAGES);
    return supportedCodes.includes(code.toLowerCase());
  }

  /**
   * Split large text into chunks for translation
   * @private
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
   * Detect language of text using Gemini
   * @param {string} text - Text to detect language for
   * @returns {Promise<Object>} - Detection result with language code and confidence
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
      console.log('Detection response:', response);
      const content = response.content.trim();
      console.log('Detection response content:', content);
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
   * Translate text using Gemini LLM
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Target language code (ISO 639-1)
   * @param {string} sourceLanguage - Source language code (optional, auto-detect if not provided)
   * @returns {Promise<Object>} - Translation result
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

      const targetLanguageName = LANGUAGE_NAMES[targetLanguage];
      const sourceLanguageName =
        sourceLanguage && sourceLanguage !== 'auto'
          ? LANGUAGE_NAMES[sourceLanguage]
          : null;

      // Build translation prompt
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

      // Detect source language if not provided
      let detectedSourceLanguage = sourceLanguage;
      if (!sourceLanguage || sourceLanguage === 'auto') {
        const detection = await this.detectLanguage(text);
        detectedSourceLanguage = detection.languageCode;
      }

      logger.info('Translation completed with LLM', {
        sourceLanguage: detectedSourceLanguage,
        targetLanguage,
        originalLength: text.length,
        translatedLength: translation.length,
      });

      return {
        success: true,
        originalText: text,
        translatedText: translation,
        sourceLanguage: detectedSourceLanguage,
        sourceLanguageName:
          LANGUAGE_NAMES[detectedSourceLanguage] || detectedSourceLanguage,
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
   * Translate large text by chunking
   * @private
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
   * Translate multiple texts (batch translation) using Gemini
   * @param {string[]} texts - Array of texts to translate
   * @param {string} targetLanguage - Target language code
   * @param {string} sourceLanguage - Source language code (optional)
   * @returns {Promise<Object>} - Batch translation result
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
   * Get supported languages
   * @returns {Promise<Object>} - List of supported languages
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

export const translationAPIClient = new TranslationAPIClient();
