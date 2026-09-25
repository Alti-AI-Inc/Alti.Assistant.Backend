import { logger } from '../../../shared/logger.js';
import { createClient } from 'redis';

let publisher, subscriber;

export const RedisPubSubService = {
  async initialize() {
    logger.info(`[Redis PubSub] Initializing distributed WebSocket backplane...`);
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    publisher = createClient({ url: redisUrl });
    subscriber = createClient({ url: redisUrl });
    
    await publisher.connect();
    await subscriber.connect();
    
    await subscriber.subscribe('aphura_global_events', (message) => {
      logger.info(`[Redis PubSub] Received cluster-wide event: ${message.substring(0, 50)}...`);
      // In production, forward this to the local WebSocketServer instance
    });
  },
  
  async broadcastToCluster(eventPayload) {
    if (publisher) {
      await publisher.publish('aphura_global_events', JSON.stringify(eventPayload));
    }
  }
};
