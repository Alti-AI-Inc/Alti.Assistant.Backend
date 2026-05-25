import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Starts a video annotation operation using Google Cloud Video Intelligence.
 * Supports label detection, text detection (OCR), shot change detection, and content moderation.
 * 
 * @param {string} [inputUri] - GCS URI of the video file (e.g. 'gs://bucket/video.mp4')
 * @param {string} [inputContent] - Base64 encoded video content string
 * @param {Array<string>} [features] - List of analysis features (LABEL_DETECTION, SHOT_CHANGE_DETECTION, EXPLICIT_CONTENT_DETECTION, TEXT_DETECTION)
 * @returns {Promise<object>} Video annotation operation report
 */
const startVideoAnalysis = async (inputUri = null, inputContent = null, features = ['LABEL_DETECTION', 'TEXT_DETECTION']) => {
  try {
    if (!inputUri && !inputContent) {
      throw new Error('Either inputUri (GCS link) or inputContent (base64) must be provided.');
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
 * Checks the status of a running Video Intelligence operation.
 * 
 * @param {string} operationName - Operation name returned by startVideoAnalysis
 * @returns {Promise<object>} Current operation status and results if complete
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
 * Synchronous helper that polls a video analysis operation until complete.
 * Timeout defaults to 120 seconds.
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

export const GcpVideoIntelService = {
  startVideoAnalysis,
  checkVideoAnalysisStatus,
  pollVideoAnalysis
};
