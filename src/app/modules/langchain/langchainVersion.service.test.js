import { vi, describe, it, expect, beforeEach } from 'vitest';
import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainChainVersion from './langchain-version.model.js';
import { langchainVersionService } from './langchainVersion.service.js';

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const mockChainFindOne = vi.fn();
const mockChainFindOneAndUpdate = vi.fn();

vi.mock('./langchain-chain.model.js', () => ({
  default: {
    findOne: mockChainFindOne,
    findOneAndUpdate: mockChainFindOneAndUpdate,
  },
}));

const mockVersionFindOne = vi.fn();
const mockVersionFind = vi.fn();
const mockVersionSave = vi.fn();

vi.mock('./langchain-version.model.js', () => {
  const MockModel = vi.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this.save = mockVersionSave;
  });
  MockModel.findOne = mockVersionFindOne;
  MockModel.find = mockVersionFind;
  return {
    default: MockModel,
  };
});

describe('langchainVersionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSnapshot', () => {
    it('should successfully create a snapshot with incremented version number', async () => {
      const chainId = 'chain-123';
      const userId = 'user-123';
      const mockChain = {
        _id: chainId,
        userId,
        inputVariables: ['in'],
        outputVariables: ['out'],
        steps: ['step'],
      };

      mockChainFindOne.mockResolvedValue(mockChain);
      mockVersionFindOne.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ versionNumber: 5 }),
        }),
      });
      mockVersionSave.mockResolvedValue({});
      mockChainFindOneAndUpdate.mockResolvedValue({});

      const result = await langchainVersionService.createSnapshot(chainId, userId, 'Test snapshot');

      expect(mockChainFindOne).toHaveBeenCalledWith({ _id: chainId, userId });
      expect(mockVersionSave).toHaveBeenCalled();
      expect(result.versionNumber).toBe(6);
      expect(result.inputVariables).toEqual(['in']);
      expect(mockChainFindOneAndUpdate).toHaveBeenCalledWith(
        { _id: chainId, userId, version: { $lt: 6 } },
        { $set: { version: 6 } },
        { new: true }
      );
      expect(logger.info).toHaveBeenCalled();
    });

    it('should start with version 1 if no previous version exists', async () => {
      const chainId = 'chain-123';
      const userId = 'user-123';
      const mockChain = {
        _id: chainId,
        userId,
        inputVariables: [],
        outputVariables: [],
        steps: [],
      };

      mockChainFindOne.mockResolvedValue(mockChain);
      mockVersionFindOne.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      mockVersionSave.mockResolvedValue({});
      mockChainFindOneAndUpdate.mockResolvedValue({});

      const result = await langchainVersionService.createSnapshot(chainId, userId);

      expect(result.versionNumber).toBe(1);
      expect(result.changeSummary).toBe('Configuration snapshotted.');
    });

    it('should throw an error if the chain is not found', async () => {
      mockChainFindOne.mockResolvedValue(null);

      await expect(
        langchainVersionService.createSnapshot('invalid-id', 'user-123')
      ).rejects.toThrow('LangChain chain not found: invalid-id');

      expect(logger.error).toHaveBeenCalled();
    });

    it('should throw and log error if saving snapshot fails', async () => {
      const chainId = 'chain-123';
      const userId = 'user-123';
      mockChainFindOne.mockResolvedValue({ _id: chainId, userId });
      mockVersionFindOne.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const saveError = new Error('DB Save Error');
      mockVersionSave.mockRejectedValue(saveError);

      await expect(
        langchainVersionService.createSnapshot(chainId, userId)
      ).rejects.toThrow('DB Save Error');

      expect(logger.error).toHaveBeenCalledWith(
        'LangchainVersion: failed to create snapshot:',
        saveError
      );
    });
  });

  describe('rollbackToVersion', () => {
    it('should successfully rollback to a prior version and create a pre-rollback snapshot', async () => {
      const chainId = 'chain-123';
      const userId = 'user-123';
      const versionNumber = 3;

      const mockChainSave = vi.fn().mockResolvedValue({});
      const mockChain = {
        _id: chainId,
        userId,
        inputVariables: ['current-in'],
        outputVariables: ['current-out'],
        steps: ['current-step'],
        save: mockChainSave,
      };

      mockChainFindOne.mockResolvedValue(mockChain);

      mockVersionFindOne.mockImplementation((query) => {
        if (query && 'versionNumber' in query) {
          return {
            lean: vi.fn().mockResolvedValue({
              chainId,
              versionNumber,
              inputVariables: ['old-in'],
              outputVariables: ['old-out'],
              steps: ['old-step'],
            }),
          };
        }
        return {
          sort: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue({ versionNumber: 5 }),
          }),
        };
      });

      mockVersionSave.mockResolvedValue({});
      mockChainFindOneAndUpdate.mockResolvedValue({});

      const result = await langchainVersionService.rollbackToVersion(chainId, versionNumber, userId);

      expect(result.success).toBe(true);
      expect(result.chain.inputVariables).toEqual(['old-in']);
      expect(result.chain.outputVariables).toEqual(['old-out']);
      expect(result.chain.steps).toEqual(['old-step']);
      expect(mockChainSave).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('should throw an error if chain is not found during rollback', async () => {
      mockChainFindOne.mockResolvedValue(null);

      await expect(
        langchainVersionService.rollbackToVersion('invalid-chain', 1, 'user-123')
      ).rejects.toThrow('LangChain chain not found: invalid-chain');
    });

    it('should throw an error if version snapshot is not found', async () => {
      const chainId = 'chain-123';
      const userId = 'user-123';
      mockChainFindOne.mockResolvedValue({ _id: chainId, userId });
      mockVersionFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      await expect(
        langchainVersionService.rollbackToVersion(chainId, 99, userId)
      ).rejects.toThrow('Version snapshot v99 not found for chain chain-123');
    });
  });

  describe('getVersionHistory', () => {
    it('should return version history sorted by versionNumber descending', async () => {
      const chainId = 'chain-123';
      const userId = 'user-123';
      const mockHistory = [
        { versionNumber: 2, changeSummary: 'Second', createdAt: new Date() },
        { versionNumber: 1, changeSummary: 'First', createdAt: new Date() },
      ];

      const mockLean = vi.fn().mockResolvedValue(mockHistory);
      const mockSelect = vi.fn().mockReturnValue({ lean: mockLean });
      const mockSort = vi.fn().mockReturnValue({ select: mockSelect });
      mockVersionFind.mockReturnValue({ sort: mockSort });

      const result = await langchainVersionService.getVersionHistory(chainId, userId);

      expect(result.success).toBe(true);
      expect(result.chainId).toBe(chainId);
      expect(result.history).toEqual(mockHistory);
      expect(mockVersionFind).toHaveBeenCalledWith({ chainId, userId });
      expect(mockSort).toHaveBeenCalledWith({ versionNumber: -1 });
      expect(mockSelect).toHaveBeenCalledWith('versionNumber changeSummary createdAt');
    });

    it('should throw and log error if history retrieval fails', async () => {
      const chainId = 'chain-123';
      const userId = 'user-123';
      const dbError = new Error('Database connection lost');

      const mockSort = vi.fn().mockImplementation(() => {
        throw dbError;
      });
      mockVersionFind.mockReturnValue({ sort: mockSort });

      await expect(
        langchainVersionService.getVersionHistory(chainId, userId)
      ).rejects.toThrow('Database connection lost');

      expect(logger.error).toHaveBeenCalledWith(
        `LangchainVersion: failed to retrieve version history for chain ${chainId}:`,
        dbError
      );
    });
  });
});