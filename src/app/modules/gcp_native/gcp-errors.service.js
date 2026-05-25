import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Programmatically reports a server error or stack trace to Google Cloud Error Reporting.
 * 
 * @param {string} errorMessage - Error description or raw message
 * @param {string} [stackTrace] - Error call stack trace (e.g. error.stack)
 * @param {string} [user] - Unique identifier of the user who encountered the error
 * @param {string} [serviceName] - Microservice identifier (default 'alti-backend')
 * @returns {Promise<object>} Error report dispatches details
 */
const reportError = async (errorMessage, stackTrace = '', user = '', serviceName = 'alti-backend') => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Stackdriver Errors: Dispatching error report into project "${projectId}" for service "${serviceName}"...`);

    const client = await auth.getClient();
    const endpoint = `https://clouderrorreporting.googleapis.com/v1beta1/projects/${projectId}/events:report`;

    const fullMessage = stackTrace ? `${errorMessage}\n${stackTrace}` : errorMessage;

    await client.request({
      url: endpoint,
      method: 'POST',
      data: {
        eventTime: new Date().toISOString(),
        serviceContext: {
          service: serviceName,
          version: '1.19.0'
        },
        message: fullMessage,
        context: {
          user
        }
      }
    });

    return {
      success: true,
      serviceName,
      errorMessage,
      user
    };
  } catch (err) {
    logger.error('Stackdriver Error Reporting failed:', err);
    throw new Error(`Cloud Error Reporting failed: ${err.message}`);
  }
};

export const GcpErrorsService = {
  reportError
};
