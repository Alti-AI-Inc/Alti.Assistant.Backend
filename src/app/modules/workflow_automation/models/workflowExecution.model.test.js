import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

const {
  mockPubSubClient,
  mockPublishMessage,
  mockTopic,
} = vi.hoisted(() => {
  const mockPublishMessage = vi.fn();
  const mockTopic = vi.fn().mockImplementation(() => ({
    publishMessage: mockPublishMessage,
  }));
  const mockPubSubClient = {
    topic: mockTopic,
  };

  return {
    mockPubSubClient,
    mockPublishMessage,
    mockTopic,
  };
});

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn(function () {
    return mockPubSubClient;
  }),
}));

const postSaveCallbacks = [];
const preSaveCallbacks = [];

vi.mock('mongoose', async (importOriginal) => {
  const originalMongoose = await importOriginal();

  const Schema = vi.fn(function (schemaDef) {
    this.pre = (event, callback) => {
      if (event === 'save') {
        preSaveCallbacks.push(callback);
      }
    };
    this.post = (event, callback) => {
      if (event === 'save') {
        postSaveCallbacks.push(callback);
      }
    };
    this.index = vi.fn();
  });

  Schema.Types = originalMongoose.Schema.Types;

  const model = vi.fn().mockImplementation(() => {
    return class MockModel {
      constructor(data) {
        this.isNew = true;
        Object.assign(this, data);
        this._id = data._id || new originalMongoose.Types.ObjectId();
        this.workflowId = new originalMongoose.Types.ObjectId(data.workflowId);
        this.workspaceId = new originalMongoose.Types.ObjectId(data.workspaceId);
        this.userId = new originalMongoose.Types.ObjectId(data.userId);
      }

      async save() {
        // 1. Run 'pre' hooks
        for (const cb of preSaveCallbacks) {
          // Mongoose 'pre' hooks are called with a 'next' function
          await new Promise(resolve => cb.call(this, resolve));
        }

        // The 'pre' hook should have set `this._wasNew`
        // Simulate the save operation completing

        // 2. Run 'post' hooks
        for (const cb of postSaveCallbacks) {
          // Mongoose 'post' hooks are called with the doc
          await cb.call(this);
        }

        // After the first save, the document is no longer new
        this.isNew = false;
        return this;
      }
    };
  });

  return {
    ...originalMongoose,
    default: {
      ...originalMongoose.default,
      Schema,
      model,
      models: {},
    },
    Schema,
    model,
    models: {},
  };
});

describe('WorkflowExecution Model', () => {
  let WorkflowExecution;
  let consoleErrorSpy;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Set env var for topic name
    process.env.WORKFLOW_EXECUTION_TOPIC = 'test-workflow-execution-topic';

    // Dynamically import the model to apply the mocks
    const modelModule = await import('./workflowExecution.model.js');
    WorkflowExecution = modelModule.default;

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.WORKFLOW_EXECUTION_TOPIC;
  });

  const createExecutionData = (overrides = {}) => ({
    workflowId: new mongoose.Types.ObjectId().toString(),
    workspaceId: new mongoose.Types.ObjectId().toString(),
    userId: new mongoose.Types.ObjectId().toString(),
    executionId: `exec_${Date.now()}`,
    status: 'pending',
    triggerType: 'manual',
    ...overrides,
  });

  it('should publish a Pub/Sub message when a new "pending" execution is created', async () => {
    const data = createExecutionData({ status: 'pending' });
    const execution = new WorkflowExecution(data);
    await execution.save();

    expect(mockTopic).toHaveBeenCalledWith('test-workflow-execution-topic');
    expect(mockPublishMessage).toHaveBeenCalledTimes(1);
  });

  it('should publish a Pub/Sub message when a new "awaiting_approval" execution is created', async () => {
    const data = createExecutionData({ status: 'awaiting_approval' });
    const execution = new WorkflowExecution(data);
    await execution.save();

    expect(mockTopic).toHaveBeenCalledWith('test-workflow-execution-topic');
    expect(mockPublishMessage).toHaveBeenCalledTimes(1);
  });

  it('should NOT publish a message when a new execution with a non-triggering status is created', async () => {
    const data = createExecutionData({ status: 'completed' });
    const execution = new WorkflowExecution(data);
    await execution.save();

    expect(mockPublishMessage).not.toHaveBeenCalled();
  });

  it('should NOT publish a message when an existing execution is updated', async () => {
    const data = createExecutionData({ status: 'pending' });
    const execution = new WorkflowExecution(data);

    // First save (creation)
    await execution.save();
    expect(mockPublishMessage).toHaveBeenCalledTimes(1);

    // Second save (update)
    execution.status = 'running';
    await execution.save();

    // Should not be called again
    expect(mockPublishMessage).toHaveBeenCalledTimes(1);
  });

  it('should publish a message with the correct payload, including workspaceId for context boundaries', async () => {
    const data = createExecutionData({ status: 'pending' });
    const execution = new WorkflowExecution(data);
    await execution.save();

    expect(mockPublishMessage).toHaveBeenCalledTimes(1);
    
    const call = mockPublishMessage.mock.calls[0][0];
    expect(call).toHaveProperty('data');
    expect(call.data).toBeInstanceOf(Buffer);

    const payload = JSON.parse(call.data.toString());

    expect(payload).toEqual({
      executionId: data.executionId,
      workflowId: data.workflowId.toString(),
      workspaceId: data.workspaceId.toString(),
      status: 'pending',
    });
  });

  it('should log a fatal error and not throw if Pub/Sub publishing fails', async () => {
    const publishError = new Error('Pub/Sub is down');
    mockPublishMessage.mockRejectedValue(publishError);

    const data = createExecutionData({ status: 'pending' });
    const execution = new WorkflowExecution(data);

    // The save operation should complete without throwing an error
    await expect(execution.save()).resolves.toBeDefined();

    // But a fatal error should be logged
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`FATAL: Failed to publish start event for executionId ${data.executionId}`),
      publishError
    );
  });
});