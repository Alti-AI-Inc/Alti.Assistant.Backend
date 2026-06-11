import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { PubSub } from '@google-cloud/pubsub';
import { paymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from './payment.model.js';
import sendResponse from '../../../shared/sendResponse.js';

// Mock external dependencies
vi.mock('@google-cloud/pubsub');
vi.mock('../../../shared/sendResponse.js');
vi.mock('./payment.service.js');
vi.mock('../auth/auth.model.js');
vi.mock('./payment.model.js');
vi.mock('mongoose', async () => {
  const actualMongoose = await vi.importActual('mongoose');
  return {
    ...actualMongoose,
    default: {
      ...actualMongoose.default,
      connect: vi.fn(),
      connection: {
        on: vi.fn(),
      },
      Types: {
        ObjectId: {
          isValid: vi.fn(),
        },
      },
    },
  };
});

describe('Payment Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      headers: {},
      rawBody: null,
      user: {}, // Mock user object from auth middleware
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
    };
    vi.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('should return 400 if userId is invalid', async () => {
      req.body = { userId: 'invalid-id', plan: 'monthly' };
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      await paymentController.createCheckoutSession(req, res);

      expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('invalid-id');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid User ID' });
    });

    it('should return 404 if user is not found', async () => {
      const validId = '60d0fe4f5311236168a109ca';
      req.body = { userId: validId, plan: 'monthly' };
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      UserModel.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      await paymentController.createCheckoutSession(req, res);

      expect(UserModel.findById).toHaveBeenCalledWith(validId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should create a checkout session and return 200 on success', async () => {
      const validId = '60d0fe4f5311236168a109ca';
      const mockUser = { _id: validId, email: 'test@example.com' };
      const mockSessionUrl = 'https://stripe.com/session/123';
      req.body = { userId: validId, plan: 'monthly' };

      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      UserModel.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      });
      PaymentService.createCheckoutSessionService.mockResolvedValue(mockSessionUrl);

      await paymentController.createCheckoutSession(req, res);

      expect(UserModel.findById).toHaveBeenCalledWith(validId);
      expect(PaymentService.createCheckoutSessionService).toHaveBeenCalledWith(mockUser, 'monthly');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: 200,
        success: true,
        message: 'Checkout session created successfully',
        data: { url: mockSessionUrl },
      });
    });
  });

  describe('handleWebhook', () => {
    const mockPublishMessage = vi.fn();
    const mockTopic = vi.fn(() => ({
      publishMessage: mockPublishMessage,
    }));

    beforeEach(() => {
      PubSub.mockImplementation(() => ({
        topic: mockTopic,
      }));
      // Re-initialize to ensure the mock is picked up
      new PubSub();
    });

    it('should publish webhook payload with rawBody to Pub/Sub and respond 200', async () => {
      const rawBodyString = '{"id":"evt_123","type":"checkout.session.completed"}';
      req.rawBody = Buffer.from(rawBodyString);
      req.headers = { 'stripe-signature': 'sig_123' };

      await paymentController.handleWebhook(req, res);

      const expectedPayload = {
        headers: req.headers,
        body: rawBodyString,
        stripeSignature: 'sig_123',
      };
      const expectedBuffer = Buffer.from(JSON.stringify(expectedPayload));

      expect(mockTopic).toHaveBeenCalledWith(process.env.STRIPE_WEBHOOK_TOPIC || 'stripe-webhooks');
      expect(mockPublishMessage).toHaveBeenCalledWith({ data: expectedBuffer });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: 200,
        success: true,
        message: 'Webhook received and queued for processing.',
        data: { received: true },
      });
    });

    it('should publish webhook payload with req.body if rawBody is missing', async () => {
      req.body = { id: 'evt_123', type: 'checkout.session.completed' };
      req.headers = { 'stripe-signature': 'sig_123' };
      req.rawBody = undefined;

      await paymentController.handleWebhook(req, res);

      const expectedPayload = {
        headers: req.headers,
        body: JSON.stringify(req.body),
        stripeSignature: 'sig_123',
      };
      const expectedBuffer = Buffer.from(JSON.stringify(expectedPayload));

      expect(mockPublishMessage).toHaveBeenCalledWith({ data: expectedBuffer });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: 200,
        success: true,
        message: 'Webhook received and queued for processing.',
        data: { received: true },
      });
    });
  });

  describe('getAllSubscriptions', () => {
    it('should fetch all subscriptions and return 200', async () => {
      const mockSubscriptions = [{ plan: 'monthly' }, { plan: 'yearly' }];
      const mockQuery = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockSubscriptions),
      };
      SubscriptionModel.find.mockReturnValue(mockQuery);

      await paymentController.getAllSubscriptions(req, res);

      expect(SubscriptionModel.find).toHaveBeenCalledWith({});
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(500);
      expect(mockQuery.lean).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: 200,
        success: true,
        message: 'All subscriptions fetched successfully',
        data: mockSubscriptions,
      });
    });
  });

  describe('getSubscriptionsByUserId', () => {
    it('should return 400 if userId is not provided in params', async () => {
      // Note: This is an edge case test, as Express routing would typically prevent this.
      req.params = {};
      await paymentController.getSubscriptionsByUserId(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User ID is required' });
    });

    it('should return 404 if no subscriptions are found for a user', async () => {
      const userId = '60d0fe4f5311236168a109ca';
      req.params = { userId };
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      };
      SubscriptionModel.find.mockReturnValue(mockQuery);

      await paymentController.getSubscriptionsByUserId(req, res);

      expect(SubscriptionModel.find).toHaveBeenCalledWith({ userId });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: 404,
        success: false,
        message: 'No subscriptions found for this user',
      });
    });

    it('should fetch subscriptions for a specific user and return 200', async () => {
      const userId = '60d0fe4f5311236168a109ca';
      const mockSubscriptions = [{ userId, plan: 'monthly' }];
      req.params = { userId };
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockSubscriptions),
      };
      SubscriptionModel.find.mockReturnValue(mockQuery);

      await paymentController.getSubscriptionsByUserId(req, res);

      expect(SubscriptionModel.find).toHaveBeenCalledWith({ userId });
      expect(mockQuery.populate).toHaveBeenCalledWith('userId', 'email');
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockQuery.lean).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: 200,
        success: true,
        message: 'User subscriptions fetched successfully',
        data: mockSubscriptions,
      });
    });
  });

  describe('incrementPromptsUsed & incrementImagesUsed', () => {
    const mockPublishMessage = vi.fn();
    const mockTopic = vi.fn(() => ({
      publishMessage: mockPublishMessage,
    }));

    beforeEach(() => {
      PubSub.mockImplementation(() => ({
        topic: mockTopic,
      }));
      new PubSub();
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('incrementPromptsUsed should publish a "prompt" usage event', async () => {
      const userId = 'user_prompt_123';
      mockPublishMessage.mockResolvedValue('message-id-1');

      const result = await paymentController.incrementPromptsUsed(userId);

      const expectedPayload = {
        userId: userId,
        type: 'prompt',
        timestamp: '2023-01-01T00:00:00.000Z',
      };
      const expectedBuffer = Buffer.from(JSON.stringify(expectedPayload));

      expect(mockTopic).toHaveBeenCalledWith(process.env.USAGE_TRACKING_TOPIC || 'usage-tracking');
      expect(mockPublishMessage).toHaveBeenCalledWith({ data: expectedBuffer });
      expect(result).toEqual({
        success: true,
        message: 'Prompt usage increment task was successfully offloaded.',
      });
    });

    it('incrementImagesUsed should publish an "image" usage event', async () => {
      const userId = 'user_image_123';
      mockPublishMessage.mockResolvedValue('message-id-2');

      const result = await paymentController.incrementImagesUsed(userId);

      const expectedPayload = {
        userId: userId,
        type: 'image',
        timestamp: '2023-01-01T00:00:00.000Z',
      };
      const expectedBuffer = Buffer.from(JSON.stringify(expectedPayload));

      expect(mockTopic).toHaveBeenCalledWith(process.env.USAGE_TRACKING_TOPIC || 'usage-tracking');
      expect(mockPublishMessage).toHaveBeenCalledWith({ data: expectedBuffer });
      expect(result).toEqual({
        success: true,
        message: 'Image usage increment task was successfully offloaded.',
      });
    });

    it('should return success: false if publishing fails', async () => {
      const userId = 'user_fail_123';
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPublishMessage.mockRejectedValue(new Error('Pub/Sub error'));

      const result = await paymentController.incrementPromptsUsed(userId);

      expect(result).toEqual({
        success: false,
        message: 'Failed to offload usage increment task.',
      });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});