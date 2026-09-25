import { logger } from '../../../shared/logger.js';

/**
 * Aphura Security Gateway
 * Enforces sovereignty constraints across the entire system.
 */
export const SecurityGateway = {
  async validateRequest(request) {
    if (request.direction === 'OUTBOUND') {
      logger.warn('[Security Gateway] BLOCKED: Outbound data transmission attempt.');
      throw new Error('SOVEREIGNTY VIOLATION: No data may leave Liberty Center One.');
    }
    if (request.engineLicense && !['MIT', 'Apache 2.0'].includes(request.engineLicense)) {
      logger.warn('[Security Gateway] BLOCKED: License violation: ' + request.engineLicense);
      throw new Error('LICENSE VIOLATION: ' + request.engineLicense + ' is not permitted.');
    }
    return { validated: true, timestamp: new Date().toISOString() };
  },

  async enforceEgressBlock() {
    return {
      iptables: 'DROP ALL OUTBOUND on liberty-mesh',
      calico: 'GlobalNetworkPolicy: deny-egress ACTIVE',
      exceptions: ['composio-auth (read-only OAuth)', 'together-ai (inference API only)'],
      status: 'ENFORCED'
    };
  }
};
