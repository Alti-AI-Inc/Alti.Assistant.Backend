import { logger } from '../../../../shared/logger.js';
import WorkflowExecution from '../models/workflowExecution.model.js';
import workflowExecutor from './workflowExecutor.service.js';
// --- IMPROVEMENT: Import models required for manager-level features ---
// These models are assumed to exist and are necessary for enforcing plan limits
// and providing workspace-specific metrics for the manager dashboard.
import User from '../../auth/auth.model.js'; // FIX: Point to correct auth model location.
import Workspace from '../../workspace/workspace.model.js'; // FIX: Point to correct workspace model location.

/**
 * Queue Management Service - Handles workflow execution queuing and concurrency
 */
class QueueManager {
  constructor() {
    this.queue = [];
    this.runningExecutions = new Map();
    this.maxConcurrentExecutions = 10; // Global system limit, configurable
    this.processing = false;

    // --- IMPROVEMENT: Workspace-specific metrics and tracking ---
    // Replaced a single global stats object with per-workspace tracking to support
    // manager dashboards. Each manager can now view metrics for their own workspace.
    this.workspaceStats = new Map(); // Key: workspaceId, Value: stats object
    this.workspaceRunningCount = new Map(); // Key: workspaceId, Value: count of running executions
  }

  /**
   * Initialize queue manager
   */
  async initialize(config = {}) {
    try {
      this.maxConcurrentExecutions = config.maxConcurrentExecutions || 10;

      this.startQueueProcessor();
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
   * Add workflow to execution queue, enforcing workspace plan limits.
   * This is a critical control point for manager-led workspaces.
   */
  async queueWorkflow(workflow, priority = 'normal', metadata = {}) {
    try {
      // --- ENHANCEMENT: Enforce Manager Plan Limits ---
      // Before queuing, verify that the workspace has not exceeded its plan limits.
      // This prevents overuse and ensures fair resource allocation.
      const user = await User.findById(workflow.userId).populate({
        path: 'workspace',
        select: 'plan monthlyExecutionCount', // Select only necessary fields
      });

      if (!user || !user.workspace) {
        logger.warn(`User or workspace not found for userId: ${workflow.userId}`);
        return { success: false, error: 'User or workspace not found.' };
      }

      const workspace = user.workspace;
      const planLimits = workspace.plan?.limits || {
        concurrentExecutions: 1,
        monthlyExecutions: 100,
      }; // Default to a basic plan if none is set

      // 1. Check concurrent execution limit for the workspace
      const currentWorkspaceConcurrent =
        this.workspaceRunningCount.get(workspace.id.toString()) || 0;
      if (currentWorkspaceConcurrent >= planLimits.concurrentExecutions) {
        return {
          success: false,
          error: `Concurrent execution limit of ${planLimits.concurrentExecutions} reached for your workspace. Please upgrade your plan or wait for other executions to complete.`,
          errorCode: 'CONCURRENCY_LIMIT_EXCEEDED',
        };
      }

      // 2. Check monthly execution limit
      // OPTIMIZATION: For high-throughput systems, this check should use a cached counter (e.g., Redis)
      // instead of a direct DB query on every queue request.
      if (workspace.monthlyExecutionCount >= planLimits.monthlyExecutions) {
        return {
          success: false,
          error: `Monthly execution limit of ${planLimits.monthlyExecutions} reached for your workspace. Please upgrade your plan.`,
          errorCode: 'MONTHLY_LIMIT_EXCEEDED',
        };
      }

      const MAX_ALLOWED_RETRIES = 10;
      let maxRetries =
        metadata.maxRetries !== undefined ? parseInt(metadata.maxRetries, 10) : 3;
      if (isNaN(maxRetries) || maxRetries < 0) maxRetries = 3;
      maxRetries = Math.min(maxRetries, MAX_ALLOWED_RETRIES);

      const queueItem = {
        id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workflowId: workflow.workflowId,
        userId: workflow.userId,
        workspaceId: workspace.id.toString(), // Store workspaceId for metrics and tracking
        workflow: workflow,
        priority: priority,
        queuedAt: new Date(),
        executionType: metadata.executionType || 'scheduled',
        triggerSource: metadata.triggerSource || 'queue',
        retryCount: 0,
        maxRetries: maxRetries,
        metadata: metadata,
      };

      this.insertByPriority(queueItem);
      this.getWorkspaceStats(queueItem.workspaceId).totalQueued++;

      logger.info(
        `Workflow queued: ${workflow.workflowId} for workspace ${queueItem.workspaceId} (Priority: ${priority}, Queue size: ${this.queue.length})`
      );

      this.processQueue();

      return {
        success: true,
        queueId: queueItem.id,
        queuePosition:
          this.queue.findIndex((item) => item.id === queueItem.id) + 1,
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
    let i = 0;
    for (; i < this.queue.length; i++) {
      const existingPriority = priorityOrder[this.queue[i].priority] || 1;
      if (itemPriority < existingPriority) break;
    }
    this.queue.splice(i, 0, queueItem);
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
    if (this.runningExecutions.size >= this.maxConcurrentExecutions) return;
    const queueItem = this.queue.shift();
    if (!queueItem) return;
    await this.executeQueuedWorkflow(queueItem);
  }

  /**
   * Execute queued workflow
   */
  async executeQueuedWorkflow(queueItem) {
    const startTime = Date.now();
    const { workspaceId, workflowId, id } = queueItem;

    try {
      logger.info(`Starting execution from queue: ${workflowId} for workspace ${workspaceId}`);

      // --- METRICS: Track running executions per workspace ---
      this.workspaceRunningCount.set(
        workspaceId,
        (this.workspaceRunningCount.get(workspaceId) || 0) + 1
      );
      this.runningExecutions.set(id, {
        ...queueItem,
        startTime: new Date(),
        status: 'running',
      });

      const result = await workflowExecutor.executeWorkflow(
        queueItem.workflow,
        queueItem.executionType,
        queueItem.triggerSource
      );

      const executionTime = Date.now() - startTime;
      this.updateStats(result.success, executionTime, workspaceId);

      if (result.success) {
        logger.info(
          `Queue execution completed: ${workflowId} (${executionTime}ms)`
        );
      } else {
        logger.error(`Queue execution failed: ${workflowId} - ${result.error}`);
        await this.handleFailedExecution(queueItem, result.error);
      }
    } catch (error) {
      logger.error(`Error executing queued workflow ${workflowId}:`, error);
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime, workspaceId);
      await this.handleFailedExecution(queueItem, error.message);
    } finally {
      // --- METRICS: Ensure workspace running count is always decremented ---
      this.workspaceRunningCount.set(
        workspaceId,
        Math.max(0, (this.workspaceRunningCount.get(workspaceId) || 1) - 1)
      );
      this.runningExecutions.delete(id);
      // Asynchronously trigger next item processing to not block the finally block
      process.nextTick(() => this.processQueue());
    }
  }

  /**
   * Handle failed execution with retry logic
   */
  async handleFailedExecution(queueItem, error) {
    if (queueItem.retryCount < queueItem.maxRetries) {
      queueItem.retryCount++;
      const delay = Math.pow(2, queueItem.retryCount) * 1000; // Exponential backoff
      setTimeout(() => {
        this.insertByPriority(queueItem); // Re-queue respecting priority
        logger.info(
          `Retry queued for workflow ${queueItem.workflowId} (attempt ${queueItem.retryCount}/${queueItem.maxRetries})`
        );
      }, delay);
    } else {
      logger.error(`Max retries exceeded for workflow ${queueItem.workflowId}`);
      this.getWorkspaceStats(queueItem.workspaceId).totalErrors++;
    }
  }

  /**
   * Update execution statistics for a specific workspace
   */
  updateStats(success, executionTime, workspaceId) {
    const stats = this.getWorkspaceStats(workspaceId);
    stats.totalProcessed++;
    if (!success) {
      stats.totalErrors++;
    }
    stats.averageExecutionTime =
      (stats.averageExecutionTime * (stats.totalProcessed - 1) +
        executionTime) /
      stats.totalProcessed;
  }

  /**
   * Get or initialize a stats object for a workspace.
   * Centralizes stat object creation for the manager dashboard.
   */
  getWorkspaceStats(workspaceId) {
    if (!this.workspaceStats.has(workspaceId)) {
      this.workspaceStats.set(workspaceId, {
        totalQueued: 0,
        totalProcessed: 0,
        totalErrors: 0,
        averageExecutionTime: 0,
      });
    }
    return this.workspaceStats.get(workspaceId);
  }

  /**
   * Get status for a specific workspace, for use in Manager Dashboards.
   */
  async getWorkspaceStatus(workspaceId) {
    const workspace = await Workspace.findById(workspaceId).select('plan');
    return {
      workspaceId: workspaceId,
      plan: workspace?.plan,
      stats: this.getWorkspaceStats(workspaceId),
      queuedCount: this.queue.filter((item) => item.workspaceId === workspaceId)
        .length,
      runningCount: this.workspaceRunningCount.get(workspaceId) || 0,
    };
  }

  /**
   * Get overall system status for admin purposes.
   */
  getSystemStatus() {
    const aggregatedStats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalErrors: 0,
      totalAvgExecutionTime: 0,
    };
    let totalTime = 0;
    let totalProcessedCount = 0;

    for (const stats of this.workspaceStats.values()) {
      aggregatedStats.totalQueued += stats.totalQueued;
      aggregatedStats.totalProcessed += stats.totalProcessed;
      aggregatedStats.totalErrors += stats.totalErrors;
      totalTime += stats.averageExecutionTime * stats.totalProcessed;
      totalProcessedCount += stats.totalProcessed;
    }

    aggregatedStats.totalAvgExecutionTime =
      totalProcessedCount > 0 ? totalTime / totalProcessedCount : 0;

    return {
      queueSize: this.queue.length,
      runningExecutions: this.runningExecutions.size,
      maxConcurrentExecutions: this.maxConcurrentExecutions,
      activeWorkspaces: this.workspaceStats.size,
      stats: aggregatedStats,
    };
  }

  /**
   * Get running executions, now including workspaceId for better filtering.
   */
  getRunningExecutions() {
    return Array.from(this.runningExecutions.values()).map((exec) => ({
      queueId: exec.id,
      workflowId: exec.workflowId,
      userId: exec.userId,
      workspaceId: exec.workspaceId, // Added for manager visibility
      startTime: exec.startTime,
      status: exec.status,
      executionType: exec.executionType,
    }));
  }

  /**
   * Cancel queued workflow
   */
  async cancelQueuedWorkflow(queueId, userId) {
    const queueIndex = this.queue.findIndex(
      (item) => item.id === queueId && item.userId === userId
    );
    if (queueIndex === -1) {
      return { success: false, error: 'Queued workflow not found' };
    }
    const [cancelledItem] = this.queue.splice(queueIndex, 1);
    logger.info(`Cancelled queued workflow: ${cancelledItem.workflowId}`);
    return {
      success: true,
      message: 'Queued workflow cancelled',
      workflowId: cancelledItem.workflowId,
    };
  }

  /**
   * Clean up stale executions on startup
   */
  async cleanupStaleExecutions() {
    try {
      // Recommendation: Ensure an index exists on { status: 1, updatedAt: 1 }
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const { modifiedCount } = await WorkflowExecution.updateMany(
        { status: 'running', updatedAt: { $lt: fiveMinutesAgo } },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            'details.error': 'Execution interrupted by system restart',
          },
        }
      );
      if (modifiedCount > 0) {
        logger.info(`Cleaned up ${modifiedCount} stale executions`);
      }
    } catch (error) {
      logger.error('Error cleaning up stale executions:', error);
    }
  }

  /**
   * Stop queue manager gracefully
   */
  async stop() {
    this.processing = false;
    const timeout = 30000;
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
    return { success: true, message: 'Queue manager stopped' };
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      healthy: this.processing,
      queueSize: this.queue.length,
      runningExecutions: this.runningExecutions.size,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const queueManager = new QueueManager();
export default queueManager;