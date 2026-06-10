import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatbotService } from './chatbot.service.js';
import Chatbot from './chatbot.model.js';
import { logger } from '../../../shared/logger.js';
import { withTenantContext, withTenantFilter } from '../../helpers/tenantQuery.js';

vi.mock('./chatbot.model.js', () => {
  const mockSave = vi.fn();
  const MockChatbot = vi.fn().mockImplementation((data) => {
    return {
      ...data,
      _id: 'mock-chatbot-id',
      save: mockSave,
    };
  });
  MockChatbot.find = vi.fn();
  MockChatbot.findOne = vi.fn();
  MockChatbot.findOneAndUpdate = vi.fn();
  return {
    default: MockChatbot,
  };
});

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../helpers/tenantQuery.js', () => ({
  withTenantContext: vi.fn((req, payload) => ({ ...payload, tenantId: req.tenantId })),
  withTenantFilter: vi.fn((req, query) => ({ ...query, tenantId: req.tenantId })),
}));

vi.mock('../../../errors/ApiError.js', () => {
  return {
    default: class ApiError extends Error {
      constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
      }
    },
  };
});

describe('Chatbot Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createChatbot', () => {
    it('should successfully create a chatbot without tenant context', async () => {
      const chatbotData = { name: 'Support Bot', isShared: false };
      const userId = 'user-123';
      
      const mockSave = vi.fn().mockResolvedValue(true);
      Chatbot.mockImplementationOnce((data) => ({
        ...data,
        _id: 'bot-123',
        save: mockSave,
      }));

      const result = await chatbotService.createChatbot(chatbotData, userId);

      expect(result._id).toBe('bot-123');
      expect(result.userId).toBe(userId);
      expect(result.name).toBe('Support Bot');
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Chatbot created: bot-123'));
    });

    it('should successfully create a chatbot with tenant context when req is provided', async () => {
      const chatbotData = { name: 'Tenant Bot' };
      const userId = 'user-123';
      const req = { tenantId: 'tenant-abc' };

      const mockSave = vi.fn().mockResolvedValue(true);
      Chatbot.mockImplementationOnce((data) => ({
        ...data,
        _id: 'bot-456',
        save: mockSave,
      }));

      const result = await chatbotService.createChatbot(chatbotData, userId, req);

      expect(withTenantContext).toHaveBeenCalledWith(req, { ...chatbotData, userId });
      expect(result.tenantId).toBe('tenant-abc');
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('should throw an ApiError if saving the chatbot fails', async () => {
      const chatbotData = { name: 'Failed Bot' };
      const userId = 'user-123';

      Chatbot.mockImplementationOnce(() => ({
        save: vi.fn().mockRejectedValue(new Error('Database connection lost')),
      }));

      await expect(chatbotService.createChatbot(chatbotData, userId)).rejects.toThrow('Failed to create chatbot');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getChatbots', () => {
    it('should retrieve chatbots for a specific user when no tenant context is present', async () => {
      const userId = 'user-123';
      const mockLean = vi.fn().mockResolvedValue([{ _id: 'bot-1', name: 'Bot 1' }]);
      const mockSort = vi.fn().mockReturnValue({ lean: mockLean });
      Chatbot.find.mockReturnValue({ sort: mockSort });

      const result = await chatbotService.getChatbots(userId);

      expect(Chatbot.find).toHaveBeenCalledWith({ userId, isActive: true });
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(result).toEqual([{ _id: 'bot-1', name: 'Bot 1' }]);
    });

    it('should retrieve chatbots including shared tenant chatbots when tenantId is present in req', async () => {
      const userId = 'user-123';
      const req = { tenantId: 'tenant-abc' };
      const mockLean = vi.fn().mockResolvedValue([{ _id: 'bot-1' }, { _id: 'bot-shared' }]);
      const mockSort = vi.fn().mockReturnValue({ lean: mockLean });
      Chatbot.find.mockReturnValue({ sort: mockSort });

      const result = await chatbotService.getChatbots(userId, req);

      expect(Chatbot.find).toHaveBeenCalledWith({
        isActive: true,
        $or: [
          { userId },
          { isShared: true, tenantId: 'tenant-abc' },
        ],
      });
      expect(result).toHaveLength(2);
    });

    it('should fallback to user-only query if req is provided but has no tenantId', async () => {
      const userId = 'user-123';
      const req = {};
      const mockLean = vi.fn().mockResolvedValue([]);
      const mockSort = vi.fn().mockReturnValue({ lean: mockLean });
      Chatbot.find.mockReturnValue({ sort: mockSort });

      await chatbotService.getChatbots(userId, req);

      expect(Chatbot.find).toHaveBeenCalledWith({ userId, isActive: true });
    });

    it('should throw an ApiError if fetching chatbots fails', async () => {
      Chatbot.find.mockImplementationOnce(() => {
        throw new Error('Query failed');
      });

      await expect(chatbotService.getChatbots('user-123')).rejects.toThrow('Failed to fetch chatbots');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getChatbotById', () => {
    it('should retrieve a single chatbot by ID and userId without tenant context', async () => {
      const chatbotId = 'bot-123';
      const userId = 'user-123';
      const mockLean = vi.fn().mockResolvedValue({ _id: chatbotId, userId, isActive: true });
      Chatbot.findOne.mockReturnValue({ lean: mockLean });

      const result = await chatbotService.getChatbotById(chatbotId, userId);

      expect(Chatbot.findOne).toHaveBeenCalledWith({ _id: chatbotId, userId, isActive: true });
      expect(result).toEqual({ _id: chatbotId, userId, isActive: true });
    });

    it('should apply tenant filter when retrieving a chatbot with req context', async () => {
      const chatbotId = 'bot-123';
      const userId = 'user-123';
      const req = { tenantId: 'tenant-abc' };
      const mockLean = vi.fn().mockResolvedValue({ _id: chatbotId, userId, tenantId: 'tenant-abc' });
      Chatbot.findOne.mockReturnValue({ lean: mockLean });

      await chatbotService.getChatbotById(chatbotId, userId, req);

      expect(withTenantFilter).toHaveBeenCalledWith(req, { _id: chatbotId, userId, isActive: true });
    });

    it('should throw a 404 ApiError if the chatbot is not found', async () => {
      const chatbotId = 'bot-nonexistent';
      const userId = 'user-123';
      const mockLean = vi.fn().mockResolvedValue(null);
      Chatbot.findOne.mockReturnValue({ lean: mockLean });

      await expect(chatbotService.getChatbotById(chatbotId, userId)).rejects.toThrow('Chatbot not found');
    });

    it('should propagate any other errors encountered during retrieval', async () => {
      Chatbot.findOne.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      await expect(chatbotService.getChatbotById('bot-123', 'user-123')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('updateChatbot', () => {
    it('should update a chatbot successfully without tenant context', async () => {
      const chatbotId = 'bot-123';
      const userId = 'user-123';
      const updateData = { name: 'Updated Name' };
      const mockUpdatedChatbot = { _id: chatbotId, userId, name: 'Updated Name', isActive: true };

      Chatbot.findOneAndUpdate.mockResolvedValue(mockUpdatedChatbot);

      const result = await chatbotService.updateChatbot(chatbotId, userId, updateData);

      expect(Chatbot.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: chatbotId, userId, isActive: true },
        { $set: updateData },
        { new: true, runValidators: true }
      );
      expect(result).toEqual(mockUpdatedChatbot);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Chatbot updated: bot-123'));
    });

    it('should apply tenant filter when updating a chatbot with req context', async () => {
      const chatbotId = 'bot-123';
      const userId = 'user-123';
      const updateData = { name: 'Updated Name' };
      const req = { tenantId: 'tenant-abc' };

      Chatbot.findOneAndUpdate.mockResolvedValue({ _id: chatbotId });

      await chatbotService.updateChatbot(chatbotId, userId, updateData, req);

      expect(withTenantFilter).toHaveBeenCalledWith(req, { _id: chatbotId, userId, isActive: true });
    });

    it('should throw a 404 ApiError if the chatbot to update is not found', async () => {
      Chatbot.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        chatbotService.updateChatbot('bot-none', 'user-123', { name: 'New' })
      ).rejects.toThrow('Chatbot not found');
    });

    it('should propagate errors encountered during update', async () => {
      Chatbot.findOneAndUpdate.mockRejectedValue(new Error('Validation failed'));

      await expect(
        chatbotService.updateChatbot('bot-123', 'user-123', { name: 'New' })
      ).rejects.toThrow('Validation failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('deleteChatbot', () => {
    it('should soft delete a chatbot successfully by setting isActive to false', async () => {
      const chatbotId = 'bot-123';
      const userId = 'user-123';

      Chatbot.findOneAndUpdate.mockResolvedValue({ _id: chatbotId, isActive: false });

      const result = await chatbotService.deleteChatbot(chatbotId, userId);

      expect(Chatbot.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: chatbotId, userId },
        { isActive: false },
        { new: true }
      );
      expect(result).toEqual({ message: 'Chatbot deleted successfully' });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Chatbot deleted: bot-123'));
    });

    it('should apply tenant filter when soft deleting a chatbot with req context', async () => {
      const chatbotId = 'bot-123';
      const userId = 'user-123';
      const req = { tenantId: 'tenant-abc' };

      Chatbot.findOneAndUpdate.mockResolvedValue({ _id: chatbotId });

      await chatbotService.deleteChatbot(chatbotId, userId, req);

      expect(withTenantFilter).toHaveBeenCalledWith(req, { _id: chatbotId, userId });
    });

    it('should throw a 404 ApiError if the chatbot to delete is not found', async () => {
      Chatbot.findOneAndUpdate.mockResolvedValue(null);

      await expect(chatbotService.deleteChatbot('bot-none', 'user-123')).rejects.toThrow('Chatbot not found');
    });

    it('should propagate errors encountered during deletion', async () => {
      Chatbot.findOneAndUpdate.mockRejectedValue(new Error('Database write failure'));

      await expect(chatbotService.deleteChatbot('bot-123', 'user-123')).rejects.toThrow('Database write failure');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});