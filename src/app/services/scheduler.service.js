import { logger } from '../../shared/logger.js';

/**
 * Scheduler Service — node-cron powered trigger scheduler.
 * ISC License (MIT-equivalent).
 *
 * Manages cron-based triggers:
 * - Loads active cron triggers on startup
 * - Dynamically adds/removes cron jobs
 * - Fires triggers via queue service
 */

let cron;
let cronParser;
const cronJobs = new Map(); // triggerId → cron task

async function initDeps() {
  if (!cron) {
    try {
      const nodeCron = await import('node-cron');
      cron = nodeCron.default || nodeCron;
    } catch (err) {
      logger.warn(`[SchedulerService] node-cron not available: ${err.message}`);
    }
  }
  if (!cronParser) {
    try {
      const parser = await import('cron-parser');
      cronParser = parser.CronExpressionParser || parser.default;
    } catch (err) {
      logger.warn(`[SchedulerService] cron-parser not available: ${err.message}`);
    }
  }
}

export const SchedulerService = {
  /**
   * Validate a cron expression.
   * Returns { valid, nextRun, error }.
   */
  async validateCron(expression) {
    await initDeps();

    if (cronParser) {
      try {
        const interval = cronParser.parse(expression);
        return {
          valid: true,
          nextRun: interval.next().toISOString(),
          nextFiveRuns: Array.from({ length: 5 }, () => interval.next().toISOString()),
        };
      } catch (err) {
        return { valid: false, error: err.message };
      }
    }

    // Fallback: basic regex validation
    const cronRegex = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;
    const valid = cronRegex.test(expression.trim());
    return { valid, error: valid ? null : 'Invalid cron expression format' };
  },

  /**
   * Get next N run times for a cron expression.
   */
  async getNextRuns(expression, count = 5) {
    await initDeps();

    if (!cronParser) return [];

    try {
      const interval = cronParser.parse(expression);
      return Array.from({ length: count }, () => interval.next().toISOString());
    } catch {
      return [];
    }
  },

  /**
   * Schedule a cron trigger.
   */
  async scheduleTrigger(triggerId, cronExpression, callback) {
    await initDeps();

    if (!cron) {
      logger.warn(`[SchedulerService] Cannot schedule trigger ${triggerId}: node-cron unavailable`);
      return false;
    }

    // Remove existing job if any
    this.unscheduleTrigger(triggerId);

    try {
      const task = cron.schedule(cronExpression, async () => {
        logger.info(`[SchedulerService] Cron fired for trigger ${triggerId}`);
        try {
          await callback(triggerId);
        } catch (err) {
          logger.error(`[SchedulerService] Cron callback error for ${triggerId}: ${err.message}`);
        }
      }, {
        scheduled: true,
        timezone: process.env.TZ || 'UTC',
      });

      cronJobs.set(triggerId, task);
      logger.info(`[SchedulerService] Trigger ${triggerId} scheduled: ${cronExpression}`);
      return true;
    } catch (err) {
      logger.error(`[SchedulerService] Failed to schedule ${triggerId}: ${err.message}`);
      return false;
    }
  },

  /**
   * Unschedule a cron trigger.
   */
  unscheduleTrigger(triggerId) {
    const task = cronJobs.get(triggerId);
    if (task) {
      task.stop();
      cronJobs.delete(triggerId);
      logger.info(`[SchedulerService] Trigger ${triggerId} unscheduled`);
      return true;
    }
    return false;
  },

  /**
   * Load and schedule all active cron triggers from the database.
   * Call this on server startup.
   */
  async loadActiveTriggers() {
    await initDeps();

    try {
      // Dynamic import to avoid circular dependency
      const { default: Trigger } = await import('../modules/triggers/triggers.model.js');
      const triggers = await Trigger.find({ type: 'cron', status: 'active' }).lean();

      let scheduled = 0;
      for (const trigger of triggers) {
        if (trigger.cronExpression) {
          const success = await this.scheduleTrigger(
            trigger._id.toString(),
            trigger.cronExpression,
            async (triggerId) => {
              // Dynamic import to avoid circular dependency
              const { TriggerService } = await import('../modules/triggers/triggers.service.js');
              await TriggerService.fireTrigger(triggerId, {
                source: 'cron',
                scheduledAt: new Date().toISOString(),
              });
            }
          );
          if (success) scheduled++;
        }
      }

      logger.info(`[SchedulerService] Loaded ${scheduled}/${triggers.length} cron triggers`);
      return { total: triggers.length, scheduled };
    } catch (err) {
      logger.error(`[SchedulerService] Failed to load triggers: ${err.message}`);
      return { total: 0, scheduled: 0 };
    }
  },

  /**
   * Get status of all scheduled cron jobs.
   */
  getScheduledJobs() {
    return Array.from(cronJobs.entries()).map(([triggerId]) => ({
      triggerId,
      active: true,
    }));
  },

  /**
   * Stop all cron jobs (for graceful shutdown).
   */
  stopAll() {
    for (const [triggerId, task] of cronJobs) {
      task.stop();
      logger.info(`[SchedulerService] Stopped trigger ${triggerId}`);
    }
    cronJobs.clear();
    logger.info(`[SchedulerService] All cron jobs stopped`);
  },
};

export default SchedulerService;
