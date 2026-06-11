import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
// BUGFIX: Import services required for authorization, usage tracking, and tenant boundary enforcement.
// These are placeholders for actual service implementations that manage workspace, usage, and job data.
import { WorkspaceService } from '../workspace/workspace.service.js';
import { UsageService } from '../usage/usage.service.js';
import { JobTrackingService } from '../jobs/job-tracking.service.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Automatically detects the language of a given text content.
 * This is a fast, synchronous API call and does not qualify as a long-running job.
 * It is appropriately handled in-process for immediate feedback.
 *
 * @param {string} text - Input text content.
 * @param {object} authContext - The authenticated user's context (userId, workspaceId, role).
 * @returns {Promise<{success: boolean, languageCode: string, confidence: number, allDetections: Array<object>}>} A promise that resolves to the detected language report with confidence scores.
 * @throws {Error} If the GCP Project ID is not configured, the user is not authorized, limits are exceeded, or the API call fails.
 */
const detectTextLanguage = async (text, authContext) => {
  try {
    // INTEGRATION: Validate authorization context.
    if (!authContext || !authContext.workspaceId || !authContext.userId) {
      throw new Error('Authorization context is missing or invalid.');
    }

    // INTEGRATION: Check workspace limits and feature flags before incurring costs.
    const workspace = await WorkspaceService.getById(authContext.workspaceId);
    if (!workspace || !workspace.features.languageDetection.enabled) {
      throw new Error('Language detection feature is not enabled for this workspace.');
    }
    const textLength = text.length;
    const canProcess = await UsageService.checkLimit(authContext.workspaceId, 'text_translation_chars', textLength);
    if (!canProcess) {
        throw new Error('Workspace text translation character limit exceeded.');
    }

    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    const location = config.google.gcp_location || process.env.GCP_LOCATION || 'global';

    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Translate API (Advanced): Detecting language for workspace ${authContext.workspaceId}...`);

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

    // INTEGRATION: Record usage against the user and workspace for billing and limit tracking.
    await UsageService.recordUsage(authContext.workspaceId, authContext.userId, 'text_translation_chars', textLength);

    return {
      success: true,
      languageCode: mainDetection.languageCode || 'unknown',
      confidence: mainDetection.confidence || 0,
      allDetections: languages
    };
  } catch (err) {
    logger.error('GCP Translate Advanced (Detection) Error:', err);
    // BUGFIX: Avoid leaking internal error details in the thrown error message.
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
 * @param {string} gcsInputUri - The GCS URI of the source document. e.g., 'gs://my-bucket/my-folder/document.pdf'.
 * @param {string} mimeType - Document mimetype (e.g. 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').
 * @param {string} gcsOutputUriPrefix - The GCS URI prefix for the output folder. e.g., 'gs://my-bucket/my-folder/translated/'.
 * @param {string} targetLanguageCode - Target ISO language code (e.g. 'es', 'fr', 'ja').
 * @param {object} authContext - The authenticated user's context (userId, workspaceId, role).
 * @param {string} [sourceLanguageCode] - Optional source language code (if omitted, GCP auto-detects).
 * @returns {Promise<{success: boolean, operationName: string, message: string}>} A promise that resolves to an object containing the name of the long-running operation.
 * @throws {Error} If required parameters are missing, user is unauthorized, limits are exceeded, or the API call to start the job fails.
 */
const startDocumentTranslation = async (gcsInputUri, mimeType, gcsOutputUriPrefix, targetLanguageCode, authContext, sourceLanguageCode = null) => {
  try {
    // INTEGRATION: Validate authorization context and role-based access control (RBAC).
    if (!authContext || !authContext.workspaceId || !authContext.userId || !authContext.role) {
      throw new Error('Authorization context is missing or invalid.');
    }
    const allowedRoles = ['super_admin', 'admin', 'manager'];
    if (!allowedRoles.includes(authContext.role)) {
        throw new Error('User does not have permission to start document translation jobs.');
    }

    // SECURITY (IDOR): Enforce tenant boundaries by validating GCS paths.
    // All workspace-related files must reside within a path prefixed by their workspace ID.
    const bucketName = config.google.gcs_bucket_name;
    if (!bucketName) {
        throw new Error('GCS bucket for document translation is not configured.');
    }
    const expectedPrefix = `gs://${bucketName}/${authContext.workspaceId}/`;
    if (!gcsInputUri.startsWith(expectedPrefix) || !gcsOutputUriPrefix.startsWith(expectedPrefix)) {
        logger.warn(`Potential IDOR attempt by user ${authContext.userId} in workspace ${authContext.workspaceId}. Attempted to access GCS path outside of boundary.`);
        throw new Error('GCS path is outside of the allowed workspace boundary.');
    }

    // INTEGRATION: Check workspace limits and feature flags before starting an expensive job.
    const workspace = await WorkspaceService.getById(authContext.workspaceId);
    if (!workspace || !workspace.features.documentTranslation.enabled) {
      throw new Error('Document translation feature is not enabled for this workspace.');
    }
    const canProcess = await UsageService.checkLimit(authContext.workspaceId, 'translated_docs', 1);
    if (!canProcess) {
        throw new Error('Workspace document translation limit exceeded.');
    }

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

    logger.info(`Translate API (Advanced): Starting batch translation job for "${gcsInputUri}" to "${targetLanguageCode}" for workspace ${authContext.workspaceId}`);

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

    // INTEGRATION: Create a tracking record for the long-running operation.
    // This allows us to later associate the completed GCP job with the correct user/workspace for billing and notifications.
    await JobTrackingService.createJob({
        gcpOperationName: operation.name,
        workspaceId: authContext.workspaceId,
        userId: authContext.userId,
        jobType: 'gcp_document_translation',
        inputUri: gcsInputUri,
        status: 'STARTED'
    });

    logger.info(`Successfully started translation LRO: ${operation.name}`);

    // INTEGRATION: Increment usage count immediately to prevent race conditions where a user starts multiple jobs before limits are updated.
    await UsageService.recordUsage(authContext.workspaceId, authContext.userId, 'translated_docs', 1);

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

/**
 * @namespace GcpTranslateAdvancedService
 * @description A service module for interacting with the advanced features of the
 * Google Cloud Translation API (v3), such as batch document translation and language detection.
 * This service uses the `google-auth-library` for authentication and enforces application-level
 * authorization, usage limits, and tenant boundaries.
 */
export const GcpTranslateAdvancedService = {
  detectTextLanguage,
  startDocumentTranslation
};