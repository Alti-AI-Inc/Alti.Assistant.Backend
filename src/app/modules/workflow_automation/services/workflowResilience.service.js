import { PubSub } from '@google-cloud/pubsub';
import { CloudTasksClient } from '@google-cloud/tasks';
import { logger } from '../../../../shared/logger.js';
import { RedisClient } from '../../../../shared/redis.js';

// --- GCP Configuration ---
// These values should be configured via environment variables for different environments.
const GCP_PROJECT = process.env.GCP_PROJECT_ID || 'your-gcp-project-id';
const GCP_LOCATION = process.env.GCP_LOCATION || 'us-central1';
const GCP_CLOUD_TASKS_QUEUE = process.env.GCP_CLOUD_TASKS_QUEUE || 'workflow-execution-queue';
// This URL must point to a secure, internal endpoint that can handle the task payload.
const GCP_TASK_HANDLER_URL = process.env.GCP_TASK_HANDLER_URL || 'https://your-backend-service.com/internal/v1/tasks/handle-workflow-step';
const GCP_TASK_INVOKER_SA = process.env.GCP_TASK_INVOKER_SA || `service-account@${GCP_PROJECT}.iam.gserviceaccount.com`;
const GCP_PUB_SUB_ROLLBACK_TOPIC = process.env.GCP_PUB_SUB_ROLLBACK_TOPIC || 'workflow-rollback-step-topic';

// --- Initialize GCP Clients ---
const pubSubClient = new PubSub({ projectId: GCP_PROJECT });
const cloudTasksClient = new CloudTasksClient();
const taskQueuePath = cloudTasksClient.queuePath(GCP_PROJECT, GCP_LOCATION, GCP_CLOUD_TASKS_QUEUE);
const rollbackTopic = pubSubClient.topic(GCP_PUB_SUB_ROLLBACK_TOPIC);

/**
 * @module WorkflowResilienceService
 * @description
 * Workflow Resilience Service (Refactored for Asynchronous Offloading)
 *
 * This service is redesigned to be stateless and scalable for containerized environments.
 * It offloads long-running operations like retries, throttled waits, and rollbacks
 * to Google Cloud Tasks and Pub/Sub, preventing in-memory blocking.
 *
 * - State (completed steps) is stored in Redis, not in-memory.
 * - Retries and rate-limit waits are handled by scheduling a Cloud Task, freeing up the server process immediately.
 * - Rollbacks are fanned out via Pub/Sub messages for parallel, decoupled processing by background workers.
 *
 * Usage:
 *   // To execute a step for the first time
 *   const result = await workflowResilienceService.handleWorkflowStep(
 *     { executionId, stepId, app, action, parameters },
 *     { actionType: 'network' }
 *   );
 *   // The result will indicate if it succeeded, failed, or was scheduled for a later attempt.
 *
 *   // A separate HTTP endpoint (at GCP_TASK_HANDLER_URL) receives POST requests from Cloud Tasks
 *   // and calls handleWorkflowStep again with the payload to execute retries.
 */

/**
 * @typedef {Object} RetryPolicy
 * @property {number} maxAttempts - Maximum number of attempts for an operation.
 * @property {number} baseDelayMs - Base delay in milliseconds for exponential backoff.
 * @property {number} maxDelayMs - Maximum delay in milliseconds between retries.
 * @property {boolean} jitter - Whether to add randomized jitter to the delay.
 */

const DEFAULT_POLICIES = {
  network: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: true },
  read: { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 15000, jitter: true },
  write: { maxAttempts: 2, baseDelayMs: 2000, maxDelayMs: 30000, jitter: true },
  default: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: true },
};

const ROLLBACK_REGISTRY = {
  gmail: { send_email: null, create_draft: 'delete_draft', add_label: 'remove_label' },
  googlecalendar: { create_event: 'delete_event', update_event: null },
  slack: { send_message: 'delete_message', create_channel: 'archive_channel' },
  github: { create_issue: 'close_issue', create_pr: 'close_pr', add_label: 'remove_label' },
  trello: { create_card: 'archive_card', add_member: 'remove_member' },
  linear: { create_issue: 'archive_issue', update_issue: null },
  notion: { create_page: 'archive_page', update_page: null },
};

const RETRYABLE_ERROR_PATTERNS = [
  /rate limit/i, /429/, /too many requests/i, /timeout/i, /ETIMEDOUT/,
  /ECONNRESET/, /ECONNREFUSED/, /socket hang up/i, /network error/i,
  /503/, /502/, /service unavailable/i, /bad gateway/i, /internal server error/i,
  /500/, /temporarily unavailable/i,
];

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} limit - The maximum number of requests allowed within the window.
 * @property {number} windowMs - The time window in milliseconds during which the limit applies.
 */

const DEFAULT_RATE_LIMITS = {
  gmail: { limit: 15, windowMs: 60000 },
  slack: { limit: 20, windowMs: 60000 },
  google_cloud: { limit: 50, windowMs: 60000 },
  google_workspace: { limit: 10, windowMs: 60000 },
  vertex_ai: { limit: 10, windowMs: 60000 },
  default: { limit: 30, windowMs: 60000 }
};

const RATE_LIMIT_LUA_SCRIPT = `
local key = KEYS[1]
local counter_key = KEYS[2]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
if count < limit then
    local unique_id = now .. ':' .. redis.call('INCR', counter_key)
    redis.call('ZADD', key, now, unique_id)
    redis.call('EXPIRE', key, math.ceil(windowMs / 1000) + 1)
    redis.call('EXPIRE', counter_key, math.ceil(windowMs / 1000) + 1)
    return {1, 0}
else
    local oldestTimestamp = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2]
    if oldestTimestamp then
        local waitTime = (tonumber(oldestTimestamp) + windowMs) - now
        return {0, math.max(0, waitTime)}
    else
        return {0, windowMs}
    end
end
`;

/**
 * @class WorkflowResilienceService
 * @description
 * Manages workflow resilience by offloading waits and retries to GCP services,
 * using Redis for distributed state management.
 */
class WorkflowResilienceService {
  constructor() {
    // The service is now stateless. `completedStepRegistry` is stored in Redis.
    // `throttleLocks` is a process-local mutex to prevent race conditions from a single
    // Node.js instance when checking Redis, which is a valid optimization.
    this.throttleLocks = new Map();
  }

  /**
   * Handles the execution of a single workflow step. It attempts to execute the step immediately.
   * If the action is rate-limited or fails with a retryable error, it schedules a Cloud Task
   * to perform the execution later, rather than blocking the current process with a sleep.
   *
   * @param {Object} stepDetails - Serializable details of the step to execute.
   * @param {string} stepDetails.executionId - The unique ID for the entire workflow execution.
   * @param {string} stepDetails.stepId - The unique ID for this specific step.
   * @param {string} stepDetails.app - The application/tool to use (e.g., 'gmail').
   * @param {string} stepDetails.action - The action to perform (e.g., 'send_email').
   * @param {Object} stepDetails.parameters - The parameters for the action.
   * @param {Object} [options={}] - Configuration options for execution.
   * @param {number} [options.currentAttempt=1] - The current attempt number (used by Cloud Task retries).
   * @param {string} [options.actionType='default'] - The type of action for resolving a retry policy.
   * @returns {Promise<Object>} A promise that resolves to an object indicating the outcome.
   *   - { status: 'SUCCESS', result, attempts } on successful execution.
   *   - { status: 'FAILED', error, attempts } on a permanent failure.
   *   - { status: 'THROTTLED', scheduled: true, waitTimeMs } if rate-limited and rescheduled.
   *   - { status: 'RETRY_SCHEDULED', scheduled: true, nextAttempt, delayMs } if a retry was scheduled.
   */
  async handleWorkflowStep(stepDetails, options = {}) {
    const { executionId, stepId, app, action, parameters } = stepDetails;
    const { currentAttempt = 1 } = options;

    const policy = this._resolvePolicy(options);
    const { maxAttempts } = policy;

    // 1. Rate Limiting Check: Before executing, check if we are within rate limits.
    if (app) {
      const appName = app.toLowerCase();
      const limitConfig = DEFAULT_RATE_LIMITS[appName] || DEFAULT_RATE_LIMITS.default;
      const { allowed, waitTime } = await this._checkRateLimit(app, limitConfig.limit, limitConfig.windowMs);

      if (!allowed) {
        logger.info(`[Rate Limiting] Limit hit for "${app}". Scheduling step ${stepId} to run in ${waitTime}ms.`);
        // Offload the execution to a Cloud Task instead of sleeping in-memory.
        await this._scheduleWorkflowStepTask(stepDetails, options, waitTime / 1000);
        return {
          status: 'THROTTLED',
          scheduled: true,
          waitTimeMs: waitTime,
          attempts: 0, // No attempt was made yet.
        };
      }
    }

    // 2. Execute the step
    const startTime = Date.now();
    try {
      logger.info(`Resilience: executing step ${stepId} (execution: ${executionId}), attempt ${currentAttempt}/${maxAttempts}`);

      // In a real application, this would call the actual tool execution service.
      const result = await this._executeMcpAction(app, action, parameters);

      return {
        status: 'SUCCESS',
        result,
        attempts: currentAttempt,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.warn(`Resilience: step ${stepId} attempt ${currentAttempt} failed: ${error.message}`);

      // 3. Handle failure: schedule a retry or fail permanently.
      if (currentAttempt < maxAttempts && this._isRetryable(error)) {
        const { baseDelayMs, maxDelayMs, jitter } = policy;
        const delayMs = this._calculateDelay(currentAttempt, baseDelayMs, maxDelayMs, jitter);
        logger.info(`Resilience: Scheduling retry ${currentAttempt + 1}/${maxAttempts} for step ${stepId} in ${delayMs}ms.`);

        // Offload the next attempt to a Cloud Task.
        const nextAttemptOptions = { ...options, currentAttempt: currentAttempt + 1 };
        await this._scheduleWorkflowStepTask(stepDetails, nextAttemptOptions, delayMs / 1000);

        return {
          status: 'RETRY_SCHEDULED',
          scheduled: true,
          nextAttempt: currentAttempt + 1,
          delayMs,
          error: error?.message || 'Unknown error',
        };
      } else {
        logger.error(`Resilience: step ${stepId} failed permanently after ${currentAttempt} attempts.`);
        return {
          status: 'FAILED',
          error: error?.message || 'Unknown error',
          attempts: currentAttempt,
          totalDurationMs: Date.now() - startTime,
        };
      }
    }
  }

  /**
   * Registers a successfully completed workflow step in Redis for potential rollback.
   * The record is set to expire to prevent orphaned data.
   *
   * @param {string} executionId - The unique identifier for the workflow execution.
   * @param {Object} step - Details about the completed step.
   * @param {Object} result - The result from the successful execution.
   * @returns {Promise<void>}
   */
  async registerCompletedStep(executionId, step, result) {
    const key = `completed_steps:${executionId}`;
    const stepData = {
      stepId: step.stepId,
      app: step.app,
      action: step.action,
      parameters: step.parameters,
      result,
      completedAt: new Date().toISOString(),
      rollbackAction: this._getRollbackAction(step.app, step.action),
    };

    const pipeline = RedisClient.pipeline();
    pipeline.rpush(key, JSON.stringify(stepData));
    pipeline.expire(key, 86400); // 24-hour TTL
    await pipeline.exec();
  }

  /**
   * Initiates a rollback by publishing messages to Pub/Sub for each reversible step.
   * This fans out the rollback process to be handled by background workers asynchronously.
   *
   * @param {string} executionId - The ID of the workflow execution to rollback.
   * @returns {Promise<Object>} A summary of the rollback initiation.
   */
  async rollbackExecution(executionId) {
    const key = `completed_steps:${executionId}`;
    const completedStepsJson = await RedisClient.lrange(key, 0, -1);

    if (!completedStepsJson || completedStepsJson.length === 0) {
      return { status: 'NO_OP', message: 'No steps to rollback', publishedMessages: 0 };
    }

    const completedSteps = completedStepsJson.map(json => JSON.parse(json));
    logger.info(`Resilience: initiating rollback for ${completedSteps.length} steps for execution ${executionId}`);

    let publishedCount = 0;
    const publishPromises = [];

    for (const step of [...completedSteps].reverse()) {
      if (!step.rollbackAction) {
        logger.info(`Resilience: no rollback action for ${step.app}.${step.action}, skipping`);
        continue;
      }

      logger.info(`Resilience: publishing rollback task for ${step.stepId} via ${step.app}.${step.rollbackAction}`);
      const rollbackParameters = this._buildRollbackParams(step);

      const messagePayload = {
        taskType: 'WORKFLOW_STEP_ROLLBACK',
        executionId,
        stepToRollback: { ...step, rollbackParameters },
      };

      const dataBuffer = Buffer.from(JSON.stringify(messagePayload));
      publishPromises.push(rollbackTopic.publishMessage({ data: dataBuffer }));
      publishedCount++;
    }

    await Promise.all(publishPromises);
    logger.info(`Published ${publishedCount} rollback messages for execution ${executionId}.`);

    await this.cleanup(executionId);

    return {
      status: 'INITIATED',
      message: `Published ${publishedCount} rollback messages.`,
      publishedMessages: publishedCount,
      totalSteps: completedSteps.length,
    };
  }

  /**
   * Cleans up Redis records for a given workflow execution.
   *
   * @param {string} executionId - The unique identifier of the workflow execution.
   */
  async cleanup(executionId) {
    const key = `completed_steps:${executionId}`;
    await RedisClient.del(key);
  }

  /**
   * @private
   * Placeholder for the actual tool/action execution logic.
   */
  async _executeMcpAction(app, action, parameters) {
    // In a real application, this would integrate with the MCP tool execution logic.
    // e.g., return await mcpTool.execute(app, action, parameters);
    logger.info(`Simulating execution: ${app}.${action} with params:`, parameters);
    if (Math.random() < 0.3) { // Simulate a 30% chance of a transient error
      const err = new Error("Simulated network error: 503 service unavailable");
      // @ts-ignore
      err.code = '503';
      throw err;
    }
    return { data: { id: `id_${Date.now()}`, message: "Action completed successfully" } };
  }

  /**
   * @private
   * Schedules a workflow step execution task in Google Cloud Tasks.
   */
  async _scheduleWorkflowStepTask(stepDetails, options, delayInSeconds = 0) {
    const payload = { taskType: 'WORKFLOW_STEP_EXECUTION', stepDetails, options };
    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: GCP_TASK_HANDLER_URL,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        oidcToken: { serviceAccountEmail: GCP_TASK_INVOKER_SA },
      },
    };

    if (delayInSeconds > 0) {
      task.scheduleTime = { seconds: Math.floor(Date.now() / 1000) + Math.ceil(delayInSeconds) };
    }

    try {
      logger.info(`Scheduling task for step ${stepDetails.stepId} with delay ${delayInSeconds.toFixed(2)}s`);
      const [response] = await cloudTasksClient.createTask({ parent: taskQueuePath, task });
      logger.info(`Task ${response.name} created successfully.`);
      return response;
    } catch (error) {
      logger.error(`Failed to create Cloud Task for step ${stepDetails.stepId}:`, error);
      throw error;
    }
  }

  /**
   * @private
   * Checks the rate limit for a service without blocking/sleeping.
   */
  async _checkRateLimit(service, limit, windowMs) {
    const key = `ratelimit:wf:${service?.toLowerCase() || 'default'}`;
    const counterKey = `${key}:counter`;

    while (this.throttleLocks.get(key)) {
      await this._sleep(5);
    }
    this.throttleLocks.set(key, true);

    try {
      const now = Date.now();
      const [allowed, waitTime] = await RedisClient.eval(
        RATE_LIMIT_LUA_SCRIPT, 2, key, counterKey, now, windowMs, limit
      );
      return { allowed: allowed === 1, waitTime };
    } finally {
      this.throttleLocks.set(key, false);
    }
  }

  /**
   * @private
   * Resolves the final retry policy by merging defaults with provided options.
   */
  _resolvePolicy(options) {
    const policyName = options.actionType || 'default';
    const basePolicy = DEFAULT_POLICIES[policyName] || DEFAULT_POLICIES.default;
    return { ...basePolicy, ...options };
  }

  /**
   * @private
   * Determines if an error is retryable based on predefined patterns.
   */
  _isRetryable(error) {
    const combined = `${error.message || ''} ${error.code || ''}`;
    return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(combined));
  }

  /**
   * @private
   * Calculates the delay for the next retry attempt with exponential backoff and jitter.
   */
  _calculateDelay(attempt, baseDelayMs, maxDelayMs, jitter) {
    let delay = baseDelayMs * Math.pow(2, attempt - 1);
    if (jitter) {
      const jitterRange = delay * 0.25;
      delay += (Math.random() * 2 - 1) * jitterRange;
    }
    return Math.min(Math.round(delay), maxDelayMs);
  }

  /**
   * @private
   * Looks up the corresponding rollback action for a given application and action.
   */
  _getRollbackAction(app, action) {
    const appRollbacks = ROLLBACK_REGISTRY[app?.toLowerCase()];
    return appRollbacks?.[action?.toLowerCase()] || null;
  }

  /**
   * @private
   * Builds parameters for a rollback action based on the original step's result.
   */
  _buildRollbackParams(step) {
    const params = {};
    const result = step.result?.data || step.result;
    if (!result) return params;

    if (result.id) params.id = result.id;
    if (result.messageId) params.messageId = result.messageId;
    if (result.eventId) params.eventId = result.eventId;
    if (result.issueId) params.issueId = result.issueId;
    if (result.cardId) params.cardId = result.cardId;
    if (result.pageId) params.pageId = result.pageId;
    if (result.channelId) params.channelId = result.channelId;
    if (result.ts) params.ts = result.ts; // Slack message timestamp

    return params;
  }

  /**
   * @private
   * Simple promise-based sleep utility.
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const workflowResilienceService = new WorkflowResilienceService();