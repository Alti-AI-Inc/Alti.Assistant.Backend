import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import config from './index.js';

let client = null;

function getClient() {
  if (!client) {
    client = new SecretManagerServiceClient({
      projectId: config.gcp.projectId,
    });
  }
  return client;
}

/**
 * Access a secret from Google Cloud Secret Manager.
 * @param {string} secretName - The name of the secret
 * @param {string} [version='latest'] - The version of the secret
 * @returns {Promise<string|null>} The secret payload or null if not found
 */
export async function getSecret(secretName, version = 'latest') {
  if (!config.gcp.projectId) {
    return null;
  }
  
  try {
    const smClient = getClient();
    const name = `projects/${config.gcp.projectId}/secrets/${secretName}/versions/${version}`;
    const [accessResponse] = await smClient.accessSecretVersion({ name });
    const payload = accessResponse.payload.data.toString('utf8');
    return payload;
  } catch (error) {
    console.warn(`Failed to retrieve secret ${secretName} from Secret Manager:`, error.message);
    return null;
  }
}

export default { getSecret };
