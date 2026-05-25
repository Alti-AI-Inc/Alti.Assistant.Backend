import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/logging.write']
});

/**
 * Writes a structured log entry directly to Google Cloud Logging (Stackdriver).
 * 
 * @param {string} logName - Name of the log container (e.g. "alti-activity-log")
 * @param {string} message - Content of the log entry text
 * @param {string} [severity] - Logging severity: 'DEFAULT', 'DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL' (default 'INFO')
 * @param {object} [labels] - Key-value pair labels associated with the log entry
 * @returns {Promise<object>} Log write report
 */
const writeLogEntry = async (logName, message, severity = 'INFO', labels = {}) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Stackdriver Logging: Streaming entry into project "${projectId}", log "${logName}" [Severity: ${severity}]...`);

    const client = await auth.getClient();
    const endpoint = 'https://logging.googleapis.com/v2/entries:write';

    const formattedLogName = `projects/${projectId}/logs/${logName}`;

    await client.request({
      url: endpoint,
      method: 'POST',
      data: {
        entries: [
          {
            logName: formattedLogName,
            resource: {
              type: 'global'
            },
            textPayload: message,
            severity,
            labels: {
              environment: config.env || 'development',
              ...labels
            },
            timestamp: new Date().toISOString()
          }
        ]
      }
    });

    return {
      success: true,
      logName: formattedLogName,
      severity,
      message,
      labels
    };
  } catch (err) {
    logger.error('Stackdriver Logging Error:', err);
    throw new Error(`Cloud Logging failed: ${err.message}`);
  }
};

export const GcpLoggingService = {
  writeLogEntry
};
