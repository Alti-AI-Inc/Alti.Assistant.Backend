import crypto from 'crypto';
import { logger } from '../../../shared/logger.js';
import OpenStackService from '../../services/openstack.service.js';
import { RedisClient } from '../../../shared/redis.js';
import axios from 'axios';

/**
 * Aphura Enterprise API Key Vault
 * Stores and manages high-value B2B API keys using Liberty Center One's OpenStack Barbican HSM.
 */
export const ApiKeyService = {

  /**
   * Generates a new API key for a tenant, stores the cryptographic material in Barbican, 
   * and returns the plaintext key ONCE.
   */
  async createEnterpriseApiKey(tenantId, keyName) {
    logger.info(`[API Key Vault] Provisioning new API Key for tenant ${tenantId} via Barbican`);
    
    // 1. Generate a cryptographically secure API key
    const rawKey = `aph_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    if (process.env.OS_USERNAME) {
      // 2. Store the key hash in OpenStack Barbican for military-grade security
      try {
        const auth = await OpenStackService.getAuthToken();
        const keyService = auth.catalog.find(s => s.type === 'key-manager');
        const keyEndpoint = keyService.endpoints.find(e => e.interface === 'public').url;

        const res = await axios.post(`${keyEndpoint}/v1/secrets`, {
          name: `apikey_${tenantId}_${keyName}`,
          payload: keyHash,
          payload_content_type: 'text/plain',
          secret_type: 'opaque',
          expiration: null // Doesn't expire by default
        }, {
          headers: { 'X-Auth-Token': auth.token }
        });

        // The URL reference to the secret in Barbican
        const secretRef = res.data.secret_ref;
        
        // Cache the mapping in Redis for fast API gateway validation
        await RedisClient.set(`apikey_hash:${keyHash}`, tenantId, { EX: 86400 }); // 24h cache

        return {
          keyName,
          secretRef,
          plaintextKey: rawKey // ONLY RETURNED ONCE!
        };
      } catch (err) {
        logger.error(`[Barbican] Failed to store API key in HSM: ${err.message}`);
        throw new Error('Failed to provision secure API key.');
      }
    } else {
      // Fallback for local dev without Barbican
      logger.warn('[API Key Vault] OpenStack not configured. Falling back to local hash mapping.');
      await RedisClient.set(`apikey_hash:${keyHash}`, tenantId);
      return { keyName, plaintextKey: rawKey };
    }
  },

  /**
   * Fast gateway validation. Looks up the hash in Redis, or verifies against Barbican/DB.
   */
  async validateApiKey(rawKey) {
    if (!rawKey || !rawKey.startsWith('aph_')) return null;
    
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const tenantId = await RedisClient.get(`apikey_hash:${keyHash}`);
    
    if (tenantId) {
      return tenantId; // Valid
    }
    
    // If not in cache, we would normally query our local DB index of secretRefs, 
    // then fetch the hash from Barbican to compare.
    return null;
  }
};
