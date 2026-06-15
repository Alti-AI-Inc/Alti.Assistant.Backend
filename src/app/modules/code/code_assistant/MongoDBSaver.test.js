import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoDBSaver } from './MongoDBSaver';

const {
  mockCheckpointModel
} = vi.hoisted(() => {
  // Mock the entire mongoose library
  const mockCheckpointModel = {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    find: vi.fn(),
  };

  return {
    mockCheckpointModel
  };
});

vi.mock('mongoose', async () => {
  const actualMongoose = await vi.importActual('mongoose');
  return {
    ...actualMongoose,
    default: {
      connect: vi.fn().mockResolvedValue(true),
      connection: { readyState: 0 },
      model: vi.fn().mockReturnValue(mockCheckpointModel),
      Schema: actualMongoose.Schema,
    },
  };
});

// Suppress console.log during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

describe('MongoDBSaver', () => {
  let saver;

  beforeEach(() => {
    saver = new MongoDBSaver();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance of MongoDBSaver', () => {
      expect(saver).toBeInstanceOf(MongoDBSaver);
    });
  });

  describe('fromUri', () => {
    it('should connect to MongoDB if not already connected', async () => {
      mongoose.connection.readyState = 0; // Simulate disconnected state
      const uri = 'mongodb://localhost:27017/test';
      const instance = await MongoDBSaver.fromUri(uri);

      expect(mongoose.connect).toHaveBeenCalledWith(uri, { family: 4 });
      expect(instance).toBeInstanceOf(MongoDBSaver);
    });

    it('should not connect to MongoDB if already connected', async () => {
      mongoose.connection.readyState = 1; // Simulate connected state
      const uri = 'mongodb://localhost:27017/test';
      const instance = await MongoDBSaver.fromUri(uri);

      expect(mongoose.connect).not.toHaveBeenCalled();
      expect(instance).toBeInstanceOf(MongoDBSaver);
    });
  });

  describe('get', () => {
    it('should return null if thread_id is not provided in config', async () => {
      const config = { configurable: {} };
      const result = await saver.get(config);
      expect(result).toBeNull();
      expect(mockCheckpointModel.findById).not.toHaveBeenCalled();
    });

    it('should return null if no checkpoint is found in the database', async () => {
      const thread_id = 'non-existent-thread';
      const config = { configurable: { thread_id } };
      mockCheckpointModel.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const result = await saver.get(config);

      expect(mockCheckpointModel.findById).toHaveBeenCalledWith(thread_id);
      expect(result).toBeNull();
    });

    it('should return the formatted checkpoint if found', async () => {
      const thread_id = 'existing-thread';
      const config = { configurable: { thread_id } };
      const now = new Date();
      const dbDocument = {
        _id: thread_id,
        ts: now,
        channel_values: { messages: ['hello'] },
        channel_versions: { 'channel:1': 1 },
        versions_seen: { 'node:1': 1 },
      };

      mockCheckpointModel.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(dbDocument),
      });

      const result = await saver.get(config);

      expect(mockCheckpointModel.findById).toHaveBeenCalledWith(thread_id);
      expect(result).toEqual({
        v: 1,
        ts: now.toISOString(),
        channel_values: dbDocument.channel_values,
        channel_versions: dbDocument.channel_versions,
        versions_seen: dbDocument.versions_seen,
      });
    });
  });

  describe('getTuple', () => {
    it('should return null if get() returns null', async () => {
      const config = { configurable: { thread_id: 'non-existent-thread' } };
      vi.spyOn(saver, 'get').mockResolvedValue(null);

      const result = await saver.getTuple(config);

      expect(saver.get).toHaveBeenCalledWith(config);
      expect(result).toBeNull();
    });

    it('should return a tuple with config, checkpoint, and metadata if a checkpoint is found', async () => {
      const config = { configurable: { thread_id: 'existing-thread' } };
      const checkpoint = { v: 1, ts: new Date().toISOString() };
      vi.spyOn(saver, 'get').mockResolvedValue(checkpoint);

      const result = await saver.getTuple(config);

      expect(saver.get).toHaveBeenCalledWith(config);
      expect(result).toEqual({
        config,
        checkpoint,
        metadata: { source: 'mongoose' },
      });
    });
  });

  describe('put', () => {
    it('should not do anything if thread_id is not provided', async () => {
      const config = { configurable: {} };
      const checkpoint = { ts: new Date().toISOString() };

      await saver.put(config, checkpoint);

      expect(mockCheckpointModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should call findByIdAndUpdate with correct data to save a checkpoint', async () => {
      const thread_id = 'thread-to-save';
      const config = { configurable: { thread_id } };
      const now = new Date();
      const checkpoint = {
        ts: now.toISOString(),
        channel_values: { messages: ['updated'] },
        channel_versions: { 'channel:1': 2 },
        versions_seen: { 'node:1': 2 },
      };

      await saver.put(config, checkpoint);

      const expectedCheckpointData = {
        ts: now,
        channel_values: checkpoint.channel_values,
        channel_versions: checkpoint.channel_versions,
        versions_seen: checkpoint.versions_seen,
      };

      expect(mockCheckpointModel.findByIdAndUpdate).toHaveBeenCalledWith(
        thread_id,
        expectedCheckpointData,
        { upsert: true, new: true }
      );
    });
  });

  describe('list', () => {
    it('should list all checkpoints if no thread_id is provided', async () => {
      const now1 = new Date();
      const now2 = new Date(Date.now() - 10000);
      const dbDocuments = [
        { _id: 'thread-1', ts: now1 },
        { _id: 'thread-2', ts: now2 },
      ];

      mockCheckpointModel.find.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(dbDocuments),
      });

      const result = await saver.list({ configurable: {} });

      expect(mockCheckpointModel.find).toHaveBeenCalledWith({});
      expect(result).toEqual([
        {
          configurable: { thread_id: 'thread-1' },
          metadata: { source: 'mongoose' },
          v: 1,
          ts: now1.toISOString(),
        },
        {
          configurable: { thread_id: 'thread-2' },
          metadata: { source: 'mongoose' },
          v: 1,
          ts: now2.toISOString(),
        },
      ]);
    });

    it('should list a specific checkpoint if a thread_id is provided', async () => {
      const thread_id = 'thread-1';
      const now = new Date();
      const dbDocuments = [{ _id: thread_id, ts: now }];

      mockCheckpointModel.find.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(dbDocuments),
      });

      const result = await saver.list({ configurable: { thread_id } });

      expect(mockCheckpointModel.find).toHaveBeenCalledWith({ _id: thread_id });
      expect(result).toEqual([
        {
          configurable: { thread_id: 'thread-1' },
          metadata: { source: 'mongoose' },
          v: 1,
          ts: now.toISOString(),
        },
      ]);
    });

    it('should return an empty array if no checkpoints are found', async () => {
      mockCheckpointModel.find.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      });

      const result = await saver.list({ configurable: {} });

      expect(mockCheckpointModel.find).toHaveBeenCalledWith({});
      expect(result).toEqual([]);
    });
  });
});