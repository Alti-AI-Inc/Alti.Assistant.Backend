import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { articleWriterController } from './article_writer.controller.js'; // The file under test

// Mock dependencies
const mockCatchAsync = (fn) => fn; // Directly execute the async function
const mockSendResponse = vi.fn();
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

const mockArticleWriterService = {
  generateGuestUserId: vi.fn(),
  processConversationalRequest: vi.fn(),
  getConversationHistory: vi.fn(),
};

const mockSubscriptionModel = {
  findOne: vi.fn().mockReturnThis(), // Allows chaining .sort().lean()
  sort: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};

const mockConversationModel = {
  countDocuments: vi.fn(),
};

// Mock the modules
vi.mock('http-status', () => ({ default: httpStatus }));
vi.mock('../../../shared/catchAsync.js', () => ({ default: mockCatchAsync }));
vi.mock('../../../shared/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../../shared/sendResponse.js', () => ({ default: mockSendResponse }));
vi.mock('./article_writer.service.js', () => ({ articleWriterService: mockArticleWriterService }));
vi.mock('../subscription/subscription.model.js', () => ({ default: mockSubscriptionModel }));
vi.mock('../conversations/conversation.model.js', () => ({ default: mockConversationModel }));
// conversationHelpers is imported but not used, so no need to mock it unless it were used.

// Destructure the functions to test after mocking catchAsync
const { conversationalAssistant, getConversationHistory } = articleWriterController;

describe('Article Writer Controller', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      user: null, // Default to no authenticated user
      isGuest: false, // Default to not guest
      file: null,
    };
    res = {
      statusCode: 0,
      data: null,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();

    // Reset all mocks before each test
    vi.clearAllMocks();

    // Ensure sendResponse uses the mock res object and calls res.status().json()
    mockSendResponse.mockImplementation((resObj, data) => {
      resObj.statusCode = data.statusCode;
      resObj.data = data;
      resObj.status(data.statusCode).json(data);
    });
  });

  // --- conversationalAssistant tests ---
  describe('conversationalAssistant', () => {
    it('should return 400 if message is missing from req.body', async () => {
      req.body = { conversationId: 'conv123' }; // No message

      await conversationalAssistant(req, res, next);

      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'Message is required',
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Message is required',
      }));
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockArticleWriterService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should return 500 if userId cannot be determined (e.g., guest user ID generation fails)', async () => {
      req.isGuest = true;
      req.body = { message: 'Test message' };
      mockArticleWriterService.generateGuestUserId.mockReturnValue(null); // Simulate failure to generate guest ID

      await conversationalAssistant(req, res, next);

      expect(mockArticleWriterService.generateGuestUserId).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          success: false,
          message: 'Failed to generate user identifier',
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to generate user identifier',
      }));
      expect(mockArticleWriterService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should handle guest user request without file and for a new conversation', async () => {
      req.isGuest = true;
      req.body = { message: 'Write an article about AI.' };
      mockArticleWriterService.generateGuestUserId.mockReturnValue('guest123');
      mockArticleWriterService.processConversationalRequest.mockResolvedValue({
        conversationId: 'newConvId',
        response: 'Generated article content for guest.',
      });

      await conversationalAssistant(req, res, next);

      expect(mockArticleWriterService.generateGuestUserId).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('guest user guest123'),
        expect.objectContaining({ hasFile: false, conversationId: undefined })
      );
      expect(mockArticleWriterService.processConversationalRequest).toHaveBeenCalledWith(
        'guest123',
        'Write an article about AI.',
        undefined, // conversationId
        null, // fileInfo
        true, // isGuest
        undefined, // articleType
        undefined, // tone
        undefined, // length
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.OK,
          success: true,
          message: 'Article generated successfully',
          data: {
            conversationId: 'newConvId',
            response: 'Generated article content for guest.',
            isGuest: true,
          },
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: {
          conversationId: 'newConvId',
          response: 'Generated article content for guest.',
          isGuest: true,
        },
      }));
    });

    it('should handle authenticated user request with file and existing conversation', async () => {
      req.user = { userId: 'user456' };
      req.body = {
        message: 'Continue article about blockchain.',
        conversationId: 'existingConvId',
        articleType: 'blog post',
        tone: 'informative',
        length: 'medium',
      };
      req.file = {
        filename: 'test.pdf',
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/uploads/test.pdf',
        location: 's3://bucket/test.pdf',
      };
      mockSubscriptionModel.lean.mockResolvedValue({ userId: 'user456', usage: 5 }); // Monthly limit of 5
      mockConversationModel.countDocuments.mockResolvedValue(2); // User has 2 conversations this month
      mockArticleWriterService.processConversationalRequest.mockResolvedValue({
        conversationId: 'existingConvId',
        response: 'Generated article content for authenticated user.',
      });

      await conversationalAssistant(req, res, next);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user456' });
      expect(mockSubscriptionModel.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockSubscriptionModel.lean).toHaveBeenCalled();
      expect(mockConversationModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user456',
          createdAt: { $gte: expect.any(Date) },
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('authenticated user user456'),
        expect.objectContaining({
          hasFile: true,
          conversationId: 'existingConvId',
          articleType: 'blog post',
          tone: 'informative',
          length: 'medium',
        })
      );
      expect(mockArticleWriterService.processConversationalRequest).toHaveBeenCalledWith(
        'user456',
        'Continue article about blockchain.',
        'existingConvId',
        expect.objectContaining({
          filename: 'test.pdf',
          originalName: 'test.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          path: '/uploads/test.pdf',
          location: 's3://bucket/test.pdf',
        }),
        false, // isGuest
        'blog post',
        'informative',
        'medium',
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.OK,
          success: true,
          message: 'Article generated successfully',
          data: {
            conversationId: 'existingConvId',
            response: 'Generated article content for authenticated user.',
            isGuest: false,
          },
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: {
          conversationId: 'existingConvId',
          response: 'Generated article content for authenticated user.',
          isGuest: false,
        },
      }));
    });

    it('should return 403 if authenticated user reaches subscription limit', async () => {
      req.user = { userId: 'user789' };
      req.body = { message: 'Try to write an article.' };
      mockSubscriptionModel.lean.mockResolvedValue({ userId: 'user789', usage: 2 }); // Monthly limit of 2
      mockConversationModel.countDocuments.mockResolvedValue(2); // User already has 2 conversations this month

      await conversationalAssistant(req, res, next);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user789' });
      expect(mockConversationModel.countDocuments).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.FORBIDDEN,
          success: false,
          message: 'You have reached your article writing limit for this month. Please upgrade your plan to continue.',
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.FORBIDDEN);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'You have reached your article writing limit for this month. Please upgrade your plan to continue.',
      }));
      expect(mockArticleWriterService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should allow authenticated user if subscription limit is not reached', async () => {
      req.user = { userId: 'user101' };
      req.body = { message: 'Another article.' };
      mockSubscriptionModel.lean.mockResolvedValue({ userId: 'user101', usage: 5 }); // Monthly limit of 5
      mockConversationModel.countDocuments.mockResolvedValue(3); // User has 3 conversations this month (3 < 5)
      mockArticleWriterService.processConversationalRequest.mockResolvedValue({
        conversationId: 'newConvId2',
        response: 'Allowed article content.',
      });

      await conversationalAssistant(req, res, next);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user101' });
      expect(mockConversationModel.countDocuments).toHaveBeenCalled();
      expect(mockArticleWriterService.processConversationalRequest).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.OK,
          success: true,
          message: 'Article generated successfully',
          data: {
            conversationId: 'newConvId2',
            response: 'Allowed article content.',
            isGuest: false,
          },
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: {
          conversationId: 'newConvId2',
          response: 'Allowed article content.',
          isGuest: false,
        },
      }));
    });

    it('should allow authenticated user if no subscription found (monthlyLimit defaults to 0)', async () => {
      req.user = { userId: 'user102' };
      req.body = { message: 'Another article.' };
      mockSubscriptionModel.lean.mockResolvedValue(null); // No subscription found, so usage is 0
      mockConversationModel.countDocuments.mockResolvedValue(10); // User has 10 conversations this month
      mockArticleWriterService.processConversationalRequest.mockResolvedValue({
        conversationId: 'newConvId3',
        response: 'Allowed article content.',
      });

      await conversationalAssistant(req, res, next);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user102' });
      expect(mockConversationModel.countDocuments).toHaveBeenCalled(); // Still counts, but limit check (0 > 0) fails
      expect(mockArticleWriterService.processConversationalRequest).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.OK,
          success: true,
          message: 'Article generated successfully',
          data: {
            conversationId: 'newConvId3',
            response: 'Allowed article content.',
            isGuest: false,
          },
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: {
          conversationId: 'newConvId3',
          response: 'Allowed article content.',
          isGuest: false,
        },
      }));
    });

    it('should handle errors from articleWriterService.processConversationalRequest with custom status code', async () => {
      req.user = { userId: 'user_err' };
      req.body = { message: 'Error prone request.' };
      mockSubscriptionModel.lean.mockResolvedValue({ userId: 'user_err', usage: 10 });
      mockConversationModel.countDocuments.mockResolvedValue(0);
      const serviceError = new Error('Service failed');
      serviceError.statusCode = httpStatus.BAD_GATEWAY;
      mockArticleWriterService.processConversationalRequest.mockRejectedValue(serviceError);

      await conversationalAssistant(req, res, next);

      expect(mockArticleWriterService.processConversationalRequest).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in conversational article writer:',
        serviceError
      );
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.BAD_GATEWAY,
          success: false,
          message: 'Service failed',
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_GATEWAY);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Service failed',
      }));
    });

    it('should handle generic errors from articleWriterService.processConversationalRequest', async () => {
      req.user = { userId: 'user_generic_err' };
      req.body = { message: 'Generic error request.' };
      mockSubscriptionModel.lean.mockResolvedValue({ userId: 'user_generic_err', usage: 10 });
      mockConversationModel.countDocuments.mockResolvedValue(0);
      const genericError = new Error('Something went wrong');
      mockArticleWriterService.processConversationalRequest.mockRejectedValue(genericError);

      await conversationalAssistant(req, res, next);

      expect(mockArticleWriterService.processConversationalRequest).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in conversational article writer:',
        genericError
      );
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          success: false,
          message: 'Failed to generate article',
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to generate article',
      }));
    });

    it('should use req.user._id if userId is not present in req.user but _id is', async () => {
      req.user = { _id: 'user_id_from_mongo' }; // Simulate user object from Mongoose
      req.body = { message: 'Article with _id user.' };
      mockSubscriptionModel.lean.mockResolvedValue({ userId: 'user_id_from_mongo', usage: 10 });
      mockConversationModel.countDocuments.mockResolvedValue(0);
      mockArticleWriterService.processConversationalRequest.mockResolvedValue({
        conversationId: 'newConvId_id',
        response: 'Article content for _id user.',
      });

      await conversationalAssistant(req, res, next);

      expect(mockArticleWriterService.processConversationalRequest).toHaveBeenCalledWith(
        'user_id_from_mongo', // Expect _id to be used as userId
        'Article with _id user.',
        undefined, // conversationId
        null, // fileInfo
        false, // isGuest
        undefined, // articleType
        undefined, // tone
        undefined, // length
        req
      );
    });
  });

  // --- getConversationHistory tests ---
  describe('getConversationHistory', () => {
    it('should retrieve conversation history successfully for an authenticated user', async () => {
      req.params.conversationId = 'conv123';
      req.user = { userId: 'user456' };
      const mockConversationData = [
        { _id: 'msg1', role: 'user', content: 'Hello' },
        { _id: 'msg2', role: 'assistant', content: 'Hi there!' },
      ];
      mockArticleWriterService.getConversationHistory.mockResolvedValue(mockConversationData);

      await getConversationHistory(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching conversation history for conv123'
      );
      expect(mockArticleWriterService.getConversationHistory).toHaveBeenCalledWith(
        'conv123',
        'user456'
      );
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.OK,
          success: true,
          message: 'Conversation history retrieved successfully',
          data: mockConversationData,
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockConversationData,
      }));
    });

    it('should handle errors when retrieving conversation history with custom status code', async () => {
      req.params.conversationId = 'conv_err';
      req.user = { userId: 'user_err' };
      const serviceError = new Error('Failed to fetch history');
      serviceError.statusCode = httpStatus.NOT_FOUND;
      mockArticleWriterService.getConversationHistory.mockRejectedValue(serviceError);

      await getConversationHistory(req, res, next);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching conversation history:',
        serviceError
      );
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.NOT_FOUND,
          success: false,
          message: 'Failed to fetch history',
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to fetch history',
      }));
    });

    it('should handle generic errors when retrieving conversation history', async () => {
      req.params.conversationId = 'conv_generic_err';
      req.user = { userId: 'user_generic_err' };
      const genericError = new Error('Database connection lost');
      mockArticleWriterService.getConversationHistory.mockRejectedValue(genericError);

      await getConversationHistory(req, res, next);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching conversation history:',
        genericError
      );
      expect(mockSendResponse).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          success: false,
          message: 'Failed to fetch conversation history',
        })
      );
      expect(res.status).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to fetch conversation history',
      }));
    });
  });
});