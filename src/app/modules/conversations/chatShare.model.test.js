import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import ChatShare from './chatShare.model.js';

vi.mock('uuid', () => ({
  v4: () => 'mocked-uuid-v4',
}));

describe('ChatShare Model', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-10-27T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Schema Validation and Defaults', () => {
    it('should create a ChatShare instance with default values', () => {
      const userId = new mongoose.Types.ObjectId();
      const share = new ChatShare({
        conversationId: 'conv-123',
        userId,
      });

      expect(share.shareId).toBe('mocked-uuid-v4');
      expect(share.conversationId).toBe('conv-123');
      expect(share.userId).toEqual(userId);
      expect(share.shareType).toBe('public');
      expect(share.isActive).toBe(true);
      expect(share.allowComments).toBe(false);
      expect(share.expiresAt).toBeNull();
      expect(share.viewCount).toBe(0);
      expect(share.lastViewedAt).toBeNull();
      expect(share.metadata).toEqual({});
    });

    it('should fail validation if required fields are missing', () => {
      const share = new ChatShare({});
      const err = share.validateSync();
      expect(err.errors.conversationId).toBeDefined();
      expect(err.errors.userId).toBeDefined();
    });

    it('should fail validation if shareType is not in enum', () => {
      const share = new ChatShare({
        conversationId: 'conv-123',
        userId: new mongoose.Types.ObjectId(),
        shareType: 'invalid-type',
      });
      const err = share.validateSync();
      expect(err.errors.shareType).toBeDefined();
    });
  });

  describe('Virtual Property: isExpired', () => {
    it('should return false if expiresAt is null', () => {
      const share = new ChatShare({ expiresAt: null });
      expect(share.isExpired).toBe(false);
    });

    it('should return false if expiresAt is in the future', () => {
      const futureDate = new Date('2023-10-27T13:00:00.000Z');
      const share = new ChatShare({ expiresAt: futureDate });
      expect(share.isExpired).toBe(false);
    });

    it('should return true if expiresAt is in the past', () => {
      const pastDate = new Date('2023-10-27T11:00:00.000Z');
      const share = new ChatShare({ expiresAt: pastDate });
      expect(share.isExpired).toBe(true);
    });
  });

  describe('Instance Method: isAccessible', () => {
    it('should return false if isActive is false', () => {
      const share = new ChatShare({ isActive: false });
      expect(share.isAccessible()).toBe(false);
    });

    it('should return false if the share link has expired', () => {
      const pastDate = new Date('2023-10-27T11:00:00.000Z');
      const share = new ChatShare({ isActive: true, expiresAt: pastDate });
      expect(share.isAccessible()).toBe(false);
    });

    it('should return true if active and not expired', () => {
      const futureDate = new Date('2023-10-27T13:00:00.000Z');
      const share = new ChatShare({ isActive: true, expiresAt: futureDate });
      expect(share.isAccessible()).toBe(true);
    });

    it('should return true if active and expiresAt is null', () => {
      const share = new ChatShare({ isActive: true, expiresAt: null });
      expect(share.isAccessible()).toBe(true);
    });
  });

  describe('Instance Method: incrementViewCount', () => {
    it('should atomically increment viewCount and update lastViewedAt', async () => {
      const share = new ChatShare({
        conversationId: 'conv-123',
        userId: new mongoose.Types.ObjectId(),
        viewCount: 5,
      });

      const updateOneSpy = vi.spyOn(ChatShare, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      await share.incrementViewCount();

      expect(share.viewCount).toBe(6);
      expect(share.lastViewedAt).toEqual(new Date('2023-10-27T12:00:00.000Z'));
      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: share._id },
        {
          $inc: { viewCount: 1 },
          $set: { lastViewedAt: new Date('2023-10-27T12:00:00.000Z') },
        }
      );
    });
  });

  describe('Static Method: findActiveShare', () => {
    it('should query active and non-expired share and populate conversationId', async () => {
      const mockQuery = {
        populate: vi.fn().mockResolvedValue({ shareId: 'mocked-uuid-v4' }),
      };
      const findOneSpy = vi.spyOn(ChatShare, 'findOne').mockReturnValue(mockQuery);

      const result = await ChatShare.findActiveShare('mocked-uuid-v4');

      expect(findOneSpy).toHaveBeenCalledWith({
        shareId: 'mocked-uuid-v4',
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date('2023-10-27T12:00:00.000Z') } },
        ],
      });
      expect(mockQuery.populate).toHaveBeenCalledWith('conversationId');
      expect(result).toEqual({ shareId: 'mocked-uuid-v4' });
    });
  });

  describe('Static Method: findUserShares', () => {
    let mockLean;
    let mockLimit;
    let mockSkip;
    let mockSort;
    let mockPopulate;
    let findSpy;
    const userId = new mongoose.Types.ObjectId();

    beforeEach(() => {
      mockLean = vi.fn().mockResolvedValue([{ shareId: 'share-1' }]);
      mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
      mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
      mockSort = vi.fn().mockReturnValue({ skip: mockSkip });
      mockPopulate = vi.fn().mockReturnValue({ sort: mockSort });
      findSpy = vi.spyOn(ChatShare, 'find').mockReturnValue({ populate: mockPopulate });
    });

    it('should query user shares with default options (active status, page 1, limit 20)', async () => {
      const result = await ChatShare.findUserShares(userId);

      expect(findSpy).toHaveBeenCalledWith({
        userId,
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date('2023-10-27T12:00:00.000Z') } },
        ],
      });
      expect(mockPopulate).toHaveBeenCalledWith(
        'conversationId',
        'title conversationId lastActivity messageCount'
      );
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockSkip).toHaveBeenCalledWith(0);
      expect(mockLimit).toHaveBeenCalledWith(20);
      expect(result).toEqual([{ shareId: 'share-1' }]);
    });

    it('should query user shares with expired status and custom pagination', async () => {
      await ChatShare.findUserShares(userId, {
        page: 3,
        limit: 10,
        status: 'expired',
      });

      expect(findSpy).toHaveBeenCalledWith({
        userId,
        expiresAt: { $lte: new Date('2023-10-27T12:00:00.000Z') },
      });
      expect(mockSkip).toHaveBeenCalledWith(20);
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should query user shares with revoked status', async () => {
      await ChatShare.findUserShares(userId, {
        status: 'revoked',
      });

      expect(findSpy).toHaveBeenCalledWith({
        userId,
        isActive: false,
      });
    });

    it('should query user shares with all status', async () => {
      await ChatShare.findUserShares(userId, {
        status: 'all',
      });

      expect(findSpy).toHaveBeenCalledWith({
        userId,
      });
    });
  });
});