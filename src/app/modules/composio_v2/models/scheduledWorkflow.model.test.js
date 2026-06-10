import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import ScheduledWorkflow from './scheduledWorkflow.model.js';

// Mock the mongoose model methods that would interact with the DB
const mockSave = vi.fn().mockImplementation(function () {
  return Promise.resolve(this);
});

const mockFind = vi.fn();
const mockSort = vi.fn();

mockFind.mockReturnValue({ sort: mockSort });
mockSort.mockReturnValue(Promise.resolve([]));

vi.mock('mongoose', async () => {
  const actualMongoose = await vi.importActual('mongoose');
  return {
    ...actualMongoose,
    default: {
      ...actualMongoose.default,
      model: vi.fn().mockImplementation((name, schema) => {
        // Add the mocked methods to the schema
        schema.methods.save = mockSave;
        schema.statics.find = mockFind;
        // Return a "real" model but with mocked DB methods
        return actualMongoose.default.model(name, schema);
      }),
    },
  };
});

describe('ScheduledWorkflow Mongoose Model', () => {
  let baseWorkflowData;
  const userId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    baseWorkflowData = {
      workflowId: `workflow_${Date.now()}`,
      userId: userId,
      title: 'Test Workflow',
      workflowType: 'single_step',
      requiredApps: ['gmail'],
      totalSteps: 1,
      originalUserInput: 'Send an email',
      executionPlan: [
        {
          step: 1,
          app: 'gmail',
          action: 'send_email',
          parameters: { to: 'test@example.com', subject: 'Hello' },
        },
      ],
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Schema Definition and Validation', () => {
    it('should be invalid if required fields are missing', async () => {
      const workflow = new ScheduledWorkflow({});
      const err = await workflow.validate().catch(e => e);
      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.workflowId).toBeDefined();
      expect(err.errors.userId).toBeDefined();
      expect(err.errors.title).toBeDefined();
      expect(err.errors.workflowType).toBeDefined();
      expect(err.errors.requiredApps).toBeDefined();
      expect(err.errors.totalSteps).toBeDefined();
      expect(err.errors.originalUserInput).toBeDefined();
    });

    it('should set default values correctly', () => {
      const workflow = new ScheduledWorkflow(baseWorkflowData);
      expect(workflow.triggerType).toBe('manual');
      expect(workflow.status).toBe('pending');
      expect(workflow.executionCount).toBe(0);
      expect(workflow.successCount).toBe(0);
      expect(workflow.failureCount).toBe(0);
      expect(workflow.isTemplate).toBe(false);
      expect(workflow.createdBy).toBe('ai_classification_system');
      expect(workflow.scheduleConfig.timezone).toBe('UTC');
      expect(workflow.scheduleConfig.isActive).toBe(true);
    });

    it('should enforce enum values', async () => {
      const workflow = new ScheduledWorkflow({
        ...baseWorkflowData,
        workflowType: 'invalid_type',
        triggerType: 'invalid_trigger',
        status: 'invalid_status',
      });
      const err = await workflow.validate().catch(e => e);
      expect(err.errors.workflowType).toBeDefined();
      expect(err.errors.triggerType).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });

    it('should enforce min value for totalSteps', async () => {
      const workflow = new ScheduledWorkflow({ ...baseWorkflowData, totalSteps: 0 });
      const err = await workflow.validate().catch(e => e);
      expect(err.errors.totalSteps).toBeDefined();
      expect(err.errors.totalSteps.kind).toBe('min');
    });
  });

  describe('Virtuals', () => {
    describe('successRate', () => {
      it('should return 0 when executionCount is 0', () => {
        const workflow = new ScheduledWorkflow(baseWorkflowData);
        expect(workflow.successRate).toBe(0);
      });

      it('should calculate the success rate correctly', () => {
        const workflow = new ScheduledWorkflow({
          ...baseWorkflowData,
          executionCount: 10,
          successCount: 7,
        });
        expect(workflow.successRate).toBe(70);
      });

      it('should round the success rate', () => {
        const workflow = new ScheduledWorkflow({
          ...baseWorkflowData,
          executionCount: 3,
          successCount: 1,
        });
        expect(workflow.successRate).toBe(33);
      });
    });

    describe('nextExecutionDisplay', () => {
      it('should return "Not scheduled" when nextExecution is not set', () => {
        const workflow = new ScheduledWorkflow(baseWorkflowData);
        expect(workflow.nextExecutionDisplay).toBe('Not scheduled');
      });

      it('should return a formatted date string when nextExecution is set', () => {
        const date = new Date();
        const workflow = new ScheduledWorkflow({ ...baseWorkflowData, nextExecution: date });
        expect(workflow.nextExecutionDisplay).toBe(date.toLocaleString());
      });
    });
  });

  describe('Instance Methods', () => {
    describe('updateExecutionStats', () => {
      it('should handle successful manual execution', async () => {
        const workflow = new ScheduledWorkflow({ ...baseWorkflowData, triggerType: 'manual' });
        const initialExecutionCount = workflow.executionCount;
        const initialSuccessCount = workflow.successCount;

        await workflow.updateExecutionStats(true);

        expect(workflow.executionCount).toBe(initialExecutionCount + 1);
        expect(workflow.successCount).toBe(initialSuccessCount + 1);
        expect(workflow.status).toBe('completed');
        expect(workflow.lastExecution).toBeInstanceOf(Date);
        expect(mockSave).toHaveBeenCalledTimes(1);
      });

      it('should handle failed manual execution', async () => {
        const workflow = new ScheduledWorkflow({ ...baseWorkflowData, triggerType: 'manual' });
        const initialFailureCount = workflow.failureCount;

        await workflow.updateExecutionStats(false);

        expect(workflow.failureCount).toBe(initialFailureCount + 1);
        expect(workflow.status).toBe('failed');
        expect(mockSave).toHaveBeenCalledTimes(1);
      });

      it('should handle successful recurring execution', async () => {
        const workflow = new ScheduledWorkflow({
          ...baseWorkflowData,
          triggerType: 'recurring',
          status: 'active',
        });
        await workflow.updateExecutionStats(true);

        expect(workflow.successCount).toBe(1);
        expect(workflow.status).toBe('active'); // Status should not change
        expect(mockSave).toHaveBeenCalledTimes(1);
      });

      it('should handle failed recurring execution', async () => {
        const workflow = new ScheduledWorkflow({
          ...baseWorkflowData,
          triggerType: 'recurring',
          status: 'active',
        });
        await workflow.updateExecutionStats(false);

        expect(workflow.failureCount).toBe(1);
        expect(workflow.status).toBe('active'); // Status should not change
        expect(mockSave).toHaveBeenCalledTimes(1);
      });
    });

    describe('pause', () => {
      it('should set status to "paused" and deactivate schedule', async () => {
        const workflow = new ScheduledWorkflow({ ...baseWorkflowData, status: 'active' });
        await workflow.pause();

        expect(workflow.status).toBe('paused');
        expect(workflow.scheduleConfig.isActive).toBe(false);
        expect(mockSave).toHaveBeenCalledTimes(1);
      });
    });

    describe('resume', () => {
      it('should set status to "active" and activate schedule', async () => {
        const workflow = new ScheduledWorkflow({
          ...baseWorkflowData,
          status: 'paused',
          scheduleConfig: { isActive: false },
        });
        await workflow.resume();

        expect(workflow.status).toBe('active');
        expect(workflow.scheduleConfig.isActive).toBe(true);
        expect(mockSave).toHaveBeenCalledTimes(1);
      });
    });

    describe('cancel', () => {
      it('should set status to "cancelled" and deactivate schedule', async () => {
        const workflow = new ScheduledWorkflow({ ...baseWorkflowData, status: 'active' });
        await workflow.cancel();

        expect(workflow.status).toBe('cancelled');
        expect(workflow.scheduleConfig.isActive).toBe(false);
        expect(mockSave).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Static Methods', () => {
    describe('findByUser', () => {
      it('should find workflows by userId without status', async () => {
        await ScheduledWorkflow.findByUser(userId);
        expect(mockFind).toHaveBeenCalledWith({ userId });
        expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
      });

      it('should find workflows by userId and status', async () => {
        const status = 'active';
        await ScheduledWorkflow.findByUser(userId, status);
        expect(mockFind).toHaveBeenCalledWith({ userId, status });
        expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
      });
    });

    describe('findDueForExecution', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should query for active, scheduled workflows due for execution', async () => {
        const now = new Date();
        vi.setSystemTime(now);

        await ScheduledWorkflow.findDueForExecution();

        expect(mockFind).toHaveBeenCalledWith({
          status: 'active',
          'scheduleConfig.isActive': true,
          nextExecution: { $lte: now },
        });
      });
    });

    describe('generateWorkflowId', () => {
      it('should generate a string starting with "workflow_"', () => {
        const id = ScheduledWorkflow.generateWorkflowId();
        expect(typeof id).toBe('string');
        expect(id.startsWith('workflow_')).toBe(true);
      });

      it('should generate unique IDs', () => {
        const id1 = ScheduledWorkflow.generateWorkflowId();
        const id2 = ScheduledWorkflow.generateWorkflowId();
        expect(id1).not.toBe(id2);
      });
    });
  });
});