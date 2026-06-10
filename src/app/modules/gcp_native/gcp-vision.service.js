/**
 * @file Service for interacting with the Google Cloud Vision API.
 * Provides functionality to analyze images for text, labels, and content moderation.
 * @module gcp-vision.service
 */

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
 * Analyzes an image buffer using the Google Cloud Vision API.
 * This function supports various features like Optical Character Recognition (OCR),
 * Safe Search (content moderation), and detection of labels, landmarks, and logos.
 *
 * @param {Buffer} fileBuffer - The raw binary buffer of the image file.
 * @param {string[]} [features=['TEXT_DETECTION', 'SAFE_SEARCH_DETECTION', 'LABEL_DETECTION']] - An array of Vision API features to apply.
 *        Valid features include 'TEXT_DETECTION', 'SAFE_SEARCH_DETECTION', 'LABEL_DETECTION', 'LANDMARK_DETECTION', 'LOGO_DETECTION', etc.
 * @returns {Promise<VisionAnalysisResult>} A promise that resolves to a structured report of the image analysis.
 * @throws {Error} If the API request fails or an error occurs during processing.
 */
const analyzeImage = async (fileBuffer, features = ['TEXT_DETECTION', 'SAFE_SEARCH_DETECTION', 'LABEL_DETECTION']) => {
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
 * Service object for Google Cloud Vision API operations.
 * @namespace GcpVisionService
 */
export const GcpVisionService = {
  analyzeImage
};