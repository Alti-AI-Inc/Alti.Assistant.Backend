import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Generates vector embeddings for a given text input using Google's SOTA text-embedding-004 model.
 * 
 * @param {string|Array<string>} texts - Input string or array of strings to embed
 * @param {string} [taskType] - Vertex Task type (RETRIEVAL_QUERY, RETRIEVAL_DOCUMENT, SEMANTIC_SIMILARITY, CLASSIFICATION, CLUSTERING)
 * @returns {Promise<object>} Vector embeddings array response
 */
const getTextEmbeddings = async (texts, taskType = 'RETRIEVAL_DOCUMENT') => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    const location = config.google.gcp_location || process.env.GCP_LOCATION || 'us-central1';

    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    const textList = Array.isArray(texts) ? texts : [texts];
    logger.info(`Embeddings API: Generating embeddings for ${textList.length} inputs...`);

    const client = await auth.getClient();

    const instances = textList.map(text => ({
      content: text,
      taskType
    }));

    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-004:predict`;

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: { instances }
    });

    const predictions = response.data?.predictions || [];
    const embeddings = predictions.map(pred => pred.embeddings?.values || []);

    return {
      success: true,
      embeddings: Array.isArray(texts) ? embeddings : embeddings[0],
      model: 'text-embedding-004',
      dimensions: embeddings[0]?.length || 768
    };
  } catch (err) {
    logger.error('GCP Embeddings Service Error:', err);
    throw new Error(`GCP Embeddings generation failed: ${err.message}`);
  }
};

/**
 * Generates multimodal embeddings from text and/or image content using multimodalembedding@001.
 * 
 * @param {string} [text] - Text prompt to embed
 * @param {Buffer} [imageBuffer] - Binary image file buffer to embed
 * @returns {Promise<object>} Unified multimodal embedding vectors
 */
const getMultimodalEmbeddings = async (text = null, imageBuffer = null) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    const location = config.google.gcp_location || process.env.GCP_LOCATION || 'us-central1';

    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }
    if (!text && !imageBuffer) {
      throw new Error('Either text or imageBuffer must be provided for multimodal embedding.');
    }

    logger.info(`Embeddings API: Generating multimodal embedding (hasText: ${!!text}, hasImage: ${!!imageBuffer})...`);

    const client = await auth.getClient();
    const instance = {};

    if (text) {
      instance.text = text;
    }
    if (imageBuffer) {
      instance.image = {
        bytesBase64Encoded: imageBuffer.toString('base64')
      };
    }

    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/multimodalembedding@001:predict`;

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: { instances: [instance] }
    });

    const predictions = response.data?.predictions?.[0] || {};
    const textEmbedding = predictions.textEmbedding || [];
    const imageEmbedding = predictions.imageEmbedding || [];

    return {
      success: true,
      textEmbedding: textEmbedding.length > 0 ? textEmbedding : null,
      imageEmbedding: imageEmbedding.length > 0 ? imageEmbedding : null,
      model: 'multimodalembedding@001',
      dimensions: textEmbedding.length || imageEmbedding.length || 1408
    };
  } catch (err) {
    logger.error('GCP Multimodal Embeddings Service Error:', err);
    throw new Error(`GCP Multimodal Embeddings failed: ${err.message}`);
  }
};

export const GcpEmbeddingsService = {
  getTextEmbeddings,
  getMultimodalEmbeddings
};
