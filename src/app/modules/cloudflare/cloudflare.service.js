import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

function getHeaders() {
  const token = config.cloudflare?.apiToken || process.env.CLOUDFLARE_API_TOKEN;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export const CloudflareService = {
  /**
   * Get zone details
   */
  async getZoneDetails(zoneId) {
    const targetZone = zoneId || config.cloudflare?.zoneId || process.env.CLOUDFLARE_ZONE_ID;
    if (!targetZone) throw new Error('Cloudflare Zone ID is required');

    const res = await axios.get(`${CF_API_BASE}/zones/${targetZone}`, {
      headers: getHeaders(),
      timeout: 5000,
    });
    return res.data.result;
  },

  /**
   * Purge Cache (all or specific files/tags)
   */
  async purgeCache(options = {}) {
    const zoneId = options.zoneId || config.cloudflare?.zoneId || process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) throw new Error('Cloudflare Zone ID is required');

    const body = options.purgeEverything
      ? { purge_everything: true }
      : { files: options.files || [], tags: options.tags || [] };

    const res = await axios.post(`${CF_API_BASE}/zones/${zoneId}/purge_cache`, body, {
      headers: getHeaders(),
      timeout: 5000,
    });
    return res.data;
  },

  /**
   * List DNS Records
   */
  async listDnsRecords(zoneId, type = '') {
    const targetZone = zoneId || config.cloudflare?.zoneId || process.env.CLOUDFLARE_ZONE_ID;
    const url = `${CF_API_BASE}/zones/${targetZone}/dns_records${type ? `?type=${type}` : ''}`;
    const res = await axios.get(url, { headers: getHeaders(), timeout: 5000 });
    return res.data.result;
  },

  /**
   * Create DNS Record
   */
  async createDnsRecord(record) {
    const targetZone = record.zoneId || config.cloudflare?.zoneId || process.env.CLOUDFLARE_ZONE_ID;
    const res = await axios.post(`${CF_API_BASE}/zones/${targetZone}/dns_records`, record, {
      headers: getHeaders(),
      timeout: 5000,
    });
    return res.data.result;
  },

  /**
   * Delete DNS Record
   */
  async deleteDnsRecord(recordId, zoneId) {
    const targetZone = zoneId || config.cloudflare?.zoneId || process.env.CLOUDFLARE_ZONE_ID;
    const res = await axios.delete(`${CF_API_BASE}/zones/${targetZone}/dns_records/${recordId}`, {
      headers: getHeaders(),
      timeout: 5000,
    });
    return res.data.result;
  },

  /**
   * Verify Turnstile Bot Protection Token
   */
  async verifyTurnstile(token, remoteIp = '') {
    const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    if (!secretKey) throw new Error('CLOUDFLARE_TURNSTILE_SECRET_KEY is missing');

    const res = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      new URLSearchParams({ secret: secretKey, response: token, remoteip: remoteIp }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 }
    );
    return res.data;
  },

  /**
   * Get WAF / Firewall Rules
   */
  async listWafRules(zoneId) {
    const targetZone = zoneId || config.cloudflare?.zoneId || process.env.CLOUDFLARE_ZONE_ID;
    // Call the actual CF Rulesets API for WAF
    const res = await axios.get(`${CF_API_BASE}/zones/${targetZone}/rulesets`, {
      headers: getHeaders(),
      timeout: 5000,
    });
    return res.data.result;
  },

  /**
   * Workers AI: Run inference models directly
   */
  async runAiModel(model, input) {
    const accountId = config.cloudflare?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) throw new Error('Cloudflare Account ID is required for Workers AI');

    const res = await axios.post(
      `${CF_API_BASE}/accounts/${accountId}/ai/run/${model}`,
      input,
      { headers: getHeaders(), timeout: 15000 }
    );
    return res.data.result;
  }
};

export default CloudflareService;
