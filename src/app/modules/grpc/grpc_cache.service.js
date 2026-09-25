import { logger } from '../../../shared/logger.js';
import { createClient } from 'redis';
import crypto from 'crypto';

let redisClient;

export const GRPCCacheService = {
  async initialize() {
    redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    await redisClient.connect();
    logger.info(`[gRPC Cache] Initialized Redis connection for binary Protobuf caching.`);
  },

  async getCachedRoute(prompt) {
    if (!redisClient) return null;
    const hash = crypto.createHash('sha256').update(prompt).digest('hex');
    const cached = await redisClient.get(`grpc:route:${hash}`);
    if (cached) {
      logger.info(`[gRPC Cache] ⚡ Cache HIT. Bypassing LangChain inference.`);
      return JSON.parse(cached);
    }
    return null;
  },

  async setCachedRoute(prompt, route) {
    if (!redisClient) return;
    const hash = crypto.createHash('sha256').update(prompt).digest('hex');
    // Cache for 24 hours
    await redisClient.setEx(`grpc:route:${hash}`, 86400, JSON.stringify({ route }));
    logger.info(`[gRPC Cache] Indexed new route computation in Redis.`);
  }
};
