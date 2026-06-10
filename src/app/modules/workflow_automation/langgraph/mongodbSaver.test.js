import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MongoDBSaver } from './mongodbSaver.js';

// Mock WorkflowCheckpoint model
const mockWorkflowCheckpoint = {
  findOne: vi.fn(),
  find: vi.fn(() => ({
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  })),
  updateOne: vi.fn(),
};

// Mock logger
const mockLogger = {
  error: vi.fn(),
};

// Mock BaseCheckpointSaver and its serde property
// MongoDBSaver extends BaseCheckpointSaver, and relies on `this.serde`
// being available and having `parse` and `stringify` methods.
class MockBaseCheckpointSaver {
  constructor() {
    this.serde = {
      parse: vi.fn(str => JSON.parse(str)),
      stringify: vi.fn(obj => JSON.stringify(obj)),
    };
  }
}

// Replace the actual imports with mocks
vi.mock('../models/workflowCheckpoint.model.js', () => ({
  default: mockWorkflowCheckpoint,
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('@langchain/langgraph', () => ({
  BaseCheckpointSaver: MockBaseCheckpointSaver,
}));


describe('MongoDBSaver', () => {
  let saver;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    saver = new MongoDBSaver();
    // Ensure serde mocks are available on the instance and reset for each test
    saver.serde = {
      parse: vi.fn(str => JSON.parse(str)),
      stringify: vi.fn(obj => JSON.stringify(obj)),
    };
  });

  describe('constructor', () => {
    it('should instantiate correctly and inherit from BaseCheckpointSaver', () => {
      expect(saver).toBeInstanceOf(MongoDBSaver);
      expect(saver.serde).toBeDefined();
      expect(saver.serde.parse).toBeInstanceOf(Function);
      expect(saver.serde.stringify).toBeInstanceOf(Function);
    });
  });

  describe('getTuple', () => {
    it('should return undefined if thread_id is missing', async () => {
      const config = { configurable: {} };
      const result = await saver.getTuple(config);
      expect(result).toBeUndefined();
      expect(mockWorkflowCheckpoint.findOne).not.toHaveBeenCalled();
      expect(mockWorkflowCheckpoint.find).not.toHaveBeenCalled();
    });

    it('should find a specific checkpoint if checkpoint_id is provided', async () => {
      const mockDoc = {
        threadId: 'thread123',
        checkpointId: 'chk456',
        checkpointStr: '{"state":"specific"}',
        metadataStr: '{"meta":"specific"}',
      };
      mockWorkflowCheckpoint.findOne.mockResolvedValue(mockDoc);

      const config = { configurable: { thread_id: 'thread123', checkpoint_id: 'chk456' } };
      const result = await saver.getTuple(config);

      expect(mockWorkflowCheckpoint.findOne).toHaveBeenCalledWith({
        threadId: 'thread123',
        checkpointId: 'chk456',
      });
      expect(mockWorkflowCheckpoint.find).not.toHaveBeenCalled();
      expect(saver.serde.parse).toHaveBeenCalledTimes(2);
      expect(saver.serde.parse).toHaveBeenCalledWith(mockDoc.checkpointStr);
      expect(saver.serde.parse).toHaveBeenCalledWith(mockDoc.metadataStr);
      expect(result).toEqual({
        config: {
          configurable: {
            thread_id: 'thread123',
            checkpoint_id: 'chk456',
          },
        },
        checkpoint: { state: 'specific' },
        metadata: { meta: 'specific' },
      });
    });

    it('should find the latest checkpoint if checkpoint_id is not provided', async () => {
      const mockDoc = {
        threadId: 'thread123',
        checkpointId: 'chk789',
        checkpointStr: '{"state":"latest"}',
        metadataStr: '{"meta":"latest"}',
      };
      const mockFindResult = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([mockDoc]),
      };
      mockWorkflowCheckpoint.find.mockReturnValue(mockFindResult);

      const config = { configurable: { thread_id: 'thread123' } };
      const result = await saver.getTuple(config);

      expect(mockWorkflowCheckpoint.findOne).not.toHaveBeenCalled();
      expect(mockWorkflowCheckpoint.find).toHaveBeenCalledWith({ threadId: 'thread123' });
      expect(mockFindResult.sort).toHaveBeenCalledWith({ checkpointId: -1 });
      expect(mockFindResult.limit).toHaveBeenCalledWith(1);
      expect(mockFindResult.exec).toHaveBeenCalled();
      expect(saver.serde.parse).toHaveBeenCalledTimes(2);
      expect(saver.serde.parse).toHaveBeenCalledWith(mockDoc.checkpointStr);
      expect(saver.serde.parse).toHaveBeenCalledWith(mockDoc.metadataStr);
      expect(result).toEqual({
        config: {
          configurable: {
            thread_id: 'thread123',
            checkpoint_id: 'chk789',
          },
        },
        checkpoint: { state: 'latest' },
        metadata: { meta: 'latest' },
      });
    });

    it('should return undefined if no document is found (specific ID)', async () => {
      mockWorkflowCheckpoint.findOne.mockResolvedValue(null);

      const configWithId = { configurable: { thread_id: 'thread123', checkpoint_id: 'nonexistent' } };
      const resultWithId = await saver.getTuple(configWithId);
      expect(resultWithId).toBeUndefined();
      expect(mockWorkflowCheckpoint.findOne).toHaveBeenCalledWith({
        threadId: 'thread123',
        checkpointId: 'nonexistent',
      });
      expect(saver.serde.parse).not.toHaveBeenCalled();
    });

    it('should return undefined if no document is found (latest)', async () => {
      const mockFindResult = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      };
      mockWorkflowCheckpoint.find.mockReturnValue(mockFindResult);

      const configWithoutId = { configurable: { thread_id: 'thread123' } };
      const resultWithoutId = await saver.getTuple(configWithoutId);
      expect(resultWithoutId).toBeUndefined();
      expect(mockWorkflowCheckpoint.find).toHaveBeenCalledWith({ threadId: 'thread123' });
      expect(mockFindResult.sort).toHaveBeenCalledWith({ checkpointId: -1 });
      expect(mockFindResult.limit).toHaveBeenCalledWith(1);
      expect(mockFindResult.exec).toHaveBeenCalled();
      expect(saver.serde.parse).not.toHaveBeenCalled();
    });

    it('should log and re-throw errors during database operations', async () => {
      const error = new Error('DB connection failed');
      mockWorkflowCheckpoint.findOne.mockRejectedValue(error);

      const config = { configurable: { thread_id: 'thread123', checkpoint_id: 'chk456' } };
      await expect(saver.getTuple(config)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith('Error in MongoDBSaver.getTuple:', error);
    });
  });

  describe('put', () => {
    it('should throw an error if thread_id is missing', async () => {
      const config = { configurable: {} };
      const checkpoint = { id: 'chk1', state: 'initial' };
      const metadata = { user: 'test' };

      await expect(saver.put(config, checkpoint, metadata)).rejects.toThrow(
        'thread_id is required in config to persist checkpoint'
      );
      expect(mockWorkflowCheckpoint.updateOne).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should call WorkflowCheckpoint.updateOne with correct arguments for upsert', async () => {
      const config = { configurable: { thread_id: 'thread123' } };
      const checkpoint = { id: 'chk1', state: 'initial' };
      const metadata = { user: 'test' };
      const expectedCheckpointStr = JSON.stringify(checkpoint);
      const expectedMetadataStr = JSON.stringify(metadata);

      mockWorkflowCheckpoint.updateOne.mockResolvedValue({ acknowledged: true, upsertedId: 'newId' });

      const result = await saver.put(config, checkpoint, metadata);

      expect(saver.serde.stringify).toHaveBeenCalledTimes(2);
      expect(saver.serde.stringify).toHaveBeenCalledWith(checkpoint);
      expect(saver.serde.stringify).toHaveBeenCalledWith(metadata);
      expect(mockWorkflowCheckpoint.updateOne).toHaveBeenCalledWith(
        { threadId: 'thread123', checkpointId: 'chk1' },
        {
          $set: {
            checkpointStr: expectedCheckpointStr,
            metadataStr: expectedMetadataStr,
          },
        },
        { upsert: true }
      );
      expect(result).toEqual({
        configurable: {
          thread_id: 'thread123',
          checkpoint_id: 'chk1',
        },
      });
    });

    it('should log and re-throw errors during database operations', async () => {
      const error = new Error('DB write failed');
      mockWorkflowCheckpoint.updateOne.mockRejectedValue(error);

      const config = { configurable: { thread_id: 'thread123' } };
      const checkpoint = { id: 'chk1', state: 'initial' };
      const metadata = { user: 'test' };

      await expect(saver.put(config, checkpoint, metadata)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith('Error in MongoDBSaver.put:', error);
    });
  });

  describe('list', () => {
    it('should return an empty generator if thread_id is missing', async () => {
      const config = { configurable: {} };
      const generator = saver.list(config);
      const result = await generator.next();
      expect(result.done).toBe(true);
      expect(mockWorkflowCheckpoint.find).not.toHaveBeenCalled();
    });

    it('should query for checkpoints by thread_id and yield results', async () => {
      const mockDocs = [
        {
          threadId: 'thread123',
          checkpointId: 'chk3',
          checkpointStr: '{"state":"c3"}',
          metadataStr: '{"meta":"m3"}',
        },
        {
          threadId: 'thread123',
          checkpointId: 'chk2',
          checkpointStr: '{"state":"c2"}',
          metadataStr: '{"meta":"m2"}',
        },
      ];
      const mockFindResult = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockDocs),
      };
      mockWorkflowCheckpoint.find.mockReturnValue(mockFindResult);

      const config = { configurable: { thread_id: 'thread123' } };
      const generator = saver.list(config);

      let result = await generator.next();
      expect(result.done).toBe(false);
      expect(result.value).toEqual({
        config: { configurable: { thread_id: 'thread123', checkpoint_id: 'chk3' } },
        checkpoint: { state: 'c3' },
        metadata: { meta: 'm3' },
      });
      expect(saver.serde.parse).toHaveBeenCalledWith(mockDocs[0].checkpointStr);
      expect(saver.serde.parse).toHaveBeenCalledWith(mockDocs[0].metadataStr);

      result = await generator.next();
      expect(result.done).toBe(false);
      expect(result.value).toEqual({
        config: { configurable: { thread_id: 'thread123', checkpoint_id: 'chk2' } },
        checkpoint: { state: 'c2' },
        metadata: { meta: 'm2' },
      });
      expect(saver.serde.parse).toHaveBeenCalledWith(mockDocs[1].checkpointStr);
      expect(saver.serde.parse).toHaveBeenCalledWith(mockDocs[1].metadataStr);

      result = await generator.next();
      expect(result.done).toBe(true);

      expect(mockWorkflowCheckpoint.find).toHaveBeenCalledWith({ threadId: 'thread123' });
      expect(mockFindResult.sort).toHaveBeenCalledWith({ checkpointId: -1 });
      expect(mockFindResult.limit).not.toHaveBeenCalled(); // No limit provided
      expect(mockFindResult.exec).toHaveBeenCalled();
    });

    it('should apply before filter if provided', async () => {
      const mockDocs = [
        {
          threadId: 'thread123',
          checkpointId: 'chk1',
          checkpointStr: '{"state":"c1"}',
          metadataStr: '{"meta":"m1"}',
        },
      ];
      const mockFindResult = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockDocs),
      };
      mockWorkflowCheckpoint.find.mockReturnValue(mockFindResult);

      const config = { configurable: { thread_id: 'thread123' } };
      const before = { configurable: { checkpoint_id: 'chk2' } };
      const generator = saver.list(config, undefined, before); // limit is undefined

      await generator.next(); // Consume the generator

      expect(mockWorkflowCheckpoint.find).toHaveBeenCalledWith({
        threadId: 'thread123',
        checkpointId: { $lt: 'chk2' },
      });
      expect(mockFindResult.sort).toHaveBeenCalledWith({ checkpointId: -1 });
      expect(mockFindResult.limit).not.toHaveBeenCalled();
      expect(mockFindResult.exec).toHaveBeenCalled();
    });

    it('should apply limit if provided', async () => {
      const mockDocs = [
        {
          threadId: 'thread123',
          checkpointId: 'chk3',
          checkpointStr: '{"state":"c3"}',
          metadataStr: '{"meta":"m3"}',
        },
      ];
      const mockFindResult = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockDocs),
      };
      mockWorkflowCheckpoint.find.mockReturnValue(mockFindResult);

      const config = { configurable: { thread_id: 'thread123' } };
      const limit = 1;
      const generator = saver.list(config, limit);

      await generator.next(); // Consume the generator

      expect(mockWorkflowCheckpoint.find).toHaveBeenCalledWith({ threadId: 'thread123' });
      expect(mockFindResult.sort).toHaveBeenCalledWith({ checkpointId: -1 });
      expect(mockFindResult.limit).toHaveBeenCalledWith(limit);
      expect(mockFindResult.exec).toHaveBeenCalled();
    });

    it('should log and re-throw errors during database operations', async () => {
      const error = new Error('DB list failed');
      const mockFindResult = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(error),
      };
      mockWorkflowCheckpoint.find.mockReturnValue(mockFindResult);

      const config = { configurable: { thread_id: 'thread123' } };
      const generator = saver.list(config);

      await expect(generator.next()).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith('Error in MongoDBSaver.list:', error);
    });
  });
});