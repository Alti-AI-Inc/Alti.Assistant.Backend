/**
 * @file This module provides a service for interacting with Google Cloud Secret Manager.
 * It encapsulates logic for accessing and managing secrets, including retrieving secret values
 * and creating new secrets with their initial versions.
 *
 * @module GcpSecretsService
 * @author Your Name/Organization (if applicable)
 * @version 1.0.0
 */

import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * @constant {GoogleAuth} auth - An instance of GoogleAuth configured with the necessary
 * scopes to interact with Google Cloud Platform services, specifically Secret Manager.
 * This client is used to obtain authenticated HTTP clients for making API requests.
 */
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Accesses the latest payload version of a Secret in Google Cloud Secret Manager.
 *
 * This function retrieves the most recent version of a specified secret, decodes its
 * base64 payload, and returns the plain text value along with metadata.
 *
 * @async
 * @param {string} secretId - The unique identifier of the secret to retrieve (e.g., 'my-api-key').
 * @returns {Promise<{ success: boolean, secretId: string, value: string }>} A promise that resolves to an object
 *   containing the secret's value and metadata.
 *   - `success`: `true` if the secret was retrieved successfully.
 *   - `secretId`: The ID of the secret that was retrieved.
 *   - `value`: The decoded string value of the secret.
 * @throws {Error} If `GCP_PROJECT_ID` is not configured in the application config or environment variables.
 * @throws {Error} If the secret payload is empty or cannot be decoded.
 * @throws {Error} If there's any other error during secret retrieval (e.g., permissions, secret not found, network issues).
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
    // Re-throw a generic error message to avoid exposing internal API details to the caller.
    throw new Error(`Failed to retrieve secret "${secretId}". Please check logs for details.`);
  }
};

/**
 * Programmatically creates a new Secret in Google Cloud Secret Manager and adds an initial version payload.
 *
 * If a secret container with the given `secretId` already exists, this function will proceed
 * to add a new version to that existing secret. Otherwise, it will first create the secret container.
 *
 * @async
 * @param {string} secretId - The unique identifier for the secret container to create or update (e.g., 'my-new-secret').
 * @param {string} secretValue - The string value to be stored as the secret's initial payload.
 * @returns {Promise<{ success: boolean, secretId: string, version: string, state: string }>} A promise that resolves to an object
 *   containing details of the created/updated secret version.
 *   - `success`: `true` if the secret and its version were created/updated successfully.
 *   - `secretId`: The ID of the secret that was created/updated.
 *   - `version`: The full resource name of the secret version (e.g., `projects/PROJECT_ID/secrets/SECRET_ID/versions/VERSION_NUMBER`).
 *   - `state`: The state of the secret version (e.g., 'ENABLED').
 * @throws {Error} If `GCP_PROJECT_ID` is not configured in the application config or environment variables.
 * @throws {Error} If there's a failure creating the secret container for reasons other than it already existing (e.g., permissions).
 * @throws {Error} If there's any other error during secret version addition (e.g., invalid payload, network issues).
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
      // Check if the error is due to the secret already existing (HTTP 409 Conflict).
      // If so, log a warning and proceed. Otherwise, re-throw the error as it's a genuine failure.
      if (existErr.response && existErr.response.status === 409) {
        logger.warn(`Secret Manager: Container "${secretId}" already exists. Proceeding to add version.`);
      } else {
        logger.error(`Secret Manager: Failed to create container "${secretId}":`, existErr);
        // Re-throw the specific error as creation failed for a reason other than existence.
        throw new Error(`Failed to create secret container "${secretId}": ${existErr.message}`);
      }
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
    // Re-throw a generic error message to avoid exposing internal API details to the caller.
    throw new Error(`Failed to create or update secret "${secretId}". Please check logs for details.`);
  }
};

/**
 * @exports {object} GcpSecretsService - An object containing functions to interact with Google Cloud Secret Manager.
 * @property {function(string): Promise<{ success: boolean, secretId: string, value: string }>} getSecretValue -
 *   Function to retrieve the latest version of a secret by its ID.
 * @property {function(string, string): Promise<{ success: boolean, secretId: string, version: string, state: string }>} createSecretValue -
 *   Function to create a new secret container and add an initial version, or add a new version to an existing secret.
 */
export const GcpSecretsService = {
  getSecretValue,
  createSecretValue
};