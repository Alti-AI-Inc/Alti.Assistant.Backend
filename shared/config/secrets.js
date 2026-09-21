/**
 * Access a secret from the environment.
 * @param {string} secretName - The name of the secret
 * @param {string} [version='latest'] - The version of the secret
 * @returns {Promise<string|null>} The secret value or null if not found
 */
export async function getSecret(secretName, version = 'latest') {
  return process.env[secretName] || null;
}

export default { getSecret };
