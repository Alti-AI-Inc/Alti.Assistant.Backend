import axios from 'axios';
import { logger } from '../../shared/logger.js';
import ipRangeCheck from 'ip-range-check';

let cloudflareIps = [];

/**
 * Aphura OEM Dark Backend Shield
 * Aphura should NEVER be accessed directly. All traffic MUST flow through Cloudflare.
 * This middleware drops any packet that didn't originate from a verified Cloudflare Edge Node.
 */
export const CloudflareShield = {
  async initialize() {
    try {
      logger.info('[Cloudflare Shield] Fetching verified Cloudflare Edge IP ranges...');
      const [v4, v6] = await Promise.all([
        axios.get('https://www.cloudflare.com/ips-v4'),
        axios.get('https://www.cloudflare.com/ips-v6')
      ]);
      
      cloudflareIps = [
        ...v4.data.split('\n').filter(ip => ip.trim().length > 0),
        ...v6.data.split('\n').filter(ip => ip.trim().length > 0)
      ];
      logger.info(`[Cloudflare Shield] Armed with ${cloudflareIps.length} Cloudflare subnets. Aphura is now a Dark Backend.`);
    } catch (error) {
      logger.error(`[Cloudflare Shield] Failed to fetch IPs: ${error.message}. Running in degraded mode.`);
    }
  },

  verifyRequest(req, res, next) {
    if (process.env.NODE_ENV !== 'production' || cloudflareIps.length === 0) {
      return next(); // Skip in dev or if IPs failed to load
    }

    // Get the actual connecting IP (the proxy/load balancer)
    const clientIp = req.socket.remoteAddress;

    if (!ipRangeCheck(clientIp, cloudflareIps)) {
      logger.warn(`[Cloudflare Shield] 🛡️ BLOCKED direct access attempt from unauthorized IP: ${clientIp}`);
      return res.status(403).json({ 
        error: 'Access Denied', 
        message: 'Direct access to Aphura private cloud is strictly forbidden. Traffic must route through the verified OEM Edge.'
      });
    }

    next();
  }
};
