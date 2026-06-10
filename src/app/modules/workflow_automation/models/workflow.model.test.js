import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Workflow from './workflow.model'; // Adjust path as needed for your project structure

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Workflow Model', () => {
  // Clear the collection before each test to ensure isolation
  beforeEach(async () => {
    await Workflow.deleteMany({});
  });

  it('should create and save a workflow successfully with all valid fields', async () => {
    const userId = new mongoose.Types.ObjectId();
    const workflowData = {
      userId: userId,
      name: 'Test Workflow',
      description: 'A workflow for testing purposes',
      originalPrompt: 'Create a workflow to send daily emails',
      steps: [
        {
          stepId: 'step1',
          stepType: 'trigger',
          description: 'Start workflow',
          app: 'system',
          action: 'start',
          order: 1,
        },
        {
          stepId: 'step2',
          stepType: 'action',
          description: 'Send an email',
          app: 'gmail',
          action: 'send_email',
          parameters: {
            to: 'test@example.com',
            subject: 'Hello from Workflow',
            body: 'This is a test email.',
          },
          order: 2,
          requireApproval: true,
        },
      ],
      trigger: {
        triggerType: 'schedule',
        scheduleConfig: {
          frequency: 'daily',
          time: '09:00',
          timezone: 'America/New_York',
          daysOfWeek: [1, 2, 3, 4, 5],
        },
      },
      status: 'active',
      isTemplate: false,
      category: 'email',
      requiredApps: [
        { app: 'gmail', connected: true, authConfigId: 'auth123' },
      ],
      executionCount: 5,
      lastExecuted: new Date(),
      nextExecution: new Date(Date.now() + 86400000), // Tomorrow
      metadata: { key: 'value' },
    };

    const workflow = new Workflow(workflowData);
    const savedWorkflow = await workflow.save();

    expect(savedWorkflow._id).toBeDefined();
    expect(savedWorkflow.userId.toString()).toBe(userId.toString());
    expect(savedWorkflow.name).toBe(workflowData.name);
    expect(savedWorkflow.description).toBe(workflowData.description);
    expect(savedWorkflow.originalPrompt).toBe(workflowData.originalPrompt);
    expect(savedWorkflow.steps).toHaveLength(2);
    expect(savedWorkflow.steps[0].stepId).toBe('step1');
    expect(savedWorkflow.steps[1].requireApproval).toBe(true);
    expect(savedWorkflow.trigger.triggerType).toBe('schedule');
    expect(savedWorkflow.trigger.scheduleConfig.frequency).toBe('daily');
    expect(savedWorkflow.status).toBe('active');
    expect(savedWorkflow.isTemplate).toBe(false);
    expect(savedWorkflow.category).toBe('email');
    expect(savedWorkflow.requiredApps).toHaveLength(1);
    expect(savedWorkflow.requiredApps[0].app).toBe('gmail');
    expect(savedWorkflow.requiredApps[0].connected).toBe(true);
    expect(savedWorkflow.requiredApps[0].authConfigId).toBe('auth123');
    expect(savedWorkflow.executionCount).toBe(5);
    expect(savedWorkflow.lastExecuted).toBeInstanceOf(Date);
    expect(savedWorkflow.nextExecution).toBeInstanceOf(Date);
    expect(savedWorkflow.metadata).toEqual({ key: 'value' });
    expect(savedWorkflow.createdAt).toBeInstanceOf(Date);
    expect(savedWorkflow.updatedAt).toBeInstanceOf(Date);
    expect(savedWorkflow.createdAt).not.toBeNull();
    expect(savedWorkflow.updatedAt).not.toBeNull();
  });

  it('should apply default values for optional fields', async () => {
    const userId = new mongoose.Types.ObjectId();
    const workflowData = {
      userId: userId,
      name: 'Workflow with Defaults',
      originalPrompt: 'Simple workflow',
      steps: [
        {
          stepId: 's1',
          stepType: 'action',
          description: 'Default step',
          app: 'test',
          action: 'do_something',
          order: 1,
        },
      ],
      trigger: {
        triggerType: 'manual',
      },
    };

    const workflow = new Workflow(workflowData);
    const savedWorkflow = await workflow.save();

    expect(savedWorkflow.status).toBe('active');
    expect(savedWorkflow.isTemplate).toBe(false);
    expect(savedWorkflow.category).toBe('other');
    expect(savedWorkflow.executionCount).toBe(0);
    expect(savedWorkflow.metadata).toEqual({});
    expect(savedWorkflow.steps[0].parameters).toEqual({});
    expect(savedWorkflow.steps[0].conditions).toEqual({});
    expect(savedWorkflow.steps[0].requireApproval).toBe(false);
    expect(savedWorkflow.trigger.scheduleConfig.timezone).toBe('UTC'); // Default for nested schema
    expect(savedWorkflow.requiredApps).toEqual([]); // Default for array
  });

  it('should fail to save if required fields are missing', async () => {
    const workflowData = {
      name: 'Missing User ID', // userId is missing
      originalPrompt: 'Test',
      steps: [],
      trigger: { triggerType: 'manual' },
    };
    const workflow = new Workflow(workflowData);
    await expect(workflow.save()).rejects.toThrow(
      'Workflow validation failed: userId: Path `userId` is required.'
    );
  });

  it('should fail to save if step required fields are missing', async () => {
    const userId = new mongoose.Types.ObjectId();
    const workflowData = {
      userId: userId,
      name: 'Invalid Step Workflow',
      originalPrompt: 'Test',
      steps: [
        {
          stepId: 's1',
          stepType: 'action',
          description: 'Missing app',
          // app is missing
          action: 'do_something',
          order: 1,
        },
      ],
      trigger: { triggerType: 'manual' },
    };
    const workflow = new Workflow(workflowData);
    await expect(workflow.save()).rejects.toThrow(
      'Workflow validation failed: steps.0.app: Path `app` is required.'
    );
  });

  it('should fail to save if triggerType is invalid', async () => {
    const userId = new mongoose.Types.ObjectId();
    const workflowData = {
      userId: userId,
      name: 'Invalid Trigger Type',
      originalPrompt: 'Test',
      steps: [],
      trigger: {
        triggerType: 'invalid_type', // Invalid enum value
      },
    };
    const workflow = new Workflow(workflowData);
    await expect(workflow.save()).rejects.toThrow(
      'Workflow validation failed: trigger.triggerType: `invalid_type` is not a valid enum value for path `triggerType`.'
    );
  });

  it('should fail to save if stepType is invalid', async () => {
    const userId = new mongoose.Types.ObjectId();
    const workflowData = {
      userId: userId,
      name: 'Invalid Step Type',
      originalPrompt: 'Test',
      steps: [
        {
          stepId: 's1',
          stepType: 'invalid_step_type', // Invalid enum value
          description: 'Invalid step',
          app: 'test',
          action: 'do_something',
          order: 1,
        },
      ],
      trigger: { triggerType: 'manual' },
    };
    const workflow = new Workflow(workflowData);
    await expect(workflow.save()).rejects.toThrow(
      'Workflow validation failed: steps.0.stepType: `invalid_step_type` is not a valid enum value for path `stepType`.'
    );
  });

  it('should fail to save if status is invalid', async () => {
    const userId = new mongoose.Types.ObjectId();
    const workflowData = {
      userId: userId,
      name: 'Invalid Status',
      originalPrompt: 'Test',
      steps: [],
      trigger: { triggerType: 'manual' },
      status: 'non_existent_status', // Invalid enum value
    };
    const workflow = new Workflow(workflowData);
    await expect(workflow.save()).rejects.toThrow(
      'Workflow validation failed: status: `non_existent_status` is not a valid enum value for path `status`.'
    );
  });

  it('should fail to save if category is invalid', async () => {
    const userId = new mongoose.Types.ObjectId();
    const workflowData = {
      userId: userId,
      name: 'Invalid Category',
      originalPrompt: 'Test',
      steps: [],
      trigger: { triggerType: 'manual' },
      category: 'unlisted_category', // Invalid enum value
    };
    const workflow = new Workflow(workflowData);
    await expect(workflow.save()).rejects.toThrow(
      'Workflow validation failed: category: `unlisted_category` is not a valid enum value for path `category`.'
    );
  });

  it('should find a workflow by userId and status', async () => {
    const userId1 = new mongoose.Types.ObjectId();
    const userId2 = new mongoose.Types.ObjectId();

    await Workflow.create({
      userId: userId1,
      name: 'Workflow 1',
      originalPrompt: 'Prompt 1',
      steps: [{ stepId: 's1', stepType: 'action', description: 'd', app: 'a', action: 'x', order: 1 }],
      trigger: { triggerType: 'manual' },
      status: 'active',
    });
    await Workflow.create({
      userId: userId1,
      name: 'Workflow 2',
      originalPrompt: 'Prompt 2',
      steps: [{ stepId: 's1', stepType: 'action', description: 'd', app: 'a', action: 'x', order: 1 }],
      trigger: { triggerType: 'manual' },
      status: 'paused',
    });
    await Workflow.create({
      userId: userId2,
      name: 'Workflow 3',
      originalPrompt: 'Prompt 3',
      steps: [{ stepId: 's1', stepType: 'action', description: 'd', app: 'a', action: 'x', order: 1 }],
      trigger: { triggerType: 'manual' },
      status: 'active',
    });

    const activeWorkflowsForUser1 = await Workflow.find({ userId: userId1, status: 'active' });
    expect(activeWorkflowsForUser1).toHaveLength(1);
    expect(activeWorkflowsForUser1[0].name).toBe('Workflow 1');

    const allWorkflowsForUser1 = await Workflow.find({ userId: userId1 });
    expect(allWorkflowsForUser1).toHaveLength(2);
  });

  it('should find workflows by nextExecution and status', async () => {
    const userId = new mongoose.Types.ObjectId();
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    await Workflow.create({
      userId: userId,
      name: 'Scheduled Active',
      originalPrompt: 'Prompt',
      steps: [{ stepId: 's1', stepType: 'action', description: 'd', app: 'a', action: 'x', order: 1 }],
      trigger: { triggerType: 'schedule' },
      status: 'active',
      nextExecution: tomorrow,
    });
    await Workflow.create({
      userId: userId,
      name: 'Scheduled Paused',
      originalPrompt: 'Prompt',
      steps: [{ stepId: 's1', stepType: 'action', description: 'd', app: 'a', action: 'x', order: 1 }],
      trigger: { triggerType: 'schedule' },
      status: 'paused',
      nextExecution: tomorrow,
    });
    await Workflow.create({
      userId: userId,
      name: 'Scheduled Active Past',
      originalPrompt: 'Prompt',
      steps: [{ stepId: 's1', stepType: 'action', description: 'd', app: 'a', action: 'x', order: 1 }],
      trigger: { triggerType: 'schedule' },
      status: 'active',
      nextExecution: yesterday,
    });

    const workflowsToExecute = await Workflow.find({
      nextExecution: { $lte: tomorrow },
      status: 'active',
    });

    expect(workflowsToExecute).toHaveLength(2); // 'Scheduled Active' and 'Scheduled Active Past'
    expect(workflowsToExecute.some(w => w.name === 'Scheduled Active')).toBe(true);
    expect(workflowsToExecute.some(w => w.name === 'Scheduled Active Past')).toBe(true);
  });

  it('should find workflows by userId and category', async () => {
    const userId1 = new mongoose.Types.ObjectId();
    const userId2 = new mongoose.Types.ObjectId();

    await Workflow.create({
      userId: userId1,
      name: 'Email Workflow',
      originalPrompt: 'Prompt',
      steps: [{ stepId: 's1', stepType: 'action', description: 'd', app: 'a', action: 'x', order: 1 }],
      trigger: { triggerType: 'manual' },
      category: 'email',
    });
    await Workflow.create({
      userId: userId1,
      name: 'Social Workflow',
      originalPrompt: 'Prompt',
      steps: [{ stepId: 's1', stepType: 'action', description: 'd', app: 'a', action: 'x', order: 1 }],
      trigger: { triggerType: 'manual' },
      category: 'social',
    });
    await Workflow.create({
      userId: userId2,
      name: 'Email Workflow 2',
      originalPrompt: 'Prompt',
      steps: [{ stepId: 's1', stepType: 'action', description: 'd', app: 'a', action: 'x', order: 1 }],
      trigger: { triggerType: 'manual' },
      category: 'email',
    });

    const emailWorkflowsForUser1 = await Workflow.find({ userId: userId1, category: 'email' });
    expect(emailWorkflowsForUser1).toHaveLength(1);
    expect(emailWorkflowsForUser1[0].name).toBe('Email Workflow');

    const socialWorkflowsForUser1 = await Workflow.find({ userId: userId1, category: 'social' });
    expect(socialWorkflowsForUser1).toHaveLength(1);
    expect(socialWorkflowsForUser1[0].name).toBe('Social Workflow');
  });
});