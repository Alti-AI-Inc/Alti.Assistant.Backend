import { logger } from './logger.js';

let cachedStripeIps = [
  "3.18.12.63", "3.69.109.8", "3.120.168.93", "3.130.192.231",
  "13.235.14.237", "13.235.122.149", "18.211.135.69", "35.154.171.200",
  "35.157.207.129", "52.15.183.38", "54.88.130.119", "54.88.130.237",
  "54.187.174.169", "54.187.205.235", "54.187.216.72"
];
let lastFetchedTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Proactively fetches Stripe's latest official webhook IP ranges and caches them in memory.
 */
export const fetchStripeIps = async () => {
  try {
    const response = await fetch('https://stripe.com/files/ips/ips_webhooks.json');
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.WEBHOOKS)) {
        cachedStripeIps = data.WEBHOOKS;
        lastFetchedTime = Date.now();
        logger.info(`[Stripe Security] Successfully fetched latest Stripe Webhook IPs: ${cachedStripeIps.length}`);
      }
    }
  } catch (err) {
    logger.error(`[Stripe Security] Failed to fetch dynamic Stripe Webhook IPs, using fallback: ${err.message}`);
  }
};

/**
 * Validates whether the incoming client IP matches a recognized Stripe IP or loopback bypass.
 * @param {string} clientIp - The raw sender IP address.
 * @returns {Promise<boolean>}
 */
export const isStripeIp = async (clientIp) => {
  if (!clientIp) return false;
  const ip = clientIp.replace(/^::ffff:/, '');

  // Localhost/dev bypass
  if (process.env.NODE_ENV === 'development' || ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return true;
  }

  if (Date.now() - lastFetchedTime > CACHE_TTL) {
    fetchStripeIps().catch(() => {});
  }

  return cachedStripeIps.includes(ip);
};

export default {
  fetchStripeIps,
  isStripeIp
};
