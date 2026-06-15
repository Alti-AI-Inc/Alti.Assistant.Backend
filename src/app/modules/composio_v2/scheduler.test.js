import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initializeWorkflowScheduler,
  getSystemStatus,
  healthCheck,
  shutdownWorkflowScheduler,
} from './scheduler.js';

const {
  mockSchedulerInitializer,
  mockCronManager,
  mockQueueManager,
  mockLogger
} = vi.hoisted(() => {
  // Mock dependencies
  const mockSchedulerInitializer = {
    initialize: vi.fn(),
    getStatus: vi.fn(),
    healthCheck: vi.fn(),
    stop: vi.fn(),
  };

  const mockCronManager = {
    getStatus: vi.fn(),
    healthCheck: vi.fn(),
    gracefulShutdown: vi.fn(),
  };

  const mockQueueManager = {
    initialize: vi.fn(),
    getQueueStatus: vi.fn(),
    healthCheck: vi.fn(),
    stop: vi.fn(),
  };

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockSchedulerInitializer,
    mockCronManager,
    mockQueueManager,
    mockLogger
  };
});

vi.mock('./services/schedulerInitializer.service.js', () => ({
  schedulerInitializer: mockSchedulerInitializer,
}));
vi.mock('./services/cronManager.service.js', () => ({
  cronManager: mockCronManager,
}));
vi.mock('./services/queueManager.service.js', () => ({
  queueManager: mockQueueManager,
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

describe('Composio v2 Workflow Scheduler', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Default successful mock implementations
    mockSchedulerInitializer.initialize.mockResolvedValue({
      success: true,
      scheduledWorkflows: 5,
    });
    mockSchedulerInitializer.getStatus.mockReturnValue({
      status: 'running',
      tasks: 5,
    });
    mockSchedulerInitializer.healthCheck.mockResolvedValue({
      healthy: true,
      message: 'Scheduler operational',
    });
    mockSchedulerInitializer.stop.mockResolvedValue(undefined);

    mockCronManager.getStatus.mockReturnValue({
      status: 'active',
      jobs: 2,
    });
    mockCronManager.healthCheck.mockResolvedValue({
      healthy: true,
      message: 'Cron manager operational',
    });
    mockCronManager.gracefulShutdown.mockResolvedValue(undefined);

    mockQueueManager.initialize.mockResolvedValue({
      success: true,
      message: 'Queue connected',
    });
    mockQueueManager.getQueueStatus.mockReturnValue({
      status: 'connected',
      pendingMessages: 0,
    });
    mockQueueManager.healthCheck.mockResolvedValue({
      healthy: true,
      message: 'Queue connected',
    });
    mockQueueManager.stop.mockResolvedValue(undefined);
  });

  describe('initializeWorkflowScheduler', () => {
    it('should initialize successfully with default config', async () => {
      const result = await initializeWorkflowScheduler();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing Composio v2 workflow scheduling system...'
      );
      expect(mockQueueManager.initialize).toHaveBeenCalledWith({});
      expect(mockSchedulerInitializer.initialize).toHaveBeenCalledWith();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow scheduling system initialized successfully'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Active scheduled workflows: 5'
      );

      expect(result).toEqual({
        success: true,
        message: 'Workflow scheduling system initialized',
        data: {
          scheduler: { success: true, scheduledWorkflows: 5 },
          queue: { success: true, message: 'Queue connected' },
        },
      });
    });

    it('should initialize successfully with provided config', async () => {
      const config = { queue: { connectionString: 'mock-conn-str' } };
      const result = await initializeWorkflowScheduler(config);

      expect(mockQueueManager.initialize).toHaveBeenCalledWith(
        config.queue
      );
      expect(mockSchedulerInitializer.initialize).toHaveBeenCalledWith();
      expect(result.success).toBe(true);
    });

    it('should return success: false if queue manager initialization fails', async () => {
      mockQueueManager.initialize.mockResolvedValueOnce({
        success: false,
        error: 'Queue connection failed',
      });

      const result = await initializeWorkflowScheduler();

      expect(mockQueueManager.initialize).toHaveBeenCalledWith({});
      expect(mockSchedulerInitializer.initialize).not.toHaveBeenCalled(); // Scheduler should not be initialized if queue fails
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize workflow scheduling system:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        error: 'Queue manager initialization failed: Queue connection failed',
      });
    });

    it('should return success: false if scheduler initialization fails', async () => {
      mockSchedulerInitializer.initialize.mockResolvedValueOnce({
        success: false,
        error: 'Scheduler setup failed',
      });

      const result = await initializeWorkflowScheduler();

      expect(mockQueueManager.initialize).toHaveBeenCalledWith({});
      expect(mockSchedulerInitializer.initialize).toHaveBeenCalledWith();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize workflow scheduling system:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        error: 'Scheduler initialization failed: Scheduler setup failed',
      });
    });

    it('should handle unexpected errors during initialization', async () => {
      mockQueueManager.initialize.mockRejectedValueOnce(
        new Error('Network error during queue init')
      );

      const result = await initializeWorkflowScheduler();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize workflow scheduling system:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        error: 'Network error during queue init',
      });
    });
  });

  describe('getSystemStatus', () => {
    it('should return the status of all components', () => {
      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const result = getSystemStatus();

      expect(mockSchedulerInitializer.getStatus).toHaveBeenCalled();
      expect(mockQueueManager.getQueueStatus).toHaveBeenCalled();
      expect(mockCronManager.getStatus).toHaveBeenCalled();

      expect(result).toEqual({
        scheduler: { status: 'running', tasks: 5 },
        queue: { status: 'connected', pendingMessages: 0 },
        cronManager: { status: 'active', jobs: 2 },
        timestamp: mockDate.toISOString(),
      });

      vi.useRealTimers();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy: true if all components are healthy', async () => {
      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const result = await healthCheck();

      expect(mockSchedulerInitializer.healthCheck).toHaveBeenCalled();
      expect(mockQueueManager.healthCheck).toHaveBeenCalled();
      expect(mockCronManager.healthCheck).toHaveBeenCalled();

      expect(result).toEqual({
        healthy: true,
        components: {
          scheduler: { healthy: true, message: 'Scheduler operational' },
          queue: { healthy: true, message: 'Queue connected' },
          cronManager: { healthy: true, message: 'Cron manager operational' },
        },
        timestamp: mockDate.toISOString(),
      });

      vi.useRealTimers();
    });

    it('should return healthy: false if scheduler is unhealthy', async () => {
      mockSchedulerInitializer.healthCheck.mockResolvedValueOnce({
        healthy: false,
        message: 'Scheduler down',
      });
      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const result = await healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.components.scheduler.healthy).toBe(false);
      expect(result.components.queue.healthy).toBe(true);
      expect(result.components.cronManager.healthy).toBe(true);
      expect(result.timestamp).toBe(mockDate.toISOString());

      vi.useRealTimers();
    });

    it('should return healthy: false if queue is unhealthy', async () => {
      mockQueueManager.healthCheck.mockResolvedValueOnce({
        healthy: false,
        message: 'Queue disconnected',
      });
      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const result = await healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.components.scheduler.healthy).toBe(true);
      expect(result.components.queue.healthy).toBe(false);
      expect(result.components.cronManager.healthy).toBe(true);
      expect(result.timestamp).toBe(mockDate.toISOString());

      vi.useRealTimers();
    });

    it('should return healthy: false if cron manager is unhealthy', async () => {
      mockCronManager.healthCheck.mockResolvedValueOnce({
        healthy: false,
        message: 'Cron jobs failing',
      });
      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const result = await healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.components.scheduler.healthy).toBe(true);
      expect(result.components.queue.healthy).toBe(true);
      expect(result.components.cronManager.healthy).toBe(false);
      expect(result.timestamp).toBe(mockDate.toISOString());

      vi.useRealTimers();
    });

    it('should handle errors during health check', async () => {
      mockSchedulerInitializer.healthCheck.mockRejectedValueOnce(
        new Error('Scheduler health check failed unexpectedly')
      );
      const mockDate = new Date('2023-01-01T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const result = await healthCheck();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Health check failed:',
        expect.any(Error)
      );
      expect(result).toEqual({
        healthy: false,
        error: 'Scheduler health check failed unexpectedly',
        timestamp: mockDate.toISOString(),
      });

      vi.useRealTimers();
    });
  });

  describe('shutdownWorkflowScheduler', () => {
    it('should shut down all components successfully', async () => {
      const result = await shutdownWorkflowScheduler();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Shutting down workflow scheduling system...'
      );
      expect(mockQueueManager.stop).toHaveBeenCalled();
      expect(mockCronManager.gracefulShutdown).toHaveBeenCalled();
      expect(mockSchedulerInitializer.stop).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Workflow scheduling system shutdown complete'
      );

      expect(result).toEqual({
        success: true,
        message: 'Workflow scheduling system shutdown complete',
      });
    });

    it('should return success: false if queue manager stop fails', async () => {
      mockQueueManager.stop.mockRejectedValueOnce(
        new Error('Queue failed to stop')
      );

      const result = await shutdownWorkflowScheduler();

      expect(mockQueueManager.stop).toHaveBeenCalled();
      expect(mockCronManager.gracefulShutdown).not.toHaveBeenCalled(); // Should stop processing on first error
      expect(mockSchedulerInitializer.stop).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during workflow scheduler shutdown:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        error: 'Queue failed to stop',
      });
    });

    it('should return success: false if cron manager shutdown fails', async () => {
      mockCronManager.gracefulShutdown.mockRejectedValueOnce(
        new Error('Cron manager failed to stop')
      );

      const result = await shutdownWorkflowScheduler();

      expect(mockQueueManager.stop).toHaveBeenCalled();
      expect(mockCronManager.gracefulShutdown).toHaveBeenCalled();
      expect(mockSchedulerInitializer.stop).not.toHaveBeenCalled(); // Should stop processing on first error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during workflow scheduler shutdown:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        error: 'Cron manager failed to stop',
      });
    });

    it('should return success: false if scheduler stop fails', async () => {
      mockSchedulerInitializer.stop.mockRejectedValueOnce(
        new Error('Scheduler failed to stop')
      );

      const result = await shutdownWorkflowScheduler();

      expect(mockQueueManager.stop).toHaveBeenCalled();
      expect(mockCronManager.gracefulShutdown).toHaveBeenCalled();
      expect(mockSchedulerInitializer.stop).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during workflow scheduler shutdown:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        error: 'Scheduler failed to stop',
      });
    });

    it('should handle unexpected errors during shutdown', async () => {
      mockQueueManager.stop.mockRejectedValueOnce(
        new Error('Unexpected network issue during shutdown')
      );

      const result = await shutdownWorkflowScheduler();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during workflow scheduler shutdown:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        error: 'Unexpected network issue during shutdown',
      });
    });
  });
});