import { describe, it, expect, vi, beforeEach } from 'vitest';
import cron from 'node-cron';
import { logger } from '../../../../shared/logger.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { workflowExecutor } from './workflowExecutor.service.js';
import parser from 'cron-parser';
import { cronManager } from './cronManager.service.js';

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(),
    validate: vi.fn().mockImplementation(() => true),
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../models/scheduledWorkflow.model.js', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('./workflowExecutor.service.js', () => ({
  workflowExecutor: {
    executeWorkflow: vi.fn(),
  },
}));

vi.mock('cron-parser', () => ({
  default: {
    parseExpression: vi.fn(),
  },
}));

describe('CronManager Service', () => {
  const mockJob = {
    stop: vi.fn(),
    destroy: vi.fn(),
    running: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    cronManager.activeCronJobs.clear();
    cronManager.isInitialized = false;
    cron.schedule.mockReturnValue(mockJob);
  });

  describe('initialize', () => {
    it('should initialize successfully if not already initialized', async () => {
      const loadActiveWorkflowsSpy = vi.spyOn(cronManager, 'loadActiveWorkflows').mockResolvedValue(undefined);
      const setupCleanupJobSpy = vi.spyOn(cronManager, 'setupCleanupJob').mockImplementation(() => {});
      const setupHealthCheckJobSpy = vi.spyOn(cronManager, 'setupHealthCheckJob').mockImplementation(() => {});

      await cronManager.initialize();

      expect(cronManager.isInitialized).toBe(true);
      expect(loadActiveWorkflowsSpy).toHaveBeenCalled();
      expect(setupCleanupJobSpy).toHaveBeenCalled();
      expect(setupHealthCheckJobSpy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('CronManager initialized successfully');
    });

    it('should warn and return early if already initialized', async () => {
      cronManager.isInitialized = true;
      const loadActiveWorkflowsSpy = vi.spyOn(cronManager, 'loadActiveWorkflows');

      await cronManager.initialize();

      expect(loadActiveWorkflowsSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('CronManager already initialized');
    });

    it('should throw error and log if initialization fails', async () => {
      const error = new Error('DB Connection Failed');
      vi.spyOn(cronManager, 'loadActiveWorkflows').mockRejectedValue(error);

      await expect(cronManager.initialize()).rejects.toThrow('DB Connection Failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to initialize CronManager:', error);
    });
  });

  describe('scheduleWorkflow', () => {
    it('should return success and not schedule if workflow is inactive', async () => {
      const workflow = {
        workflowId: 'wf-123',
        scheduleConfig: { isActive: false },
      };

      const result = await cronManager.scheduleWorkflow(workflow);

      expect(result).toEqual({ success: true, message: 'Workflow is inactive' });
      expect(cronManager.activeCronJobs.has('wf-123')).toBe(false);
    });

    it('should schedule a one-time scheduled workflow successfully', async () => {
      const futureDate = new Date(Date.now() + 10000);
      const workflow = {
        workflowId: 'wf-123',
        triggerType: 'scheduled',
        scheduleConfig: {
          isActive: true,
          triggerDate: futureDate.toISOString(),
          timezone: 'UTC',
        },
      };

      const mockNextDate = new Date('2026-01-01T00:00:00.000Z');
      parser.parseExpression.mockReturnValue({
        next: () => ({ toDate: () => mockNextDate }),
      });

      const result = await cronManager.scheduleWorkflow(workflow);

      expect(result.success).toBe(true);
      expect(result.data.nextExecution).toEqual(mockNextDate);
      expect(cronManager.activeCronJobs.has('wf-123')).toBe(true);
      expect(ScheduledWorkflow.updateOne).toHaveBeenCalledWith(
        { workflowId: 'wf-123' },
        { nextExecution: mockNextDate }
      );
    });

    it('should throw error if scheduled workflow has no triggerDate', async () => {
      const workflow = {
        workflowId: 'wf-123',
        triggerType: 'scheduled',
        scheduleConfig: { isActive: true },
      };

      const result = await cronManager.scheduleWorkflow(workflow);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Trigger date is required');
    });

    it('should throw error if triggerDate is in the past', async () => {
      const pastDate = new Date(Date.now() - 10000);
      const workflow = {
        workflowId: 'wf-123',
        triggerType: 'scheduled',
        scheduleConfig: {
          isActive: true,
          triggerDate: pastDate.toISOString(),
        },
      };

      const result = await cronManager.scheduleWorkflow(workflow);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Trigger date must be in the future');
    });

    it('should schedule a recurring workflow successfully', async () => {
      const workflow = {
        workflowId: 'wf-123',
        triggerType: 'recurring',
        scheduleConfig: {
          isActive: true,
          cronExpression: '0 0 * * *',
          timezone: 'EST',
        },
      };

      const mockNextDate = new Date('2026-01-01T00:00:00.000Z');
      parser.parseExpression.mockReturnValue({
        next: () => ({ toDate: () => mockNextDate }),
      });

      const result = await cronManager.scheduleWorkflow(workflow);

      expect(result.success).toBe(true);
      expect(cronManager.activeCronJobs.has('wf-123')).toBe(true);
      expect(ScheduledWorkflow.updateOne).toHaveBeenCalledWith(
        { workflowId: 'wf-123' },
        { nextExecution: mockNextDate }
      );
    });

    it('should throw error if recurring workflow has no cronExpression', async () => {
      const workflow = {
        workflowId: 'wf-123',
        triggerType: 'recurring',
        scheduleConfig: { isActive: true },
      };

      const result = await cronManager.scheduleWorkflow(workflow);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cron expression is required');
    });

    it('should return success and do nothing for manual trigger workflows', async () => {
      const workflow = {
        workflowId: 'wf-123',
        triggerType: 'manual',
        scheduleConfig: { isActive: true },
      };

      const result = await cronManager.scheduleWorkflow(workflow);

      expect(result).toEqual({
        success: true,
        message: 'Manual trigger workflow, no scheduling needed',
      });
    });

    it('should handle invalid cron expression validation failure', async () => {
      cron.validate.mockReturnValueOnce(false);
      const workflow = {
        workflowId: 'wf-123',
        triggerType: 'recurring',
        scheduleConfig: {
          isActive: true,
          cronExpression: 'invalid-cron',
        },
      };

      const result = await cronManager.scheduleWorkflow(workflow);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid cron expression');
    });

    it('should execute the cron job callback and handle success/error', async () => {
      let capturedCallback;
      cron.schedule.mockImplementationOnce((expr, cb) => {
        capturedCallback = cb;
        return mockJob;
      });

      const workflow = {
        workflowId: 'wf-123',
        triggerType: 'recurring',
        scheduleConfig: {
          isActive: true,
          cronExpression: '0 0 * * *',
        },
      };

      await cronManager.scheduleWorkflow(workflow);
      expect(capturedCallback).toBeDefined();

      const executeCronJobSpy = vi.spyOn(cronManager, 'executeCronJob').mockResolvedValue(undefined);
      await capturedCallback();
      expect(executeCronJobSpy).toHaveBeenCalledWith('wf-123');

      executeCronJobSpy.mockRejectedValueOnce(new Error('Execution failed'));
      await capturedCallback();
      expect(logger.error).toHaveBeenCalledWith(
        'Unhandled error in cron job for workflow wf-123:',
        expect.any(Error)
      );
    });
  });

  describe('unscheduleWorkflow', () => {
    it('should stop, destroy and delete active cron job if it exists', async () => {
      cronManager.activeCronJobs.set('wf-123', {
        job: mockJob,
        cronExpression: '0 0 * * *',
        description: 'Test Job',
        createdAt: new Date(),
      });

      const result = await cronManager.unscheduleWorkflow('wf-123');

      expect(result).toEqual({ success: true });
      expect(mockJob.stop).toHaveBeenCalled();
      expect(mockJob.destroy).toHaveBeenCalled();
      expect(cronManager.activeCronJobs.has('wf-123')).toBe(false);
      expect(ScheduledWorkflow.updateOne).toHaveBeenCalledWith(
        { workflowId: 'wf-123' },
        { nextExecution: null }
      );
    });

    it('should still clear nextExecution in DB even if job is not in active map', async () => {
      const result = await cronManager.unscheduleWorkflow('wf-nonexistent');

      expect(result).toEqual({ success: true });
      expect(ScheduledWorkflow.updateOne).toHaveBeenCalledWith(
        { workflowId: 'wf-nonexistent' },
        { nextExecution: null }
      );
    });

    it('should return failure if database update throws error', async () => {
      ScheduledWorkflow.updateOne.mockRejectedValueOnce(new Error('DB Error'));

      const result = await cronManager.unscheduleWorkflow('wf-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB Error');
    });
  });

  describe('rescheduleWorkflow', () => {
    it('should unschedule and then schedule the workflow', async () => {
      const workflow = { workflowId: 'wf-123', triggerType: 'manual', scheduleConfig: { isActive: true } };
      const unscheduleSpy = vi.spyOn(cronManager, 'unscheduleWorkflow').mockResolvedValue({ success: true });
      const scheduleSpy = vi.spyOn(cronManager, 'scheduleWorkflow').mockResolvedValue({ success: true });

      const result = await cronManager.rescheduleWorkflow(workflow);

      expect(result).toEqual({ success: true });
      expect(unscheduleSpy).toHaveBeenCalledWith('wf-123');
      expect(scheduleSpy).toHaveBeenCalledWith(workflow);
    });

    it('should return failure if rescheduling throws an error', async () => {
      const workflow = { workflowId: 'wf-123' };
      vi.spyOn(cronManager, 'unscheduleWorkflow').mockRejectedValue(new Error('Reschedule Failed'));

      const result = await cronManager.rescheduleWorkflow(workflow);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Reschedule Failed');
    });
  });

  describe('executeCronJob', () => {
    it('should log error and unschedule if workflow is not found in DB', async () => {
      ScheduledWorkflow.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      const unscheduleSpy = vi.spyOn(cronManager, 'unscheduleWorkflow').mockResolvedValue({ success: true });

      await cronManager.executeCronJob('wf-missing');

      expect(logger.error).toHaveBeenCalledWith('Workflow not found: wf-missing');
      expect(unscheduleSpy).toHaveBeenCalledWith('wf-missing');
    });

    it('should skip execution if workflow is inactive in DB', async () => {
      const mockWorkflow = {
        workflowId: 'wf-123',
        scheduleConfig: { isActive: false },
      };
      ScheduledWorkflow.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockWorkflow),
      });

      await cronManager.executeCronJob('wf-123');

      expect(logger.info).toHaveBeenCalledWith('Workflow wf-123 is inactive, skipping execution');
      expect(workflowExecutor.executeWorkflow).not.toHaveBeenCalled();
    });

    it('should execute and complete one-time scheduled workflow', async () => {
      const mockWorkflow = {
        _id: 'mongo-id-123',
        workflowId: 'wf-123',
        triggerType: 'scheduled',
        scheduleConfig: { isActive: true },
      };
      ScheduledWorkflow.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockWorkflow),
      });
      const unscheduleSpy = vi.spyOn(cronManager, 'unscheduleWorkflow').mockResolvedValue({ success: true });

      await cronManager.executeCronJob('wf-123');

      expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(mockWorkflow, 'scheduled', 'cron_job');
      expect(ScheduledWorkflow.updateOne).toHaveBeenCalledWith(
        { _id: 'mongo-id-123' },
        { status: 'completed', 'scheduleConfig.isActive': false }
      );
      expect(unscheduleSpy).toHaveBeenCalledWith('wf-123');
    });

    it('should execute and update nextExecution for recurring workflow', async () => {
      const mockWorkflow = {
        _id: 'mongo-id-123',
        workflowId: 'wf-123',
        triggerType: 'recurring',
        scheduleConfig: {
          isActive: true,
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
        },
      };
      ScheduledWorkflow.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockWorkflow),
      });

      const mockNextDate = new Date('2026-01-01T00:00:00.000Z');
      parser.parseExpression.mockReturnValue({
        next: () => ({ toDate: () => mockNextDate }),
      });

      await cronManager.executeCronJob('wf-123');

      expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(mockWorkflow, 'scheduled', 'cron_job');
      expect(ScheduledWorkflow.updateOne).toHaveBeenCalledWith(
        { _id: 'mongo-id-123' },
        { nextExecution: mockNextDate }
      );
    });

    it('should catch and log errors during execution', async () => {
      ScheduledWorkflow.findOne.mockImplementation(() => {
        throw new Error('Database Crash');
      });

      await cronManager.executeCronJob('wf-123');

      expect(logger.error).toHaveBeenCalledWith(
        'Error executing cron job for workflow wf-123:',
        expect.any(Error)
      );
    });
  });

  describe('loadActiveWorkflows', () => {
    it('should load and schedule active workflows', async () => {
      const mockWorkflows = [
        { workflowId: 'wf-1', triggerType: 'recurring' },
        { workflowId: 'wf-2', triggerType: 'scheduled' },
      ];
      ScheduledWorkflow.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockWorkflows),
      });

      const scheduleSpy = vi.spyOn(cronManager, 'scheduleWorkflow').mockResolvedValue({ success: true });

      await cronManager.loadActiveWorkflows();

      expect(ScheduledWorkflow.find).toHaveBeenCalledWith({
        status: 'active',
        'scheduleConfig.isActive': true,
        triggerType: { $in: ['scheduled', 'recurring'] },
      });
      expect(scheduleSpy).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith('Loaded and scheduled 2 workflows');
    });

    it('should log error if loading active workflows fails', async () => {
      ScheduledWorkflow.find.mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error('Query Failed')),
      });

      await cronManager.loadActiveWorkflows();

      expect(logger.error).toHaveBeenCalledWith('Failed to load active workflows:', expect.any(Error));
    });
  });

  describe('setupCleanupJob', () => {
    it('should schedule cleanup job and process completed workflows', async () => {
      let capturedCallback;
      cron.schedule.mockImplementationOnce((expr, cb) => {
        capturedCallback = cb;
        return mockJob;
      });

      cronManager.setupCleanupJob();

      expect(cron.schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function), { timezone: 'UTC' });
      expect(capturedCallback).toBeDefined();

      const mockCompletedWorkflows = [
        { workflowId: 'wf-old-1' },
        { workflowId: 'wf-old-2' },
      ];
      ScheduledWorkflow.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCompletedWorkflows),
      });

      const unscheduleSpy = vi.spyOn(cronManager, 'unscheduleWorkflow').mockResolvedValue({ success: true });

      await capturedCallback();

      expect(ScheduledWorkflow.find).toHaveBeenCalledWith({
        triggerType: 'scheduled',
        status: 'completed',
        updatedAt: { $lt: expect.any(Date) },
      });
      expect(unscheduleSpy).toHaveBeenCalledWith('wf-old-1');
      expect(unscheduleSpy).toHaveBeenCalledWith('wf-old-2');
    });

    it('should log error if cleanup job fails', async () => {
      let capturedCallback;
      cron.schedule.mockImplementationOnce((expr, cb) => {
        capturedCallback = cb;
        return mockJob;
      });

      cronManager.setupCleanupJob();

      ScheduledWorkflow.find.mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error('Cleanup DB Error')),
      });

      await capturedCallback();

      expect(logger.error).toHaveBeenCalledWith('Error in cleanup job:', expect.any(Error));
    });
  });

  describe('setupHealthCheckJob', () => {
    it('should schedule health check job and log active jobs count', () => {
      let capturedCallback;
      cron.schedule.mockImplementationOnce((expr, cb) => {
        capturedCallback = cb;
        return mockJob;
      });

      cronManager.setupHealthCheckJob();

      expect(cron.schedule).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function), { timezone: 'UTC' });
      expect(capturedCallback).toBeDefined();

      cronManager.activeCronJobs.set('wf-1', {});
      capturedCallback();

      expect(logger.debug).toHaveBeenCalledWith('CronManager health check: 1 active jobs');
    });
  });

  describe('dateTimeToCron', () => {
    it('should convert Date object to cron expression correctly', () => {
      const testDate = new Date();
      const expected = `${testDate.getMinutes()} ${testDate.getHours()} ${testDate.getDate()} ${testDate.getMonth() + 1} *`;
      expect(cronManager.dateTimeToCron(testDate)).toBe(expected);
    });
  });

  describe('getNextExecutionTime', () => {
    it('should return next execution date from cron-parser', () => {
      const mockNextDate = new Date('2026-01-01T00:00:00.000Z');
      parser.parseExpression.mockReturnValueOnce({
        next: () => ({ toDate: () => mockNextDate }),
      });

      const result = cronManager.getNextExecutionTime('0 0 * * *', 'UTC');

      expect(result).toEqual(mockNextDate);
      expect(parser.parseExpression).toHaveBeenCalledWith('0 0 * * *', {
        currentDate: expect.any(Date),
        endDate: null,
        iterator: false,
        timezone: 'UTC',
      });
    });

    it('should return null and log error if parsing fails', () => {
      parser.parseExpression.mockImplementationOnce(() => {
        throw new Error('Parse Error');
      });

      const result = cronManager.getNextExecutionTime('invalid-cron');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Error parsing cron expression "invalid-cron" for next execution time:',
        expect.any(Error)
      );
    });
  });

  describe('getStatus', () => {
    it('should return correct status structure', () => {
      cronManager.isInitialized = true;
      cronManager.activeCronJobs.set('wf-123', {
        cronExpression: '0 0 * * *',
        description: 'Daily Job',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        job: { running: true },
      });

      const status = cronManager.getStatus();

      expect(status).toEqual({
        isInitialized: true,
        activeJobsCount: 1,
        jobs: [
          {
            workflowId: 'wf-123',
            cronExpression: '0 0 * * *',
            description: 'Daily Job',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            isRunning: true,
          },
        ],
      });
    });
  });

  describe('shutdown', () => {
    it('should stop and destroy all active jobs and clear map', async () => {
      const job1 = { stop: vi.fn(), destroy: vi.fn() };
      const job2 = { stop: vi.fn(), destroy: vi.fn() };

      cronManager.activeCronJobs.set('wf-1', { job: job1 });
      cronManager.activeCronJobs.set('wf-2', { job: job2 });
      cronManager.isInitialized = true;

      await cronManager.shutdown();

      expect(job1.stop).toHaveBeenCalled();
      expect(job1.destroy).toHaveBeenCalled();
      expect(job2.stop).toHaveBeenCalled();
      expect(job2.destroy).toHaveBeenCalled();
      expect(cronManager.activeCronJobs.size).toBe(0);
      expect(cronManager.isInitialized).toBe(false);
      expect(logger.info).toHaveBeenCalledWith('CronManager shutdown completed');
    });

    it('should log error if shutdown fails', async () => {
      cronManager.activeCronJobs.set('wf-1', null); // Will throw error on jobData.job.stop()

      await cronManager.shutdown();

      expect(logger.error).toHaveBeenCalledWith('Error during CronManager shutdown:', expect.any(Error));
    });
  });

  describe('triggerScheduledWorkflow', () => {
    it('should return failure if workflow is not found', async () => {
      ScheduledWorkflow.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const result = await cronManager.triggerScheduledWorkflow('wf-missing');

      expect(result).toEqual({
        success: false,
        error: 'Workflow not found',
      });
    });

    it('should execute workflow manually and return success', async () => {
      const mockWorkflow = { workflowId: 'wf-123' };
      ScheduledWorkflow.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockWorkflow),
      });
      workflowExecutor.executeWorkflow.mockResolvedValue({ executionId: 'exec-123' });

      const result = await cronManager.triggerScheduledWorkflow('wf-123');

      expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(mockWorkflow, 'manual', 'user_trigger');
      expect(result).toEqual({
        success: true,
        data: { executionId: 'exec-123' },
        message: 'Workflow triggered successfully',
      });
    });

    it('should return failure and log error if manual trigger throws', async () => {
      ScheduledWorkflow.findOne.mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error('DB Error')),
      });

      const result = await cronManager.triggerScheduledWorkflow('wf-123');

      expect(result).toEqual({
        success: false,
        error: 'DB Error',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error triggering scheduled workflow wf-123:',
        expect.any(Error)
      );
    });
  });
});