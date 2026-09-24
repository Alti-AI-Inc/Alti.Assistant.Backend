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
      logger.error(`[OpenStack] Nova Provisioning failed: ${error.message}`);
      throw error;
    }
  }
};

export default OpenStackService;
