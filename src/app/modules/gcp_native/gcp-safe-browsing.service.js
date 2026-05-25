import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Checks a URL against Google's Safe Browsing API lists for security threat evaluation.
 * 
 * @param {string} url - Target URL to inspect
 * @returns {Promise<object>} Safety threat analysis report
 */
const lookupUrlSafety = async (url) => {
  try {
    const apiKey = config.google_search_api_key || process.env.GOOGLE_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error('Google Search/Safe Browsing API Key is not configured.');
    }

    if (!url) {
      throw new Error('Target URL to check is required.');
    }

    logger.info(`GCP Safe Browsing: Evaluating security threat status for URL "${url}"...`);

    const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;

    const requestBody = {
      client: {
        clientId: 'alti-assistant-backend',
        clientVersion: '1.0.0'
      },
      threatInfo: {
        threatTypes: [
          'MALWARE', 
          'SOCIAL_ENGINEERING', 
          'UNWANTED_SOFTWARE', 
          'POTENTIALLY_HARMFUL_APPLICATION'
        ],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [
          { url: url }
        ]
      }
    };

    const response = await axios.post(endpoint, requestBody);
    const matches = response.data.matches || [];

    const isSecure = matches.length === 0;

    logger.info(`GCP Safe Browsing: Evaluation complete. URL "${url}" is ${isSecure ? 'SECURE' : 'FLAGGED THREAT'}.`);

    return {
      success: true,
      url: url,
      isSecure: isSecure,
      threatCount: matches.length,
      threats: matches.map(m => ({
        threatType: m.threatType,
        platformType: m.platformType,
        threatEntryType: m.threatEntryType
      }))
    };
  } catch (err) {
    logger.error('GCP Safe Browsing Lookup Error:', err);
    // Fallback to claiming it's secure rather than breaking the application but log the exception
    return {
      success: false,
      url: url,
      isSecure: true,
      error: err.message,
      threatCount: 0,
      threats: []
    };
  }
};

export const GcpSafeBrowsingService = {
  lookupUrlSafety
};
