import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';

// Initialize auth helper with scopes
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Analyzes natural language text for sentiment, classification, and entities.
 * 
 * @param {string} text - Text to analyze
 * @param {Array<string>} operations - NLP operations (e.g. SENTIMENT, ENTITY, CLASSIFY)
 * @returns {Promise<object>} NLP analysis report
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

export const GcpNlpService = {
  analyzeText
};
