import { logger } from '../../../../shared/logger.js';
import WorkflowExecution from '../models/workflowExecution.model.js';
import workflowExecutor from './workflowExecutor.service.js';

/**
 * Queue Management Service - Handles workflow execution queuing and concurrency
 */
class QueueManager {
  constructor() {
    this.queue = [];
    this.runningExecutions = new Map();
    this.maxConcurrentExecutions = 5; // Configurable
    this.processing = false;
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalErrors: 0,
      averageExecutionTime: 0,
    };
  }

  /**
   * Initialize queue manager
   */
  async initialize(config = {}) {
    try {
      this.maxConcurrentExecutions = config.maxConcurrentExecutions || 5;

      // Start queue processor
      this.startQueueProcessor();

      // Clean up any stale executions on startup
      await this.cleanupStaleExecutions();

      logger.info(
        `Queue manager initialized with max concurrent executions: ${this.maxConcurrentExecutions}`
      );

      return {
        success: true,
        message: 'Queue manager initialized',
      };
    } catch (error) {
      logger.error('Error initializing queue manager:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Add workflow to execution queue
   */
  async queueWorkflow(workflow, priority = 'normal', metadata = {}) {
    try {
      const queueItem = {
        id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workflowId: workflow.workflowId,
        userId: workflow.userId,
        workflow: workflow,
        priority: priority, // high, normal, low
        queuedAt: new Date(),
        executionType: metadata.executionType || 'scheduled',
        triggerSource: metadata.triggerSource || 'queue',
        retryCount: 0,
        maxRetries: metadata.maxRetries || 3,
        metadata: metadata,
      };

      // Insert based on priority
      this.insertByPriority(queueItem);
      this.stats.totalQueued++;

      logger.info(
        `Workflow queued: ${workflow.workflowId} (Priority: ${priority}, Queue size: ${this.queue.length})`
      );

      // Trigger queue processing
      this.processQueue();

      return {
        success: true,
        queueId: queueItem.id,
        queuePosition:
          this.queue.findIndex((item) => item.id === queueItem.id) + 1,
        estimatedWaitTime: this.estimateWaitTime(),
      };
    } catch (error) {
      logger.error('Error queuing workflow:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Insert item into queue based on priority
   */
  insertByPriority(queueItem) {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const itemPriority = priorityOrder[queueItem.priority] || 1;

    let insertIndex = this.queue.length;

    for (let i = 0; i < this.queue.length; i++) {
      const existingPriority = priorityOrder[this.queue[i].priority] || 1;
      if (itemPriority < existingPriority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, queueItem);
  }

  /**
   * Start queue processor
   */
  startQueueProcessor() {
    if (this.processing) return;

    this.processing = true;

    const processInterval = setInterval(async () => {
      if (!this.processing) {
        clearInterval(processInterval);
        return;
      }

      await this.processQueue();
    }, 1000); // Check every second

    logger.info('Queue processor started');
  }

  /**
   * Process queued workflows
   */
  async processQueue() {
    try {
      // Check if we can process more workflows
      if (this.runningExecutions.size >= this.maxConcurrentExecutions) {
        return;
      }

      // Get next item from queue
      const queueItem = this.queue.shift();
      if (!queueItem) {
        return;
      }

      // Start execution
      await this.executeQueuedWorkflow(queueItem);
    } catch (error) {
      logger.error('Error processing queue:', error);
    }
  }

  /**
   * Execute queued workflow
   */
  async executeQueuedWorkflow(queueItem) {
    const startTime = Date.now();

    try {
      logger.info(`Starting execution from queue: ${queueItem.workflowId}`);

      // Add to running executions
      this.runningExecutions.set(queueItem.id, {
        ...queueItem,
        startTime: new Date(),
        status: 'running',
      });

      // Execute workflow
      const result = await workflowExecutor.executeWorkflow(
        queueItem.workflow,
        queueItem.executionType,
        queueItem.triggerSource
      );

      // Remove from running executions
      this.runningExecutions.delete(queueItem.id);

      // Update stats
      const executionTime = Date.now() - startTime;
      this.updateStats(result.success, executionTime);

      if (result.success) {
        logger.info(
          `Queue execution completed: ${queueItem.workflowId} (${executionTime}ms)`
        );
      } else {
        logger.error(
          `Queue execution failed: ${queueItem.workflowId} - ${result.error}`
        );

        // Retry if configured
        await this.handleFailedExecution(queueItem, result.error);
      }

      // Continue processing queue
      this.processQueue();
    } catch (error) {
      logger.error(
        `Error executing queued workflow ${queueItem.workflowId}:`,
        error
      );

      // Remove from running executions
      this.runningExecutions.delete(queueItem.id);

      // Update stats
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      // Handle retry
      await this.handleFailedExecution(queueItem, error.message);

      // Continue processing
      this.processQueue();
    }
  }

  /**
   * Handle failed execution with retry logic
   */
  async handleFailedExecution(queueItem, error) {
    try {
      if (queueItem.retryCount < queueItem.maxRetries) {
        queueItem.retryCount++;
        queueItem.lastError = error;
        queueItem.retryAt = new Date(Date.now() + queueItem.retryCount * 30000); // Exponential backoff

        // Re-queue with delay
        setTimeout(() => {
          this.queue.unshift(queueItem); // Add to front for retry
          logger.info(
            `Retry queued for workflow ${queueItem.workflowId} (attempt ${queueItem.retryCount}/${queueItem.maxRetries})`
          );
        }, queueItem.retryCount * 30000);
      } else {
        logger.error(
          `Max retries exceeded for workflow ${queueItem.workflowId}`
        );
        this.stats.totalErrors++;
      }
    } catch (retryError) {
      logger.error('Error handling failed execution:', retryError);
    }
  }

  /**
   * Update execution statistics
   */
  updateStats(success, executionTime) {
    this.stats.totalProcessed++;

    if (!success) {
      this.stats.totalErrors++;
    }

    // Update average execution time
    this.stats.averageExecutionTime =
      (this.stats.averageExecutionTime * (this.stats.totalProcessed - 1) +
        executionTime) /
      this.stats.totalProcessed;
  }

  /**
   * Estimate wait time for next execution
   */
  estimateWaitTime() {
    const avgTime = this.stats.averageExecutionTime || 30000; // Default 30 seconds
    const queueSize = this.queue.length;
    const runningCount = this.runningExecutions.size;
    const availableSlots = Math.max(
      0,
      this.maxConcurrentExecutions - runningCount
    );

    if (availableSlots > 0) {
      return Math.ceil(queueSize / availableSlots) * avgTime;
    }

    return queueSize * avgTime;
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      queueSize: this.queue.length,
      runningExecutions: this.runningExecutions.size,
      maxConcurrentExecutions: this.maxConcurrentExecutions,
      stats: this.stats,
      estimatedWaitTime: this.estimateWaitTime(),
      nextItems: this.queue.slice(0, 5).map((item) => ({
        workflowId: item.workflowId,
        priority: item.priority,
        queuedAt: item.queuedAt,
        retryCount: item.retryCount,
      })),
    };
  }

  /**
   * Get running executions
   */
  getRunningExecutions() {
    return Array.from(this.runningExecutions.values()).map((execution) => ({
      queueId: execution.id,
      workflowId: execution.workflowId,
      userId: execution.userId,
      startTime: execution.startTime,
      status: execution.status,
      executionType: execution.executionType,
    }));
  }

  /**
   * Cancel queued workflow
   */
  async cancelQueuedWorkflow(queueId, userId) {
    try {
      const queueIndex = this.queue.findIndex(
        (item) => item.id === queueId && item.userId === userId
      );

      if (queueIndex === -1) {
        return {
          success: false,
          error: 'Queued workflow not found',
        };
      }

      const cancelledItem = this.queue.splice(queueIndex, 1)[0];

      logger.info(`Cancelled queued workflow: ${cancelledItem.workflowId}`);

      return {
        success: true,
        message: 'Queued workflow cancelled',
        workflowId: cancelledItem.workflowId,
      };
    } catch (error) {
      logger.error('Error cancelling queued workflow:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Cancel running execution
   */
  async cancelRunningExecution(queueId, userId) {
    try {
      const runningExecution = this.runningExecutions.get(queueId);

      if (!runningExecution || runningExecution.userId !== userId) {
        return {
          success: false,
          error: 'Running execution not found',
        };
      }

      // Note: This is a simplified cancellation
      // In production, you'd need more sophisticated cancellation logic
      this.runningExecutions.delete(queueId);

      logger.info(
        `Cancelled running execution: ${runningExecution.workflowId}`
      );

      return {
        success: true,
        message: 'Running execution cancelled',
        workflowId: runningExecution.workflowId,
      };
    } catch (error) {
      logger.error('Error cancelling running execution:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Clear queue (emergency function)
   */
  async clearQueue(userId = null) {
    try {
      const beforeCount = this.queue.length;

      if (userId) {
        // Clear only specific user's workflows
        this.queue = this.queue.filter((item) => item.userId !== userId);
      } else {
        // Clear all
        this.queue = [];
      }

      const clearedCount = beforeCount - this.queue.length;

      logger.warn(
        `Cleared ${clearedCount} items from queue${userId ? ` for user ${userId}` : ''}`
      );

      return {
        success: true,
        cleared: clearedCount,
        remaining: this.queue.length,
      };
    } catch (error) {
      logger.error('Error clearing queue:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Clean up stale executions on startup
   */
  async cleanupStaleExecutions() {
    try {
      // Find executions that were running but app was restarted
      const staleExecutions = await WorkflowExecution.find({
        status: 'running',
        updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }, // 5 minutes old
      });

      for (const execution of staleExecutions) {
        await execution.completeExecution(false, {
          error: 'Execution interrupted by system restart',
          cleanupReason: 'stale_execution_cleanup',
        });
      }

      if (staleExecutions.length > 0) {
        logger.info(`Cleaned up ${staleExecutions.length} stale executions`);
      }
    } catch (error) {
      logger.error('Error cleaning up stale executions:', error);
    }
  }

  /**
   * Stop queue manager
   */
  async stop() {
    try {
      this.processing = false;

      // Wait for running executions to complete (with timeout)
      const timeout = 30000; // 30 seconds
      const startTime = Date.now();

      while (
        this.runningExecutions.size > 0 &&
        Date.now() - startTime < timeout
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (this.runningExecutions.size > 0) {
        logger.warn(
          `Force stopping with ${this.runningExecutions.size} executions still running`
        );
      }

      logger.info('Queue manager stopped');

      return {
        success: true,
        message: 'Queue manager stopped',
      };
    } catch (error) {
      logger.error('Error stopping queue manager:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      healthy: this.processing,
      queueSize: this.queue.length,
      runningExecutions: this.runningExecutions.size,
      stats: this.stats,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const queueManager = new QueueManager();
export default queueManager;
