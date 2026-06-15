import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';

// Mock dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: fn => fn,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('./translation.service.js', () => ({
  translationService: {
    generateGuestUserId: vi.fn(),
    processConversationalRequest: vi.fn(),
    translateTextDirect: vi.fn(),
    detectLanguageDirect: vi.fn(),
  },
}));

vi.mock('../payment/payment.model.js', () => {
  const mockLean = vi.fn();
  const mockSort = vi.fn().mockImplementation(() => ({ lean: mockLean }));
  const mockFindOne = vi.fn().mockImplementation(() => ({ sort: mockSort }));
  
  class MockSubscriptionModel {
    static findOne = mockFindOne;
  }
  
  // Expose mocks for easy access in tests
  MockSubscriptionModel._mocks = {
    findOne: mockFindOne,
    sort: mockSort,
    lean: mockLean,
  };

  return { default: MockSubscriptionModel };
});

vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
  },
}));

vi.mock('./services/translationAPIClient.js', async () => ({
  translationAPIClient: {
    getSupportedLanguages: vi.fn(),
  },
}));


// Import mocked modules to access their mock functions
import sendResponse from '../../../shared/sendResponse.js';
import { translationService } from './translation.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { translationAPIClient } from './services/translationAPIClient.js';

// Dynamically import the controller to test
const { conversationalAssistant, translateText, detectLanguage, getSupportedLanguages } = await import('./translation.controller.js');

describe('Translation Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      user: null,
      isGuest: true,
      ip: '127.0.0.1',
      file: null,
    };
    res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('conversationalAssistant', () => {
    
    it('should process a request for a guest user successfully', async () => {
      req.body = { message: 'Hello' };
      req.isGuest = true;
      
      translationService.generateGuestUserId.mockReturnValue('guest_123');
      translationService.processConversationalRequest.mockResolvedValue({
        response: 'Hi there!',
        conversationId: 'conv_123',
        needsMoreInfo: false,
      });

      await conversationalAssistant(req, res);

      expect(translationService.processConversationalRequest).toHaveBeenCalledWith(
        'guest_123',
        'Hello',
        undefined,
        true,
        null,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: expect.any(Object),
      });
    });

    it('should use provided userId for a guest user', async () => {
        req.body = { message: 'Hello', userId: 'provided_guest_id' };
        req.isGuest = true;
        
        translationService.processConversationalRequest.mockResolvedValue({
          response: 'Hi there!',
          conversationId: 'conv_123',
          needsMoreInfo: false,
        });
  
        await conversationalAssistant(req, res);
  
        expect(translationService.generateGuestUserId).not.toHaveBeenCalled();
        expect(translationService.processConversationalRequest).toHaveBeenCalledWith(
          'provided_guest_id',
          'Hello',
          undefined,
          true,
          null,
          req
        );
    });

    it('should process a request for an authenticated user successfully', async () => {
      req.user = { userId: 'user_abc', role: 'user' };
      req.isGuest = false;
      req.body = { message: 'Translate this', conversationId: 'conv_456' };
      
      SubscriptionModel._mocks.lean.mockResolvedValue({ usage: 1000 });
      conversationHelpers.getConversationById.mockResolvedValue(50);
      translationService.processConversationalRequest.mockResolvedValue({
        response: 'Translated text',
        conversationId: 'conv_456',
      });

      await conversationalAssistant(req, res);

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user_abc' });
      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(null, 'user_abc', req);
      expect(translationService.processConversationalRequest).toHaveBeenCalledWith(
        'user_abc',
        'Translate this',
        'conv_456',
        false,
        null,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: expect.any(Object),
      });
    });
    
    it('should ignore userId in body for authenticated users to prevent IDOR', async () => {
        req.user = { userId: 'real_user_id', role: 'user' };
        req.isGuest = false;
        req.body = { message: 'Translate this', userId: 'spoofed_user_id' };
        
        SubscriptionModel._mocks.lean.mockResolvedValue({ usage: 1000 });
        conversationHelpers.getConversationById.mockResolvedValue(50);
        translationService.processConversationalRequest.mockResolvedValue({});
  
        await conversationalAssistant(req, res);
  
        expect(translationService.processConversationalRequest).toHaveBeenCalledWith(
          'real_user_id', // Ensures the authenticated user's ID is used
          'Translate this',
          undefined,
          false,
          null,
          req
        );
    });

    it('should reject request if authenticated user exceeds subscription limit', async () => {
      req.user = { userId: 'user_abc', role: 'user' };
      req.isGuest = false;
      req.body = { message: 'Translate this' };
      
      SubscriptionModel._mocks.lean.mockResolvedValue({ usage: 100 });
      conversationHelpers.getConversationById.mockResolvedValue(100); // Usage equals limit

      await conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your translation limit for this month. Please upgrade your plan to continue.',
      });
    });

    it('should return 500 if subscription check fails', async () => {
        req.user = { userId: 'user_abc', role: 'user' };
        req.isGuest = false;
        req.body = { message: 'Translate this' };
        
        SubscriptionModel._mocks.lean.mockRejectedValue(new Error('DB error'));
  
        await conversationalAssistant(req, res);
  
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          success: false,
          message: 'Failed to verify subscription status. Please try again later.',
        });
    });

    it('should return 400 if message is missing', async () => {
      req.body = {};
      await conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Message is required',
      });
    });

    it('should handle file uploads correctly', async () => {
        req.user = { userId: 'user_abc', role: 'user' };
        req.isGuest = false;
        req.body = { message: 'Translate this file' };
        req.file = { originalname: 'test.pdf', buffer: Buffer.from('test') };

        SubscriptionModel._mocks.lean.mockResolvedValue({ usage: 1000 });
        conversationHelpers.getConversationById.mockResolvedValue(50);
        translationService.processConversationalRequest.mockResolvedValue({});

        await conversationalAssistant(req, res);

        expect(translationService.processConversationalRequest).toHaveBeenCalledWith(
            'user_abc',
            'Translate this file',
            undefined,
            false,
            req.file,
            req
        );
    });

    it('should handle errors from the translation service', async () => {
        req.body = { message: 'Hello', conversationId: 'conv_123' };
        const serviceError = new Error('LLM API is down');
        serviceError.statusCode = 503;
        translationService.processConversationalRequest.mockRejectedValue(serviceError);

        await conversationalAssistant(req, res);

        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: 503,
            success: false,
            message: 'LLM API is down',
            data: {
                conversationId: 'conv_123',
                error: 'LLM API is down',
            },
        });
    });
  });

  describe('translateText', () => {
    it('should translate text successfully', async () => {
      req.body = { text: 'Hello world', targetLanguage: 'es' };
      translationService.translateTextDirect.mockResolvedValue({
        message: 'Translation successful',
        translation: 'Hola mundo',
      });

      await translateText(req, res);

      expect(translationService.translateTextDirect).toHaveBeenCalledWith('Hello world', 'es', undefined);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Translation successful',
        data: 'Hola mundo',
      });
    });

    it('should handle errors from the translation service', async () => {
      req.body = { text: 'Hello world', targetLanguage: 'es' };
      const serviceError = new Error('Invalid language code');
      serviceError.statusCode = 400;
      translationService.translateTextDirect.mockRejectedValue(serviceError);

      await translateText(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: 400,
        success: false,
        message: 'Invalid language code',
      });
    });
  });

  describe('detectLanguage', () => {
    it('should detect language successfully', async () => {
      req.body = { text: 'Bonjour' };
      translationService.detectLanguageDirect.mockResolvedValue({
        message: 'Language detection successful',
        detection: { language: 'fr', confidence: 0.99 },
      });

      await detectLanguage(req, res);

      expect(translationService.detectLanguageDirect).toHaveBeenCalledWith('Bonjour');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Language detection successful',
        data: { language: 'fr', confidence: 0.99 },
      });
    });

    it('should handle errors from the detection service', async () => {
      req.body = { text: '...' };
      const serviceError = new Error('Detection failed');
      translationService.detectLanguageDirect.mockRejectedValue(serviceError);

      await detectLanguage(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Detection failed',
      });
    });
  });

  describe('getSupportedLanguages', () => {
    it('should retrieve supported languages successfully', async () => {
      const languages = [{ code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }];
      translationAPIClient.getSupportedLanguages.mockResolvedValue(languages);

      await getSupportedLanguages(req, res);

      expect(translationAPIClient.getSupportedLanguages).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Supported languages retrieved successfully',
        data: languages,
      });
    });

    it('should handle errors when retrieving languages', async () => {
      translationAPIClient.getSupportedLanguages.mockRejectedValue(new Error('API error'));

      await getSupportedLanguages(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve supported languages',
      });
    });
  });

  // Note: Rate limiting logic is implicitly tested as it's part of every controller.
  // A dedicated test for rate limiting itself would require exporting `checkRateLimit`
  // or more complex mocking of the Redis/memory store state across multiple calls.
  // For this controller, we confirm it's called and can block requests.
  describe('Rate Limiting', () => {
    it('should block a request that exceeds the rate limit', async () => {
        // This test simulates the memory fallback path as Redis is not mocked to be available.
        req.body = { text: 'test' };
        
        // Call the controller more times than the limit (20 for translateText)
        // Since the memory store is shared in the module scope, we can test it this way.
        for (let i = 0; i < 20; i++) {
            await translateText(req, res);
        }

        // The 21st call should be blocked
        await translateText(req, res);

        expect(sendResponse).toHaveBeenLastCalledWith(res, {
            statusCode: httpStatus.TOO_MANY_REQUESTS,
            success: false,
            message: 'Too many translation requests. Please try again later.',
        });
        expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 20);
        expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
    });
  });
});