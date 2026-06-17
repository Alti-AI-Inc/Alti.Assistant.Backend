import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import Dataset from './datasets.model.js'; // We import this to get access to the schema

const {
  mockPubSub,
  mockTopic,
  mockPublishMessage,
  TEST_TOPIC_NAME
} = vi.hoisted(() => {
  const TEST_TOPIC_NAME = 'test-dataset-processing-topic';
  process.env.DATASET_PROCESSING_TOPIC = TEST_TOPIC_NAME;

  const mockPublishMessage = vi.fn();
  const mockTopic = vi.fn().mockImplementation(function() {
    return {
      publishMessage: mockPublishMessage,
    };
  });
  const mockPubSub = vi.fn().mockImplementation(function() {
    return {
      topic: mockTopic,
    };
  });

  return {
    mockPubSub,
    mockTopic,
    mockPublishMessage,
    TEST_TOPIC_NAME
  };
});

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: mockPubSub,
}));

describe('Dataset Model', () => {
  // Access the schema to test hooks directly
  const DatasetSchema = Dataset.schema;
  const preSaveHook = DatasetSchema.s.hooks._pres.get('save').find(hook => hook.fn.toString().includes('_wasNew')).fn;
  const postSaveHook = DatasetSchema.s.hooks._posts.get('save').find(hook => hook.fn.toString().includes('pubSubClient')).fn;

  beforeEach(() => {
    mockPublishMessage.mockClear();
    mockTopic.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Schema Definition', () => {
    it('should have the correct schema properties', () => {
      const paths = Object.keys(DatasetSchema.paths);
      expect(paths).toContain('datasetId');
      expect(paths).toContain('workspaceId');
      expect(paths).toContain('name');
      expect(paths).toContain('status');
      expect(paths).toContain('gcsBucket');
      expect(paths).toContain('sizeBytes');
      expect(DatasetSchema.paths.status.enumValues).toEqual(['pending', 'downloading', 'archived', 'indexing', 'indexed', 'failed']);
      expect(DatasetSchema.paths.status.options.default).toBe('pending');
    });

    it('should have correct indexes defined', () => {
      const indexes = DatasetSchema.indexes();
      // Check for text index
      const textIndex = indexes.find(idx => idx[1].name === 'DatasetTextIndex');
      expect(textIndex).toBeDefined();
      expect(textIndex[0]).toEqual({ datasetId: 'text', name: 'text', description: 'text' });
      expect(textIndex[1].weights).toEqual({ datasetId: 10, name: 5, description: 1 });

      // Check for compound indexes
      const workspaceStatusIndex = indexes.find(idx => idx[0].workspaceId === 1 && idx[0].status === 1);
      expect(workspaceStatusIndex).toBeDefined();

      const workspaceSizeIndex = indexes.find(idx => idx[0].workspaceId === 1 && idx[0].sizeBytes === 1);
      expect(workspaceSizeIndex).toBeDefined();
    });
  });

  describe('pre("save") hook', () => {
    it('should set _wasNew to true on a new document', () => {
      const mockDoc = { isNew: true };
      const next = vi.fn();
      preSaveHook.call(mockDoc, next);
      expect(mockDoc._wasNew).toBe(true);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should set _wasNew to false on an existing document', () => {
      const mockDoc = { isNew: false };
      const next = vi.fn();
      preSaveHook.call(mockDoc, next);
      expect(mockDoc._wasNew).toBe(false);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('post("save") hook', () => {
    const mockDoc = {
      _id: new mongoose.Types.ObjectId(),
      datasetId: 'test/dataset',
      status: 'pending',
    };

    it('should publish a message to Pub/Sub for a new, pending dataset', async () => {
      const context = { _wasNew: true }; // Simulating state from pre-hook
      mockPublishMessage.mockResolvedValue('mock-message-id-123');

      await postSaveHook.call(context, mockDoc);

      expect(mockPubSub).toHaveBeenCalledTimes(1);
      expect(mockTopic).toHaveBeenCalledWith(TEST_TOPIC_NAME);
      expect(mockPublishMessage).toHaveBeenCalledTimes(1);

      const expectedPayload = {
        datasetMongoId: mockDoc._id.toString(),
        datasetId: mockDoc.datasetId,
      };
      const expectedBuffer = Buffer.from(JSON.stringify(expectedPayload));
      expect(mockPublishMessage).toHaveBeenCalledWith({ data: expectedBuffer });

      expect(console.log).toHaveBeenCalledWith(
        `[Dataset Model] Job for dataset ${mockDoc.datasetId} published with message ID: mock-message-id-123`
      );
    });

    it('should NOT publish a message if the dataset is not new', async () => {
      const context = { _wasNew: false }; // Simulating an update
      await postSaveHook.call(context, mockDoc);

      expect(mockPublishMessage).not.toHaveBeenCalled();
    });

    it('should NOT publish a message if the dataset status is not "pending"', async () => {
      const context = { _wasNew: true };
      const nonPendingDoc = { ...mockDoc, status: 'indexed' };
      await postSaveHook.call(context, nonPendingDoc);

      expect(mockPublishMessage).not.toHaveBeenCalled();
    });

    it('should NOT publish a message if the dataset is not new AND status is not "pending"', async () => {
      const context = { _wasNew: false };
      const nonPendingDoc = { ...mockDoc, status: 'indexed' };
      await postSaveHook.call(context, nonPendingDoc);

      expect(mockPublishMessage).not.toHaveBeenCalled();
    });

    it('should log an error if publishing to Pub/Sub fails', async () => {
      const context = { _wasNew: true };
      const publishError = new Error('Failed to publish');
      mockPublishMessage.mockRejectedValue(publishError);

      await postSaveHook.call(context, mockDoc);

      expect(mockPublishMessage).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        `[Dataset Model] Failed to publish job for dataset ${mockDoc.datasetId}:`,
        publishError
      );
    });
  });
});