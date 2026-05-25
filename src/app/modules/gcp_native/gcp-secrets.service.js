import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Accesses the latest payload version of a Secret in Google Cloud Secret Manager.
 * 
 * @param {string} secretId - Secret identifier
 * @returns {Promise<object>} Secret value payload report
 */
const getSecretValue = async (secretId) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Secret Manager: Fetching latest version of secret "${secretId}"...`);

    const client = await auth.getClient();
    const endpoint = `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${secretId}/versions/latest:access`;

    const response = await client.request({
      url: endpoint,
      method: 'GET'
    });

    const payloadBase64 = response.data?.payload?.data;
    if (!payloadBase64) {
      throw new Error(`Secret Manager payload for "${secretId}" is empty.`);
    }

    const value = Buffer.from(payloadBase64, 'base64').toString('utf8');

    return {
      success: true,
      secretId,
      value
    };
  } catch (err) {
    logger.error(`Secret Manager Retrieval Error for ${secretId}:`, err);
    throw new Error(`Secret Manager Retrieval failed: ${err.message}`);
  }
};

/**
 * Programmatically creates a new Secret and adds a version payload.
 * 
 * @param {string} secretId - Secret name
 * @param {string} secretValue - Secret payload string
 * @returns {Promise<object>} Secret creation report
 */
const createSecretValue = async (secretId, secretValue) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Secret Manager: Creating new secret container "${secretId}"...`);

    const client = await auth.getClient();
    
    // 1. Create Secret Container (if it doesn't already exist)
    try {
      await client.request({
        url: `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets`,
        method: 'POST',
        data: {
          replication: {
            automatic: {}
          }
        },
        params: {
          secretId
        }
      });
      logger.info(`Secret Manager: Successfully created container "${secretId}".`);
    } catch (existErr) {
      // Ignore if container already exists
      logger.warn(`Secret Manager: Container "${secretId}" already exists or could not be created directly: ${existErr.message}`);
    }

    // 2. Add Payload Version
    logger.info(`Secret Manager: Uploading secret payload version for "${secretId}"...`);
    const payloadBase64 = Buffer.from(secretValue).toString('base64');
    
    const response = await client.request({
      url: `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${secretId}:addVersion`,
      method: 'POST',
      data: {
        payload: {
          data: payloadBase64
        }
      }
    });

    return {
      success: true,
      secretId,
      version: response.data?.name,
      state: response.data?.state || 'ENABLED'
    };
  } catch (err) {
    logger.error(`Secret Manager Version Addition Error for ${secretId}:`, err);
    throw new Error(`Secret Manager creation failed: ${err.message}`);
  }
};

export const GcpSecretsService = {
  getSecretValue,
  createSecretValue
};
