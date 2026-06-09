import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';

/**
 * @constant {GoogleAuth} auth
 * @description GoogleAuth client configured with 'cloud-platform' scope for accessing Google Cloud APIs.
 *              This client handles authentication details automatically based on the environment
 *              (e.g., service account key file, GCE metadata, gcloud CLI credentials).
 */
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * @constant {Array<string>} VALID_VIDEO_FEATURES
 * @description A whitelist of valid features supported by the Google Cloud Video Intelligence API.
 */
const VALID_VIDEO_FEATURES = [
  'LABEL_DETECTION',
  'SHOT_CHANGE_DETECTION',
  'EXPLICIT_CONTENT_DETECTION',
  'TEXT_DETECTION'
];

/**
 * Initiates a video annotation operation using Google Cloud Video Intelligence.
 * Supports various analysis features like label detection, text detection (OCR),
 * shot change detection, and content moderation.
 *
 * @async
 * @param {string} [inputUri=null] - GCS URI of the video file (e.g., 'gs://bucket/video.mp4').
 *   Required if `inputContent` is not provided.
 * @param {string} [inputContent=null] - Base64 encoded video content string.
 *   Required if `inputUri` is not provided.
 * @param {Array<string>} [features=['LABEL_DETECTION', 'TEXT_DETECTION']] - List of analysis features to enable.
 *   Valid features include: 'LABEL_DETECTION', 'SHOT_CHANGE_DETECTION',
 *   'EXPLICIT_CONTENT_DETECTION', 'TEXT_DETECTION'.
 * @returns {Promise<{ success: boolean, operationName: string, done: boolean, metadata: object | undefined }>}
 *   A promise that resolves with an object containing the operation details.
 *   - `success`: `true` if the operation was successfully initiated.
 *   - `operationName`: The full name of the long-running operation (e.g., 'projects/PROJECT_ID/locations/LOCATION_ID/operations/OPERATION_ID').
 *   - `done`: `true` if the operation is already complete (unlikely for video analysis), `false` otherwise.
 *   - `metadata`: Optional metadata about the operation.
 * @throws {Error} If neither `inputUri` nor `inputContent` is provided, or if the API call fails.
 */
const startVideoAnalysis = async (inputUri = null, inputContent = null, features = ['LABEL_DETECTION', 'TEXT_DETECTION']) => {
  try {
    if (!inputUri && !inputContent) {
      throw new Error('Either inputUri (GCS link) or inputContent (base64) must be provided.');
    }

    // Bug Fix: Validate provided features against a whitelist to prevent invalid API requests.
    const invalidFeatures = features.filter(f => !VALID_VIDEO_FEATURES.includes(f));
    if (invalidFeatures.length > 0) {
      throw new Error(`Invalid video analysis features provided: ${invalidFeatures.join(', ')}. Valid features are: ${VALID_VIDEO_FEATURES.join(', ')}.`);
    }

    logger.info(`Video Intel API: Starting annotation with features: ${features.join(', ')}`);

    const client = await auth.getClient();
    const requestData = { features };

    if (inputUri) {
      requestData.inputUri = inputUri;
    } else {
      requestData.inputContent = inputContent;
    }

    const response = await client.request({
      url: 'https://videointelligence.googleapis.com/v1/videos:annotate',
      method: 'POST',
      data: requestData
    });

    const operationName = response.data?.name;
    if (!operationName) {
      throw new Error('GCP Video Intelligence API did not return an operation name.');
    }

    return {
      success: true,
      operationName,
      done: response.data?.done || false,
      metadata: response.data?.metadata
    };
  } catch (err) {
    logger.error('GCP Video Intel Service Error:', err);
    throw new Error(`GCP Video Analysis trigger failed: ${err.message}`);
  }
};

/**
 * Checks the status of a running Google Cloud Video Intelligence operation.
 * If the operation is complete, it parses and returns the annotation results.
 *
 * @async
 * @param {string} operationName - The full name of the video annotation operation
 *   (e.g., 'projects/PROJECT_ID/locations/LOCATION_ID/operations/OPERATION_ID')
 *   returned by `startVideoAnalysis`.
 * @returns {Promise<{ success: boolean, operationName: string, done: boolean, results: object | null, raw: object }>}
 *   A promise that resolves with an object containing the current operation status and results.
 *   - `success`: `true` if the status check was successful.
 *   - `operationName`: The name of the operation.
 *   - `done`: `true` if the operation is complete, `false` otherwise.
 *   - `results`: An object containing parsed annotation results (`labels`, `text`, `explicit`, `shots`)
 *     if `done` is `true`, otherwise `null`.
 *     - `labels`: Array of detected labels, each with `entity`, `categories`, and `segments`.
 *     - `text`: Array of detected text, each with `text` and `segments`.
 *     - `explicit`: Array of explicit content frames, each with `timeOffset` and `pornographyLikelihood`.
 *     - `shots`: Array of shot change annotations, each with `start` and `end` time offsets.
 *   - `raw`: The raw response data from the Google Cloud Video Intelligence API.
 * @throws {Error} If the API call to check status fails.
 */
const checkVideoAnalysisStatus = async (operationName) => {
  try {
    logger.info(`Video Intel API: Querying status for operation: ${operationName}`);

    const client = await auth.getClient();
    const response = await client.request({
      url: `https://videointelligence.googleapis.com/v1/${operationName}`,
      method: 'GET'
    });

    const data = response.data || {};
    const done = data.done || false;

    let results = null;
    if (done && data.response) {
      const annotationResults = data.response.annotationResults?.[0] || {};

      // Cleanly map results for easy developer consumption
      const labels = (annotationResults.segmentLabelAnnotations || []).map(label => ({
        entity: label.entity?.description,
        categories: (label.categoryEntities || []).map(cat => cat.description),
        segments: (label.segments || []).map(seg => ({
          start: parseFloat(seg.segment?.startTimeOffset || '0'),
          end: parseFloat(seg.segment?.endTimeOffset || '0'),
          confidence: seg.confidence
        }))
      }));

      const text = (annotationResults.textAnnotations || []).map(txt => ({
        text: txt.text,
        segments: (txt.segments || []).map(seg => ({
          start: parseFloat(seg.segment?.startTimeOffset || '0'),
          end: parseFloat(seg.segment?.endTimeOffset || '0'),
          confidence: seg.confidence
        }))
      }));

      const explicit = (annotationResults.explicitAnnotation?.frames || []).map(frame => ({
        timeOffset: parseFloat(frame.timeOffset || '0'),
        pornographyLikelihood: frame.pornographyLikelihood
      }));

      const shots = (annotationResults.shotAnnotations || []).map(shot => ({
        start: parseFloat(shot.startTimeOffset || '0'),
        end: parseFloat(shot.endTimeOffset || '0')
      }));

      results = { labels, text, explicit, shots };
    }

    return {
      success: true,
      operationName,
      done,
      results,
      raw: data
    };
  } catch (err) {
    logger.error(`GCP Video Intel Status Check Error for ${operationName}:`, err);
    throw new Error(`GCP Video Status Check failed: ${err.message}`);
  }
};

/**
 * Synchronously polls a Google Cloud Video Intelligence operation until it completes or a timeout is reached.
 * This helper function repeatedly calls `checkVideoAnalysisStatus` at a specified interval.
 *
 * @async
 * @param {string} operationName - The full name of the video annotation operation to poll.
 * @param {number} [intervalMs=5000] - The interval in milliseconds between polling attempts. Defaults to 5000ms (5 seconds).
 * @param {number} [maxAttempts=24] - The maximum number of polling attempts before timing out.
 *   Defaults to 24 attempts (2 minutes with the default interval).
 * @returns {Promise<{ success: boolean, operationName: string, done: boolean, results: object | null, raw: object }>}
 *   A promise that resolves with the final status and results of the operation once it's done.
 * @throws {Error} If polling times out after `maxAttempts` or if `checkVideoAnalysisStatus` throws an error.
 */
const pollVideoAnalysis = async (operationName, intervalMs = 5000, maxAttempts = 24) => {
  let attempts = 0;
  while (attempts < maxAttempts) {
    logger.info(`Video Intel Polling: Attempt ${attempts + 1}/${maxAttempts} for ${operationName}...`);
    const status = await checkVideoAnalysisStatus(operationName);
    if (status.done) {
      return status;
    }
    attempts++;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Video Analysis polling timed out after ${attempts * (intervalMs / 1000)} seconds.`);
};

/**
 * @namespace GcpVideoIntelService
 * @description Service module for interacting with Google Cloud Video Intelligence API.
 *   Provides functions to start video analysis, check operation status, and poll for completion.
 */
export const GcpVideoIntelService = {
  /**
   * @function startVideoAnalysis
   * @memberof GcpVideoIntelService
   * @description Initiates a video annotation operation.
   * @param {string} [inputUri=null] - GCS URI of the video file.
   * @param {string} [inputContent=null] - Base64 encoded video content string.
   * @param {Array<string>} [features=['LABEL_DETECTION', 'TEXT_DETECTION']] - List of analysis features.
   * @returns {Promise<{ success: boolean, operationName: string, done: boolean, metadata: object | undefined }>}
   */
  startVideoAnalysis,
  /**
   * @function checkVideoAnalysisStatus
   * @memberof GcpVideoIntelService
   * @description Checks the status and retrieves results of a video annotation operation.
   * @param {string} operationName - The full name of the video annotation operation.
   * @returns {Promise<{ success: boolean, operationName: string, done: boolean, results: object | null, raw: object }>}
   */
  checkVideoAnalysisStatus,
  /**
   * @function pollVideoAnalysis
   * @memberof GcpVideoIntelService
   * @description Polls a video annotation operation until completion or timeout.
   * @param {string} operationName - The full name of the video annotation operation to poll.
   * @param {number} [intervalMs=5000] - The interval in milliseconds between polling attempts.
   * @param {number} [maxAttempts=24] - The maximum number of polling attempts.
   * @returns {Promise<{ success: boolean, operationName: string, done: boolean, results: object | null, raw: object }>}
   */
  pollVideoAnalysis
};