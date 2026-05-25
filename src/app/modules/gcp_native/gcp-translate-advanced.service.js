import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Automatically detects the language of a given text content.
 * 
 * @param {string} text - Input text content
 * @returns {Promise<object>} Detected language report with confidence scores
 */
const detectTextLanguage = async (text) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    const location = config.google.gcp_location || process.env.GCP_LOCATION || 'global';

    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info('Translate API (Advanced): Detecting language...');

    const client = await auth.getClient();
    const endpoint = `https://translate.googleapis.com/v3/projects/${projectId}/locations/${location}:detectLanguage`;

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: {
        content: text
      }
    });

    const languages = response.data?.languages || [];
    const mainDetection = languages[0] || {};

    return {
      success: true,
      languageCode: mainDetection.languageCode || 'unknown',
      confidence: mainDetection.confidence || 0,
      allDetections: languages
    };
  } catch (err) {
    logger.error('GCP Translate Advanced (Detection) Error:', err);
    throw new Error(`GCP Language Detection failed: ${err.message}`);
  }
};

/**
 * Translates a complete binary document (PDF, DOCX, XLSX) using the GCP Translate Document API.
 * Keeps structural formatting and layouts fully intact.
 * 
 * @param {Buffer} documentBuffer - Binary document buffer
 * @param {string} mimeType - Document mimetype (e.g. 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 * @param {string} targetLanguageCode - Target ISO language code (e.g. 'es', 'fr', 'ja')
 * @param {string} [sourceLanguageCode] - Optional source language code (if omitted, GCP auto-detects)
 * @returns {Promise<object>} Translated document report containing base64 document output bytes
 */
const translateDocument = async (documentBuffer, mimeType, targetLanguageCode, sourceLanguageCode = null) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    // Location must be a regional endpoint for document translation (global not supported for docs)
    const location = config.google.gcp_location && config.google.gcp_location !== 'global' 
      ? config.google.gcp_location 
      : 'us-central1';

    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Translate API (Advanced): Translates document of type "${mimeType}" to "${targetLanguageCode}"`);

    const client = await auth.getClient();
    const endpoint = `https://translate.googleapis.com/v3/projects/${projectId}/locations/${location}:translateDocument`;

    const requestBody = {
      targetLanguageCode,
      documentInput: {
        content: documentBuffer.toString('base64'),
        mimeType
      }
    };

    if (sourceLanguageCode) {
      requestBody.sourceLanguageCode = sourceLanguageCode;
    }

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: requestBody
    });

    const docTranslation = response.data?.documentTranslation || {};
    const translatedContent = docTranslation.byteStreamOutputs?.[0];

    if (!translatedContent) {
      throw new Error('GCP Document Translation did not return translated byte stream.');
    }

    return {
      success: true,
      translatedContent, // Base64 encoded translated file
      mimeType: docTranslation.mimeType || mimeType,
      detectedLanguageCode: docTranslation.detectedLanguageCode
    };
  } catch (err) {
    logger.error('GCP Translate Advanced (Doc Translation) Error:', err);
    throw new Error(`GCP Document Translation failed: ${err.message}`);
  }
};

export const GcpTranslateAdvancedService = {
  detectTextLanguage,
  translateDocument
};
