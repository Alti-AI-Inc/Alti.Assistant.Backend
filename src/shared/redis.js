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

// ── High-performance in-memory fallback cache store ─────────────────────────
const memoryStore = new Map();

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
  if (redisEnabled && redisClient && redisClient.isOpen) {
    try {
      await redisClient.set(key, value, options);
      return;
    } catch (err) {
      logger.warn(`Redis set failed, falling back to memory: ${err.message}`);
    }
  }
  let expiry = null;
  if (options && options.EX) {
    expiry = Date.now() + options.EX * 1000;
  }
  memoryStore.set(key, { value, expiry });
};

const get = async (key) => {
  if (redisEnabled && redisClient && redisClient.isOpen) {
    try {
      return await redisClient.get(key);
    } catch (err) {
      logger.warn(`Redis get failed, falling back to memory: ${err.message}`);
    }
  }
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiry && entry.expiry < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
};

const del = async (key) => {
  if (redisEnabled && redisClient && redisClient.isOpen) {
    try {
      await redisClient.del(key);
      return;
    } catch (err) {
      logger.warn(`Redis del failed, falling back to memory: ${err.message}`);
    }
  }
  memoryStore.delete(key);
};

const mget = async (keys) => {
  if (redisEnabled && redisClient && redisClient.isOpen) {
    try {
      return await redisClient.mGet(keys);
    } catch (err) {
      logger.warn(`Redis mget failed, falling back to memory: ${err.message}`);
    }
  }
  return keys.map(key => {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiry && entry.expiry < Date.now()) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  });
};

const mset = async (keyValuePairs, ttlSecs) => {
  if (redisEnabled && redisClient && redisClient.isOpen) {
    try {
      const pipeline = redisClient.multi();
      for (const [key, value] of keyValuePairs) {
        if (ttlSecs) {
          pipeline.set(key, value, { EX: ttlSecs });
        } else {
          pipeline.set(key, value);
        }
      }
      await pipeline.exec();
      return;
    } catch (err) {
      logger.warn(`Redis mset failed, falling back to memory: ${err.message}`);
    }
  }
  const expiry = ttlSecs ? Date.now() + ttlSecs * 1000 : null;
  for (const [key, value] of keyValuePairs) {
    memoryStore.set(key, { value, expiry });
  }
};

const lpush = async (key, value) => {
  if (redisEnabled && redisClient && redisClient.isOpen) {
    try {
      return await redisClient.lPush(key, value);
    } catch (err) {
      logger.warn(`Redis lpush failed, falling back to memory: ${err.message}`);
    }
  }
  const entry = memoryStore.get(key) || { value: [] };
  const arr = Array.isArray(entry.value) ? entry.value : [];
  arr.unshift(value);
  memoryStore.set(key, { value: arr, expiry: entry.expiry });
  return arr.length;
};

const ltrim = async (key, start, stop) => {
  if (redisEnabled && redisClient && redisClient.isOpen) {
    try {
      return await redisClient.lTrim(key, start, stop);
    } catch (err) {
      logger.warn(`Redis ltrim failed, falling back to memory: ${err.message}`);
    }
  }
  const entry = memoryStore.get(key);
  if (!entry || !Array.isArray(entry.value)) return;
  const arr = entry.value.slice(start, stop === -1 ? undefined : stop + 1);
  memoryStore.set(key, { value: arr, expiry: entry.expiry });
};

const lrange = async (key, start, stop) => {
  if (redisEnabled && redisClient && redisClient.isOpen) {
    try {
      return await redisClient.lRange(key, start, stop);
    } catch (err) {
      logger.warn(`Redis lrange failed, falling back to memory: ${err.message}`);
    }
  }
  const entry = memoryStore.get(key);
  if (!entry) return [];
  if (entry.expiry && entry.expiry < Date.now()) {
    memoryStore.delete(key);
    return [];
  }
  if (!Array.isArray(entry.value)) return [];
  return entry.value.slice(start, stop === -1 ? undefined : stop + 1);
};

const expire = async (key, seconds) => {
  if (redisEnabled && redisClient && redisClient.isOpen) {
    try {
      return await redisClient.expire(key, seconds);
    } catch (err) {
      logger.warn(`Redis expire failed, falling back to memory: ${err.message}`);
    }
  }
  const entry = memoryStore.get(key);
  if (entry) {
    entry.expiry = Date.now() + seconds * 1000;
    memoryStore.set(key, entry);
  }
};

const setAccessToken = async (userId, token) => {
  const key = `access-token:${userId}`;
  await set(key, token, { EX: Number(config.redis?.expires_in || 3600) });
};

const getAccessToken = async (userId) => {
  const key = `access-token:${userId}`;
  return await get(key);
};

const delAccessToken = async (userId) => {
  const key = `access-token:${userId}`;
  await del(key);
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
    : async () => {},
  set,
  get,
  del,
  mget,
  mset,
  lpush,
  ltrim,
  lrange,
  expire,
  disconnect,
  setAccessToken,
  getAccessToken,
  delAccessToken,
};
