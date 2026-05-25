import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// Initialize auth helper with vision scope
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Analyzes an image buffer using Google Cloud Vision API.
 * Supports OCR, Safe Search (content moderation), label detection, landmark, and logo detection.
 * 
 * @param {Buffer} fileBuffer - File raw binary buffer
 * @param {Array<string>} features - List of Vision features (e.g., TEXT_DETECTION, SAFE_SEARCH_DETECTION, LABEL_DETECTION, LANDMARK_DETECTION, LOGO_DETECTION)
 * @returns {Promise<object>} Vision API response report
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

export const GcpVisionService = {
  analyzeImage
};
