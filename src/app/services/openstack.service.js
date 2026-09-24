import axios from 'axios';
import config from '../../config/index.js';
import { logger } from '../shared/logger.js';

export const OpenStackService = {
  /**
   * Authenticate with OpenStack Keystone v3
   */
  async getAuthToken() {
    const authUrl = process.env.OS_AUTH_URL || 'https://keystone.libertycenterone.com/v3/auth/tokens';
    const payload = {
      auth: {
        identity: {
          methods: ['password'],
          password: {
            user: {
              name: process.env.OS_USERNAME,
              domain: { id: process.env.OS_USER_DOMAIN_ID || 'default' },
              password: process.env.OS_PASSWORD
            }
          }
        },
        scope: {
          project: {
            name: process.env.OS_PROJECT_NAME,
            domain: { id: process.env.OS_PROJECT_DOMAIN_ID || 'default' }
          }
        }
      }
    };

    try {
      const response = await axios.post(authUrl, payload);
      return {
        token: response.headers['x-subject-token'],
        catalog: response.data.token.catalog
      };
    } catch (error) {
      logger.error(`[OpenStack] Keystone Auth failed: ${error.message}`);
      throw error;
    }
  },

  /**
   * Provision a Virtual Computer on Liberty Center One
   * Uses OpenStack Nova / Compute APIs
   */
  async provisionVirtualComputer(options = {}) {
    logger.info(`[Liberty Center One] Provisioning Virtual Computer: ${options.name || 'agi-worker'}`);
    
    if (!process.env.OS_USERNAME) {
      logger.warn('[OpenStack] Missing OS_USERNAME, falling back to simulation mode');
      return {
        instanceId: `vm-${Date.now().toString(36)}`,
        status: 'BUILD',
        ipAddress: 'pending',
        flavor: options.flavor || 'm1.large',
        image: 'ubuntu-22.04-agi-base',
        createdAt: new Date().toISOString()
      };
    }

    try {
      const auth = await this.getAuthToken();
      // Find Nova compute endpoint
      const computeService = auth.catalog.find(s => s.type === 'compute');
      const computeEndpoint = computeService.endpoints.find(e => e.interface === 'public').url;

      const response = await axios.post(`${computeEndpoint}/servers`, {
        server: {
          name: options.name || `agi-worker-${Date.now()}`,
          imageRef: options.imageRef || process.env.OS_DEFAULT_IMAGE_ID,
          flavorRef: options.flavorRef || process.env.OS_DEFAULT_FLAVOR_ID,
          networks: [{ uuid: process.env.OS_NETWORK_ID }]
        }
      }, {
        headers: { 'X-Auth-Token': auth.token }
      });

      return {
        instanceId: response.data.server.id,
        status: 'BUILD',
        links: response.data.server.links,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`[OpenStack Nova] Provisioning failed: ${error.message}`);
      throw error;
    }
  },

  /**
   * OpenStack Designate (DNS v2)
   * Automatically registers tenant subdomains on Liberty Center One's edge DNS.
   */
  async provisionTenantSubdomain(subdomain) {
    if (!process.env.OS_USERNAME || !process.env.OS_DNS_ZONE_ID) return null;
    logger.info(`[OpenStack Designate] Registering DNS A-Record for: ${subdomain}.aphura.ai`);
    try {
      const auth = await this.getAuthToken();
      const dnsService = auth.catalog.find(s => s.type === 'dns');
      const dnsEndpoint = dnsService.endpoints.find(e => e.interface === 'public').url;

      const response = await axios.post(`${dnsEndpoint}/v2/zones/${process.env.OS_DNS_ZONE_ID}/recordsets`, {
        name: `${subdomain}.aphura.ai.`,
        type: 'A',
        ttl: 300,
        records: [process.env.OS_LOAD_BALANCER_IP || '127.0.0.1']
      }, {
        headers: { 'X-Auth-Token': auth.token }
      });
      return response.data;
    } catch (error) {
      logger.error(`[OpenStack Designate] DNS Registration failed: ${error.message}`);
    }
  },

  /**
   * OpenStack Cinder (Block Storage v3)
   * Provisions dedicated NVMe volumes for heavy agentic tasks or RAG processing.
   */
  async provisionVolumeForAgent(name, sizeGb = 10) {
    if (!process.env.OS_USERNAME) return null;
    logger.info(`[OpenStack Cinder] Provisioning ${sizeGb}GB NVMe Volume: ${name}`);
    try {
      const auth = await this.getAuthToken();
      const volService = auth.catalog.find(s => s.type === 'volumev3' || s.type === 'volume');
      const volEndpoint = volService.endpoints.find(e => e.interface === 'public').url;

      const response = await axios.post(`${volEndpoint}/volumes`, {
        volume: {
          size: sizeGb,
          name: name,
          volume_type: 'nvme-high-iops'
        }
      }, {
        headers: { 'X-Auth-Token': auth.token }
      });
      return response.data.volume.id;
    } catch (error) {
      logger.error(`[OpenStack Cinder] Volume Provisioning failed: ${error.message}`);
    }
  },

  /**
   * OpenStack Barbican (Key Manager v1)
   * Securely retrieve encryption keys or API tokens from the Liberty Center One vault.
   */
  async getSecret(secretRef) {
    if (!process.env.OS_USERNAME) return null;
    try {
      const auth = await this.getAuthToken();
      const keyService = auth.catalog.find(s => s.type === 'key-manager');
      const keyEndpoint = keyService.endpoints.find(e => e.interface === 'public').url;

      const response = await axios.get(`${keyEndpoint}/v1/secrets/${secretRef}/payload`, {
        headers: { 'X-Auth-Token': auth.token, 'Accept': 'text/plain' }
      });
      return response.data;
    } catch (error) {
      logger.error(`[OpenStack Barbican] Secret retrieval failed: ${error.message}`);
    }
  }
};

export default OpenStackService;
