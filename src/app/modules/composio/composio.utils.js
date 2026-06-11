// composio.utils.js

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Storage } = require('@google-cloud/storage');
const { VertexAI } = require('@google-cloud/vertexai');

// The hardcoded path to the service account key file has been removed.
// The clients will now use Application Default Credentials (ADC).
// For local development, run 'gcloud auth application-default login'.
// In GCP environments (Cloud Run, GKE, GCE, etc.), credentials are automatically available.

/**
 * Initializes and returns a Google Cloud Secret Manager client.
 * This function leverages Application Default Credentials (ADC) for authentication,
 * automatically detecting credentials in the environment (e.g., via `gcloud auth application-default login`
 * for local development or from the service account in a GCP environment).
 * @returns {SecretManagerServiceClient} An instance of the Secret Manager service client.
 */
function getSecretManagerClient() {
  // By not providing 'keyFilename' or 'credentials', the client automatically uses ADC.
  const client = new SecretManagerServiceClient();
  return client;
}

/**
 * Initializes and returns a Google Cloud Storage client.
 * This function uses Application Default Credentials (ADC) for authentication,
 * which allows the client to work seamlessly in both local development and deployed GCP environments
 * without hardcoded credentials. The project ID is also inferred from the environment.
 * @returns {Storage} An instance of the Google Cloud Storage client.
 */
function getStorageClient() {
  // By not providing 'keyFilename' or 'credentials', the client automatically uses ADC
  // and infers the project ID from the environment.
  const storage = new Storage();
  return storage;
}

/**
 * Initializes and returns a Google Cloud Vertex AI client.
 * This function requires the `GCP_PROJECT_ID` and `GCP_LOCATION` environment variables to be set.
 * It uses Application Default Credentials (ADC) for authentication.
 * @returns {VertexAI} An instance of the Vertex AI client, configured for the project and location specified in the environment variables.
 */
function getVertexAIClient() {
    // Project and location are required for Vertex AI.
    // The client will use ADC for authentication.
    // The project ID and location should be sourced from environment variables, not hardcoded.
    const vertex_ai = new VertexAI({
        project: process.env.GCP_PROJECT_ID,
        location: process.env.GCP_LOCATION,
    });
    return vertex_ai;
}

module.exports = {
  getSecretManagerClient,
  getStorageClient,
  getVertexAIClient,
};