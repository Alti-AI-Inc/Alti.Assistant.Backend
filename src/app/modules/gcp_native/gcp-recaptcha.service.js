import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Validates a client interaction token using Google reCAPTCHA Enterprise.
 * Evaluates bot/fraud risk score (0.0 to 1.0) and lists validation reasons.
 * 
 * @param {string} token - Client reCAPTCHA token
 * @param {string} [expectedAction] - Expected name of user interaction (e.g. 'login', 'checkout')
 * @param {string} [siteKey] - The reCAPTCHA Site Key (default from config/env)
 * @returns {Promise<object>} Assessment score and verification results
 */
const verifyRecaptchaToken = async (token, expectedAction = '', siteKey = '') => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    const activeSiteKey = siteKey || process.env.RECAPTCHA_SITE_KEY || config.recaptcha_site_key || 'MOCK_RECAPTCHA_SITE_KEY';

    logger.info(`reCAPTCHA Enterprise: Evaluating token assessment for action "${expectedAction}"...`);

    const client = await auth.getClient();
    const endpoint = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments`;

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: {
        event: {
          token,
          siteKey: activeSiteKey,
          expectedAction
        }
      }
    });

    const riskAnalysis = response.data?.riskAnalysis || {};
    const tokenProperties = response.data?.tokenProperties || {};

    return {
      success: tokenProperties.valid || false,
      score: riskAnalysis.score || 0.0,
      reasons: riskAnalysis.reasons || [],
      action: tokenProperties.action || expectedAction,
      invalidReason: tokenProperties.invalidReason || ''
    };
  } catch (err) {
    logger.error('reCAPTCHA Enterprise Verification failed:', err);
    throw new Error(`reCAPTCHA Enterprise validation failed: ${err.message}`);
  }
};

export const GcpRecaptchaService = {
  verifyRecaptchaToken
};
