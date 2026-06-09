import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';

/**
 * Initializes a GoogleAuth client with the necessary scopes for accessing Google Cloud Platform services.
 * This client is used to obtain authenticated requests for GCP APIs.
 * @type {import('google-auth-library').GoogleAuth}
 */
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Analyzes natural language text using Google Cloud Natural Language API for various operations.
 * It can perform sentiment analysis, named entity recognition, and text classification.
 *
 * @param {string} text - The input text string to be analyzed.
 * @param {Array<('SENTIMENT'|'ENTITY'|'CLASSIFY')>} [operations=['SENTIMENT', 'ENTITY']] - An array of NLP operations to perform.
 *   Valid operations include:
 *   - 'SENTIMENT': Performs sentiment analysis on the document and individual sentences.
 *   - 'ENTITY': Performs named entity recognition, identifying people, places, events, etc.
 *   - 'CLASSIFY': Classifies the document into categories (requires a minimum of 20 words).
 * @returns {Promise<object>} A promise that resolves to an object containing the analysis results.
 *   The object structure includes:
 *   - `success`: {boolean} Indicates if the analysis was successful.
 *   - `results`: {object} An object containing the specific analysis outputs:
 *     - `sentiment`: {object} (if 'SENTIMENT' operation is included)
 *       - `score`: {number} Overall sentiment score (-1.0 to 1.0).
 *       - `magnitude`: {number} Overall magnitude of sentiment (0.0 to +inf).
 *       - `sentences`: {Array<object>} Sentiment analysis for each sentence.
 *         - `text`: {string} Content of the sentence.
 *         - `score`: {number} Sentiment score for the sentence.
 *         - `magnitude`: {number} Magnitude for the sentence.
 *     - `entities`: {Array<object>} (if 'ENTITY' operation is included)
 *       - `name`: {string} The entity's name.
 *       - `type`: {string} The entity's type (e.g., PERSON, LOCATION, ORGANIZATION).
 *       - `salience`: {number} The salience score of the entity.
 *       - `metadata`: {object} Additional metadata about the entity.
 *     - `classification`: {Array<object>} (if 'CLASSIFY' operation is included and text has >= 20 words)
 *       - `name`: {string} The category name (e.g., "/Arts & Entertainment").
 *       - `confidence`: {number} The confidence score for the category.
 *   - `textLength`: {number} The length of the input text.
 * @throws {Error} Throws an error if the GCP NLP analysis fails due to API errors or network issues.
 */
const analyzeText = async (text, operations = ['SENTIMENT', 'ENTITY']) => {
  try {
    logger.info(`NLP API: Analyzing text for operations: ${operations.join(', ')}`);

    const client = await auth.getClient();
    const results = {};

    const document = {
      type: 'PLAIN_TEXT',
      content: text
    };

    // 1. Sentiment analysis
    if (operations.includes('SENTIMENT')) {
      const response = await client.request({
        url: 'https://language.googleapis.com/v1/documents:analyzeSentiment',
        method: 'POST',
        data: { document }
      });
      const sentiment = response.data?.documentSentiment || {};
      results.sentiment = {
        score: sentiment.score || 0,
        magnitude: sentiment.magnitude || 0,
        sentences: (response.data?.sentences || []).map(s => ({
          text: s.text?.content,
          score: s.sentiment?.score || 0,
          magnitude: s.sentiment?.magnitude || 0
        }))
      };
    }

    // 2. Named Entity analysis
    if (operations.includes('ENTITY')) {
      const response = await client.request({
        url: 'https://language.googleapis.com/v1/documents:analyzeEntities',
        method: 'POST',
        data: { document }
      });
      results.entities = (response.data?.entities || []).map(ent => ({
        name: ent.name,
        type: ent.type,
        salience: ent.salience,
        metadata: ent.metadata
      }));
    }

    // 3. Document classification (requires minimum 20 words)
    if (operations.includes('CLASSIFY')) {
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      if (wordCount < 20) {
        results.classification = [];
        logger.warn('NLP API: Skipped classification operation. Input text must be at least 20 words.');
      } else {
        const response = await client.request({
          url: 'https://language.googleapis.com/v1/documents:classifyText',
          method: 'POST',
          data: { document }
        });
        results.classification = (response.data?.categories || []).map(cat => ({
          name: cat.name,
          confidence: cat.confidence
        }));
      }
    }

    return {
      success: true,
      results,
      textLength: text.length
    };
  } catch (err) {
    logger.error('GCP NLP Service Error:', err);
    throw new Error(`GCP NLP Analysis failed: ${err.message}`);
  }
};

/**
 * @namespace GcpNlpService
 * @description Provides a collection of functions for interacting with the Google Cloud Natural Language API.
 * This service encapsulates the logic for performing various NLP tasks such as sentiment analysis,
 * entity recognition, and text classification.
 */
export const GcpNlpService = {
  /**
   * @function analyzeText
   * @memberof GcpNlpService
   * @see {@link analyzeText} for detailed documentation.
   */
  analyzeText
};