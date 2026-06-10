// composio.utils.js

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Storage } = require('@google-cloud/storage');
const { VertexAI } = require('@google-cloud/vertexai');

// The hardcoded path to the service account key file has been removed.
// The clients will now use Application Default Credentials (ADC).
// For local development, run 'gcloud auth application-default login'.
// In GCP environments (Cloud Run, GKE, GCE, etc.), credentials are automatically available.

/**
 * Initializes and returns a Secret Manager client using Application Default Credentials.
 */
function getSecretManagerClient() {
  // By not providing 'keyFilename' or 'credentials', the client automatically uses ADC.
  const client = new SecretManagerServiceClient();
  return client;
}

/**
 * Initializes and returns a Google Cloud Storage client using Application Default Credentials.
 */
function getStorageClient() {
  // By not providing 'keyFilename' or 'credentials', the client automatically uses ADC
  // and infers the project ID from the environment.
  const storage = new Storage();
  return storage;
}

/**
 * Initializes and returns a Vertex AI client using Application Default Credentials.
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