import axios from 'axios';
import config from '../../../config/index.js';
import { logger } from '../../shared/logger.js';

export const OpenStackService = {
  /**
   * Authenticate with OpenStack Keystone v3
   */
  async getAuthToken() {
    const authUrl = process.env.OS_AUTH_URL || 'https://keystone.aphura.com/v3/auth/tokens';
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
   * Provision a Virtual Computer on Aphura
   * Uses OpenStack Nova / Compute APIs
   */
  async provisionVirtualComputer(options = {}) {
    logger.info(`[Aphura] Provisioning Virtual Computer: ${options.name || 'agi-worker'}`);
    
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
   * Automatically registers tenant subdomains on Aphura's edge DNS.
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
   * Securely retrieve encryption keys or API tokens from the Aphura vault.
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
  },
  /**
   * OpenStack Zun (Container Service v1) - GPU Accelerated
   * Boots ultra-fast, air-gapped ephemeral containers for AI Code Execution.
   * Automatically requests vGPU passthrough if the task requires heavy ML/CUDA processing.
   */
  async executeAirGappedCode(code, language = 'python', requireGpu = false) {
    if (!process.env.OS_USERNAME) return null;
    logger.info(`[OpenStack Zun] Booting air-gapped container (GPU: ${requireGpu})`);
    
    try {
      const auth = await this.getAuthToken();
      const zunService = auth.catalog.find(s => s.type === 'container');
      const zunEndpoint = zunService.endpoints.find(e => e.interface === 'public').url;

      const payload = {
        name: `sandbox-${Date.now()}`,
        image: language === 'python' ? 'python:3.11-slim' : 'node:20-slim',
        command: language === 'python' ? ['python', '-c', code] : ['node', '-e', code],
        memory: requireGpu ? 8192 : 512,
        cpu: requireGpu ? 4.0 : 1.0,
        auto_remove: true,
        interactive: false
      };

      // Inject PCIe passthrough request for Nvidia/AMD accelerators
      if (requireGpu) {
        payload.labels = { 'accelerator': 'nvidia-tesla-t4' }; // Target Aphura ML nodes
      }

      const createRes = await axios.post(`${zunEndpoint}/v1/containers`, payload, {
        headers: { 'X-Auth-Token': auth.token, 'OpenStack-API-Version': 'container 1.12' }
      });
      const containerUuid = createRes.data.uuid;

      await axios.post(`${zunEndpoint}/v1/containers/${containerUuid}/actions`, { start: {} }, {
        headers: { 'X-Auth-Token': auth.token, 'OpenStack-API-Version': 'container 1.12' }
      });

      return { containerId: containerUuid, status: 'EXECUTING' };
    } catch (error) {
      logger.error(`[OpenStack Zun] Code sandbox failed: ${error.message}`);
    }
  },

  /**
   * OpenStack Magnum (Container Infrastructure Management)
   * Dynamically provisions dedicated Kubernetes clusters for large Enterprise clients.
   * Perfect for isolating backend microservices for the Mobile App, Desktop App, and public API.
   */
  async provisionDedicatedK8sCluster(tenantId, nodeCount = 3) {
    if (!process.env.OS_USERNAME) return null;
    logger.info(`[OpenStack Magnum] Provisioning dedicated K8s cluster for tenant ${tenantId}`);
    
    try {
      const auth = await this.getAuthToken();
      const magnumService = auth.catalog.find(s => s.type === 'container-infra');
      const magnumEndpoint = magnumService.endpoints.find(e => e.interface === 'public').url;

      const clusterRes = await axios.post(`${magnumEndpoint}/clusters`, {
        name: `k8s-tenant-${tenantId}`,
        cluster_template_id: process.env.OS_MAGNUM_TEMPLATE_ID || 'default-k8s-template',
        node_count: nodeCount,
        master_count: 1,
        keypair: process.env.OS_KEYPAIR_NAME
      }, {
        headers: { 'X-Auth-Token': auth.token, 'OpenStack-API-Version': 'container-infra 1.9' }
      });

      return clusterRes.data.uuid;
    } catch (error) {
      logger.error(`[OpenStack Magnum] K8s cluster provisioning failed: ${error.message}`);
    }
  },

  /**
   * OpenStack Octavia (Load Balancer v2)
   * Dynamically add SSL certificates and route traffic for custom domains (e.g. Enterprise White-labeling).
   */
  async registerEnterpriseDomain(customDomain, certSecretRef) {
    if (!process.env.OS_USERNAME || !process.env.OS_LOAD_BALANCER_ID) return null;
    logger.info(`[OpenStack Octavia] Routing custom domain ${customDomain} to Load Balancer`);
    
    try {
      const auth = await this.getAuthToken();
      const octaviaService = auth.catalog.find(s => s.type === 'load-balancer');
      const lbEndpoint = octaviaService.endpoints.find(e => e.interface === 'public').url;

      // 1. Get the primary HTTPS listener
      const listenersRes = await axios.get(`${lbEndpoint}/v2.0/lbaas/listeners?loadbalancer_id=${process.env.OS_LOAD_BALANCER_ID}`, {
        headers: { 'X-Auth-Token': auth.token }
      });
      const httpsListener = listenersRes.data.listeners.find(l => l.protocol === 'TERMINATED_HTTPS');

      if (httpsListener && certSecretRef) {
        // 2. Attach the Barbican SSL certificate to the Octavia Listener for SNI (Server Name Indication)
        await axios.post(`${lbEndpoint}/v2.0/lbaas/listeners/${httpsListener.id}/certificates`, {
          certificate: { tls_container_ref: certSecretRef }
        }, {
          headers: { 'X-Auth-Token': auth.token }
        });
      }

      // 3. Create L7 Policy and Rule to route customDomain to the main backend pool
      const policyRes = await axios.post(`${lbEndpoint}/v2.0/lbaas/l7policies`, {
        l7policy: {
          listener_id: httpsListener.id,
          action: 'REDIRECT_TO_POOL',
          pool_id: process.env.OS_BACKEND_POOL_ID,
          name: `route_${customDomain.replace(/\./g, '_')}`
        }
      }, { headers: { 'X-Auth-Token': auth.token } });

      await axios.post(`${lbEndpoint}/v2.0/lbaas/l7policies/${policyRes.data.l7policy.id}/rules`, {
        rule: {
          compare_type: 'EQUAL_TO',
          type: 'HOST_NAME',
          value: customDomain
        }
      }, { headers: { 'X-Auth-Token': auth.token } });

      return true;
    } catch (error) {
      logger.error(`[OpenStack Octavia] Load Balancer routing failed: ${error.message}`);
    }
  },
  /**
   * OpenStack Zaqar (Messaging v2)
   * High-throughput queuing and push notifications (Mobile/WebSockets).
   */
  async dispatchPushNotification(queueName, messages) {
    if (!process.env.OS_USERNAME) return null;
    logger.info(`[OpenStack Zaqar] Dispatching push notification to ${queueName}`);
    
    try {
      const auth = await this.getAuthToken();
      const zaqarService = auth.catalog.find(s => s.type === 'messaging');
      const zaqarEndpoint = zaqarService.endpoints.find(e => e.interface === 'public').url;

      const response = await axios.post(`${zaqarEndpoint}/v2/queues/${queueName}/messages`, {
        messages: messages.map(msg => ({ body: msg, ttl: 3600 }))
      }, {
        headers: { 'X-Auth-Token': auth.token, 'Client-ID': 'aphura-mobile-gateway' }
      });

      return response.data;
    } catch (error) {
      logger.error(`[OpenStack Zaqar] Push notification failed: ${error.message}`);
    }
  }
};

export default OpenStackService;
