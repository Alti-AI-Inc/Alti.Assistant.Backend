import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Automatically detects the language of a given text content.
 * This is a fast, synchronous API call and does not qualify as a long-running job.
 * It is appropriately handled in-process for immediate feedback.
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
 * REFACTORED: Initiates an asynchronous, long-running document translation job using the GCP Batch Translate API.
 * This function offloads the heavy processing from the application server to a managed GCP service.
 * Instead of processing a document in-memory and blocking the request, this function starts a job and returns immediately.
 * The caller is responsible for storing the returned operation name to check for completion later.
 * This approach requires the source document to be in a GCS bucket.
 * 
 * @param {string} gcsInputUri - The GCS URI of the source document. e.g., 'gs://my-bucket/my-folder/document.pdf'
 * @param {string} mimeType - Document mimetype (e.g. 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 * @param {string} gcsOutputUriPrefix - The GCS URI prefix for the output folder. e.g., 'gs://my-bucket/my-folder/translated/'
 * @param {string} targetLanguageCode - Target ISO language code (e.g. 'es', 'fr', 'ja')
 * @param {string} [sourceLanguageCode] - Optional source language code (if omitted, GCP auto-detects)
 * @returns {Promise<object>} An object containing the name of the long-running operation.
 */
const startDocumentTranslation = async (gcsInputUri, mimeType, gcsOutputUriPrefix, targetLanguageCode, sourceLanguageCode = null) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    // Location must be a regional endpoint for document translation (global not supported for docs)
    const location = config.google.gcp_location && config.google.gcp_location !== 'global' 
      ? config.google.gcp_location 
      : 'us-central1';

    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }
    if (!gcsInputUri || !gcsOutputUriPrefix) {
      throw new Error('GCS input URI and output URI prefix are required for batch translation.');
    }

    logger.info(`Translate API (Advanced): Starting batch translation job for "${gcsInputUri}" to "${targetLanguageCode}"`);

    const client = await auth.getClient();
    const endpoint = `https://translate.googleapis.com/v3/projects/${projectId}/locations/${location}:batchTranslateDocument`;

    const requestBody = {
      targetLanguageCodes: [targetLanguageCode],
      inputConfigs: [{
        mimeType: mimeType,
        gcsSource: {
          inputUri: gcsInputUri
        }
      }],
      outputConfig: {
        gcsDestination: {
          outputUriPrefix: gcsOutputUriPrefix
        }
      }
    };

    if (sourceLanguageCode) {
      requestBody.sourceLanguageCode = sourceLanguageCode;
    }

    // This API call is non-blocking. It initiates a Long-Running Operation (LRO) on GCP.
    const [operation] = await client.request({
      url: endpoint,
      method: 'POST',
      data: requestBody
    });

    logger.info(`Successfully started translation LRO: ${operation.name}`);

    return {
      success: true,
      operationName: operation.name,
      message: 'Document translation job started successfully. Check the operation status for completion.'
    };
  } catch (err) {
    logger.error('GCP Translate Advanced (Batch Doc Translation) Error:', err);
    throw new Error(`GCP Batch Document Translation failed to start: ${err.message}`);
  }
};

export const GcpTranslateAdvancedService = {
  detectTextLanguage,
  startDocumentTranslation
};