import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const {
  logger
} = vi.hoisted(() => {
  // Mock logger
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    logger
  };
});
vi.mock('../../../../shared/logger.js', () => ({ logger }));

// Mock WorkflowExecution model
const WorkflowExecution = {
  find: vi.fn(),
  updateMany: vi.fn(),
};
vi.mock('../models/workflowExecution.model.js', () => ({ default: WorkflowExecution }));

// Mock workflowExecutor service
const workflowExecutor = {
  executeWorkflow: vi.fn(),
};
vi.mock('./workflowExecutor.service.js', () => ({ default: workflowExecutor }));

// Import the actual QueueManager after mocks are set up
import { default as QueueManagerClass } from './queueManager.service.js';

// We will create a new instance for each test to ensure isolation
let queueManager;

describe('QueueManager', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    vi.useFakeTimers(); // Use fake timers for setTimeout/setInterval

    // Create a fresh instance for each test
    queueManager = new QueueManagerClass();

    // Reset internal state that might persist from previous tests if not careful
    queueManager.queue = [];
    queueManager.runningExecutions = new Map();
    queueManager.processing = false;
    queueManager.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalErrors: 0,
      averageExecutionTime: 0,
    };
  });

  afterEach(() => {
    vi.runOnlyPendingTimers(); // Ensure any pending timers are run
    vi.restoreAllMocks(); // Restore original implementations
    vi.useRealTimers(); // Switch back to real timers
  });

  // Helper for a dummy workflow
  const dummyWorkflow = {
    workflowId: 'wf-123',
    userId: 'user-abc',
    name: 'Test Workflow',
    steps: [],
  };

  const dummyWorkflow2 = {
    workflowId: 'wf-456',
    userId: 'user-def',
    name: 'Another Workflow',
    steps: [],
  };

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(queueManager.queue).toEqual([]);
      expect(queueManager.runningExecutions).toBeInstanceOf(Map);
      expect(queueManager.maxConcurrentExecutions).toBe(5);
      expect(queueManager.processing).toBe(false);
      expect(queueManager.stats).toEqual({
        totalQueued: 0,
        totalProcessed: 0,
        totalErrors: 0,
        averageExecutionTime: 0,
      });
    });
  });

  describe('initialize', () => {
    it('should initialize with default config if none provided', async () => {
      WorkflowExecution.find.mockResolvedValue([]); // No stale executions
      const startQueueProcessorSpy = vi.spyOn(queueManager, 'startQueueProcessor');
      const cleanupStaleExecutionsSpy = vi.spyOn(queueManager, 'cleanupStaleExecutions');

      const result = await queueManager.initialize();

      expect(result.success).toBe(true);
      expect(queueManager.maxConcurrentExecutions).toBe(5);
      expect(startQueueProcessorSpy).toHaveBeenCalledTimes(1);
      expect(cleanupStaleExecutionsSpy).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        'Queue manager initialized with max concurrent executions: 5'
      );
    });

    it('should initialize with provided config', async () => {
      WorkflowExecution.find.mockResolvedValue([]);
      const startQueueProcessorSpy = vi.spyOn(queueManager, 'startQueueProcessor');
      const cleanupStaleExecutionsSpy = vi.spyOn(queueManager, 'cleanupStaleExecutions');

      const result = await queueManager.initialize({ maxConcurrentExecutions: 10 });

      expect(result.success).toBe(true);
      expect(queueManager.maxConcurrentExecutions).toBe(10);
      expect(startQueueProcessorSpy).toHaveBeenCalledTimes(1);
      expect(cleanupStaleExecutionsSpy).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        'Queue manager initialized with max concurrent executions: 10'
      );
    });

    it('should handle errors during initialization', async () => {
      const error = new Error('Init failed');
      vi.spyOn(queueManager, 'cleanupStaleExecutions').mockRejectedValue(error);

      const result = await queueManager.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Init failed');
      expect(logger.error).toHaveBeenCalledWith('Error initializing queue manager:', error);
    });
  });

  describe('queueWorkflow', () => {
    it('should add a workflow to the queue with normal priority', async () => {
      const processQueueSpy = vi.spyOn(queueManager, 'processQueue');
      const insertByPrioritySpy = vi.spyOn(queueManager, 'insertByPriority');

      const result = await queueManager.queueWorkflow(dummyWorkflow);

      expect(result.success).toBe(true);
      expect(result.queueId).toMatch(/^queue_\d+_[a-z0-9]+$/);
      expect(result.queuePosition).toBe(1);
      expect(queueManager.queue.length).toBe(1);
      expect(queueManager.queue[0].workflowId).toBe(dummyWorkflow.workflowId);
      expect(queueManager.queue[0].priority).toBe('normal');
      expect(queueManager.stats.totalQueued).toBe(1);
      expect(logger.info).toHaveBeenCalledWith(
        `Workflow queued: ${dummyWorkflow.workflowId} (Priority: normal, Queue size: 1)`
      );
      expect(insertByPrioritySpy).toHaveBeenCalledTimes(1);
      expect(processQueueSpy).toHaveBeenCalledTimes(1);
    });

    it('should add multiple workflows and maintain priority order', async () => {
      vi.spyOn(queueManager, 'processQueue').mockResolvedValue(undefined); // Prevent immediate processing

      await queueManager.queueWorkflow(dummyWorkflow, 'low');
      await queueManager.queueWorkflow(dummyWorkflow2, 'high');
      const workflow3 = { ...dummyWorkflow, workflowId: 'wf-789' };
      await queueManager.queueWorkflow(workflow3, 'normal');

      expect(queueManager.queue.length).toBe(3);
      expect(queueManager.queue[0].workflowId).toBe(dummyWorkflow2.workflowId); // High
      expect(queueManager.queue[1].workflowId).toBe(workflow3.workflowId); // Normal
      expect(queueManager.queue[2].workflowId).toBe(dummyWorkflow.workflowId); // Low
      expect(queueManager.stats.totalQueued).toBe(3);
    });

    it('should handle errors during queuing', async () => {
      const error = new Error('Queue failed');
      vi.spyOn(queueManager, 'insertByPriority').mockImplementation(() => {
        throw error;
      });

      const result = await queueManager.queueWorkflow(dummyWorkflow);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Queue failed');
      expect(logger.error).toHaveBeenCalledWith('Error queuing workflow:', error);
      expect(queueManager.queue.length).toBe(0);
      expect(queueManager.stats.totalQueued).toBe(0);
    });
  });

  describe('insertByPriority', () => {
    it('should insert high priority items at the beginning', () => {
      queueManager.queue = [
        { priority: 'normal', id: 'n1' },
        { priority: 'low', id: 'l1' },
      ];
      queueManager.insertByPriority({ priority: 'high', id: 'h1' });
      expect(queueManager.queue.map((i) => i.id)).toEqual(['h1', 'n1', 'l1']);
    });

    it('should insert normal priority items after high and before low', () => {
      queueManager.queue = [
        { priority: 'high', id: 'h1' },
        { priority: 'low', id: 'l1' },
      ];
      queueManager.insertByPriority({ priority: 'normal', id: 'n1' });
      expect(queueManager.queue.map((i) => i.id)).toEqual(['h1', 'n1', 'l1']);
    });

    it('should insert low priority items at the end', () => {
      queueManager.queue = [
        { priority: 'high', id: 'h1' },
        { priority: 'normal', id: 'n1' },
      ];
      queueManager.insertByPriority({ priority: 'low', id: 'l1' });
      expect(queueManager.queue.map((i) => i.id)).toEqual(['h1', 'n1', 'l1']);
    });

    it('should handle multiple items of the same priority correctly (FIFO)', () => {
      queueManager.queue = [
        { priority: 'normal', id: 'n1' },
        { priority: 'normal', id: 'n2' },
      ];
      queueManager.insertByPriority({ priority: 'normal', id: 'n3' });
      expect(queueManager.queue.map((i) => i.id)).toEqual(['n1', 'n2', 'n3']);
    });

    it('should handle unknown priority as normal', () => {
      queueManager.queue = [
        { priority: 'high', id: 'h1' },
        { priority: 'low', id: 'l1' },
      ];
      queueManager.insertByPriority({ priority: 'unknown', id: 'u1' });
      expect(queueManager.queue.map((i) => i.id)).toEqual(['h1', 'u1', 'l1']);
    });
  });

  describe('startQueueProcessor', () => {
    it('should start the processor and call processQueue periodically', async () => {
      const processQueueSpy = vi.spyOn(queueManager, 'processQueue');
      queueManager.startQueueProcessor();

      expect(queueManager.processing).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Queue processor started');
      expect(processQueueSpy).not.toHaveBeenCalled(); // Not called immediately

      vi.advanceTimersByTime(1000); // Advance by 1 second
      expect(processQueueSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000); // Advance by another second
      expect(processQueueSpy).toHaveBeenCalledTimes(2);
    });

    it('should not start if already processing', () => {
      const processQueueSpy = vi.spyOn(queueManager, 'processQueue');
      queueManager.processing = true;
      queueManager.startQueueProcessor();

      expect(logger.info).not.toHaveBeenCalledWith('Queue processor started');
      expect(processQueueSpy).not.toHaveBeenCalled();
    });

    it('should stop the interval if processing is set to false', () => {
      const processQueueSpy = vi.spyOn(queueManager, 'processQueue');
      queueManager.startQueueProcessor();
      expect(queueManager.processing).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(processQueueSpy).toHaveBeenCalledTimes(1);

      queueManager.processing = false;
      vi.advanceTimersByTime(1000); // Should not call processQueue again
      expect(processQueueSpy).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe('processQueue', () => {
    beforeEach(() => {
      // Mock executeQueuedWorkflow to prevent actual execution during processQueue tests
      vi.spyOn(queueManager, 'executeQueuedWorkflow').mockResolvedValue(undefined);
    });

    it('should not process if max concurrent executions reached', async () => {
      queueManager.maxConcurrentExecutions = 1;
      queueManager.runningExecutions.set('exec1', {}); // Simulate one running execution
      queueManager.queue.push({ id: 'q1' });

      await queueManager.processQueue();

      expect(queueManager.queue.length).toBe(1); // Item should still be in queue
      expect(queueManager.executeQueuedWorkflow).not.toHaveBeenCalled();
    });

    it('should not process if queue is empty', async () => {
      await queueManager.processQueue();

      expect(queueManager.queue.length).toBe(0);
      expect(queueManager.executeQueuedWorkflow).not.toHaveBeenCalled();
    });

    it('should dequeue an item and call executeQueuedWorkflow', async () => {
      const queueItem = { id: 'q1', workflowId: 'wf-1' };
      queueManager.queue.push(queueItem);

      await queueManager.processQueue();

      expect(queueManager.queue.length).toBe(0); // Item dequeued
      expect(queueManager.executeQueuedWorkflow).toHaveBeenCalledWith(queueItem);
    });

    it('should handle errors during queue processing', async () => {
      const error = new Error('Process error');
      vi.spyOn(queueManager, 'executeQueuedWorkflow').mockRejectedValue(error);
      const queueItem = { id: 'q1', workflowId: 'wf-1' };
      queueManager.queue.push(queueItem);

      await queueManager.processQueue();

      expect(logger.error).toHaveBeenCalledWith('Error processing queue:', error);
      // The item is still dequeued even if execution fails
      expect(queueManager.queue.length).toBe(0);
    });
  });

  describe('executeQueuedWorkflow', () => {
    const mockQueueItem = {
      id: 'queue_1',
      workflowId: 'wf-test',
      userId: 'user-test',
      workflow: dummyWorkflow,
      executionType: 'scheduled',
      triggerSource: 'queue',
      retryCount: 0,
      maxRetries: 3,
      metadata: {},
    };

    beforeEach(() => {
      // Mock processQueue to prevent recursive calls during execution tests
      vi.spyOn(queueManager, 'processQueue').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'handleFailedExecution').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'updateStats').mockImplementation(() => {}); // Mock to prevent side effects on stats
    });

    it('should execute workflow successfully', async () => {
      workflowExecutor.executeWorkflow.mockResolvedValue({ success: true, result: 'done' });

      await queueManager.executeQueuedWorkflow(mockQueueItem);

      expect(logger.info).toHaveBeenCalledWith(`Starting execution from queue: ${mockQueueItem.workflowId}`);
      expect(queueManager.runningExecutions.size).toBe(0); // Should be removed after completion
      expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(
        mockQueueItem.workflow,
        mockQueueItem.executionType,
        mockQueueItem.triggerSource
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Queue execution completed: ${mockQueueItem.workflowId}`)
      );
      expect(queueManager.updateStats).toHaveBeenCalledWith(true, expect.any(Number));
      expect(queueManager.handleFailedExecution).not.toHaveBeenCalled();
      expect(queueManager.processQueue).toHaveBeenCalledTimes(1);
    });

    it('should handle workflow execution failure', async () => {
      workflowExecutor.executeWorkflow.mockResolvedValue({ success: false, error: 'Workflow failed' });

      await queueManager.executeQueuedWorkflow(mockQueueItem);

      expect(queueManager.runningExecutions.size).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        `Queue execution failed: ${mockQueueItem.workflowId} - Workflow failed`
      );
      expect(queueManager.updateStats).toHaveBeenCalledWith(false, expect.any(Number));
      expect(queueManager.handleFailedExecution).toHaveBeenCalledWith(mockQueueItem, 'Workflow failed');
      expect(queueManager.processQueue).toHaveBeenCalledTimes(1);
    });

    it('should handle errors thrown during workflow execution', async () => {
      const error = new Error('Executor crashed');
      workflowExecutor.executeWorkflow.mockRejectedValue(error);

      await queueManager.executeQueuedWorkflow(mockQueueItem);

      expect(queueManager.runningExecutions.size).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        `Error executing queued workflow ${mockQueueItem.workflowId}:`,
        error
      );
      expect(queueManager.updateStats).toHaveBeenCalledWith(false, expect.any(Number));
      expect(queueManager.handleFailedExecution).toHaveBeenCalledWith(mockQueueItem, error.message);
      expect(queueManager.processQueue).toHaveBeenCalledTimes(1);
    });

    it('should add item to runningExecutions before execution and remove after', async () => {
      workflowExecutor.executeWorkflow.mockResolvedValue({ success: true, result: 'done' });

      // Ensure runningExecutions is empty initially
      expect(queueManager.runningExecutions.size).toBe(0);

      // Call executeQueuedWorkflow, but mock the actual execution to check intermediate state
      const originalExecuteWorkflow = workflowExecutor.executeWorkflow;
      workflowExecutor.executeWorkflow.mockImplementation(async () => {
        expect(queueManager.runningExecutions.has(mockQueueItem.id)).toBe(true);
        return originalExecuteWorkflow();
      });

      await queueManager.executeQueuedWorkflow(mockQueueItem);

      expect(queueManager.runningExecutions.size).toBe(0); // Should be removed
    });
  });

  describe('handleFailedExecution', () => {
    let mockQueueItem;

    beforeEach(() => {
      mockQueueItem = {
        id: 'queue_1',
        workflowId: 'wf-test',
        userId: 'user-test',
        workflow: dummyWorkflow,
        executionType: 'scheduled',
        triggerSource: 'queue',
        retryCount: 0,
        maxRetries: 3,
        metadata: {},
      };
      vi.spyOn(queueManager, 'queueWorkflow').mockResolvedValue(undefined); // Prevent re-queuing from calling queueWorkflow
    });

    it('should retry workflow if retryCount is less than maxRetries', async () => {
      await queueManager.handleFailedExecution(mockQueueItem, 'Temporary error');

      expect(mockQueueItem.retryCount).toBe(1);
      expect(mockQueueItem.lastError).toBe('Temporary error');
      expect(mockQueueItem.retryAt).toBeInstanceOf(Date);

      // Expect setTimeout to be called
      expect(vi.getTimerCount()).toBe(1);
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Retry queued'));

      vi.advanceTimersByTime(30000); // Advance by 30 seconds (1st retry delay)

      expect(queueManager.queue.length).toBe(1);
      expect(queueManager.queue[0]).toBe(mockQueueItem); // Item added to front
      expect(logger.info).toHaveBeenCalledWith(
        `Retry queued for workflow ${mockQueueItem.workflowId} (attempt 1/3)`
      );
    });

    it('should increment retryCount and use exponential backoff', async () => {
      mockQueueItem.retryCount = 1; // Already failed once
      await queueManager.handleFailedExecution(mockQueueItem, 'Another error');

      expect(mockQueueItem.retryCount).toBe(2);
      expect(vi.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(2 * 30000); // Advance by 60 seconds (2nd retry delay)

      expect(queueManager.queue.length).toBe(1);
      expect(logger.info).toHaveBeenCalledWith(
        `Retry queued for workflow ${mockQueueItem.workflowId} (attempt 2/3)`
      );
    });

    it('should not retry if maxRetries exceeded', async () => {
      mockQueueItem.retryCount = 3; // Max retries reached
      await queueManager.handleFailedExecution(mockQueueItem, 'Persistent error');

      expect(mockQueueItem.retryCount).toBe(3); // Should not increment further
      expect(vi.getTimerCount()).toBe(0); // No setTimeout should be called
      expect(queueManager.queue.length).toBe(0); // Not re-queued
      expect(logger.error).toHaveBeenCalledWith(
        `Max retries exceeded for workflow ${mockQueueItem.workflowId}`
      );
      expect(queueManager.stats.totalErrors).toBe(1);
    });

    it('should handle errors during retry logic', async () => {
      const error = new Error('Retry logic failed');
      vi.spyOn(queueManager.queue, 'unshift').mockImplementation(() => {
        throw error;
      });

      await queueManager.handleFailedExecution(mockQueueItem, 'Error');
      vi.advanceTimersByTime(30000); // Trigger setTimeout

      expect(logger.error).toHaveBeenCalledWith('Error handling failed execution:', error);
    });
  });

  describe('updateStats', () => {
    it('should update totalProcessed and averageExecutionTime on success', () => {
      queueManager.stats = { totalQueued: 0, totalProcessed: 0, totalErrors: 0, averageExecutionTime: 0 };
      queueManager.updateStats(true, 100);
      expect(queueManager.stats).toEqual({
        totalQueued: 0,
        totalProcessed: 1,
        totalErrors: 0,
        averageExecutionTime: 100,
      });

      queueManager.updateStats(true, 200);
      expect(queueManager.stats).toEqual({
        totalQueued: 0,
        totalProcessed: 2,
        totalErrors: 0,
        averageExecutionTime: 150, // (100 + 200) / 2
      });
    });

    it('should update totalProcessed, totalErrors, and averageExecutionTime on failure', () => {
      queueManager.stats = { totalQueued: 0, totalProcessed: 0, totalErrors: 0, averageExecutionTime: 0 };
      queueManager.updateStats(false, 50);
      expect(queueManager.stats).toEqual({
        totalQueued: 0,
        totalProcessed: 1,
        totalErrors: 1,
        averageExecutionTime: 50,
      });

      queueManager.updateStats(false, 150);
      expect(queueManager.stats).toEqual({
        totalQueued: 0,
        totalProcessed: 2,
        totalErrors: 2,
        averageExecutionTime: 100, // (50 + 150) / 2
      });
    });
  });

  describe('estimateWaitTime', () => {
    it('should return 0 if queue is empty and slots are available', () => {
      queueManager.queue = [];
      queueManager.runningExecutions.clear();
      queueManager.maxConcurrentExecutions = 5;
      queueManager.stats.averageExecutionTime = 10000; // 10 seconds

      expect(queueManager.estimateWaitTime()).toBe(0);
    });

    it('should estimate wait time correctly with available slots', () => {
      queueManager.queue = [{}, {}, {}]; // 3 items
      queueManager.runningExecutions.set('r1', {}); // 1 running
      queueManager.maxConcurrentExecutions = 2; // 1 available slot
      queueManager.stats.averageExecutionTime = 10000; // 10 seconds

      // Math.ceil(queueSize / availableSlots) * avgTime = Math.ceil(3 / 1) * 10000 = 3 * 10000 = 30000
      expect(queueManager.estimateWaitTime()).toBe(30000);

      queueManager.runningExecutions.clear(); // 2 available slots
      // Math.ceil(3 / 2) * 10000 = Math.ceil(1.5) * 10000 = 2 * 10000 = 20000
      expect(queueManager.estimateWaitTime()).toBe(20000);
    });

    it('should estimate wait time correctly with no available slots', () => {
      queueManager.queue = [{}, {}, {}]; // 3 items
      queueManager.runningExecutions.set('r1', {});
      queueManager.runningExecutions.set('r2', {});
      queueManager.maxConcurrentExecutions = 2; // 0 available slots
      queueManager.stats.averageExecutionTime = 10000; // 10 seconds

      // queueSize * avgTime = 3 * 10000 = 30000
      expect(queueManager.estimateWaitTime()).toBe(30000);
    });

    it('should use default average execution time if stats.averageExecutionTime is 0', () => {
      queueManager.queue = [{}];
      queueManager.runningExecutions.clear();
      queueManager.maxConcurrentExecutions = 1;
      queueManager.stats.averageExecutionTime = 0; // Default 30000

      expect(queueManager.estimateWaitTime()).toBe(30000); // 1 * 30000
    });
  });

  describe('getQueueStatus', () => {
    it('should return the correct queue status', async () => {
      await queueManager.queueWorkflow(dummyWorkflow, 'high');
      await queueManager.queueWorkflow(dummyWorkflow2, 'normal');

      // Simulate one running execution
      const runningItem = {
        id: 'running_1',
        workflowId: 'wf-running',
        userId: 'user-running',
        startTime: new Date(),
        status: 'running',
      };
      queueManager.runningExecutions.set(runningItem.id, runningItem);

      queueManager.stats = {
        totalQueued: 2,
        totalProcessed: 1,
        totalErrors: 0,
        averageExecutionTime: 15000,
      };
      queueManager.maxConcurrentExecutions = 5;

      const status = queueManager.getQueueStatus();

      expect(status.queueSize).toBe(2);
      expect(status.runningExecutions).toBe(1);
      expect(status.maxConcurrentExecutions).toBe(5);
      expect(status.stats).toEqual(queueManager.stats);
      expect(status.estimatedWaitTime).toBe(15000); // Math.ceil(2 / (5-1)) * 15000 = 1 * 15000

      expect(status.nextItems.length).toBe(2);
      expect(status.nextItems[0].workflowId).toBe(dummyWorkflow.workflowId);
      expect(status.nextItems[1].workflowId).toBe(dummyWorkflow2.workflowId);
      expect(status.nextItems[0]).toHaveProperty('priority');
      expect(status.nextItems[0]).toHaveProperty('queuedAt');
      expect(status.nextItems[0]).toHaveProperty('retryCount');
    });
  });

  describe('getRunningExecutions', () => {
    it('should return a list of running executions', () => {
      const runningItem1 = {
        id: 'r1',
        workflowId: 'wf-r1',
        userId: 'u1',
        startTime: new Date(),
        status: 'running',
        executionType: 'manual',
      };
      const runningItem2 = {
        id: 'r2',
        workflowId: 'wf-r2',
        userId: 'u2',
        startTime: new Date(),
        status: 'running',
        executionType: 'scheduled',
      };
      queueManager.runningExecutions.set(runningItem1.id, runningItem1);
      queueManager.runningExecutions.set(runningItem2.id, runningItem2);

      const executions = queueManager.getRunningExecutions();

      expect(executions.length).toBe(2);
      expect(executions[0]).toEqual({
        queueId: 'r1',
        workflowId: 'wf-r1',
        userId: 'u1',
        startTime: runningItem1.startTime,
        status: 'running',
        executionType: 'manual',
      });
      expect(executions[1]).toEqual({
        queueId: 'r2',
        workflowId: 'wf-r2',
        userId: 'u2',
        startTime: runningItem2.startTime,
        status: 'running',
        executionType: 'scheduled',
      });
    });

    it('should return an empty array if no executions are running', () => {
      queueManager.runningExecutions.clear();
      expect(queueManager.getRunningExecutions()).toEqual([]);
    });
  });

  describe('cancelQueuedWorkflow', () => {
    let queuedItem1, queuedItem2;

    beforeEach(async () => {
      vi.spyOn(queueManager, 'processQueue').mockResolvedValue(undefined); // Prevent processing
      const result1 = await queueManager.queueWorkflow({ ...dummyWorkflow, userId: 'user-abc' }, 'normal');
      const result2 = await queueManager.queueWorkflow({ ...dummyWorkflow2, userId: 'user-def' }, 'high');
      queuedItem1 = queueManager.queue.find(item => item.id === result1.queueId);
      queuedItem2 = queueManager.queue.find(item => item.id === result2.queueId);
    });

    it('should cancel a queued workflow by ID and userId', async () => {
      expect(queueManager.queue.length).toBe(2);
      const result = await queueManager.cancelQueuedWorkflow(queuedItem1.id, 'user-abc');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Queued workflow cancelled');
      expect(result.workflowId).toBe(dummyWorkflow.workflowId);
      expect(queueManager.queue.length).toBe(1);
      expect(queueManager.queue[0].id).toBe(queuedItem2.id);
      expect(logger.info).toHaveBeenCalledWith(`Cancelled queued workflow: ${dummyWorkflow.workflowId}`);
    });

    it('should return error if queued workflow not found', async () => {
      const result = await queueManager.cancelQueuedWorkflow('non-existent-id', 'user-abc');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Queued workflow not found');
      expect(queueManager.queue.length).toBe(2);
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Cancelled queued workflow'));
    });

    it('should return error if userId does not match', async () => {
      const result = await queueManager.cancelQueuedWorkflow(queuedItem1.id, 'wrong-user');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Queued workflow not found'); // The check includes userId
      expect(queueManager.queue.length).toBe(2);
    });

    it('should handle errors during cancellation', async () => {
      const error = new Error('Cancel error');
      vi.spyOn(queueManager.queue, 'findIndex').mockImplementation(() => {
        throw error;
      });

      const result = await queueManager.cancelQueuedWorkflow(queuedItem1.id, 'user-abc');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cancel error');
      expect(logger.error).toHaveBeenCalledWith('Error cancelling queued workflow:', error);
    });
  });

  describe('cancelRunningExecution', () => {
    let runningItem1, runningItem2;

    beforeEach(() => {
      runningItem1 = {
        id: 'r1',
        workflowId: 'wf-r1',
        userId: 'user-abc',
        startTime: new Date(),
        status: 'running',
      };
      runningItem2 = {
        id: 'r2',
        workflowId: 'wf-r2',
        userId: 'user-def',
        startTime: new Date(),
        status: 'running',
      };
      queueManager.runningExecutions.set(runningItem1.id, runningItem1);
      queueManager.runningExecutions.set(runningItem2.id, runningItem2);
    });

    it('should cancel a running execution by ID and userId', async () => {
      expect(queueManager.runningExecutions.size).toBe(2);
      const result = await queueManager.cancelRunningExecution(runningItem1.id, 'user-abc');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Running execution cancelled');
      expect(result.workflowId).toBe(runningItem1.workflowId);
      expect(queueManager.runningExecutions.size).toBe(1);
      expect(queueManager.runningExecutions.has(runningItem1.id)).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(`Cancelled running execution: ${runningItem1.workflowId}`);
    });

    it('should return error if running execution not found', async () => {
      const result = await queueManager.cancelRunningExecution('non-existent-id', 'user-abc');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Running execution not found');
      expect(queueManager.runningExecutions.size).toBe(2);
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Cancelled running execution'));
    });

    it('should return error if userId does not match', async () => {
      const result = await queueManager.cancelRunningExecution(runningItem1.id, 'wrong-user');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Running execution not found');
      expect(queueManager.runningExecutions.size).toBe(2);
    });

    it('should handle errors during cancellation', async () => {
      const error = new Error('Cancel error');
      vi.spyOn(queueManager.runningExecutions, 'get').mockImplementation(() => {
        throw error;
      });

      const result = await queueManager.cancelRunningExecution(runningItem1.id, 'user-abc');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cancel error');
      expect(logger.error).toHaveBeenCalledWith('Error cancelling running execution:', error);
    });
  });

  describe('clearQueue', () => {
    beforeEach(async () => {
      vi.spyOn(queueManager, 'processQueue').mockResolvedValue(undefined); // Prevent processing
      await queueManager.queueWorkflow({ ...dummyWorkflow, userId: 'user-1' });
      await queueManager.queueWorkflow({ ...dummyWorkflow2, userId: 'user-2' });
      await queueManager.queueWorkflow({ ...dummyWorkflow, workflowId: 'wf-3', userId: 'user-1' });
    });

    it('should clear all items from the queue if no userId is provided', async () => {
      expect(queueManager.queue.length).toBe(3);
      const result = await queueManager.clearQueue();

      expect(result.success).toBe(true);
      expect(result.cleared).toBe(3);
      expect(result.remaining).toBe(0);
      expect(queueManager.queue.length).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('Cleared 3 items from queue');
    });

    it('should clear only items for a specific userId', async () => {
      expect(queueManager.queue.length).toBe(3);
      const result = await queueManager.clearQueue('user-1');

      expect(result.success).toBe(true);
      expect(result.cleared).toBe(2);
      expect(result.remaining).toBe(1);
      expect(queueManager.queue.length).toBe(1);
      expect(queueManager.queue[0].userId).toBe('user-2');
      expect(logger.warn).toHaveBeenCalledWith('Cleared 2 items from queue for user user-1');
    });

    it('should handle errors during clearing the queue', async () => {
      const error = new Error('Clear error');
      vi.spyOn(queueManager.queue, 'filter').mockImplementation(() => {
        throw error;
      });

      const result = await queueManager.clearQueue('user-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Clear error');
      expect(logger.error).toHaveBeenCalledWith('Error clearing queue:', error);
    });
  });

  describe('cleanupStaleExecutions', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000 - 1000); // A bit more than 5 minutes ago

    it('should find and update stale running executions', async () => {
      const staleExecutions = [
        { _id: 'stale1', status: 'running', updatedAt: fiveMinutesAgo },
        { _id: 'stale2', status: 'running', updatedAt: fiveMinutesAgo },
      ];
      WorkflowExecution.find.mockResolvedValue(staleExecutions);
      WorkflowExecution.updateMany.mockResolvedValue({ modifiedCount: 2 });

      await queueManager.cleanupStaleExecutions();

      expect(WorkflowExecution.find).toHaveBeenCalledWith(
        {
          status: 'running',
          updatedAt: { $lt: expect.any(Date) },
        },
        { _id: 1 }
      );
      expect(WorkflowExecution.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['stale1', 'stale2'] } },
        {
          $set: {
            status: 'failed',
            completedAt: expect.any(Date),
            details: {
              error: 'Execution interrupted by system restart',
              cleanupReason: 'stale_execution_cleanup',
            },
          },
        }
      );
      expect(logger.info).toHaveBeenCalledWith('Cleaned up 2 stale executions');
    });

    it('should do nothing if no stale executions are found', async () => {
      WorkflowExecution.find.mockResolvedValue([]);
      WorkflowExecution.updateMany.mockResolvedValue({ modifiedCount: 0 });

      await queueManager.cleanupStaleExecutions();

      expect(WorkflowExecution.find).toHaveBeenCalledTimes(1);
      expect(WorkflowExecution.updateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Cleaned up'));
    });

    it('should handle errors during cleanup', async () => {
      const error = new Error('DB error');
      WorkflowExecution.find.mockRejectedValue(error);

      await queueManager.cleanupStaleExecutions();

      expect(logger.error).toHaveBeenCalledWith('Error cleaning up stale executions:', error);
      expect(WorkflowExecution.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should set processing to false and wait for running executions to complete', async () => {
      queueManager.processing = true;
      queueManager.runningExecutions.set('r1', {});
      queueManager.runningExecutions.set('r2', {});

      const stopPromise = queueManager.stop();

      expect(queueManager.processing).toBe(false);

      // Simulate executions finishing
      vi.advanceTimersByTime(1000); // Wait 1 second
      queueManager.runningExecutions.delete('r1');
      vi.advanceTimersByTime(1000); // Wait another second
      queueManager.runningExecutions.delete('r2');

      await stopPromise; // Await the stop method to complete its loop

      expect(logger.info).toHaveBeenCalledWith('Queue manager stopped');
      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('Force stopping'));
    });

    it('should force stop if executions do not complete within timeout', async () => {
      queueManager.processing = true;
      queueManager.runningExecutions.set('r1', {});
      queueManager.runningExecutions.set('r2', {});

      const stopPromise = queueManager.stop();

      expect(queueManager.processing).toBe(false);

      vi.advanceTimersByTime(30000); // Advance past the 30-second timeout

      await stopPromise;

      expect(logger.warn).toHaveBeenCalledWith(
        `Force stopping with 2 executions still running`
      );
      expect(logger.info).toHaveBeenCalledWith('Queue manager stopped');
    });

    it('should handle errors during stopping', async () => {
      const error = new Error('Stop error');
      // Mock the getter for runningExecutions to throw an error
      vi.spyOn(queueManager, 'runningExecutions', 'get').mockImplementation(() => {
        throw error;
      });

      const result = await queueManager.stop();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Stop error');
      expect(logger.error).toHaveBeenCalledWith('Error stopping queue manager:', error);
    });
  });

  describe('healthCheck', () => {
    it('should return the current health status', () => {
      queueManager.processing = true;
      queueManager.queue = [{}, {}];
      queueManager.runningExecutions.set('r1', {});
      queueManager.stats = {
        totalQueued: 10,
        totalProcessed: 5,
        totalErrors: 1,
        averageExecutionTime: 1000,
      };

      const health = queueManager.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.queueSize).toBe(2);
      expect(health.runningExecutions).toBe(1);
      expect(health.stats).toEqual(queueManager.stats);
      expect(health.timestamp).toBeDefined();
      expect(typeof health.timestamp).toBe('string');
    });
  });
});