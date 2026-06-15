import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockLogger,
  mockWorkflowExecutionService,
  mockGcpEventsService
} = vi.hoisted(() => {
  // Mock the logger
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  // Mock the workflowExecutionService
  const mockWorkflowExecutionService = {
    initializeScheduledWorkflows: vi.fn(),
    scheduledJobs: new Map(),
  };

  // Mock the gcpEventsService (for dynamic import)
  const mockGcpEventsService = {
    initializePubSubTriggers: vi.fn(),
    unregisterPubSubTrigger: vi.fn(),
    activeSubscriptions: new Map(),
  };

  return {
    mockLogger,
    mockWorkflowExecutionService,
    mockGcpEventsService
  };
});

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('./services/workflowExecution.service.js', () => ({
  workflowExecutionService: mockWorkflowExecutionService,
}));

vi.mock('./services/gcpEvents.service.js', () => ({
  gcpEventsService: mockGcpEventsService,
}));

// Import the functions to test
import { initializeWorkflowAutomation, cleanupWorkflowAutomation } from './init.js';

describe('Workflow Automation Module Initialization and Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowExecutionService.scheduledJobs.clear();
    mockGcpEventsService.activeSubscriptions.clear();
  });

  describe('initializeWorkflowAutomation', () => {
    it('should successfully initialize all services and log success', async () => {
      mockWorkflowExecutionService.initializeScheduledWorkflows.mockResolvedValue(undefined);
      mockGcpEventsService.initializePubSubTriggers.mockResolvedValue(undefined);

      await initializeWorkflowAutomation();

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing Workflow Automation module...');
      expect(mockWorkflowExecutionService.initializeScheduledWorkflows).toHaveBeenCalledTimes(1);
      expect(mockGcpEventsService.initializePubSubTriggers).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Workflow Automation module initialized successfully');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log and re-throw an error if workflowExecutionService fails', async () => {
      const testError = new Error('Scheduled workflow init failed');
      mockWorkflowExecutionService.initializeScheduledWorkflows.mockRejectedValue(testError);

      await expect(initializeWorkflowAutomation()).rejects.toThrow(testError);

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing Workflow Automation module...');
      expect(mockWorkflowExecutionService.initializeScheduledWorkflows).toHaveBeenCalledTimes(1);
      expect(mockGcpEventsService.initializePubSubTriggers).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Error initializing Workflow Automation module:', testError);
    });

    it('should log and re-throw an error if gcpEventsService fails', async () => {
      const testError = new Error('GCP Pub/Sub init failed');
      mockWorkflowExecutionService.initializeScheduledWorkflows.mockResolvedValue(undefined);
      mockGcpEventsService.initializePubSubTriggers.mockRejectedValue(testError);

      await expect(initializeWorkflowAutomation()).rejects.toThrow(testError);

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing Workflow Automation module...');
      expect(mockWorkflowExecutionService.initializeScheduledWorkflows).toHaveBeenCalledTimes(1);
      expect(mockGcpEventsService.initializePubSubTriggers).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('Error initializing Workflow Automation module:', testError);
    });
  });

  describe('cleanupWorkflowAutomation', () => {
    it('should perform cleanup for all active scheduled jobs and GCP subscriptions', async () => {
      const mockJob1 = { stop: vi.fn().mockResolvedValue(undefined) };
      const mockJob2 = { stop: vi.fn().mockResolvedValue(undefined) };
      mockWorkflowExecutionService.scheduledJobs.set('wf1', mockJob1);
      mockWorkflowExecutionService.scheduledJobs.set('wf2', mockJob2);

      mockGcpEventsService.activeSubscriptions.set('wf3', {});
      mockGcpEventsService.activeSubscriptions.set('wf4', {});
      mockGcpEventsService.unregisterPubSubTrigger.mockResolvedValue(undefined);

      await cleanupWorkflowAutomation();

      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up Workflow Automation module...');
      expect(mockJob1.stop).toHaveBeenCalledTimes(1);
      expect(mockJob2.stop).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Stopped scheduled job for workflow: wf1');
      expect(mockLogger.info).toHaveBeenCalledWith('Stopped scheduled job for workflow: wf2');
      expect(mockWorkflowExecutionService.scheduledJobs.size).toBe(0);

      expect(mockGcpEventsService.unregisterPubSubTrigger).toHaveBeenCalledTimes(2);
      expect(mockGcpEventsService.unregisterPubSubTrigger).toHaveBeenCalledWith('wf3');
      expect(mockGcpEventsService.unregisterPubSubTrigger).toHaveBeenCalledWith('wf4');
      expect(mockGcpEventsService.activeSubscriptions.size).toBe(0);

      expect(mockLogger.info).toHaveBeenCalledWith('Workflow Automation module cleanup completed');
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should handle cases with no active jobs or subscriptions gracefully', async () => {
      await cleanupWorkflowAutomation();

      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up Workflow Automation module...');
      expect(mockWorkflowExecutionService.scheduledJobs.size).toBe(0);
      expect(mockGcpEventsService.activeSubscriptions.size).toBe(0);
      expect(mockGcpEventsService.unregisterPubSubTrigger).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Workflow Automation module cleanup completed');
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should continue cleanup and log a warning if a job fails to stop', async () => {
      const stopError = new Error('Job stop failed');
      const mockJob1 = { stop: vi.fn().mockRejectedValue(stopError) };
      const mockJob2 = { stop: vi.fn().mockResolvedValue(undefined) };
      mockWorkflowExecutionService.scheduledJobs.set('wf1-fail', mockJob1);
      mockWorkflowExecutionService.scheduledJobs.set('wf2-ok', mockJob2);

      mockGcpEventsService.activeSubscriptions.set('wf3', {});
      mockGcpEventsService.unregisterPubSubTrigger.mockResolvedValue(undefined);

      await cleanupWorkflowAutomation();

      expect(mockJob1.stop).toHaveBeenCalledTimes(1);
      expect(mockJob2.stop).toHaveBeenCalledTimes(1);

      expect(mockLogger.warn).toHaveBeenCalledWith(`Failed to stop scheduled job for workflow wf1-fail: ${stopError.message}`);
      expect(mockLogger.info).toHaveBeenCalledWith('Stopped scheduled job for workflow: wf2-ok');
      
      expect(mockGcpEventsService.unregisterPubSubTrigger).toHaveBeenCalledWith('wf3');
      expect(mockWorkflowExecutionService.scheduledJobs.size).toBe(0);
      expect(mockGcpEventsService.activeSubscriptions.size).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Workflow Automation module cleanup completed');
    });

    it('should continue cleanup and log a warning if unregistering a subscription fails', async () => {
        const unregisterError = new Error('Unregister failed');
        mockGcpEventsService.activeSubscriptions.set('wf3-fail', {});
        mockGcpEventsService.activeSubscriptions.set('wf4-ok', {});
        
        mockGcpEventsService.unregisterPubSubTrigger
            .mockImplementation(async (workflowId) => {
                if (workflowId === 'wf3-fail') {
                    throw unregisterError;
                }
                return Promise.resolve();
            });

        await cleanupWorkflowAutomation();

        expect(mockGcpEventsService.unregisterPubSubTrigger).toHaveBeenCalledTimes(2);
        expect(mockGcpEventsService.unregisterPubSubTrigger).toHaveBeenCalledWith('wf3-fail');
        expect(mockGcpEventsService.unregisterPubSubTrigger).toHaveBeenCalledWith('wf4-ok');

        expect(mockLogger.warn).toHaveBeenCalledWith(`Failed to release dynamic GCP event subscription for workflow wf3-fail: ${unregisterError.message}`);
        expect(mockGcpEventsService.activeSubscriptions.size).toBe(0);
        expect(mockLogger.info).toHaveBeenCalledWith('Workflow Automation module cleanup completed');
    });

    it('should log an error but not re-throw if a critical error occurs during cleanup', async () => {
      const criticalError = new Error('Cannot access scheduledJobs');
      const originalDescriptor = Object.getOwnPropertyDescriptor(mockWorkflowExecutionService, 'scheduledJobs');
      
      Object.defineProperty(mockWorkflowExecutionService, 'scheduledJobs', {
        get: () => { throw criticalError; },
        configurable: true
      });

      await cleanupWorkflowAutomation();

      expect(mockLogger.error).toHaveBeenCalledWith('Error during Workflow Automation cleanup:', criticalError);
      expect(mockLogger.info).not.toHaveBeenCalledWith('Workflow Automation module cleanup completed');

      // Restore original property to not affect other tests
      if (originalDescriptor) {
        Object.defineProperty(mockWorkflowExecutionService, 'scheduledJobs', originalDescriptor);
      }
    });
  });
});