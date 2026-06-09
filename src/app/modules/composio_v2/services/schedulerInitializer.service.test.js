import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { schedulerInitializer, SchedulerInitializer } from './schedulerInitializer.service.js';

// Mock external dependencies
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../models/scheduledWorkflow.model.js', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('./cronManager.service.js', () => ({
  cronManager: {
    initialize: vi.fn(),
    scheduleWorkflow: vi.fn(),
    scheduleOneTimeWorkflow: vi.fn(),
    stopScheduling: vi.fn(),
    gracefulShutdown: vi.fn(),
    stopAllJobs: vi.fn(),
    getStatus: vi.fn(),
    getActiveJobsCount: vi.fn(),
    healthCheck: vi.fn(),
  },
}));

vi.mock('./workflowExecutor.service.js', () => ({
  default: {
    executeWorkflow: vi.fn(),
  },
}));

// Import mocked dependencies
import { logger } from '../../../../shared/logger.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { cronManager } from './cronManager.service.js';
import workflowExecutor from './workflowExecutor.service.js';

describe('SchedulerInitializer', () => {
  let instance;
  let processOnSpy;
  let processExitSpy;
  let processUptimeSpy;
  let processMemoryUsageSpy;

  beforeEach(() => {
    // Reset the singleton instance for each test
    instance = new SchedulerInitializer();
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Mock process methods
    processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, handler) => {
      // Store handlers to be called manually in tests
      if (!instance._processHandlers) {
        instance._processHandlers = {};
      }
      instance._processHandlers[event] = handler;
    });
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    processUptimeSpy = vi.spyOn(process, 'uptime').mockReturnValue(12345);
    processMemoryUsageSpy = vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 100,
      heapTotal: 200,
      heapUsed: 150,
      external: 50,
      arrayBuffers: 10,
    });

    // Default mock implementations for cronManager
    cronManager.initialize.mockResolvedValue(undefined);
    cronManager.scheduleWorkflow.mockResolvedValue({ success: true });
    cronManager.scheduleOneTimeWorkflow.mockResolvedValue({ success: true });
    cronManager.stopScheduling.mockResolvedValue(undefined);
    cronManager.gracefulShutdown.mockResolvedValue(undefined);
    cronManager.stopAllJobs.mockResolvedValue(undefined);
    cronManager.getActiveJobsCount.mockReturnValue(0);
    cronManager.getStatus.mockReturnValue({ status: 'running' });
    cronManager.healthCheck.mockResolvedValue({ healthy: true });

    // Default mock implementations for ScheduledWorkflow
    ScheduledWorkflow.find.mockResolvedValue([]);
    ScheduledWorkflow.findOne.mockResolvedValue(null);

    // Default mock implementations for workflowExecutor
    workflowExecutor.executeWorkflow.mockResolvedValue({ status: 'completed' });
  });

  afterEach(() => {
    // Restore original process methods
    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
    processUptimeSpy.mockRestore();
    processMemoryUsageSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(instance.initialized).toBe(false);
      expect(instance.gracefulShutdownHandlers).toEqual([]);
    });
  });

  describe('initialize', () => {
    it('should successfully initialize the scheduler', async () => {
      cronManager.getActiveJobsCount.mockReturnValue(2);

      const result = await instance.initialize();

      expect(logger.info).toHaveBeenCalledWith('Initializing workflow scheduler...');
      expect(cronManager.initialize).toHaveBeenCalledTimes(1);
      expect(instance.initialized).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Workflow scheduler initialized successfully');
      expect(result).toEqual({
        success: true,
        message: 'Scheduler initialized',
        scheduledWorkflows: 2,
      });
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGQUIT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('should handle errors during initialization', async () => {
      const initError = new Error('Failed to init cron manager');
      cronManager.initialize.mockRejectedValue(initError);

      const result = await instance.initialize();

      expect(logger.info).toHaveBeenCalledWith('Initializing workflow scheduler...');
      expect(cronManager.initialize).toHaveBeenCalledTimes(1);
      expect(instance.initialized).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Error initializing scheduler:', initError);
      expect(result).toEqual({
        success: false,
        error: initError.message,
      });
    });
  });

  describe('loadActiveWorkflows', () => {
    const mockDate = new Date('2023-01-01T10:00:00Z');
    const futureDate = new Date('2023-01-01T11:00:00Z');
    const pastDate = new Date('2023-01-01T09:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should load and schedule active workflows with cron expressions and one-time runs', async () => {
      const mockWorkflows = [
        {
          workflowId: 'wf1',
          name: 'Workflow 1',
          cronExpression: '0 0 * * *',
          userId: 'user1',
          timezone: 'America/New_York',
          isActive: true,
          nextRun: futureDate,
        },
        {
          workflowId: 'wf2',
          name: 'Workflow 2',
          oneTimeRun: true,
          oneTimeDate: futureDate,
          userId: 'user2',
          isActive: true,
          nextRun: futureDate,
        },
        {
          workflowId: 'wf3',
          name: 'Workflow 3',
          cronExpression: '0 0 * * *',
          oneTimeRun: true,
          oneTimeDate: futureDate,
          userId: 'user3',
          isActive: true,
          nextRun: futureDate,
        },
        {
          workflowId: 'wf4',
          name: 'Workflow 4',
          isActive: true,
          nextRun: futureDate, // No cron or one-time, should not be scheduled
        },
        {
          workflowId: 'wf5',
          name: 'Workflow 5',
          isActive: true,
          nextRun: pastDate, // nextRun in past, should be filtered by query
        },
        {
          workflowId: 'wf6',
          name: 'Workflow 6',
          oneTimeRun: true,
          oneTimeDate: pastDate, // oneTimeDate in past, should not be scheduled
          userId: 'user6',
          isActive: true,
          nextRun: futureDate,
        },
      ];

      ScheduledWorkflow.find.mockResolvedValue(mockWorkflows.filter(wf => wf.nextRun > mockDate));

      const result = await instance.loadActiveWorkflows();

      expect(logger.info).toHaveBeenCalledWith('Loading active scheduled workflows...');
      expect(ScheduledWorkflow.find).toHaveBeenCalledWith({
        isActive: true,
        nextRun: { $gt: mockDate },
      });
      expect(cronManager.scheduleWorkflow).toHaveBeenCalledWith(
        'wf1',
        '0 0 * * *',
        'user1',
        'America/New_York'
      );
      expect(cronManager.scheduleOneTimeWorkflow).toHaveBeenCalledWith(
        'wf2',
        futureDate,
        'user2',
        'UTC'
      );
      expect(cronManager.scheduleWorkflow).toHaveBeenCalledWith(
        'wf3',
        '0 0 * * *',
        'user3',
        'UTC'
      );
      expect(cronManager.scheduleOneTimeWorkflow).toHaveBeenCalledWith(
        'wf3',
        futureDate,
        'user3',
        'UTC'
      );
      expect(cronManager.scheduleWorkflow).toHaveBeenCalledTimes(2);
      expect(cronManager.scheduleOneTimeWorkflow).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        total: 4, // wf5 is filtered by query, wf6's oneTimeDate is in past
        scheduled: 4, // wf1 (cron), wf2 (one-time), wf3 (cron), wf3 (one-time)
        errors: 0,
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Loaded 4 workflows, scheduled 4, errors: 0'
      );
    });

    it('should handle no active workflows found', async () => {
      ScheduledWorkflow.find.mockResolvedValue([]);

      const result = await instance.loadActiveWorkflows();

      expect(logger.info).toHaveBeenCalledWith('Loading active scheduled workflows...');
      expect(ScheduledWorkflow.find).toHaveBeenCalledTimes(1);
      expect(cronManager.scheduleWorkflow).not.toHaveBeenCalled();
      expect(cronManager.scheduleOneTimeWorkflow).not.toHaveBeenCalled();
      expect(result).toEqual({
        total: 0,
        scheduled: 0,
        errors: 0,
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Loaded 0 workflows, scheduled 0, errors: 0'
      );
    });

    it('should handle errors when fetching workflows from the database', async () => {
      const dbError = new Error('DB connection failed');
      ScheduledWorkflow.find.mockRejectedValue(dbError);

      await expect(instance.loadActiveWorkflows()).rejects.toThrow(dbError);
      expect(logger.error).toHaveBeenCalledWith('Error loading active workflows:', dbError);
    });

    it('should handle errors when scheduling individual workflows', async () => {
      const mockWorkflows = [
        {
          workflowId: 'wf1',
          name: 'Workflow 1',
          cronExpression: '0 0 * * *',
          userId: 'user1',
          isActive: true,
          nextRun: futureDate,
        },
        {
          workflowId: 'wf2',
          name: 'Workflow 2',
          oneTimeRun: true,
          oneTimeDate: futureDate,
          userId: 'user2',
          isActive: true,
          nextRun: futureDate,
        },
      ];

      ScheduledWorkflow.find.mockResolvedValue(mockWorkflows);
      cronManager.scheduleWorkflow.mockResolvedValueOnce({ success: false, error: 'Invalid cron' });
      cronManager.scheduleOneTimeWorkflow.mockResolvedValueOnce({ success: false, error: 'Invalid date' });

      const result = await instance.loadActiveWorkflows();

      expect(cronManager.scheduleWorkflow).toHaveBeenCalledWith(
        'wf1',
        '0 0 * * *',
        'user1',
        'UTC'
      );
      expect(cronManager.scheduleOneTimeWorkflow).toHaveBeenCalledWith(
        'wf2',
        futureDate,
        'user2',
        'UTC'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to schedule workflow wf1: Invalid cron'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to schedule one-time workflow wf2: Invalid date'
      );
      expect(result).toEqual({
        total: 2,
        scheduled: 0,
        errors: 2,
      });
    });

    it('should handle unexpected errors during workflow processing loop', async () => {
      const mockWorkflows = [
        {
          workflowId: 'wf1',
          name: 'Workflow 1',
          cronExpression: '0 0 * * *',
          userId: 'user1',
          isActive: true,
          nextRun: futureDate,
        },
      ];
      ScheduledWorkflow.find.mockResolvedValue(mockWorkflows);
      cronManager.scheduleWorkflow.mockImplementationOnce(() => {
        throw new Error('Unexpected scheduling error');
      });

      const result = await instance.loadActiveWorkflows();

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing workflow wf1:',
        expect.any(Error)
      );
      expect(result).toEqual({
        total: 1,
        scheduled: 0,
        errors: 1,
      });
    });
  });

  describe('setupGracefulShutdown', () => {
    let originalProcessOn;
    let originalProcessExit;

    beforeEach(() => {
      // Re-initialize to ensure setupGracefulShutdown is called
      instance = new SchedulerInitializer();
      instance.initialize(); // Call initialize to set up handlers
      vi.clearAllMocks(); // Clear mocks after initialize sets up handlers
      processOnSpy.mockRestore(); // Restore original spy to allow manual triggering
      processExitSpy.mockRestore(); // Restore original spy to allow manual triggering

      originalProcessOn = process.on;
      originalProcessExit = process.exit;

      // Mock process.on to store handlers
      const handlers = {};
      process.on = vi.fn((event, handler) => {
        handlers[event] = handler;
      });
      instance._processHandlers = handlers; // Store handlers on instance for testing

      // Mock process.exit to prevent actual exit
      process.exit = vi.fn();

      // Call setupGracefulShutdown again to ensure mocks are in place
      instance.setupGracefulShutdown();
    });

    afterEach(() => {
      process.on = originalProcessOn;
      process.exit = originalProcessExit;
    });

    const triggerSignal = async (signal) => {
      const handler = instance._processHandlers[signal];
      if (handler) {
        await handler();
      } else {
        throw new Error(`No handler registered for signal: ${signal}`);
      }
    };

    const triggerException = async (type, error) => {
      const handler = instance._processHandlers[type === 'uncaughtException' ? 'uncaughtException' : 'unhandledRejection'];
      if (handler) {
        await handler(error, Promise.reject(error)); // Pass promise for unhandledRejection
      } else {
        throw new Error(`No handler registered for exception type: ${type}`);
      }
    };

    it('should handle SIGTERM gracefully', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      instance.addShutdownHandler(handler1);

      await triggerSignal('SIGTERM');

      expect(logger.info).toHaveBeenCalledWith('Received SIGTERM. Starting graceful shutdown...');
      expect(cronManager.stopScheduling).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(cronManager.gracefulShutdown).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Graceful shutdown completed');
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle SIGINT gracefully', async () => {
      await triggerSignal('SIGINT');
      expect(logger.info).toHaveBeenCalledWith('Received SIGINT. Starting graceful shutdown...');
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle SIGQUIT gracefully', async () => {
      await triggerSignal('SIGQUIT');
      expect(logger.info).toHaveBeenCalledWith('Received SIGQUIT. Starting graceful shutdown...');
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle uncaughtException gracefully', async () => {
      const error = new Error('Test uncaught exception');
      await triggerException('uncaughtException', error);

      expect(logger.error).toHaveBeenCalledWith('Uncaught exception:', error);
      expect(logger.info).toHaveBeenCalledWith('Received UNCAUGHT_EXCEPTION. Starting graceful shutdown...');
      expect(process.exit).toHaveBeenCalledWith(1); // Exit with 1 on error
    });

    it('should handle unhandledRejection gracefully', async () => {
      const reason = 'Test unhandled rejection';
      const promise = Promise.reject(reason);
      await triggerException('unhandledRejection', reason, promise);

      expect(logger.error).toHaveBeenCalledWith('Unhandled rejection at:', promise, 'reason:', reason);
      expect(logger.info).toHaveBeenCalledWith('Received UNHANDLED_REJECTION. Starting graceful shutdown...');
      expect(process.exit).toHaveBeenCalledWith(1); // Exit with 1 on error
    });

    it('should handle errors in shutdown handlers', async () => {
      const handlerWithError = vi.fn().mockRejectedValue(new Error('Handler failed'));
      instance.addShutdownHandler(handlerWithError);

      await triggerSignal('SIGTERM');

      expect(handlerWithError).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('Error in shutdown handler:', expect.any(Error));
      expect(process.exit).toHaveBeenCalledWith(0); // Still exits gracefully if handler error doesn't stop main flow
    });

    it('should handle errors during cronManager graceful shutdown', async () => {
      cronManager.gracefulShutdown.mockRejectedValue(new Error('Cron shutdown failed'));

      await triggerSignal('SIGTERM');

      expect(logger.error).toHaveBeenCalledWith('Error during graceful shutdown:', expect.any(Error));
      expect(process.exit).toHaveBeenCalledWith(1); // Exit with 1 if cronManager shutdown fails
    });
  });

  describe('addShutdownHandler', () => {
    it('should add a function to gracefulShutdownHandlers', () => {
      const handler = vi.fn();
      instance.addShutdownHandler(handler);
      expect(instance.gracefulShutdownHandlers).toContain(handler);
    });

    it('should not add non-function types', () => {
      const initialLength = instance.gracefulShutdownHandlers.length;
      instance.addShutdownHandler(null);
      instance.addShutdownHandler('not a function');
      expect(instance.gracefulShutdownHandlers.length).toBe(initialLength);
    });
  });

  describe('reloadWorkflows', () => {
    it('should successfully stop all jobs and reload active workflows', async () => {
      const loadResult = { total: 5, scheduled: 3, errors: 0 };
      vi.spyOn(instance, 'loadActiveWorkflows').mockResolvedValue(loadResult);

      const result = await instance.reloadWorkflows();

      expect(logger.info).toHaveBeenCalledWith('Reloading scheduled workflows...');
      expect(cronManager.stopAllJobs).toHaveBeenCalledTimes(1);
      expect(instance.loadActiveWorkflows).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Workflow reload completed');
      expect(result).toEqual({
        success: true,
        data: loadResult,
        message: 'Workflows reloaded successfully',
      });
    });

    it('should handle errors during workflow reload', async () => {
      const reloadError = new Error('Failed to reload');
      cronManager.stopAllJobs.mockRejectedValue(reloadError);

      const result = await instance.reloadWorkflows();

      expect(logger.error).toHaveBeenCalledWith('Error reloading workflows:', reloadError);
      expect(result).toEqual({
        success: false,
        error: reloadError.message,
      });
    });
  });

  describe('getStatus', () => {
    it('should return the current status of the scheduler', () => {
      instance.initialized = true;
      instance.addShutdownHandler(vi.fn());
      cronManager.getStatus.mockReturnValue({ status: 'active', jobs: 5 });
      cronManager.getActiveJobsCount.mockReturnValue(5);
      processUptimeSpy.mockReturnValue(3600);
      processMemoryUsageSpy.mockReturnValue({ heapUsed: 1000 });

      const status = instance.getStatus();

      expect(status).toEqual({
        initialized: true,
        cronManagerStatus: { status: 'active', jobs: 5 },
        activeJobs: 5,
        uptime: 3600,
        memoryUsage: { heapUsed: 1000 },
        shutdownHandlers: 1,
      });
      expect(cronManager.getStatus).toHaveBeenCalledTimes(1);
      expect(cronManager.getActiveJobsCount).toHaveBeenCalledTimes(1);
      expect(processUptimeSpy).toHaveBeenCalledTimes(1);
      expect(processMemoryUsageSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('healthCheck', () => {
    const mockDate = new Date('2023-01-01T12:00:00Z');
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return healthy status when initialized and cron manager is healthy', async () => {
      instance.initialized = true;
      cronManager.healthCheck.mockResolvedValue({ healthy: true, details: 'ok' });
      vi.spyOn(instance, 'getStatus').mockReturnValue({ initialized: true, activeJobs: 2 });

      const result = await instance.healthCheck();

      expect(result).toEqual({
        healthy: true,
        status: {
          scheduler: { initialized: true, activeJobs: 2 },
          cronManager: { healthy: true, details: 'ok' },
        },
        timestamp: mockDate.toISOString(),
      });
      expect(instance.getStatus).toHaveBeenCalledTimes(1);
      expect(cronManager.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('should return unhealthy if scheduler is not initialized', async () => {
      instance.initialized = false;
      cronManager.healthCheck.mockResolvedValue({ healthy: true, details: 'ok' });
      vi.spyOn(instance, 'getStatus').mockReturnValue({ initialized: false, activeJobs: 0 });

      const result = await instance.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.status.scheduler.initialized).toBe(false);
      expect(result.timestamp).toBe(mockDate.toISOString());
    });

    it('should return unhealthy if cron manager is not healthy', async () => {
      instance.initialized = true;
      cronManager.healthCheck.mockResolvedValue({ healthy: false, error: 'cron error' });
      vi.spyOn(instance, 'getStatus').mockReturnValue({ initialized: true, activeJobs: 2 });

      const result = await instance.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.status.cronManager.healthy).toBe(false);
      expect(result.timestamp).toBe(mockDate.toISOString());
    });

    it('should handle errors during health check', async () => {
      const healthError = new Error('Health check failed');
      cronManager.healthCheck.mockRejectedValue(healthError);

      const result = await instance.healthCheck();

      expect(logger.error).toHaveBeenCalledWith('Health check failed:', healthError);
      expect(result).toEqual({
        healthy: false,
        error: healthError.message,
        timestamp: mockDate.toISOString(),
      });
    });
  });

  describe('forceCleanup', () => {
    it('should successfully stop all jobs and reset initialization state', async () => {
      instance.initialized = true;

      const result = await instance.forceCleanup();

      expect(logger.warn).toHaveBeenCalledWith('Force cleanup initiated...');
      expect(cronManager.stopAllJobs).toHaveBeenCalledWith(true);
      expect(instance.initialized).toBe(false);
      expect(logger.info).toHaveBeenCalledWith('Force cleanup completed');
      expect(result).toEqual({
        success: true,
        message: 'Force cleanup completed',
      });
    });

    it('should handle errors during force cleanup', async () => {
      const cleanupError = new Error('Failed to stop jobs');
      cronManager.stopAllJobs.mockRejectedValue(cleanupError);

      const result = await instance.forceCleanup();

      expect(logger.error).toHaveBeenCalledWith('Error during force cleanup:', cleanupError);
      expect(result).toEqual({
        success: false,
        error: cleanupError.message,
      });
    });
  });

  describe('executeWorkflowManually', () => {
    const workflowId = 'wf-manual-1';
    const userId = 'user-manual-1';
    const mockWorkflow = {
      workflowId,
      userId,
      isActive: true,
      name: 'Manual Workflow',
    };

    it('should successfully execute an active workflow manually', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflow);
      workflowExecutor.executeWorkflow.mockResolvedValue({ executionId: 'exec-1' });

      const result = await instance.executeWorkflowManually(workflowId, userId);

      expect(logger.info).toHaveBeenCalledWith(`Manual execution requested for workflow: ${workflowId}`);
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(
        mockWorkflow,
        'manual',
        'manual_trigger: Manual trigger'
      );
      expect(result).toEqual({
        success: true,
        data: { executionId: 'exec-1' },
        message: 'Manual execution started',
      });
    });

    it('should return error if workflow not found', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(null);

      const result = await instance.executeWorkflowManually(workflowId, userId);

      expect(logger.info).toHaveBeenCalledWith(`Manual execution requested for workflow: ${workflowId}`);
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(workflowExecutor.executeWorkflow).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Workflow not found',
      });
    });

    it('should return error if workflow is not active', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue({ ...mockWorkflow, isActive: false });

      const result = await instance.executeWorkflowManually(workflowId, userId);

      expect(logger.info).toHaveBeenCalledWith(`Manual execution requested for workflow: ${workflowId}`);
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(workflowExecutor.executeWorkflow).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Workflow is not active',
      });
    });

    it('should handle errors during manual execution', async () => {
      const execError = new Error('Execution failed');
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflow);
      workflowExecutor.executeWorkflow.mockRejectedValue(execError);

      const result = await instance.executeWorkflowManually(workflowId, userId);

      expect(logger.error).toHaveBeenCalledWith(`Error in manual execution for ${workflowId}:`, execError);
      expect(result).toEqual({
        success: false,
        error: execError.message,
      });
    });

    it('should use custom reason if provided', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflow);
      workflowExecutor.executeWorkflow.mockResolvedValue({ executionId: 'exec-1' });

      const result = await instance.executeWorkflowManually(workflowId, userId, 'Test Reason');

      expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(
        mockWorkflow,
        'manual',
        'manual_trigger: Test Reason'
      );
      expect(result.success).toBe(true);
    });
  });

  describe('emergencyExecute', () => {
    const workflowId = 'wf-emergency-1';
    const userId = 'user-emergency-1';
    const mockWorkflowActive = {
      workflowId,
      userId,
      isActive: true,
      name: 'Emergency Workflow Active',
    };
    const mockWorkflowInactive = {
      workflowId,
      userId,
      isActive: false,
      name: 'Emergency Workflow Inactive',
    };

    it('should execute an active workflow without override', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflowActive);
      workflowExecutor.executeWorkflow.mockResolvedValue({ executionId: 'exec-e1' });

      const result = await instance.emergencyExecute(workflowId, userId, false);

      expect(logger.warn).toHaveBeenCalledWith(`Emergency execution for workflow: ${workflowId}`);
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(
        mockWorkflowActive,
        'emergency',
        'emergency_trigger'
      );
      expect(result).toEqual({
        success: true,
        data: { executionId: 'exec-e1' },
        message: 'Emergency execution completed',
      });
    });

    it('should execute an inactive workflow with overrideChecks=true', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflowInactive);
      workflowExecutor.executeWorkflow.mockResolvedValue({ executionId: 'exec-e2' });

      const result = await instance.emergencyExecute(workflowId, userId, true);

      expect(logger.warn).toHaveBeenCalledWith(`Emergency execution for workflow: ${workflowId}`);
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(
        mockWorkflowInactive,
        'emergency',
        'emergency_trigger'
      );
      expect(result).toEqual({
        success: true,
        data: { executionId: 'exec-e2' },
        message: 'Emergency execution completed',
      });
    });

    it('should return error if workflow is inactive and overrideChecks=false', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflowInactive);

      const result = await instance.emergencyExecute(workflowId, userId, false);

      expect(logger.warn).toHaveBeenCalledWith(`Emergency execution for workflow: ${workflowId}`);
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(workflowExecutor.executeWorkflow).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Workflow is not active and overrideChecks is false',
      });
    });

    it('should return error if workflow not found', async () => {
      ScheduledWorkflow.findOne.mockResolvedValue(null);

      const result = await instance.emergencyExecute(workflowId, userId, true);

      expect(logger.warn).toHaveBeenCalledWith(`Emergency execution for workflow: ${workflowId}`);
      expect(ScheduledWorkflow.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(workflowExecutor.executeWorkflow).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Workflow not found',
      });
    });

    it('should handle errors during emergency execution', async () => {
      const execError = new Error('Emergency execution failed');
      ScheduledWorkflow.findOne.mockResolvedValue(mockWorkflowActive);
      workflowExecutor.executeWorkflow.mockRejectedValue(execError);

      const result = await instance.emergencyExecute(workflowId, userId, false);

      expect(logger.error).toHaveBeenCalledWith(`Error in emergency execution for ${workflowId}:`, execError);
      expect(result).toEqual({
        success: false,
        error: execError.message,
      });
    });
  });
});