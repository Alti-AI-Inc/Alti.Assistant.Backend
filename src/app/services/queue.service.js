import { logger } from '../../shared/logger.js';

/**
 * Queue Service — BullMQ-powered durable job queue manager.
 * MIT License. Uses existing Redis connection.
 *
 * Provides named queues for agents, workflows, and triggers
 * with automatic retries, priority, and progress events.
 */

let Queue, Worker, QueueEvents;
let queues = {};
let workers = {};
let initialized = false;

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

async function initBullMQ() {
  if (initialized) return;
  try {
    const bullmq = await import('bullmq');
    Queue = bullmq.Queue;
    Worker = bullmq.Worker;
    QueueEvents = bullmq.QueueEvents;
    initialized = true;
    logger.info('[QueueService] BullMQ initialized');
  } catch (err) {
    logger.warn(`[QueueService] BullMQ not available: ${err.message}`);
  }
}

export const QueueService = {
  /**
   * Get or create a named queue.
   */
  async getQueue(name) {
    await initBullMQ();
    if (!Queue) return null;

    if (!queues[name]) {
      queues[name] = new Queue(name, {
        connection: REDIS_CONFIG,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      logger.info(`[QueueService] Queue "${name}" created`);
    }
    return queues[name];
  },

  /**
   * Add a job to a named queue.
   */
  async addJob(queueName, jobName, data, options = {}) {
    const queue = await this.getQueue(queueName);
    if (!queue) {
      logger.warn(`[QueueService] Queue unavailable, executing inline`);
      return { id: 'inline', data };
    }

    const job = await queue.add(jobName, data, {
      ...DEFAULT_JOB_OPTIONS,
      ...options,
    });

    logger.info(`[QueueService] Job ${job.id} added to "${queueName}"`);
    return { id: job.id, name: job.name, data: job.data };
  },

  /**
   * Register a worker for a named queue.
   */
  async registerWorker(queueName, processor, options = {}) {
    await initBullMQ();
    if (!Worker) return null;

    const worker = new Worker(queueName, processor, {
      connection: REDIS_CONFIG,
      concurrency: options.concurrency || 5,
      ...options,
    });

    worker.on('completed', (job) => {
      logger.info(`[QueueService] Job ${job.id} completed in "${queueName}"`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[QueueService] Job ${job?.id} failed in "${queueName}": ${err.message}`);
    });

    workers[queueName] = worker;
    logger.info(`[QueueService] Worker registered for "${queueName}" (concurrency: ${options.concurrency || 5})`);
    return worker;
  },

  /**
   * Get job status by ID from a named queue.
   */
  async getJobStatus(queueName, jobId) {
    const queue = await this.getQueue(queueName);
    if (!queue) return null;

    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return {
      id: job.id,
      name: job.name,
      state,
      progress: job.progress,
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
    };
  },

  /**
   * Get queue metrics.
   */
  async getQueueMetrics(queueName) {
    const queue = await this.getQueue(queueName);
    if (!queue) return null;

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { queueName, waiting, active, completed, failed, delayed };
  },

  /**
   * Gracefully close all queues and workers.
   */
  async shutdown() {
    for (const [name, worker] of Object.entries(workers)) {
      await worker.close();
      logger.info(`[QueueService] Worker "${name}" closed`);
    }
    for (const [name, queue] of Object.entries(queues)) {
      await queue.close();
      logger.info(`[QueueService] Queue "${name}" closed`);
    }
    queues = {};
    workers = {};
    initialized = false;
  },
};

export default QueueService;
