import { logger } from '../../../../shared/logger.js';

/**
 * Workflow Resilience Service
 * 
 * Provides configurable retry policies with exponential backoff and jitter,
 * plus a rollback registry for reversible Composio actions.
 * 
 * Usage:
 *   const result = await resilienceService.executeWithRetry(
 *     () => composioTool.execute(params),
 *     { maxAttempts: 3, baseDelayMs: 1000, stepId: 'step_1' }
 *   );
 */

// Default retry policies per action type
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

// Actions known to be reversible (app → action → undo action)
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

// Errors that are retryable (transient)
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

class WorkflowResilienceService {
  constructor() {
    /** @type {Map<string, Array<Object>>} Completed steps per execution for rollback */
    this.completedStepRegistry = new Map();
  }

  /**
   * Execute a function with retry logic and exponential backoff.
   * 
   * @param {Function} fn - Async function to execute
   * @param {Object} options - Retry configuration
   * @param {number} [options.maxAttempts=3] - Maximum number of attempts
   * @param {number} [options.baseDelayMs=1000] - Base delay between retries
   * @param {number} [options.maxDelayMs=30000] - Maximum delay cap
   * @param {boolean} [options.jitter=true] - Add randomized jitter
   * @param {string} [options.stepId] - Step identifier for logging
   * @param {string} [options.actionType='default'] - Action type for policy lookup
   * @returns {Object} Result with attempt count and timing info
   */
  async executeWithRetry(fn, options = {}) {
    const policy = this._resolvePolicy(options);
    const { maxAttempts, baseDelayMs, maxDelayMs, jitter } = policy;
    const stepId = options.stepId || 'unknown';

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
   * Register a completed step for potential rollback.
   * 
   * @param {string} executionId - The workflow execution ID
   * @param {Object} step - The completed step info
   * @param {Object} result - The step's execution result
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
   * Rollback all completed steps for a failed execution.
   * Executes rollbacks in reverse order.
   * 
   * @param {string} executionId - The workflow execution ID
   * @param {Function} executeRollbackFn - Function to execute a rollback step
   * @returns {Object} Rollback summary
   */
  async rollbackExecution(executionId, executeRollbackFn) {
    const completedSteps = this.completedStepRegistry.get(executionId);
    
    if (!completedSteps || completedSteps.length === 0) {
      return {
        success: true,
        message: 'No steps to rollback',
        rolledBack: 0,
        skipped: 0,
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
   * Get the retry policy for a given action type.
   * @private
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
   * Check if an error is retryable.
   * @private
   */
  _isRetryable(error) {
    const message = error.message || '';
    const code = error.code || '';
    const combined = `${message} ${code}`;

    return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(combined));
  }

  /**
   * Calculate exponential backoff delay with optional jitter.
   * @private
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
   * Look up the rollback action for an app+action combination.
   * @private
   */
  _getRollbackAction(app, action) {
    const appRollbacks = ROLLBACK_REGISTRY[app?.toLowerCase()];
    if (!appRollbacks) return null;
    return appRollbacks[action?.toLowerCase()] || null;
  }

  /**
   * Build rollback parameters from the original step's result.
   * @private
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
   * Promisified sleep.
   * @private
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up old registry entries to prevent memory leaks.
   * Call periodically or after execution completes.
   */
  cleanup(executionId) {
    this.completedStepRegistry.delete(executionId);
  }
}

export const workflowResilienceService = new WorkflowResilienceService();
