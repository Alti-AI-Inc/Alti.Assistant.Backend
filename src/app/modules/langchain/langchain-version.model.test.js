import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import LangchainChainVersion from './langchain-version.model.js';

describe('LangchainChainVersion Model', () => {
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
    // Clear the collection before each test
    await LangchainChainVersion.deleteMany({});
  });

  it('should create and save a langchain chain version successfully', async () => {
    const validVersionData = {
      chainId: new mongoose.Types.ObjectId(),
      userId: 'user-123',
      tenantId: 'tenant-abc',
      versionNumber: 1,
      steps: { type: 'llm', config: { model: 'gpt-4' } },
      inputVariables: ['topic'],
      outputVariables: ['response'],
      changeSummary: 'Initial version'
    };
    const version = new LangchainChainVersion(validVersionData);
    const savedVersion = await version.save();

    expect(savedVersion._id).toBeDefined();
    expect(savedVersion.chainId).toEqual(validVersionData.chainId);
    expect(savedVersion.userId).toBe('user-123');
    expect(savedVersion.tenantId).toBe('tenant-abc');
    expect(savedVersion.versionNumber).toBe(1);
    expect(savedVersion.steps).toEqual({ type: 'llm', config: { model: 'gpt-4' } });
    expect(savedVersion.inputVariables).toEqual(['topic']);
    expect(savedVersion.outputVariables).toEqual(['response']);
    expect(savedVersion.changeSummary).toBe('Initial version');
    expect(savedVersion.createdAt).toBeInstanceOf(Date);
    expect(savedVersion.updatedAt).toBeInstanceOf(Date);
  });

  describe('Required Fields Validation', () => {
    const baseData = {
      chainId: new mongoose.Types.ObjectId(),
      userId: 'user-123',
      versionNumber: 1,
      steps: { some: 'data' }
    };

    it('should fail if chainId is missing', async () => {
      const { chainId, ...data } = baseData;
      const version = new LangchainChainVersion(data);
      await expect(version.save()).rejects.toThrow('LangchainChainVersion validation failed: chainId: Path `chainId` is required.');
    });

    it('should fail if userId is missing', async () => {
      const { userId, ...data } = baseData;
      const version = new LangchainChainVersion(data);
      await expect(version.save()).rejects.toThrow('LangchainChainVersion validation failed: userId: Path `userId` is required.');
    });

    it('should fail if versionNumber is missing', async () => {
      const { versionNumber, ...data } = baseData;
      const version = new LangchainChainVersion(data);
      await expect(version.save()).rejects.toThrow('LangchainChainVersion validation failed: versionNumber: Path `versionNumber` is required.');
    });

    it('should fail if steps is missing', async () => {
      const { steps, ...data } = baseData;
      const version = new LangchainChainVersion(data);
      await expect(version.save()).rejects.toThrow('LangchainChainVersion validation failed: steps: Path `steps` is required.');
    });
  });

  describe('Default Values', () => {
    it('should apply default values for optional fields on save', async () => {
      const minimalVersionData = {
        chainId: new mongoose.Types.ObjectId(),
        userId: 'user-123',
        versionNumber: 1,
        steps: { some: 'steps' }
      };
      const version = new LangchainChainVersion(minimalVersionData);
      const savedVersion = await version.save();

      expect(savedVersion.tenantId).toBe(null);
      expect(savedVersion.inputVariables).toEqual([]);
      expect(savedVersion.outputVariables).toEqual([]);
      expect(savedVersion.changeSummary).toBe('Version snapshot captured.');
      expect(savedVersion.isSystemTemplate).toBe(false);
      expect(savedVersion.bypassLimits).toBe(false);
      expect(savedVersion.isLocked).toBe(false);
    });
  });

  describe('Indexes', () => {
    it('should enforce unique constraint on the combination of chainId and versionNumber', async () => {
      const chainId = new mongoose.Types.ObjectId();
      const versionData1 = {
        chainId: chainId,
        userId: 'user-123',
        versionNumber: 1,
        steps: { step: 1 }
      };
      await new LangchainChainVersion(versionData1).save();

      const versionData2 = {
        chainId: chainId, // Same chainId
        userId: 'user-456',
        versionNumber: 1, // Same version number
        steps: { step: 2 }
      };
      const version2 = new LangchainChainVersion(versionData2);
      await expect(version2.save()).rejects.toThrow(/E11000 duplicate key error/);
    });

    it('should allow the same versionNumber for different chainIds', async () => {
      const versionData1 = {
        chainId: new mongoose.Types.ObjectId(),
        userId: 'user-123',
        versionNumber: 1,
        steps: { step: 1 }
      };
      await new LangchainChainVersion(versionData1).save();

      const versionData2 = {
        chainId: new mongoose.Types.ObjectId(), // Different chainId
        userId: 'user-123',
        versionNumber: 1, // Same version number
        steps: { step: 2 }
      };
      const version2 = new LangchainChainVersion(versionData2);
      const savedVersion2 = await version2.save();
      expect(savedVersion2._id).toBeDefined();
    });
  });

  describe('Role-Based Access and Context Boundary Fields', () => {
    // Note: The model itself does not enforce role-based access.
    // It only provides the fields (e.g., isSystemTemplate, tenantId) that application logic (services/controllers)
    // would use to enforce such rules. These tests verify that the model correctly stores this contextual data.

    it('should correctly store tenantId for multi-tenancy context', async () => {
      const versionData = {
        chainId: new mongoose.Types.ObjectId(),
        userId: 'manager-in-tenant-xyz',
        tenantId: 'tenant-xyz',
        versionNumber: 1,
        steps: {}
      };
      const savedVersion = await new LangchainChainVersion(versionData).save();
      expect(savedVersion.tenantId).toBe('tenant-xyz');
    });

    it('should store a version without a tenantId (e.g., for a global resource)', async () => {
      const versionData = {
        chainId: new mongoose.Types.ObjectId(),
        userId: 'super-admin-user',
        versionNumber: 1,
        steps: {}
        // tenantId is omitted, should default to null
      };
      const savedVersion = await new LangchainChainVersion(versionData).save();
      expect(savedVersion.tenantId).toBe(null);
    });

    it('should allow a super_admin to create a system template', async () => {
      // This test simulates the data a super_admin might create.
      const systemTemplateData = {
        chainId: new mongoose.Types.ObjectId(),
        userId: 'super-admin-user',
        versionNumber: 1,
        steps: { template: 'system' },
        isSystemTemplate: true,
        bypassLimits: true,
        isLocked: true
      };
      const savedVersion = await new LangchainChainVersion(systemTemplateData).save();
      expect(savedVersion.isSystemTemplate).toBe(true);
      expect(savedVersion.bypassLimits).toBe(true);
      expect(savedVersion.isLocked).toBe(true);
    });

    it('should correctly store a version created by a regular user with default access flags', async () => {
      // This test simulates the data a regular user would create.
      // The application logic should prevent them from setting isSystemTemplate, etc.
      const userData = {
        chainId: new mongoose.Types.ObjectId(),
        userId: 'regular-user',
        tenantId: 'tenant-abc',
        versionNumber: 5,
        steps: { user: 'steps' },
        // A regular user should not be able to set these, so we don't include them.
        // The model will apply defaults.
      };
      const savedVersion = await new LangchainChainVersion(userData).save();
      expect(savedVersion.isSystemTemplate).toBe(false);
      expect(savedVersion.bypassLimits).toBe(false);
      expect(savedVersion.isLocked).toBe(false);
      expect(savedVersion.tenantId).toBe('tenant-abc');
    });
  });
});