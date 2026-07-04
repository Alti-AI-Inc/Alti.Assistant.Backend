import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Checks a URL against Google's Safe Browsing API lists for security threat evaluation.
 * It queries the Google Safe Browsing API (v4) to determine if a given URL is associated
 * with malware, social engineering, unwanted software, or potentially harmful applications.
 *
 * @param {string} url - The target URL to inspect for security threats.
 * @returns {Promise<object>} A promise that resolves to an object containing the safety analysis report.
 *   The object structure is as follows:
 *   - `success`: {boolean} True if the API call was successful and a determination was made, false otherwise.
 *   - `url`: {string} The URL that was checked.
 *   - `isSecure`: {boolean} True if no threats were found for the URL, false if threats were detected or an error occurred.
 *   - `threatCount`: {number} The number of threats identified for the URL.
 *   - `threats`: {Array<object>} An array of threat details if any were found. Each object contains:
 *     - `threatType`: {string} The type of threat (e.g., 'MALWARE', 'SOCIAL_ENGINEERING').
 *     - `platformType`: {string} The platform type associated with the threat (e.g., 'ANY_PLATFORM').
 *     - `threatEntryType`: {string} The entry type of the threat (e.g., 'URL').
 *   - `error`: {string} (Optional) An error message if `success` is false, indicating why the check failed.
 * @throws {Error} If the Web Search/Safe Browsing API Key is not configured or if the target URL is not provided.
 */
const lookupUrlSafety = async (url) => {
  const apiKey = config.google_search_api_key || process.env.GOOGLE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error('Web Search/Safe Browsing API Key is not configured.');
  }

  if (url === null || url === undefined || url === '') {
    throw new Error('Target URL to check is required.');
  }

  try {
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
    // If an error occurs during the safe browsing check, it's safer to assume the URL's status
    // could not be verified, or to treat it as potentially unsafe, rather than claiming it's secure.
    return {
      success: false,
      url: url,
      isSecure: false, // Changed from true to false to avoid misrepresenting an unchecked URL as secure.
      error: err.message,
      threatCount: 0,
      threats: []
    };
  }
};

/**
 * @typedef {object} GcpSafeBrowsingService
 * @property {function(string): Promise<object>} lookupUrlSafety - Function to check a URL's safety using Google Safe Browsing API.
 */

/**
 * Provides a service interface for interacting with Google's Safe Browsing API.
 * This service allows checking URLs against Google's constantly updated lists of unsafe web resources.
 *
 * @type {GcpSafeBrowsingService}
 */
export const GcpSafeBrowsingService = {
  lookupUrlSafety
};