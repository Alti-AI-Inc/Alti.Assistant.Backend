import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import subscriptionService from '../subscription/subscription.service.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { sendSecurityAlert } from '../../../shared/securityAlerts.js';
import StripeEvent from '../subscription/stripeEvent.model.js';
import { isStripeIp } from '../../../shared/stripeSecurity.js';
import StripeWebhookController from './webhook.controller.js'; // The module under test

// Mock all external dependencies
vi.mock('stripe', () => {
  const mockStripe = {
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  // Mock the constructor to return the mockStripe instance
  const StripeConstructor = vi.fn().mockImplementation(() => mockStripe);
  // Add static properties if needed, e.g., Stripe.errors
  StripeConstructor.errors = {
    StripeSignatureVerificationError: class extends Error {
      constructor(message, signature, header, detail) {
        super(message);
        this.name = 'StripeSignatureVerificationError';
        this.signature = signature;
        this.header = header;
        this.detail = detail;
      }
    },
  };
  return {
    default: StripeConstructor,
  };
});

const {
  mockConfig
} = vi.hoisted(() => {
  // Mock config with default values
  const mockConfig = {
    stripe: {
      stripe_secret_key: 'sk_test_mock',
      webhook_secret: 'whsec_test_mock',
      webhook_secret_fallback: 'whsec_fallback_mock',
    },
    env: 'development',
  };

  return {
    mockConfig
  };
});
vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));

vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn, // Simply return the function for testing its core logic
}));
vi.mock('../subscription/subscription.service.js');
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../../../shared/securityAlerts.js');
vi.mock('../subscription/stripeEvent.model.js', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('../../../shared/stripeSecurity.js');

// Helper for creating mock req/res objects
const createMockReqRes = (body, headers = {}, ip = '127.0.0.1') => {
  const req = {
    body: body,
    headers: {
      'stripe-signature': 't=123,v1=mock_signature',
      ...headers,
    },
    ip: ip,
  };
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(), // Allow chaining .status().json()
  };
  return { req, res };
};

describe('StripeWebhookController', () => {
  // Store original config values to restore after tests
  let originalConfigStripeWebhookSecret;
  let originalConfigStripeWebhookSecretFallback;
  let originalConfigEnv;
  let originalProcessEnvStripeWebhookSecret;
  let originalProcessEnvStripeWebhookSecretFallback;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Store original config values
    originalConfigStripeWebhookSecret = config.stripe.webhook_secret;
    originalConfigStripeWebhookSecretFallback = config.stripe.webhook_secret_fallback;
    originalConfigEnv = config.env;
    originalProcessEnvStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    originalProcessEnvStripeWebhookSecretFallback = process.env.STRIPE_WEBHOOK_SECRET_FALLBACK;

    // Reset config to default mock values
    config.stripe.webhook_secret = mockConfig.stripe.webhook_secret;
    config.stripe.webhook_secret_fallback = mockConfig.stripe.webhook_secret_fallback;
    config.env = mockConfig.env;
    process.env.STRIPE_WEBHOOK_SECRET = undefined; // Ensure env var is clean by default
    process.env.STRIPE_WEBHOOK_SECRET_FALLBACK = undefined; // Ensure env var is clean by default

    // Default mock implementations for common dependencies
    isStripeIp.mockResolvedValue(true); // Assume valid IP by default
    Stripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123' } },
    });
    StripeEvent.findOne.mockResolvedValue(null); // No duplicate by default
    StripeEvent.create.mockResolvedValue({}); // Successfully create event by default
    subscriptionService.processStripeCheckout.mockResolvedValue({});
    subscriptionService.updateSubscriptionFromStripe.mockResolvedValue({});
    subscriptionService.handleInvoicePaymentSucceeded.mockResolvedValue({});
    subscriptionService.handleInvoicePaymentFailed.mockResolvedValue({});
  });

  afterEach(() => {
    // Restore original config values after each test
    config.stripe.webhook_secret = originalConfigStripeWebhookSecret;
    config.stripe.webhook_secret_fallback = originalConfigStripeWebhookSecretFallback;
    config.env = originalConfigEnv;
    process.env.STRIPE_WEBHOOK_SECRET = originalProcessEnvStripeWebhookSecret;
    process.env.STRIPE_WEBHOOK_SECRET_FALLBACK = originalProcessEnvStripeWebhookSecretFallback;
  });

  describe('handleStripeWebhook', () => {
    const rawBodyBuffer = Buffer.from(JSON.stringify({ id: 'evt_test_123', type: 'checkout.session.completed' }));
    const rawBodyString = JSON.stringify({ id: 'evt_test_123', type: 'checkout.session.completed' });

    // Test IP verification
    it('should throw ApiError 403 and send security alert if IP is not from Stripe', async () => {
      isStripeIp.mockResolvedValue(false);
      const { req, res } = createMockReqRes(rawBodyBuffer, {}, '1.2.3.4');

      await expect(StripeWebhookController.handleStripeWebhook(req, res)).rejects.toThrow(
        new ApiError(httpStatus.FORBIDDEN, 'Forbidden: untrusted sender source IP')
      );
      expect(isStripeIp).toHaveBeenCalledWith('1.2.3.4');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Untrusted Webhook IP Blocked'));
      expect(sendSecurityAlert).toHaveBeenCalledWith(
        'Untrusted Webhook IP Blocked (Legacy Controller)',
        expect.any(String),
        expect.objectContaining({ senderIp: '1.2.3.4' })
      );
      expect(res.json).not.toHaveBeenCalled();
    });

    // Test missing webhook secret
    it('should throw ApiError 500 if webhook secret is not configured', async () => {
      // Temporarily unset for this test
      config.stripe.webhook_secret = undefined;
      process.env.STRIPE_WEBHOOK_SECRET = undefined;

      const { req, res } = createMockReqRes(rawBodyBuffer);

      await expect(StripeWebhookController.handleStripeWebhook(req, res)).rejects.toThrow(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Webhook secret not configured')
      );
      expect(logger.error).toHaveBeenCalledWith('Stripe webhook secret not configured');
      expect(res.json).not.toHaveBeenCalled();
    });

    // Test raw body requirement
    it('should throw ApiError 400 and send security alert if req.body is not a raw buffer/string', async () => {
      const { req, res } = createMockReqRes({ id: 'evt_test_123' }); // Parsed object
      req.body = { id: 'evt_test_123' }; // Explicitly set as object

      await expect(StripeWebhookController.handleStripeWebhook(req, res)).rejects.toThrow(
        new ApiError(httpStatus.BAD_REQUEST, 'Webhook payload format error: raw body required for signature verification.')
      );
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Webhook payload is not raw buffer/string'));
      expect(sendSecurityAlert).toHaveBeenCalledWith(
        'Stripe Webhook Misconfiguration (Legacy Controller)',
        expect.any(String),
        expect.objectContaining({ payloadType: 'object' })
      );
      expect(res.json).not.toHaveBeenCalled();
    });

    // Test signature verification failure (primary and fallback)
    it('should throw ApiError 400 and send security alert if signature verification fails with both secrets', async () => {
      Stripe.webhooks.constructEvent
        .mockImplementationOnce(() => {
          throw new Error('Primary secret failed');
        })
        .mockImplementationOnce(() => {
          throw new Error('Fallback secret failed');
        });
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await expect(StripeWebhookController.handleStripeWebhook(req, res)).rejects.toThrow(
        new ApiError(httpStatus.BAD_REQUEST, expect.stringContaining('Webhook signature verification failed'))
      );
      expect(Stripe.webhooks.constructEvent).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith('Webhook signature verification failed:', expect.stringContaining('Both primary and fallback secret verifications failed'));
      expect(sendSecurityAlert).toHaveBeenCalledWith(
        'Webhook Signature Mismatch (Legacy Controller)',
        expect.any(String),
        expect.objectContaining({ errorMessage: expect.stringContaining('Both primary and fallback secret verifications failed') })
      );
      expect(res.json).not.toHaveBeenCalled();
    });

    // Test signature verification success with primary secret
    it('should verify signature successfully with primary secret', async () => {
      const { req, res } = createMockReqRes(rawBodyBuffer);
      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(Stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBodyBuffer,
        't=123,v1=mock_signature',
        'whsec_test_mock'
      );
      expect(Stripe.webhooks.constructEvent).toHaveBeenCalledTimes(1); // Only primary
      expect(logger.info).toHaveBeenCalledWith('Webhook received: checkout.session.completed');
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    // Test signature verification success with fallback secret
    it('should verify signature successfully with fallback secret if primary fails', async () => {
      Stripe.webhooks.constructEvent
        .mockImplementationOnce(() => {
          throw new Error('Primary secret failed');
        })
        .mockReturnValueOnce({
          id: 'evt_test_123',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_test_123' } },
        }); // Fallback succeeds
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(Stripe.webhooks.constructEvent).toHaveBeenCalledTimes(2);
      expect(Stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBodyBuffer,
        't=123,v1=mock_signature',
        'whsec_test_mock'
      );
      expect(Stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBodyBuffer,
        't=123,v1=mock_signature',
        'whsec_fallback_mock'
      );
      expect(logger.info).toHaveBeenCalledWith('[Stripe Security] Primary webhook secret verification failed. Trying fallback secret...');
      expect(logger.info).toHaveBeenCalledWith('[Stripe Security] Webhook signature verified successfully using fallback secret.');
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    // Test replay protection (duplicate event)
    it('should return duplicate: true and not process event if event ID already exists', async () => {
      StripeEvent.findOne.mockResolvedValue({ eventId: 'evt_test_123' }); // Simulate existing event
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(StripeEvent.findOne).toHaveBeenCalledWith({ eventId: 'evt_test_123' });
      expect(StripeEvent.create).not.toHaveBeenCalled(); // Should not create a new one
      expect(logger.info).toHaveBeenCalledWith('Duplicate webhook event evt_test_123 discarded in Legacy Webhook Controller.');
      expect(subscriptionService.processStripeCheckout).not.toHaveBeenCalled(); // Should not process
      expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
    });

    // Test successful processing of a new event
    it('should create a new StripeEvent and process the event if it is not a duplicate', async () => {
      const { req, res } = createMockReqRes(rawBodyBuffer); // Default mocks mean new event

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(StripeEvent.findOne).toHaveBeenCalledWith({ eventId: 'evt_test_123' });
      expect(StripeEvent.create).toHaveBeenCalledWith({ eventId: 'evt_test_123' });
      expect(subscriptionService.processStripeCheckout).toHaveBeenCalledWith('cs_test_123');
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    // Test various event types
    it('should call subscriptionService.processStripeCheckout for checkout.session.completed', async () => {
      const event = {
        id: 'evt_cs_1',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_123', object: 'checkout.session' } },
      };
      Stripe.webhooks.constructEvent.mockReturnValue(event);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(subscriptionService.processStripeCheckout).toHaveBeenCalledWith('cs_123');
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should log for customer.subscription.created but not call service', async () => {
      const event = {
        id: 'evt_sub_created_1',
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_123', object: 'subscription' } },
      };
      Stripe.webhooks.constructEvent.mockReturnValue(event);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(logger.info).toHaveBeenCalledWith(`Subscription created: ${event.data.object.id}`);
      expect(subscriptionService.processStripeCheckout).not.toHaveBeenCalled();
      expect(subscriptionService.updateSubscriptionFromStripe).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should call subscriptionService.updateSubscriptionFromStripe for customer.subscription.updated', async () => {
      const event = {
        id: 'evt_sub_updated_1',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_123', object: 'subscription', status: 'active' } },
      };
      Stripe.webhooks.constructEvent.mockReturnValue(event);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(subscriptionService.updateSubscriptionFromStripe).toHaveBeenCalledWith(event.data.object);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should call subscriptionService.updateSubscriptionFromStripe for customer.subscription.deleted', async () => {
      const event = {
        id: 'evt_sub_deleted_1',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_123', object: 'subscription', status: 'canceled' } },
      };
      Stripe.webhooks.constructEvent.mockReturnValue(event);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(subscriptionService.updateSubscriptionFromStripe).toHaveBeenCalledWith(event.data.object);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should call subscriptionService.handleInvoicePaymentSucceeded for invoice.payment_succeeded', async () => {
      const event = {
        id: 'evt_inv_succeeded_1',
        type: 'invoice.payment_succeeded',
        data: { object: { id: 'inv_123', object: 'invoice' } },
      };
      Stripe.webhooks.constructEvent.mockReturnValue(event);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(subscriptionService.handleInvoicePaymentSucceeded).toHaveBeenCalledWith(event.data.object);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should call subscriptionService.handleInvoicePaymentFailed for invoice.payment_failed', async () => {
      const event = {
        id: 'evt_inv_failed_1',
        type: 'invoice.payment_failed',
        data: { object: { id: 'inv_123', object: 'invoice' } },
      };
      Stripe.webhooks.constructEvent.mockReturnValue(event);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(subscriptionService.handleInvoicePaymentFailed).toHaveBeenCalledWith(event.data.object);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should log for invoice.payment_action_required but not call service', async () => {
      const event = {
        id: 'evt_inv_action_1',
        type: 'invoice.payment_action_required',
        data: { object: { id: 'inv_123', object: 'invoice' } },
      };
      Stripe.webhooks.constructEvent.mockReturnValue(event);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(logger.warn).toHaveBeenCalledWith(`Payment action required for invoice: ${event.data.object.id}`);
      expect(subscriptionService.handleInvoicePaymentSucceeded).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should log for customer.subscription.trial_will_end but not call service', async () => {
      const event = {
        id: 'evt_trial_end_1',
        type: 'customer.subscription.trial_will_end',
        data: { object: { id: 'sub_123', object: 'subscription' } },
      };
      Stripe.webhooks.constructEvent.mockReturnValue(event);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(logger.info).toHaveBeenCalledWith(`Trial ending soon for subscription: ${event.data.object.id}`);
      expect(subscriptionService.updateSubscriptionFromStripe).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should log for unhandled event types', async () => {
      const event = {
        id: 'evt_unhandled_1',
        type: 'some.unhandled.event',
        data: { object: { id: 'obj_123' } },
      };
      Stripe.webhooks.constructEvent.mockReturnValue(event);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(logger.info).toHaveBeenCalledWith(`Unhandled event type: ${event.type}`);
      expect(subscriptionService.processStripeCheckout).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should return 200 with error message if an error occurs during event processing', async () => {
      const processingError = new Error('Failed to process checkout');
      subscriptionService.processStripeCheckout.mockRejectedValue(processingError);
      const { req, res } = createMockReqRes(rawBodyBuffer);

      await StripeWebhookController.handleStripeWebhook(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error processing webhook:', processingError);
      expect(res.json).toHaveBeenCalledWith({ received: true, error: processingError.message });
    });
  });

  describe('testWebhook', () => {
    it('should throw ApiError 403 if in production environment', async () => {
      config.env = 'production';
      const { req, res } = createMockReqRes({ eventType: 'checkout.session.completed', data: { sessionId: 'cs_test_123' } });

      await expect(StripeWebhookController.testWebhook(req, res)).rejects.toThrow(
        new ApiError(httpStatus.FORBIDDEN, 'Test webhook is disabled in production environment')
      );
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should call subscriptionService.processStripeCheckout for checkout.session.completed eventType', async () => {
      config.env = 'development';
      const sessionId = 'cs_test_123';
      const serviceResult = { success: true, id: sessionId };
      subscriptionService.processStripeCheckout.mockResolvedValue(serviceResult);
      const { req, res } = createMockReqRes({ eventType: 'checkout.session.completed', data: { sessionId } });

      await StripeWebhookController.testWebhook(req, res);

      expect(logger.info).toHaveBeenCalledWith(`Test webhook: checkout.session.completed`);
      expect(subscriptionService.processStripeCheckout).toHaveBeenCalledWith(sessionId);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: `Test webhook checkout.session.completed processed`,
        result: serviceResult,
      });
    });

    it('should call subscriptionService.updateSubscriptionFromStripe for customer.subscription.updated eventType', async () => {
      config.env = 'development';
      const subscriptionData = { id: 'sub_test_123', status: 'active' };
      const serviceResult = { success: true, id: subscriptionData.id };
      subscriptionService.updateSubscriptionFromStripe.mockResolvedValue(serviceResult);
      const { req, res } = createMockReqRes({ eventType: 'customer.subscription.updated', data: { subscription: subscriptionData } });

      await StripeWebhookController.testWebhook(req, res);

      expect(logger.info).toHaveBeenCalledWith(`Test webhook: customer.subscription.updated`);
      expect(subscriptionService.updateSubscriptionFromStripe).toHaveBeenCalledWith(subscriptionData);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: `Test webhook customer.subscription.updated processed`,
        result: serviceResult,
      });
    });

    it('should throw ApiError 400 for unsupported test event type', async () => {
      config.env = 'development';
      const { req, res } = createMockReqRes({ eventType: 'unsupported.event', data: {} });

      await expect(StripeWebhookController.testWebhook(req, res)).rejects.toThrow(
        new ApiError(httpStatus.BAD_REQUEST, 'Unsupported test event type')
      );
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});