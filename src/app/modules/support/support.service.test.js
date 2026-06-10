import { vi, describe, it, expect, beforeEach } from 'vitest';
import { supportService } from './support.service.js';
import UserModel from '../auth/auth.model.js';
import Support from './support.model.js';
import { logger } from '../../../shared/logger.js';

// Mock dependencies
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Mongoose models and their methods
const mockSupportLean = vi.fn();
const mockSupportLimit = vi.fn(() => ({ lean: mockSupportLean }));
const mockSupportFind = vi.fn(() => ({ limit: mockSupportLimit, lean: mockSupportLean }));
const mockSupportFindOneLean = vi.fn();
const mockSupportFindOne = vi.fn(() => ({ lean: mockSupportFindOneLean }));

vi.mock('./support.model.js', () => ({
  default: {
    create: vi.fn(),
    find: mockSupportFind,
    findOne: mockSupportFindOne,
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../auth/auth.model.js', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
  },
}));

describe('Support Service', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('reqForSupportService', () => {
    it('should create a support request and associate it with a user', async () => {
      const userId = 'user123';
      const supportData = {
        title: 'Issue with login',
        description: 'Cannot log in to my account.',
        status: 'pending',
      };
      const createdSupportRequest = {
        _id: 'support123',
        ...supportData,
      };

      Support.create.mockResolvedValue(createdSupportRequest);
      UserModel.findOneAndUpdate.mockResolvedValue({ _id: userId, task: ['support123'] });

      const result = await supportService.reqForSupportService(userId, supportData);

      expect(Support.create).toHaveBeenCalledWith(supportData);
      expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: userId },
        { $push: { task: createdSupportRequest._id } },
        { new: true }
      );
      expect(result).toEqual(createdSupportRequest);
    });

    it('should handle errors during support request creation', async () => {
      const userId = 'user123';
      const supportData = {
        title: 'Issue with login',
        description: 'Cannot log in to my account.',
      };
      const error = new Error('Database error');

      Support.create.mockRejectedValue(error);

      await expect(supportService.reqForSupportService(userId, supportData)).rejects.toThrow(error);
      expect(Support.create).toHaveBeenCalledWith(supportData);
      expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled(); // Should not be called if create fails
    });
  });

  describe('getAllSupportService', () => {
    it('should retrieve all support requests with a limit of 200 and lean()', async () => {
      const mockSupportRequests = [
        { _id: 's1', title: 'Issue 1', description: 'Desc 1' },
        { _id: 's2', title: 'Issue 2', description: 'Desc 2' },
      ];

      mockSupportLean.mockResolvedValue(mockSupportRequests);

      const result = await supportService.getAllSupportService();

      expect(Support.find).toHaveBeenCalledWith({});
      expect(mockSupportLimit).toHaveBeenCalledWith(200);
      expect(mockSupportLean).toHaveBeenCalled();
      expect(result).toEqual(mockSupportRequests);
    });

    it('should return an empty array if no support requests are found', async () => {
      mockSupportLean.mockResolvedValue([]);

      const result = await supportService.getAllSupportService();

      expect(Support.find).toHaveBeenCalledWith({});
      expect(mockSupportLimit).toHaveBeenCalledWith(200);
      expect(mockSupportLean).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('getSupportServiceById', () => {
    it('should retrieve a single support request by ID with lean()', async () => {
      const supportId = 'support123';
      const mockSupportRequest = { _id: supportId, title: 'Issue', description: 'Desc' };

      mockSupportFindOneLean.mockResolvedValue(mockSupportRequest);

      const result = await supportService.getSupportServiceById(supportId);

      expect(Support.findOne).toHaveBeenCalledWith({ _id: supportId });
      expect(mockSupportFindOneLean).toHaveBeenCalled();
      expect(result).toEqual(mockSupportRequest);
    });

    it('should return null if no support request is found by ID', async () => {
      const supportId = 'nonexistentId';

      mockSupportFindOneLean.mockResolvedValue(null);

      const result = await supportService.getSupportServiceById(supportId);

      expect(Support.findOne).toHaveBeenCalledWith({ _id: supportId });
      expect(mockSupportFindOneLean).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('updateSupportReqService', () => {
    it('should update an existing support request by ID', async () => {
      const supportRequestId = 'support123';
      const updateData = { status: 'resolved', description: 'Issue fixed.' };
      const mockUpdateResult = { acknowledged: true, modifiedCount: 1, upsertedId: null, upsertedCount: 0, matchedCount: 1 };

      Support.updateOne.mockResolvedValue(mockUpdateResult);

      const result = await supportService.updateSupportReqService(supportRequestId, updateData);

      expect(Support.updateOne).toHaveBeenCalledWith(
        { _id: supportRequestId },
        { $set: updateData },
        { runValidators: true }
      );
      expect(result).toEqual(mockUpdateResult);
    });

    it('should return a result indicating no modification if ID not found', async () => {
      const supportRequestId = 'nonexistentId';
      const updateData = { status: 'resolved' };
      const mockUpdateResult = { acknowledged: true, modifiedCount: 0, upsertedId: null, upsertedCount: 0, matchedCount: 0 };

      Support.updateOne.mockResolvedValue(mockUpdateResult);

      const result = await supportService.updateSupportReqService(supportRequestId, updateData);

      expect(Support.updateOne).toHaveBeenCalledWith(
        { _id: supportRequestId },
        { $set: updateData },
        { runValidators: true }
      );
      expect(result).toEqual(mockUpdateResult);
    });
  });

  describe('deleteSupportReqService', () => {
    it('should delete a support request by ID', async () => {
      const supportId = 'support123';
      const mockDeleteResult = { acknowledged: true, deletedCount: 1 };

      Support.deleteOne.mockResolvedValue(mockDeleteResult);

      const result = await supportService.deleteSupportReqService(supportId);

      expect(Support.deleteOne).toHaveBeenCalledWith({ _id: supportId });
      expect(result).toEqual(mockDeleteResult);
    });

    it('should return a result indicating no deletion if ID not found', async () => {
      const supportId = 'nonexistentId';
      const mockDeleteResult = { acknowledged: true, deletedCount: 0 };

      Support.deleteOne.mockResolvedValue(mockDeleteResult);

      const result = await supportService.deleteSupportReqService(supportId);

      expect(Support.deleteOne).toHaveBeenCalledWith({ _id: supportId });
      expect(result).toEqual(mockDeleteResult);
    });
  });

  describe('bulkDeleteSupportReqService', () => {
    it('should delete multiple support requests by IDs', async () => {
      const supportIds = ['s1', 's2', 's3'];
      const mockDeleteManyResult = { acknowledged: true, deletedCount: 3 };

      Support.deleteMany.mockResolvedValue(mockDeleteManyResult);

      const result = await supportService.bulkDeleteSupportReqService(supportIds);

      expect(logger.info).toHaveBeenCalledWith(supportIds, 'idssssssss');
      expect(Support.deleteMany).toHaveBeenCalledWith({ _id: { $in: supportIds } });
      expect(logger.info).toHaveBeenCalledWith(mockDeleteManyResult);
      expect(result).toEqual(mockDeleteManyResult);
    });

    it('should return a result indicating no deletion if no IDs match', async () => {
      const supportIds = ['nonexistent1', 'nonexistent2'];
      const mockDeleteManyResult = { acknowledged: true, deletedCount: 0 };

      Support.deleteMany.mockResolvedValue(mockDeleteManyResult);

      const result = await supportService.bulkDeleteSupportReqService(supportIds);

      expect(logger.info).toHaveBeenCalledWith(supportIds, 'idssssssss');
      expect(Support.deleteMany).toHaveBeenCalledWith({ _id: { $in: supportIds } });
      expect(logger.info).toHaveBeenCalledWith(mockDeleteManyResult);
      expect(result).toEqual(mockDeleteManyResult);
    });
  });
});