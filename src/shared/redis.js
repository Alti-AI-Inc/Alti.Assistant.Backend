import redis from 'redis';
import config from '../../config/index.js';
import { logger } from './logger.js';
const { createClient } = redis;

// ── Validate REDIS_URL before attempting to create a client ─────────────────
// Cloud Run Secret Manager may inject a leading '?' or the URL may be absent.
// Rather than crashing the whole container, we disable Redis gracefully.
const rawRedisUrl = (config.redis?.url || '').replace(/^\?+/, '').trim();
const redisEnabled = (() => {
  if (!rawRedisUrl) return false;
  try { new URL(rawRedisUrl); return true; }
  catch { return false; }
})();

if (!redisEnabled) {
  logger.warn(
    `⚠️  Redis disabled: REDIS_URL is missing or invalid ("${rawRedisUrl}"). ` +
    'Caching and pub/sub features will be unavailable.'
  );
}

// ── No-op stub used when Redis is disabled ───────────────────────────────────
const noop = async () => {};
const noopGet = async () => null;

let redisClient, redisPubClient, redisSubClient;

if (redisEnabled) {
  redisClient    = createClient({ url: rawRedisUrl });
  redisPubClient = createClient({ url: rawRedisUrl });
  redisSubClient = createClient({ url: rawRedisUrl });

  redisClient.on('error',   (err) => logger.error('RedisError', err));
  redisClient.on('connect', ()    => logger.info('Redis Connected'));
}

const connect = async () => {
  if (!redisEnabled) return;
  await redisClient.connect();
  await redisPubClient.connect();
  await redisSubClient.connect();
};

const set = async (key, value, options) => {
  if (!redisEnabled) return;
  await redisClient.set(key, value, options);
};

const get = async (key) => {
  if (!redisEnabled) return null;
  return await redisClient.get(key);
};

const del = async (key) => {
  if (!redisEnabled) return;
  await redisClient.del(key);
};

const setAccessToken = async (userId, token) => {
  if (!redisEnabled) return;
  const key = `access-token:${userId}`;
  await redisClient.set(key, token, { EX: Number(config.redis.expires_in) });
};

const getAccessToken = async (userId) => {
  if (!redisEnabled) return null;
  const key = `access-token:${userId}`;
  return await redisClient.get(key);
};

const delAccessToken = async (userId) => {
  if (!redisEnabled) return;
  const key = `access-token:${userId}`;
  await redisClient.del(key);
};

const disconnect = async () => {
  if (!redisEnabled) return;
  await redisClient.quit();
  await redisPubClient.quit();
  await redisSubClient.quit();
};

export const RedisClient = {
  isEnabled: redisEnabled,
  connect,
  publish: async (channel, message) => {
    if (!redisEnabled) return;
    if (!redisPubClient.isOpen) await redisPubClient.connect();
    return redisPubClient.publish(channel, message);
  },
  subscribe: redisEnabled
    ? redisSubClient.subscribe.bind(redisSubClient)
    : noop,
  set,
  get,
  del,
  disconnect,
  setAccessToken,
  getAccessToken,
  delAccessToken,
};
