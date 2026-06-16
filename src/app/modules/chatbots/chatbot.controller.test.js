import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';

const { sendResponse, chatbotService } = vi.hoisted(() => {
  return {
    sendResponse: vi.fn(),
    chatbotService: {
      createChatbot: vi.fn(),
      getChatbots: vi.fn(),
      getChatbotById: vi.fn(),
      updateChatbot: vi.fn(),
      deleteChatbot: vi.fn(),
      getWorkspaceMetrics: vi.fn(),
      getTeamMembers: vi.fn(),
      inviteTeamMember: vi.fn(),
      updateTeamMemberRole: vi.fn(),
      removeTeamMember: vi.fn(),
    },
  };
});

vi.mock('../../../shared/sendResponse.js', () => ({
  default: sendResponse,
}));

vi.mock('./chatbot.service.js', () => ({
  chatbotService: chatbotService,
}));

// Import the controller after mocks are set up
import { chatbotController } from './chatbot.controller.js';

describe('Chatbot Controller', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock req and res objects
    req = {
      body: {},
      params: {},
      query: {},
      user: {
        userId: 'testUserId123',
      },
    };
    // For sendResponse, we only need to pass the res object,
    // it doesn't directly call methods on `res` in the controller's context.
    res = {};
  });

  describe('createChatbot', () => {
    it('should create a chatbot and send a success response', async () => {
      const mockChatbotData = { name: 'Test Bot', description: 'A test chatbot' };
      const mockCreatedChatbot = { id: 'chatbotId1', ...mockChatbotData, userId: req.user.userId };

      req.body = mockChatbotData;
      chatbotService.createChatbot.mockResolvedValue(mockCreatedChatbot);

      await chatbotController.createChatbot(req, res);

      expect(chatbotService.createChatbot).toHaveBeenCalledWith(req.body, req.user.userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Chatbot created successfully',
        data: mockCreatedChatbot,
      });
    });
  });

  describe('getChatbots', () => {
    it('should retrieve chatbots and send a success response', async () => {
      const mockQuery = { page: 1, limit: 10, search: 'test' };
      const mockChatbots = [{ id: 'chatbotId1', name: 'Bot A' }, { id: 'chatbotId2', name: 'Bot B' }];

      req.query = mockQuery;
      chatbotService.getChatbots.mockResolvedValue(mockChatbots);

      await chatbotController.getChatbots(req, res);

      expect(chatbotService.getChatbots).toHaveBeenCalledWith(req.user.userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Chatbots retrieved successfully',
        data: mockChatbots,
      });
    });
  });

  describe('getChatbotById', () => {
    it('should retrieve a chatbot by ID and send a success response', async () => {
      const chatbotId = 'chatbotId123';
      const mockChatbot = { id: chatbotId, name: 'Specific Bot', description: 'Details for specific bot' };

      req.params.id = chatbotId;
      chatbotService.getChatbotById.mockResolvedValue(mockChatbot);

      await chatbotController.getChatbotById(req, res);

      expect(chatbotService.getChatbotById).toHaveBeenCalledWith(chatbotId, req.user.userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Chatbot retrieved successfully',
        data: mockChatbot,
      });
    });
  });

  describe('updateChatbot', () => {
    it('should update a chatbot and send a success response', async () => {
      const chatbotId = 'chatbotId123';
      const updatePayload = { name: 'Updated Bot Name', description: 'New description' };
      const mockUpdatedChatbot = { id: chatbotId, ...updatePayload, userId: req.user.userId };

      req.params.id = chatbotId;
      req.body = updatePayload;
      chatbotService.updateChatbot.mockResolvedValue(mockUpdatedChatbot);

      await chatbotController.updateChatbot(req, res);

      expect(chatbotService.updateChatbot).toHaveBeenCalledWith(chatbotId, req.user.userId, updatePayload, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Chatbot updated successfully',
        data: mockUpdatedChatbot,
      });
    });
  });

  describe('deleteChatbot', () => {
    it('should delete a chatbot and send a success response', async () => {
      const chatbotId = 'chatbotId123';
      const mockDeletedChatbot = { id: chatbotId, name: 'Deleted Bot', isDeleted: true };

      req.params.id = chatbotId;
      chatbotService.deleteChatbot.mockResolvedValue(mockDeletedChatbot);

      await chatbotController.deleteChatbot(req, res);

      expect(chatbotService.deleteChatbot).toHaveBeenCalledWith(chatbotId, req.user.userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Chatbot deleted successfully',
        data: mockDeletedChatbot,
      });
    });
  });
});