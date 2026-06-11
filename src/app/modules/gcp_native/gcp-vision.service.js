/**
 * @file Service for interacting with the Google Cloud Vision API.
 * Provides functionality to analyze images for text, labels, and content moderation.
 * This service is designed to offload heavy image processing to a background worker
 * via Google Cloud Pub/Sub.
 * @module gcp-vision.service
 */

import { PubSub } from '@google-cloud/pubsub';
import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Google Authentication client configured for the Google Cloud Platform scope,
 * which includes the Vision API.
 * @private
 */
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Google Cloud Pub/Sub client.
 * @private
 */
const pubSubClient = new PubSub();
const visionAnalysisTopicName = config.gcp?.pubsub?.visionAnalysisTopic || 'vision-analysis-requests';

/**
 * @typedef {object} SafeSearchResult
 * @property {string} adult - Likelihood of adult content ('UNKNOWN', 'VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY').
 * @property {string} spoof - Likelihood of spoofed content.
 * @property {string} medical - Likelihood of medical content.
 * @property {string} violence - Likelihood of violent content.
 * @property {string} racy - Likelihood of racy content.
 */

/**
 * @typedef {object} VisionAnnotation
 * @property {string} description - The description of the detected entity.
 * @property {number} score - The confidence score of the detection (0 to 1).
 */

/**
 * @typedef {object} LandmarkAnnotation
 * @property {string} description - The description of the detected landmark.
 * @property {number} score - The confidence score of the detection (0 to 1).
 * @property {object} [location] - The latitude and longitude of the landmark.
 * @property {number} location.latitude
 * @property {number} location.longitude
 */

/**
 * @typedef {object} VisionAnalysisResult
 * @property {boolean} success - Indicates if the analysis was successful.
 * @property {string} text - The extracted OCR text from the image.
 * @property {SafeSearchResult} safeSearch - The content moderation analysis results.
 * @property {VisionAnnotation[]} labels - A list of detected labels/tags for the image.
 * @property {LandmarkAnnotation[]} landmarks - A list of detected landmarks.
 * @property {VisionAnnotation[]} logos - A list of detected logos.
 * @property {object} raw - The raw annotation result from the Google Vision API for the first response.
 */

/**
 * Performs the actual image analysis using the Google Cloud Vision API.
 * This function contains the core analysis logic and is intended to be called by a background worker.
 *
 * @private
 * @param {Buffer} fileBuffer - The raw binary buffer of the image file.
 * @param {string[]} features - An array of Vision API features to apply.
 * @returns {Promise<VisionAnalysisResult>} A promise that resolves to a structured report of the image analysis.
 * @throws {Error} If the API request fails or an error occurs during processing.
 */
const _performAnalysis = async (fileBuffer, features) => {
  try {
    logger.info(`Vision API: Annotating image with features: ${features.join(', ')}`);

    const client = await auth.getClient();
    const base64Content = fileBuffer.toString('base64');

    const requests = [
      {
        image: {
          content: base64Content
        },
        features: features.map(type => ({ type, maxResults: 15 }))
      }
    ];

    const response = await client.request({
      url: 'https://vision.googleapis.com/v1/images:annotate',
      method: 'POST',
      data: { requests }
    });

    const annotateResult = response.data?.responses?.[0] || {};
    
    // Parse results cleanly
    const ocrText = annotateResult.fullTextAnnotation?.text || '';
    const safeSearch = annotateResult.safeSearchAnnotation || {};
    const labels = (annotateResult.labelAnnotations || []).map(label => ({
      description: label.description,
      score: label.score
    }));
    const landmarks = (annotateResult.landmarkAnnotations || []).map(landmark => ({
      description: landmark.description,
      score: landmark.score,
      location: landmark.locations?.[0]?.latLng
    }));
    const logos = (annotateResult.logoAnnotations || []).map(logo => ({
      description: logo.description,
      score: logo.score
    }));

    return {
      success: true,
      text: ocrText,
      safeSearch: {
        adult: safeSearch.adult || 'UNKNOWN',
        spoof: safeSearch.spoof || 'UNKNOWN',
        medical: safeSearch.medical || 'UNKNOWN',
        violence: safeSearch.violence || 'UNKNOWN',
        racy: safeSearch.racy || 'UNKNOWN'
      },
      labels,
      landmarks,
      logos,
      raw: annotateResult
    };
  } catch (err) {
    logger.error('GCP Vision Service Error:', err);
    throw new Error(`GCP Vision Annotation failed: ${err.message}`);
  }
};

/**
 * Publishes a message to a Pub/Sub topic to request an asynchronous image analysis.
 * This allows the initial request (e.g., an HTTP request) to return immediately,
 * while the potentially long-running analysis is handled by a background worker.
 *
 * @param {Buffer} fileBuffer - The raw binary buffer of the image file.
 * @param {string[]} [features=['TEXT_DETECTION', 'SAFE_SEARCH_DETECTION', 'LABEL_DETECTION']] - An array of Vision API features to apply.
 * @param {object} [metadata={}] - Additional metadata to pass through the job, e.g., { correlationId, userId, callbackUrl }.
 * @returns {Promise<string>} A promise that resolves to the message ID of the published message.
 */
const requestImageAnalysis = async (fileBuffer, features = ['TEXT_DETECTION', 'SAFE_SEARCH_DETECTION', 'LABEL_DETECTION'], metadata = {}) => {
  try {
    const payload = {
      imageBase64: fileBuffer.toString('base64'),
      features,
      metadata
    };

    const dataBuffer = Buffer.from(JSON.stringify(payload));
    const messageId = await pubSubClient.topic(visionAnalysisTopicName).publishMessage({ data: dataBuffer });
    
    logger.info(`Vision analysis request queued. Topic: ${visionAnalysisTopicName}, Message ID: ${messageId}`);
    return messageId;
  } catch (error) {
    logger.error(`Failed to publish vision analysis request to topic ${visionAnalysisTopicName}`, error);
    throw new Error(`Failed to queue vision analysis: ${error.message}`);
  }
};

/**
 * Processes a Pub/Sub message for image analysis.
 * This function is designed to be the handler for a Pub/Sub subscription listening to the vision analysis topic.
 * It parses the message, calls the Vision API via `_performAnalysis`, and handles the result.
 *
 * @param {import('@google-cloud/pubsub').Message} message - The Pub/Sub message object. The message data is expected to be a JSON string
 * with `imageBase64`, `features`, and `metadata` properties.
 */
const processVisionAnalysisMessage = async (message) => {
  logger.info(`Received vision analysis request with message ID: ${message.id}`);
  try {
    const payload = JSON.parse(message.data.toString());
    const { imageBase64, features, metadata } = payload;

    if (!imageBase64 || !Array.isArray(features)) {
      throw new Error('Invalid message payload: missing imageBase64 or features.');
    }

    const fileBuffer = Buffer.from(imageBase64, 'base64');
    const analysisResult = await _performAnalysis(fileBuffer, features);

    logger.info({
      message: `Successfully analyzed image for message ID: ${message.id}`,
      metadata,
      resultSummary: {
        hasText: !!analysisResult.text,
        labels: analysisResult.labels.map(l => l.description).slice(0, 3)
      }
    });

    // TODO: Handle the analysis result.
    // This is where you would save the result to a database (e.g., Firestore, Cloud SQL)
    // or trigger a subsequent action (e.g., call a webhook, send a notification).
    // Example: await db.collection('analysis_results').doc(metadata.correlationId).set(analysisResult);

    message.ack();
    logger.info(`Acked vision analysis message ID: ${message.id}`);
  } catch (error) {
    logger.error(`Failed to process vision analysis message ID: ${message.id}`, error);
    // Nack the message to have Pub/Sub retry it according to the subscription's retry policy.
    // This prevents losing the message if a transient error occurs.
    message.nack();
  }
};

/**
 * Service object for Google Cloud Vision API operations.
 * @namespace GcpVisionService
 */
export const GcpVisionService = {
  requestImageAnalysis,
  processVisionAnalysisMessage
};