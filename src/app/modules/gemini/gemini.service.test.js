import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { GeminiAiService } from './gemini.service.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import { paymentController } from '../payment/payment.controller.js';
import { RedisClient } from '../../../shared/redis.js';
import { UnifiedSmartRouter } from '../../helpers/UnifiedSmartRouter.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';

// Mock external dependencies
vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn().mockResolvedValue({
    response: {
      candidates: [{ content: { parts: [{ text: 'Mocked AI reply' }] } }],
    },
    usage: { total_time: 100 },
  });
  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
  });
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
  };
});

vi.mock('../auth/auth.model.js');
vi.mock('../conversations/chatHistory.model.js');
vi.mock('../payment/payment.controller.js');
vi.mock('../../../shared/redis.js');
vi.mock('../../helpers/UnifiedSmartRouter.js');
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GeminiAiService', () => {
  const sessionId = 'test-session-123';
  const prompt = 'Hello, world!';
  const userId = 'user-id-123';
  const tenantId = 'tenant-id-456';
  const managerId = 'manager-id-789';

  let mockUserModel, mockChatHistoryModel;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Default successful mocks
    mockUserModel = {
      findById: vi.fn().mockReturnThis(),
      findOne: vi.fn().mockReturnThis(),
      findByIdAndUpdate: vi.fn().mockResolvedValue(true),
      updateMany: vi.fn().mockResolvedValue(true),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn(),
    };
    UserModel.findById.mockImplementation(mockUserModel.findById);
    UserModel.findOne.mockImplementation(mockUserModel.findOne);
    UserModel.findByIdAndUpdate.mockImplementation(mockUserModel.findByIdAndUpdate);
    UserModel.updateMany.mockImplementation(mockUserModel.updateMany);

    mockChatHistoryModel = {
      findOne: vi.fn().mockReturnThis(),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1, matchedCount: 1 }),
      create: vi.fn().mockResolvedValue({ _id: 'new-chat-id' }),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn(),
    };
    ChatHistory.findOne.mockImplementation(mockChatHistoryModel.findOne);
    ChatHistory.updateOne.mockImplementation(mockChatHistoryModel.updateOne);
    ChatHistory.create.mockImplementation(mockChatHistoryModel.create);

    paymentController.incrementPromptsUsed.mockResolvedValue({ success: true });
    RedisClient.publish.mockResolvedValue(1);
    UnifiedSmartRouter.combinedRouteAndEnhancePrompt.mockImplementation(p => Promise.resolve(`enhanced: ${p}`));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Core Logic (_handleGeminiInteraction)', () => {
    it('should successfully process a prompt for a new conversation', async () => {
      const mockUser = {
        _id: userId,
        role: 'user',
        tenantId,
        managerId,
        promptLimit: 100,
        promptsUsed: 10,
      };
      mockUserModel.lean.mockResolvedValueOnce(mockUser); // For findById
      mockChatHistoryModel.lean.mockResolvedValueOnce(null); // No existing history
      mockChatHistoryModel.updateOne.mockResolvedValueOnce({ modifiedCount: 0 }); // Simulate new conversation

      const result = await GeminiAiService.geminiService(sessionId, prompt, userId);

      expect(result).toEqual({
        prompt,
        sessionId,
        reply: 'Mocked AI reply',
      });

      // Verify checks and operations
      expect(UserModel.findById).toHaveBeenCalledWith(userId);
      expect(UnifiedSmartRouter.combinedRouteAndEnhancePrompt).toHaveBeenCalledWith(prompt);
      expect(paymentController.incrementPromptsUsed).toHaveBeenCalledWith(userId);
      expect(ChatHistory.create).toHaveBeenCalled();
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(userId, {
        $push: { geminiAiSessions: 'new-chat-id' },
      });

      // Verify propagation
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(managerId, { $inc: { managedUsageCount: 1 } });
      expect(UserModel.updateMany).toHaveBeenCalledWith({ tenantId, role: 'admin' }, { $inc: { tenantUsageCount: 1 } });
      expect(UserModel.updateMany).toHaveBeenCalledWith({ role: 'super_admin' }, { $inc: { platformUsageCount: 1 } });

      // Verify Redis publish
      expect(RedisClient.publish).toHaveBeenCalled();
    });

    it('should successfully process a prompt for an existing conversation', async () => {
      const mockUser = { role: 'user', tenantId, promptLimit: 100, promptsUsed: 10 };
      const mockHistory = {
        responses: [{ prompt: 'old prompt', reply: 'old reply' }],
      };
      mockUserModel.lean.mockResolvedValueOnce(mockUser);
      mockChatHistoryModel.lean.mockResolvedValueOnce(mockHistory);

      await GeminiAiService.geminiService(sessionId, prompt, userId);

      expect(ChatHistory.findOne).toHaveBeenCalledWith({ user: userId, sessionId });
      expect(ChatHistory.updateOne).toHaveBeenCalled();
      expect(ChatHistory.create).not.toHaveBeenCalled();
    });

    it('should not publish to Redis for gemini25PreviewService', async () => {
      const mockUser = { role: 'user', tenantId, promptLimit: 100, promptsUsed: 10 };
      mockUserModel.lean.mockResolvedValueOnce(mockUser);
      mockChatHistoryModel.lean.mockResolvedValueOnce(null);
      mockChatHistoryModel.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });

      await GeminiAiService.gemini25PreviewService(sessionId, prompt, userId);

      expect(RedisClient.publish).not.toHaveBeenCalled();
    });

    describe('Role-Based Access and Context Boundaries', () => {
      it('should allow super_admin without a tenantId', async () => {
        const mockSuperAdmin = { role: 'super_admin', promptLimit: 1000, promptsUsed: 0 };
        mockUserModel.lean.mockResolvedValueOnce(mockSuperAdmin);
        mockChatHistoryModel.lean.mockResolvedValueOnce(null);
        mockChatHistoryModel.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });

        await expect(GeminiAiService.geminiService(sessionId, prompt, userId)).resolves.toBeDefined();
        expect(UserModel.updateMany).toHaveBeenCalledWith({ role: 'super_admin' }, { $inc: { platformUsageCount: 1 } });
      });

      it('should throw FORBIDDEN for an invalid user role', async () => {
        const mockInvalidRoleUser = { role: 'guest', tenantId };
        mockUserModel.lean.mockResolvedValueOnce(mockInvalidRoleUser);

        await expect(GeminiAiService.geminiService(sessionId, prompt, userId)).rejects.toThrow(
          new ApiError(httpStatus.FORBIDDEN, 'Unauthorized role or invalid role configuration')
        );
      });

      it('should throw BAD_REQUEST for a non-super_admin user without a tenantId', async () => {
        const mockUserNoTenant = { role: 'user', tenantId: null };
        mockUserModel.lean.mockResolvedValueOnce(mockUserNoTenant);

        await expect(GeminiAiService.geminiService(sessionId, prompt, userId)).rejects.toThrow(
          new ApiError(httpStatus.BAD_REQUEST, 'User is not associated with any tenant/workspace context')
        );
      });
    });

    describe('Error Handling and Limits', () => {
      it('should throw NOT_FOUND if user does not exist', async () => {
        mockUserModel.lean.mockResolvedValueOnce(null);
        await expect(GeminiAiService.geminiService(sessionId, prompt, userId)).rejects.toThrow(
          new ApiError(httpStatus.NOT_FOUND, 'User not found')
        );
      });

      it('should throw PAYMENT_REQUIRED if user prompt limit is exceeded', async () => {
        const mockUser = { role: 'user', tenantId, promptLimit: 50, promptsUsed: 50 };
        mockUserModel.lean.mockResolvedValueOnce(mockUser);

        await expect(GeminiAiService.geminiService(sessionId, prompt, userId)).rejects.toThrow(
          new ApiError(httpStatus.PAYMENT_REQUIRED, 'User prompt limit exceeded')
        );
      });

      it('should throw PAYMENT_REQUIRED if tenant limit is exceeded', async () => {
        const mockUser = { role: 'user', tenantId, promptLimit: 100, promptsUsed: 10 };
        const mockTenantAdmin = { tenantLimit: 200, tenantUsage: 200 };
        mockUserModel.lean.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(mockTenantAdmin);

        await expect(GeminiAiService.geminiService(sessionId, prompt, userId)).rejects.toThrow(
          new ApiError(httpStatus.PAYMENT_REQUIRED, 'Workspace/Tenant limit exceeded')
        );
      });

      it('should throw BAD_REQUEST if payment increment fails', async () => {
        const mockUser = { role: 'user', tenantId, promptLimit: 100, promptsUsed: 10 };
        mockUserModel.lean.mockResolvedValueOnce(mockUser);
        paymentController.incrementPromptsUsed.mockResolvedValueOnce({
          success: false,
          message: 'Payment failed',
        });

        await expect(GeminiAiService.geminiService(sessionId, prompt, userId)).rejects.toThrow(
          new ApiError(httpStatus.BAD_REQUEST, 'Payment failed')
        );
      });

      it('should handle errors from paymentController.incrementPromptsUsed', async () => {
        const mockUser = { role: 'user', tenantId, promptLimit: 100, promptsUsed: 10 };
        mockUserModel.lean.mockResolvedValueOnce(mockUser);
        const paymentError = new Error('Internal payment system error');
        paymentController.incrementPromptsUsed.mockRejectedValueOnce(paymentError);

        await expect(GeminiAiService.geminiService(sessionId, prompt, userId)).rejects.toThrow(
          new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Internal payment system error')
        );
      });

      it('should handle generic errors and wrap them in ApiError', async () => {
        const genericError = new Error('Something went wrong');
        mockUserModel.lean.mockRejectedValueOnce(genericError);

        await expect(GeminiAiService.geminiService(sessionId, prompt, userId)).rejects.toThrow(
          new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Gemini Service failed')
        );
        expect(logger.error).toHaveBeenCalledWith('Gemini Service Error:', genericError);
      });
    });
  });
});