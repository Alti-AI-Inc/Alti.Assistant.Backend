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
const MAX_MEMORY_STORE_SIZE = 5000; // Prevent unbounded memory growth
const memoryStore = new Map();

// LRU-style eviction: remove oldest entries when max size exceeded
const memoryStoreSet = (key, value) => {
  if (memoryStore.size >= MAX_MEMORY_STORE_SIZE && !memoryStore.has(key)) {
    // Delete the first (oldest) entry
    const firstKey = memoryStore.keys().next().value;
    memoryStore.delete(firstKey);
  }
  memoryStore.set(key, value);
};

let redisClient, redisPubClient, redisSubClient;

// Reconnection strategy with exponential backoff
const socketOptions = {
  reconnectStrategy: (retries) => {
    if (retries > 10) {
      logger.error('Redis: Max reconnection attempts (10) reached. Giving up.');
      return new Error('Redis max retries reached');
    }
    const delay = Math.min(retries * 1000, 30000); // Max 30s between retries
    logger.warn(`Redis: Reconnecting in ${delay}ms (attempt ${retries}/10)`);
    return delay;
  },
};

if (redisEnabled) {
  redisClient    = createClient({ url: rawRedisUrl, socket: socketOptions, disableOfflineQueue: true });
  redisPubClient = createClient({ url: rawRedisUrl, socket: socketOptions, disableOfflineQueue: true });
  redisSubClient = createClient({ url: rawRedisUrl, socket: socketOptions, disableOfflineQueue: true });

  redisClient.on('error',        (err) => logger.error('Redis client error:', err.message));
  redisClient.on('connect',      ()    => logger.info('Redis: Connected'));
  redisClient.on('reconnecting', ()    => logger.warn('Redis: Reconnecting...'));
  redisClient.on('ready',        ()    => logger.info('Redis: Ready to accept commands'));
  redisClient.on('end',          ()    => logger.warn('Redis: Connection closed'));
}

const connect = async () => {
  if (!redisEnabled) return;
  await redisClient.connect();
  await redisPubClient.connect();
  await redisSubClient.connect();
};

const set = async (key, value, options) => {
  if (redisEnabled && redisClient && redisClient.isReady) {
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
  memoryStoreSet(key, { value, expiry });
};

const get = async (key) => {
  if (redisEnabled && redisClient && redisClient.isReady) {
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
  if (redisEnabled && redisClient && redisClient.isReady) {
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
  if (redisEnabled && redisClient && redisClient.isReady) {
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
  if (redisEnabled && redisClient && redisClient.isReady) {
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
    memoryStoreSet(key, { value, expiry });
  }
};

const lpush = async (key, value) => {
  if (redisEnabled && redisClient && redisClient.isReady) {
    try {
      return await redisClient.lPush(key, value);
    } catch (err) {
      logger.warn(`Redis lpush failed, falling back to memory: ${err.message}`);
    }
  }
  const entry = memoryStore.get(key) || { value: [] };
  const arr = Array.isArray(entry.value) ? entry.value : [];
  arr.unshift(value);
  memoryStoreSet(key, { value: arr, expiry: entry.expiry });
  return arr.length;
};

const ltrim = async (key, start, stop) => {
  if (redisEnabled && redisClient && redisClient.isReady) {
    try {
      return await redisClient.lTrim(key, start, stop);
    } catch (err) {
      logger.warn(`Redis ltrim failed, falling back to memory: ${err.message}`);
    }
  }
  const entry = memoryStore.get(key);
  if (!entry || !Array.isArray(entry.value)) return;
  const arr = entry.value.slice(start, stop === -1 ? undefined : stop + 1);
  memoryStoreSet(key, { value: arr, expiry: entry.expiry });
};

const lrange = async (key, start, stop) => {
  if (redisEnabled && redisClient && redisClient.isReady) {
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
  if (redisEnabled && redisClient && redisClient.isReady) {
    try {
      return await redisClient.expire(key, seconds);
    } catch (err) {
      logger.warn(`Redis expire failed, falling back to memory: ${err.message}`);
    }
  }
  const entry = memoryStore.get(key);
  if (entry) {
    entry.expiry = Date.now() + seconds * 1000;
    memoryStoreSet(key, entry);
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
  rateLimitSendCommand: async (args) => {
    const cmd = String(args[0]).toUpperCase();
    const isScriptLoad = cmd === 'SCRIPT' && String(args[1]).toUpperCase() === 'LOAD';
    const isEvalSha = cmd === 'EVALSHA';

    if (redisEnabled && redisClient && redisClient.isReady) {
      try {
        return await redisClient.sendCommand(args);
      } catch (err) {
        // If Redis is online but doesn't have the script, we must propagate the NOSCRIPT error
        // so that rate-limit-redis can catch it and reload the script.
        if (err && err.message && err.message.toUpperCase().includes('NOSCRIPT')) {
          throw err;
        }
        logger.warn(`Redis rate limit command failed, failing open: ${err.message}`);
        // Fall through to fail-open
      }
    }

    // Fail-open behavior when Redis is disabled or not ready/errored
    if (isScriptLoad) {
      return '0000000000000000000000000000000000000000';
    }
    if (isEvalSha) {
      // Return a mock response indicating 1 hit, expires in 60s.
      // rate-limit-redis expects [totalHits, timeToExpire]
      return [1, 60000];
    }
    return null;
  },
  isEnabled: redisEnabled,
  get isReady() {
    return !!(redisEnabled && redisClient && redisClient.isReady);
  },
  connect,
  publish: async (channel, message) => {
    if (redisEnabled && redisPubClient && redisPubClient.isReady) {
      try {
        return await redisPubClient.publish(channel, message);
      } catch (err) {
        logger.error('Redis publish failed:', err);
      }
    }
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

export { redisClient };
export default redisClient;
