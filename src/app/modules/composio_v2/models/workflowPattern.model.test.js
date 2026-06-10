import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import WorkflowPattern from './workflowPattern.model.js';

describe('WorkflowPattern Model', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await WorkflowPattern.deleteMany({});
  });

  const createValidData = () => ({
    workspaceId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    sequence: ['TOOL_A', 'TOOL_B'],
  });

  describe('Schema Definition and Validation', () => {
    it('should create and save a valid workflow pattern', async () => {
      const validData = createValidData();
      const pattern = new WorkflowPattern(validData);
      const savedPattern = await pattern.save();

      expect(savedPattern._id).toBeDefined();
      expect(savedPattern.workspaceId).toEqual(validData.workspaceId);
      expect(savedPattern.userId).toEqual(validData.userId);
      expect(savedPattern.sequence).toEqual(expect.arrayContaining(validData.sequence));
      expect(savedPattern.createdAt).toBeInstanceOf(Date);
      expect(savedPattern.updatedAt).toBeInstanceOf(Date);
    });

    it('should fail to save if workspaceId is missing', async () => {
      const invalidData = { ...createValidData(), workspaceId: undefined };
      const pattern = new WorkflowPattern(invalidData);
      await expect(pattern.save()).rejects.toThrow('WorkflowPattern validation failed: workspaceId: Path `workspaceId` is required.');
    });

    it('should fail to save if userId is missing', async () => {
      const invalidData = { ...createValidData(), userId: undefined };
      const pattern = new WorkflowPattern(invalidData);
      await expect(pattern.save()).rejects.toThrow('WorkflowPattern validation failed: userId: Path `userId` is required.');
    });

    it('should fail to save if sequence is missing', async () => {
      const invalidData = { ...createValidData(), sequence: undefined };
      const pattern = new WorkflowPattern(invalidData);
      await expect(pattern.save()).rejects.toThrow('WorkflowPattern validation failed: sequence: Path `sequence` is required.');
    });

    it('should apply default values correctly', async () => {
      const data = createValidData();
      const pattern = new WorkflowPattern(data);
      const savedPattern = await pattern.save();

      expect(savedPattern.occurrenceCount).toBe(1);
      expect(savedPattern.successRate).toBe(100);
      expect(savedPattern.avgSequenceLatencyMs).toBe(0);
      expect(savedPattern.estimatedTimeSavingsMs).toBe(0);
      expect(savedPattern.geminiSuggestion).toBe('');
      expect(savedPattern.patternTitle).toBe('');
      expect(savedPattern.status).toBe('SUGGESTED');
      expect(savedPattern.workflowId).toBe(null);
      expect(savedPattern.dismissed).toBe(false);
      expect(savedPattern.lastObservedAt).toBeInstanceOf(Date);
    });

    it('should fail if status is not one of the enum values', async () => {
      const invalidData = { ...createValidData(), status: 'INVALID_STATUS' };
      const pattern = new WorkflowPattern(invalidData);
      await expect(pattern.save()).rejects.toThrow('`INVALID_STATUS` is not a valid enum value for path `status`');
    });

    it('should fail if successRate is out of bounds', async () => {
      const dataHigh = { ...createValidData(), successRate: 101 };
      const patternHigh = new WorkflowPattern(dataHigh);
      await expect(patternHigh.save()).rejects.toThrow('Path `successRate` (101) is more than maximum allowed value (100)');

      const dataLow = { ...createValidData(), successRate: -1 };
      const patternLow = new WorkflowPattern(dataLow);
      await expect(patternLow.save()).rejects.toThrow('Path `successRate` (-1) is less than minimum allowed value (0)');
    });

    it('should fail if occurrenceCount is less than 1', async () => {
        const invalidData = { ...createValidData(), occurrenceCount: 0 };
        const pattern = new WorkflowPattern(invalidData);
        await expect(pattern.save()).rejects.toThrow('Path `occurrenceCount` (0) is less than minimum allowed value (1)');
    });
  });

  describe('pre("validate") Hook: sequenceHash Generation', () => {
    it('should automatically generate a sequenceHash on creation', async () => {
      const data = createValidData();
      const pattern = new WorkflowPattern(data);
      await pattern.save();

      const expectedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(data.sequence))
        .digest('hex');

      expect(pattern.sequenceHash).toBeDefined();
      expect(pattern.sequenceHash).toBe(expectedHash);
    });

    it('should generate a consistent hash for the same sequence', async () => {
        const data1 = createValidData();
        const pattern1 = new WorkflowPattern(data1);
        await pattern1.validate();

        const data2 = { ...createValidData(), userId: new mongoose.Types.ObjectId() }; // Different user, same sequence
        const pattern2 = new WorkflowPattern(data2);
        await pattern2.validate();

        expect(pattern1.sequenceHash).toBe(pattern2.sequenceHash);
    });

    it('should generate a different hash for a different sequence', async () => {
        const data1 = createValidData();
        const pattern1 = new WorkflowPattern(data1);
        await pattern1.validate();

        const data2 = { ...createValidData(), sequence: ['TOOL_C', 'TOOL_D'] };
        const pattern2 = new WorkflowPattern(data2);
        await pattern2.validate();

        expect(pattern1.sequenceHash).not.toBe(pattern2.sequenceHash);
    });

    it('should update the sequenceHash when the sequence is modified', async () => {
      const data = createValidData();
      const pattern = new WorkflowPattern(data);
      const savedPattern = await pattern.save();
      const initialHash = savedPattern.sequenceHash;

      savedPattern.sequence = ['TOOL_X', 'TOOL_Y'];
      const updatedPattern = await savedPattern.save();
      const newHash = updatedPattern.sequenceHash;

      const expectedNewHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(['TOOL_X', 'TOOL_Y']))
        .digest('hex');

      expect(newHash).toBeDefined();
      expect(newHash).not.toBe(initialHash);
      expect(newHash).toBe(expectedNewHash);
    });

    it('should not update the sequenceHash if other fields are modified', async () => {
        const data = createValidData();
        const pattern = new WorkflowPattern(data);
        const savedPattern = await pattern.save();
        const initialHash = savedPattern.sequenceHash;

        savedPattern.occurrenceCount = 10;
        const updatedPattern = await savedPattern.save();
        const newHash = updatedPattern.sequenceHash;

        expect(newHash).toBe(initialHash);
    });
  });

  describe('Indexes', () => {
    it('should enforce unique constraint on { userId, sequenceHash }', async () => {
      const commonUserId = new mongoose.Types.ObjectId();
      const commonSequence = ['GMAIL_SEND', 'SLACK_POST'];

      const data1 = {
        workspaceId: new mongoose.Types.ObjectId(),
        userId: commonUserId,
        sequence: commonSequence,
      };
      await new WorkflowPattern(data1).save();

      const data2 = {
        workspaceId: new mongoose.Types.ObjectId(),
        userId: commonUserId, // Same user
        sequence: commonSequence, // Same sequence
      };
      const duplicatePattern = new WorkflowPattern(data2);

      // Expect a duplicate key error (E11000)
      await expect(duplicatePattern.save()).rejects.toThrow(/E11000 duplicate key error/);
    });

    it('should allow same sequence for different users', async () => {
        const commonSequence = ['GMAIL_SEND', 'SLACK_POST'];

        const data1 = {
          workspaceId: new mongoose.Types.ObjectId(),
          userId: new mongoose.Types.ObjectId(),
          sequence: commonSequence,
        };
        await new WorkflowPattern(data1).save();

        const data2 = {
          workspaceId: new mongoose.Types.ObjectId(),
          userId: new mongoose.Types.ObjectId(), // Different user
          sequence: commonSequence, // Same sequence
        };
        const secondPattern = new WorkflowPattern(data2);

        // This should save successfully
        await expect(secondPattern.save()).resolves.toBeDefined();
      });
  });
});