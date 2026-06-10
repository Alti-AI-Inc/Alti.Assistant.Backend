import { logger } from '../../../../shared/logger.js';
import { RedisClient } from '../../../../shared/redis.js';

/**
 * @module WorkflowResilienceService
 * @description
 * Workflow Resilience Service
 *
 * Provides configurable retry policies with exponential backoff and jitter,
 * plus a rollback registry for reversible Composio actions. It also includes
 * a distributed rate-limiting mechanism using Redis to manage outgoing API calls
 * to third-party services.
 *
 * Usage:
 *   const result = await workflowResilienceService.executeWithRetry(
 *     () => composioTool.execute(params),
 *     { maxAttempts: 3, baseDelayMs: 1000, stepId: 'step_1', app: 'gmail', actionType: 'network' }
 *   );
 *
 *   workflowResilienceService.registerCompletedStep(executionId, stepInfo, stepResult);
 *
 *   const rollbackSummary = await workflowResilienceService.rollbackExecution(
 *     executionId,
 *     async (rollbackStep) => {
 *       // Logic to execute the rollback action, e.g., call Composio tool
 *       await composioTool.execute(rollbackStep.app, rollbackStep.action, rollbackStep.parameters);
 *     }
 *   );
 */

/**
 * @typedef {Object} RetryPolicy
 * @property {number} maxAttempts - Maximum number of attempts for an operation.
 * @property {number} baseDelayMs - Base delay in milliseconds for exponential backoff.
 * @property {number} maxDelayMs - Maximum delay in milliseconds between retries.
 * @property {boolean} jitter - Whether to add randomized jitter to the delay.
 */

/**
 * @constant {Object.<string, RetryPolicy>} DEFAULT_POLICIES
 * @description Default retry policies configured for different action types.
 * These policies define the `maxAttempts`, `baseDelayMs`, `maxDelayMs`, and `jitter`
 * settings for network-heavy, read, write, and general actions.
 */
const DEFAULT_POLICIES = {
  // Network-heavy actions (email, API calls) get more retries
  network: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: true },
  // Idempotent read actions can retry aggressively
  read: { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 15000, jitter: true },
  // Write/create actions are more cautious
  write: { maxAttempts: 2, baseDelayMs: 2000, maxDelayMs: 30000, jitter: true },
  // Default fallback
  default: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: true },
};

/**
 * @constant {Object.<string, Object.<string, string|null>>} ROLLBACK_REGISTRY
 * @description A registry mapping Composio application actions to their corresponding
 * rollback (undo) actions. If an action cannot be rolled back, its value is `null`.
 * This is crucial for maintaining data consistency in case of workflow failures.
 */
const ROLLBACK_REGISTRY = {
  gmail: {
    send_email: null, // Cannot unsend
    create_draft: 'delete_draft',
    add_label: 'remove_label',
  },
  googlecalendar: {
    create_event: 'delete_event',
    update_event: null, // Would need snapshot
  },
  slack: {
    send_message: 'delete_message',
    create_channel: 'archive_channel',
  },
  github: {
    create_issue: 'close_issue',
    create_pr: 'close_pr',
    add_label: 'remove_label',
  },
  trello: {
    create_card: 'archive_card',
    add_member: 'remove_member',
  },
  linear: {
    create_issue: 'archive_issue',
    update_issue: null,
  },
  notion: {
    create_page: 'archive_page',
    update_page: null,
  },
};

/**
 * @constant {RegExp[]} RETRYABLE_ERROR_PATTERNS
 * @description An array of regular expressions used to identify transient errors
 * that are considered retryable. These patterns are matched against error messages
 * and codes to determine if an operation should be re-attempted.
 */
const RETRYABLE_ERROR_PATTERNS = [
  /rate limit/i,
  /429/,
  /too many requests/i,
  /timeout/i,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /socket hang up/i,
  /network error/i,
  /503/,
  /502/,
  /service unavailable/i,
  /bad gateway/i,
  /internal server error/i,
  /500/,
  /temporarily unavailable/i,
];

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} limit - The maximum number of requests allowed within the window.
 * @property {number} windowMs - The time window in milliseconds during which the limit applies.
 */

/**
 * @constant {Object.<string, RateLimitConfig>} DEFAULT_RATE_LIMITS
 * @description Predefined outgoing rate limits for various third-party providers/services.
 * These limits are used by the `throttle` method to prevent exceeding API quotas.
 */
const DEFAULT_RATE_LIMITS = {
  gmail: { limit: 15, windowMs: 60000 },
  slack: { limit: 20, windowMs: 60000 },
  google_cloud: { limit: 50, windowMs: 60000 },
  google_workspace: { limit: 10, windowMs: 60000 },
  vertex_ai: { limit: 10, windowMs: 60000 },
  default: { limit: 30, windowMs: 60000 }
};

/**
 * @constant {string} RATE_LIMIT_LUA_SCRIPT
 * @description Lua script for atomic sliding window rate limiting using Redis sorted sets.
 * This script ensures that rate limit checks and updates are performed atomically on the Redis server,
 * preventing race conditions that could occur with separate GET and SET operations in a distributed environment.
 * It removes old timestamps, checks the current count, adds a new timestamp if under limit,
 * and calculates the wait time if the limit is exceeded.
 */
const RATE_LIMIT_LUA_SCRIPT = `
-- KEYS[1]: The Redis key for the rate limit (e.g., ratelimit:wf:gmail)
-- KEYS[2]: A counter key for unique members (e.g., ratelimit:wf:gmail:counter)
-- ARGV[1]: Current timestamp in milliseconds
-- ARGV[2]: Window size in milliseconds
-- ARGV[3]: Limit (max requests)

local key = KEYS[1]
local counter_key = KEYS[2]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- Remove all members with a score less than (now - windowMs)
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)

-- Get the current count of requests within the window
local count = redis.call('ZCARD', key)

if count < limit then
    -- Generate a unique member ID using a counter to ensure each request is counted
    local unique_id = now .. ':' .. redis.call('INCR', counter_key)
    redis.call('ZADD', key, now, unique_id)
    -- Set/update the expiry for the main key to ensure it eventually cleans up
    redis.call('EXPIRE', key, math.ceil(windowMs / 1000) + 1)
    -- Also set expiry for the counter key to clean up
    redis.call('EXPIRE', counter_key, math.ceil(windowMs / 1000) + 1)
    return {1, 0} -- Allowed, no wait
else
    -- Limit exceeded. Calculate wait time.
    -- Get the score (timestamp) of the oldest request in the window
    local oldestTimestamp = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2]
    if oldestTimestamp then
        local waitTime = (tonumber(oldestTimestamp) + windowMs) - now
        return {0, math.max(0, waitTime)} -- Not allowed, return wait time
    else
        -- This case should ideally not be reached if count > 0, but as a fallback
        return {0, windowMs} -- Fallback: wait for a full window
    end
end
`;

/**
 * @class WorkflowResilienceService
 * @description
 * Manages workflow resilience by providing retry mechanisms with exponential backoff
 * and jitter, a rollback registry for failed workflow executions, and distributed
 * rate limiting for outgoing API calls.
 */
class WorkflowResilienceService {
  /**
   * Creates an instance of WorkflowResilienceService.
   * Initializes internal registries for completed steps and throttle locks.
   */
  constructor() {
    /**
     * @private
     * @type {Map<string, Array<Object>>}
     * A registry storing details of successfully completed steps for each workflow execution.
     * This map is keyed by `executionId` and stores an array of step objects,
     * each containing `stepId`, `app`, `action`, `parameters`, `result`, `completedAt`,
     * and `rollbackAction`. This allows for potential rollback operations.
     */
    this.completedStepRegistry = new Map();
    /**
     * @private
     * @type {Map<string, boolean>}
     * A local mutex map used to prevent race conditions in the `throttle` method
     * when multiple concurrent calls attempt to update Redis rate limit counters
     * from the same Node.js process.
     * Keys are rate limit keys (e.g., `ratelimit:wf:gmail`), values indicate if a lock is held.
     */
    this.throttleLocks = new Map(); // Local mutex map to prevent concurrent tick race conditions
  }

  /**
   * Checks and enforces rate limits for a given target service using an atomic Redis Lua script.
   * This method uses Redis sorted sets to maintain a distributed log of request timestamps
   * within a sliding time window. If the limit is exceeded, the execution is blocked (sleeps)
   * until the rate limit resets or a token becomes available. A local mutex is used to prevent
   * race conditions during Redis operations from the same Node.js instance.
   *
   * @param {string} service - The name of the service or provider, e.g., 'gmail', 'slack'.
   * @param {number} [limit=30] - The maximum number of requests allowed within the `windowMs`.
   * @param {number} [windowMs=60000] - The duration of the rate limit window in milliseconds.
   * @returns {Promise<void>} A promise that resolves when the request is allowed to proceed.
   * @throws {Error} If an error occurs during Redis operations or throttle lock management.
   */
  async throttle(service, limit = 30, windowMs = 60000) {
    const key = `ratelimit:wf:${service?.toLowerCase() || 'default'}`;
    const counterKey = `${key}:counter`; // Key for unique member counter in Lua script

    while (true) {
      // Acquire local execution lock to prevent parallel EVAL calls from the same Node.js instance
      // for the same key. This is a local optimization, the Lua script handles atomicity on Redis.
      while (this.throttleLocks.get(key)) {
        await this._sleep(5);
      }
      this.throttleLocks.set(key, true);

      try {
        const now = Date.now();
        // Execute the Lua script atomically on Redis.
        // The script returns an array: [allowed (1 or 0), waitTimeMs].
        const [allowed, waitTime] = await RedisClient.eval(
          RATE_LIMIT_LUA_SCRIPT,
          2, // Number of keys passed to the script
          key,
          counterKey,
          now,
          windowMs,
          limit
        );

        if (allowed === 1) {
          this.throttleLocks.set(key, false); // Release local lock
          break; // Allowed to run!
        } else {
          // Release local lock *before* sleeping to allow other concurrent calls to queue up and wait too
          this.throttleLocks.set(key, false);

          logger.info(`[Rate Limiting] Outgoing limit exceeded for service "${service}". Throttling execution. Pausing for ${waitTime}ms...`);
          await this._sleep(waitTime + 50); // Add a small buffer to wait time
        }
      } catch (err) {
        this.throttleLocks.set(key, false); // Safeguard release on error
        throw err;
      }
    }
  }

  /**
   * Executes an asynchronous function with configurable retry logic, exponential backoff, and jitter.
   * It also applies outgoing rate limiting if an `app` is specified in the options.
   *
   * @param {Function} fn - The asynchronous function to execute. This function should return a Promise.
   * @param {Object} [options={}] - Configuration options for the retry mechanism.
   * @param {number} [options.maxAttempts=3] - The maximum number of times to attempt the function execution.
   * @param {number} [options.baseDelayMs=1000] - The base delay in milliseconds for the exponential backoff.
   * @param {number} [options.maxDelayMs=30000] - The maximum delay in milliseconds between retries.
   * @param {boolean} [options.jitter=true] - If `true`, adds a random jitter to the calculated delay.
   * @param {string} [options.stepId='unknown'] - An identifier for the current step, used for logging.
   * @param {string} [options.actionType='default'] - The type of action (e.g., 'network', 'read', 'write')
   *   to resolve a predefined retry policy from `DEFAULT_POLICIES`.
   * @param {string} [options.app] - The name of the application/service (e.g., 'gmail', 'slack')
   *   to apply outgoing rate limiting based on `DEFAULT_RATE_LIMITS`.
   * @returns {Promise<Object>} A promise that resolves to an object containing the execution result and metadata.
   * @property {boolean} success - `true` if the function executed successfully, `false` otherwise.
   * @property {*} [result] - The return value of `fn()` if successful.
   * @property {string} [error] - The error message if the function failed after all retries.
   * @property {number} attempts - The total number of attempts made.
   * @property {number} totalDurationMs - The total time taken for all attempts, in milliseconds.
   * @property {boolean} retried - `true` if the function was retried at least once.
   * @property {boolean} [exhaustedRetries] - `true` if all retry attempts were exhausted without success.
   * @throws {Error} If the function fails and the error is not retryable, or if all retries are exhausted.
   */
  async executeWithRetry(fn, options = {}) {
    const policy = this._resolvePolicy(options);
    const { maxAttempts, baseDelayMs, maxDelayMs, jitter } = policy;
    const stepId = options.stepId || 'unknown';

    // Apply outgoing rate limit throttle if app/service is specified
    if (options.app) {
      const appName = options.app.toLowerCase();
      const limitConfig = DEFAULT_RATE_LIMITS[appName] || DEFAULT_RATE_LIMITS.default;
      await this.throttle(options.app, limitConfig.limit, limitConfig.windowMs);
    }

    let lastError = null;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`Resilience: executing step ${stepId}, attempt ${attempt}/${maxAttempts}`);

        const result = await fn();

        return {
          success: true,
          result,
          attempts: attempt,
          totalDurationMs: Date.now() - startTime,
          retried: attempt > 1,
        };
      } catch (error) {
        lastError = error;
        logger.warn(`Resilience: step ${stepId} attempt ${attempt} failed: ${error.message}`);

        // Check if error is retryable
        if (!this._isRetryable(error)) {
          logger.info(`Resilience: error is not retryable, failing immediately`);
          break;
        }

        // Don't wait after the last attempt
        if (attempt < maxAttempts) {
          const delay = this._calculateDelay(attempt, baseDelayMs, maxDelayMs, jitter);
          logger.info(`Resilience: waiting ${delay}ms before retry`);
          await this._sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      attempts: maxAttempts,
      totalDurationMs: Date.now() - startTime,
      retried: maxAttempts > 1,
      exhaustedRetries: true,
    };
  }

  /**
   * Registers a successfully completed workflow step for a given execution.
   * This information is stored in the `completedStepRegistry` and can be used
   * later for rollback operations if the workflow fails downstream.
   *
   * @param {string} executionId - The unique identifier for the workflow execution.
   * @param {Object} step - An object containing details about the completed step.
   * @param {string} step.stepId - The unique ID of the step within the workflow.
   * @param {string} step.app - The name of the application/service involved (e.g., 'gmail').
   * @param {string} step.action - The specific action performed (e.g., 'send_email').
   * @param {Object} step.parameters - The parameters used to execute the step.
   * @param {Object} result - The result object returned by the successful execution of the step.
   *   This typically includes data like `id`, `messageId`, `eventId`, etc., which might be
   *   needed for rollback.
   */
  registerCompletedStep(executionId, step, result) {
    if (!this.completedStepRegistry.has(executionId)) {
      this.completedStepRegistry.set(executionId, []);
    }

    this.completedStepRegistry.get(executionId).push({
      stepId: step.stepId,
      app: step.app,
      action: step.action,
      parameters: step.parameters,
      result,
      completedAt: new Date(),
      rollbackAction: this._getRollbackAction(step.app, step.action),
    });
  }

  /**
   * Initiates a rollback for all registered completed steps of a failed workflow execution.
   * Steps are rolled back in reverse order of their completion (most recent first).
   * Only steps with a defined `rollbackAction` in the `ROLLBACK_REGISTRY` will be attempted.
   *
   * @param {string} executionId - The unique identifier of the workflow execution to rollback.
   * @param {Function} executeRollbackFn - An asynchronous function responsible for executing
   *   a single rollback step. It receives an object with `app`, `action`, `parameters`, and `stepId`.
   *   Example: `async ({ app, action, parameters, stepId }) => { await composioTool.execute(app, action, parameters); }`
   * @returns {Promise<Object>} A promise that resolves to a summary of the rollback operation.
   * @property {boolean} success - `true` if all attempted rollbacks were successful, `false` otherwise.
   * @property {string} [message] - A descriptive message, e.g., 'No steps to rollback'.
   * @property {number} rolledBack - The count of steps successfully rolled back.
   * @property {number} skipped - The count of steps skipped (e.g., no rollback action defined).
   * @property {number} failed - The count of rollback attempts that failed.
   * @property {Array<Object>} details - An array of objects detailing the outcome for each step.
   * @throws {Error} If `executeRollbackFn` throws an unhandled error during a rollback attempt.
   */
  async rollbackExecution(executionId, executeRollbackFn) {
    const completedSteps = this.completedStepRegistry.get(executionId);

    if (!completedSteps || completedSteps.length === 0) {
      return {
        success: true,
        message: 'No steps to rollback',
        rolledBack: 0,
        skipped: 0,
        failed: 0,
        details: [],
      };
    }

    logger.info(`Resilience: rolling back ${completedSteps.length} steps for execution ${executionId}`);

    const rollbackResults = [];
    let rolledBack = 0;
    let skipped = 0;
    let failed = 0;

    // Reverse order — most recent first
    for (const step of [...completedSteps].reverse()) {
      if (!step.rollbackAction) {
        logger.info(`Resilience: no rollback action for ${step.app}.${step.action}, skipping`);
        skipped++;
        rollbackResults.push({
          stepId: step.stepId,
          status: 'skipped',
          reason: 'No rollback action available',
        });
        continue;
      }

      try {
        logger.info(`Resilience: rolling back ${step.stepId} via ${step.app}.${step.rollbackAction}`);

        // Build rollback parameters from the original result
        const rollbackParams = this._buildRollbackParams(step);

        await executeRollbackFn({
          app: step.app,
          action: step.rollbackAction,
          parameters: rollbackParams,
          stepId: `rollback_${step.stepId}`,
        });

        rolledBack++;
        rollbackResults.push({
          stepId: step.stepId,
          status: 'rolled_back',
          rollbackAction: step.rollbackAction,
        });
      } catch (error) {
        logger.error(`Resilience: rollback failed for ${step.stepId}: ${error.message}`);
        failed++;
        rollbackResults.push({
          stepId: step.stepId,
          status: 'rollback_failed',
          error: error.message,
        });
      }
    }

    // Clean up registry
    this.completedStepRegistry.delete(executionId);

    return {
      success: failed === 0,
      rolledBack,
      skipped,
      failed,
      details: rollbackResults,
    };
  }

  /**
   * Resolves the final retry policy by merging default policies with any provided options.
   *
   * @private
   * @param {Object} options - User-provided retry options.
   * @param {string} [options.actionType='default'] - The type of action to look up in `DEFAULT_POLICIES`.
   * @param {number} [options.maxAttempts] - Overrides the `maxAttempts` from the resolved policy.
   * @param {number} [options.baseDelayMs] - Overrides the `baseDelayMs` from the resolved policy.
   * @param {number} [options.maxDelayMs] - Overrides the `maxDelayMs` from the resolved policy.
   * @param {boolean} [options.jitter] - Overrides the `jitter` from the resolved policy.
   * @returns {RetryPolicy} The resolved retry policy object.
   */
  _resolvePolicy(options) {
    const policyName = options.actionType || 'default';
    const basePolicy = DEFAULT_POLICIES[policyName] || DEFAULT_POLICIES.default;

    return {
      ...basePolicy,
      maxAttempts: options.maxAttempts ?? basePolicy.maxAttempts,
      baseDelayMs: options.baseDelayMs ?? basePolicy.baseDelayMs,
      maxDelayMs: options.maxDelayMs ?? basePolicy.maxDelayMs,
      jitter: options.jitter ?? basePolicy.jitter,
    };
  }

  /**
   * Determines if a given error is considered retryable based on predefined patterns.
   *
   * @private
   * @param {Error} error - The error object to check.
   * @returns {boolean} `true` if the error's message or code matches any retryable pattern, `false` otherwise.
   */
  _isRetryable(error) {
    const message = error.message || '';
    const code = error.code || '';
    const combined = `${message} ${code}`;

    return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(combined));
  }

  /**
   * Calculates the delay for the next retry attempt using exponential backoff
   * and optional jitter.
   *
   * @private
   * @param {number} attempt - The current attempt number (1-indexed).
   * @param {number} baseDelayMs - The base delay in milliseconds.
   * @param {number} maxDelayMs - The maximum allowed delay in milliseconds.
   * @param {boolean} jitter - If `true`, adds a random jitter to the delay.
   * @returns {number} The calculated delay in milliseconds before the next retry.
   */
  _calculateDelay(attempt, baseDelayMs, maxDelayMs, jitter) {
    // Exponential backoff: base * 2^(attempt-1)
    let delay = baseDelayMs * Math.pow(2, attempt - 1);

    // Add jitter (±25% randomization)
    if (jitter) {
      const jitterRange = delay * 0.25;
      delay += (Math.random() * 2 - 1) * jitterRange;
    }

    // Cap at maximum
    return Math.min(Math.round(delay), maxDelayMs);
  }

  /**
   * Looks up the corresponding rollback action for a given application and action.
   *
   * @private
   * @param {string} app - The name of the application (e.g., 'gmail').
   * @param {string} action - The original action performed (e.g., 'create_draft').
   * @returns {string|null} The name of the rollback action (e.g., 'delete_draft'), or `null` if none is defined.
   */
  _getRollbackAction(app, action) {
    const appRollbacks = ROLLBACK_REGISTRY[app?.toLowerCase()];
    if (!appRollbacks) return null;
    return appRollbacks[action?.toLowerCase()] || null;
  }

  /**
   * Builds a set of parameters suitable for a rollback action based on the original step's result.
   * This method attempts to extract common identifiers (like `id`, `messageId`, etc.) from the result.
   *
   * @private
   * @param {Object} step - The completed step object, including its `result`.
   * @param {Object} step.result - The result object from the original successful step execution.
   * @returns {Object} An object containing parameters for the rollback action.
   */
  _buildRollbackParams(step) {
    const params = {};
    const result = step.result?.data || step.result;

    // Common patterns: use the created resource's ID for deletion
    if (result?.id) params.id = result.id;
    if (result?.messageId) params.messageId = result.messageId;
    if (result?.eventId) params.eventId = result.eventId;
    if (result?.issueId) params.issueId = result.issueId;
    if (result?.cardId) params.cardId = result.cardId;
    if (result?.pageId) params.pageId = result.pageId;
    if (result?.channelId) params.channelId = result.channelId;
    if (result?.ts) params.ts = result.ts; // Slack message timestamp

    return params;
  }

  /**
   * Returns a Promise that resolves after a specified number of milliseconds.
   *
   * @private
   * @param {number} ms - The number of milliseconds to sleep.
   * @returns {Promise<void>} A promise that resolves after the delay.
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleans up the `completedStepRegistry` for a specific workflow execution.
   * This should be called after a workflow execution has definitively completed
   * (either successfully or after a rollback) to prevent memory leaks.
   *
   * @param {string} executionId - The unique identifier of the workflow execution to clean up.
   */
  cleanup(executionId) {
    this.completedStepRegistry.delete(executionId);
  }
}

/**
 * @constant {WorkflowResilienceService} workflowResilienceService
 * @description An exported singleton instance of the `WorkflowResilienceService`.
 * Use this instance to access all resilience functionalities across the application.
 */
export const workflowResilienceService = new WorkflowResilienceService();