// src/shared/queues.js
// Message queues and pub/sub implementation using Redis

import { redisClient, redisPubClient, redisSubClient } from './redis.js';
import { EventEmitter } from 'events';
import crypto from 'crypto';

const localEmitter = new EventEmitter();
localEmitter.setMaxListeners(50);

/**
 * Publish a message to a topic (Redis pub/sub channel)
 * Drop-in replacement for PubSub.topic().publishMessage()
 */
export async function publishMessage(topicName, data) {
  const message = JSON.stringify({
    id: crypto.randomUUID(),
    data,
    publishTime: new Date().toISOString(),
  });
  
  try {
    if (redisPubClient?.isReady) {
      await redisPubClient.publish(topicName, message);
    } else {
      // Fallback: process locally via event emitter
      localEmitter.emit(topicName, JSON.parse(message));
    }
  } catch (err) {
    // Fallback: process locally
    localEmitter.emit(topicName, JSON.parse(message));
  }
}

/**
 * Subscribe to a topic (Redis pub/sub channel)
 * Drop-in replacement for PubSub.subscription().on('message', handler)
 */
export async function subscribe(topicName, handler) {
  // Local fallback listener
  localEmitter.on(topicName, (msg) => {
    handler({ data: Buffer.from(JSON.stringify(msg.data)), ack: () => {} });
  });
  
  try {
    if (redisSubClient?.isReady) {
      await redisSubClient.subscribe(topicName, (message) => {
        const parsed = JSON.parse(message);
        handler({ data: Buffer.from(JSON.stringify(parsed.data)), ack: () => {} });
      });
    }
  } catch (err) {
    console.warn(`[queues] Redis subscribe failed for ${topicName}, using local emitter`);
  }
}

/**
 * Schedule a delayed task (replaces Cloud Tasks)
 * Uses Redis sorted sets with timestamps
 */
export async function scheduleTask(queueName, payload, delayMs = 0) {
  const task = JSON.stringify({
    id: crypto.randomUUID(),
    payload,
    scheduledAt: new Date(Date.now() + delayMs).toISOString(),
  });
  
  try {
    if (redisClient?.isReady) {
      const score = Date.now() + delayMs;
      await redisClient.zAdd(`queue:${queueName}`, { score, value: task });
    } else {
      // Execute immediately as fallback
      setTimeout(() => localEmitter.emit(queueName, JSON.parse(task)), delayMs);
    }
  } catch (err) {
    setTimeout(() => localEmitter.emit(queueName, JSON.parse(task)), delayMs);
  }
}

export default { publishMessage, subscribe, scheduleTask };
