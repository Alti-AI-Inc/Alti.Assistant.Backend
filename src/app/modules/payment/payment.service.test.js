import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import { PubSub } from '@google-cloud/pubsub';
import config from '../../../../config/index.js';
import { sendMailWithMailGun } from '../../middlewares/sendEmail/sendMail.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from './payment.model.js';
import { purchasePlanTemplate } from './payment.utils.js';
import { logger } from '../../../shared/logger.js';
import Tenant from '../tenant/tenant.model.js';
import { sendSecurityAlert } from '../../../shared/securityAlerts.js';
import StripeEvent from '../subscription/stripeEvent.model.js';
import { isStripeIp } from '../../../shared/stripeSecurity.js';
import { PaymentService } from './payment.service.js';

// Mock external dependencies
vi.mock('mongoose', async () => {
  const actualMongoose = await vi.importActual('mongoose');
  return {
    default: {
      ...actualMongoose,
      Types: {
        ObjectId: vi.fn().mockImplementation(id => id || new actualMongoose.Types.ObjectId().toString()),
      },
      startSession: vi.fn(),
    },
  };
});

const {
  mockStripeInstance,
  mockPubSubClient
} = vi.hoisted(() => {
  const mockStripeInstance = {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
    invoices: { retrieve: vi.fn() },
  };
  const mockPubSubClient = { topic: vi.fn().mockImplementation(() => mockTopic) };

  return {
    mockStripeInstance,
    mockPubSubClient
  };
});

vi.mock('stripe', () => ({ default: vi.fn().mockImplementation(() => mockStripeInstance) }));

const mockTopic = { publishMessage: vi.fn() };
vi.mock('@google-cloud/pubsub', () => ({ PubSub: vi.fn().mockImplementation(() => mockPubSubClient) }));

vi.mock('../../../../config/index.js', () => ({
  default: {
    stripe: {
      stripe_secret_key: 'sk_test_123',
      webhook_secret: 'whsec_primary_secret',
      webhook_secret_fallback: 'whsec_fallback_secret',
    },
    client_url: 'https://app.example.com',
    gcp: { pubsub: { stripe_webhook_topic: 'test-stripe-topic' } },
  },
}));

vi.mock('../../middlewares/sendEmail/sendMail.js', () => ({ sendMailWithMailGun: vi.fn() }));
vi.mock('../auth/auth.model.js');
vi.mock('./payment.model.js');
vi.mock('./payment.utils.js');
vi.mock('../../../shared/logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('../tenant/tenant.model.js');
vi.mock('../../../shared/securityAlerts.js', () => ({ sendSecurityAlert: vi.fn() }));
vi.mock('../subscription/stripeEvent.model.js');
vi.mock('../../../shared/stripeSecurity.js', () => ({ isStripeIp: vi.fn() }));

describe('PaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCheckoutSessionService', () => {
    const mockUser = {
      _id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_123',
    };
    const mockPlan = {
      plan_name: 'explore',
      duration: 'month',
      price: 29,
    };
    const mockTenant = {
      _id: 'tenant_123',
      name: 'Test Tenant',
      slug: 'test-tenant',
      ownerId: 'owner_123',
    };

    it('should create a new Stripe customer and a checkout session if one does not exist', async () => {
      Tenant.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) });
      SubscriptionModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      mockStripeInstance.customers.create.mockResolvedValue({ id: 'cus_new' });
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/session_new' });

      const url = await PaymentService.createCheckoutSessionService(mockUser, mockPlan);

      expect(Tenant.findById).toHaveBeenCalledWith(mockUser.tenantId);
      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ tenantId: mockTenant._id, status: 'active' });
      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
        email: mockUser.email,
        name: mockTenant.name,
        metadata: {
          tenantId: mockTenant._id.toString(),
          tenantSlug: mockTenant.slug,
          ownerId: mockTenant.ownerId.toString(),
        },
      });
      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
        customer: 'cus_new',
        metadata: expect.objectContaining({
          tenantId: mockTenant._id.toString(),
          userId: mockUser._id.toString(),
        }),
      }));
      expect(url).toBe('https://checkout.stripe.com/session_new');
    });

    it('should use an existing Stripe customer ID if available', async () => {
      const existingSubscription = { stripeCustomerId: 'cus_existing' };
      Tenant.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) });
      SubscriptionModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(existingSubscription) });
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/session_existing' });

      const url = await PaymentService.createCheckoutSessionService(mockUser, mockPlan);

      expect(mockStripeInstance.customers.create).not.toHaveBeenCalled();
      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
        customer: 'cus_existing',
      }));
      expect(url).toBe('https://checkout.stripe.com/session_existing');
    });

    it('should throw an error for an invalid plan name', async () => {
      const invalidPlan = { ...mockPlan, plan_name: 'invalid_plan' };
      await expect(PaymentService.createCheckoutSessionService(mockUser, invalidPlan)).rejects.toThrow('Invalid plan name');
    });

    it('should throw an error for an invalid plan duration', async () => {
      const invalidPlan = { ...mockPlan, duration: 'decade' };
      await expect(PaymentService.createCheckoutSessionService(mockUser, invalidPlan)).rejects.toThrow('Invalid plan duration');
    });

    it('should throw an error if the user does not belong to a tenant', async () => {
      Tenant.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      await expect(PaymentService.createCheckoutSessionService(mockUser, mockPlan)).rejects.toThrow('User must belong to a tenant to subscribe');
    });
  });

  describe('handleWebhookService', () => {
    let mockReq, mockRes;

    beforeEach(() => {
      mockReq = {
        headers: { 'stripe-signature': 'valid_sig' },
        body: 'raw_body',
        ip: '52.34.56.78',
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };
      isStripeIp.mockResolvedValue(true);
    });

    it('should reject request from untrusted IP', async () => {
      isStripeIp.mockResolvedValue(false);
      await PaymentService.handleWebhookService(mockReq, mockRes);
      expect(sendSecurityAlert).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Forbidden: untrusted sender source IP');
    });

    it('should fail if webhook secret is not configured', async () => {
      config.stripe.webhook_secret = null;
      await PaymentService.handleWebhookService(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Webhook secret not configured');
      config.stripe.webhook_secret = 'whsec_primary_secret'; // Restore for other tests
    });

    it('should fail if signature is missing', async () => {
      mockReq.headers['stripe-signature'] = null;
      await PaymentService.handleWebhookService(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Missing Stripe Signature');
    });

    it('should fail if signature verification fails for both primary and fallback secrets', async () => {
      mockStripeInstance.webhooks.constructEvent
        .mockImplementationOnce(() => { throw new Error('Primary failed'); })
        .mockImplementationOnce(() => { throw new Error('Fallback failed'); });

      await PaymentService.handleWebhookService(mockReq, mockRes);

      expect(sendSecurityAlert).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('Webhook signature verification failed'));
    });

    it('should succeed with fallback secret if primary fails', async () => {
        const mockEvent = { id: 'evt_123', type: 'checkout.session.completed' };
        mockStripeInstance.webhooks.constructEvent
          .mockImplementationOnce(() => { throw new Error('Primary failed'); })
          .mockImplementationOnce(() => mockEvent);
        StripeEvent.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
        mockTopic.publishMessage.mockResolvedValue();
  
        await PaymentService.handleWebhookService(mockReq, mockRes);
  
        expect(StripeEvent.create).toHaveBeenCalledWith({ eventId: 'evt_123' });
        expect(mockTopic.publishMessage).toHaveBeenCalled();
        expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should discard duplicate events', async () => {
      const mockEvent = { id: 'evt_123', type: 'checkout.session.completed' };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
      StripeEvent.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ eventId: 'evt_123' }) });

      await PaymentService.handleWebhookService(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('Webhook processed successfully (Duplicate)');
      expect(StripeEvent.create).not.toHaveBeenCalled();
      expect(mockTopic.publishMessage).not.toHaveBeenCalled();
    });

    it('should return 500 if publishing to Pub/Sub fails', async () => {
      const mockEvent = { id: 'evt_123', type: 'checkout.session.completed' };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
      StripeEvent.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      StripeEvent.create.mockResolvedValue({});
      mockTopic.publishMessage.mockRejectedValue(new Error('Pub/Sub error'));

      await PaymentService.handleWebhookService(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Failed to queue webhook for processing.');
    });

    it('should successfully process a valid webhook, create an event record, and publish to Pub/Sub', async () => {
      const mockEvent = { id: 'evt_123', type: 'checkout.session.completed' };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
      StripeEvent.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      StripeEvent.create.mockResolvedValue({});
      mockTopic.publishMessage.mockResolvedValue();

      await PaymentService.handleWebhookService(mockReq, mockRes);

      expect(StripeEvent.create).toHaveBeenCalledWith({ eventId: 'evt_123' });
      expect(mockTopic.publishMessage).toHaveBeenCalledWith({ data: Buffer.from(JSON.stringify(mockEvent)) });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('Webhook acknowledged and queued for processing.');
    });
  });

  describe('processStripeEventService', () => {
    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    };

    beforeEach(() => {
      mongoose.startSession.mockResolvedValue(mockSession);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('checkout.session.completed', () => {
      const mockStripeSession = {
        id: 'cs_123',
        subscription: 'sub_123',
        customer: 'cus_123',
        amount_total: 2900,
        payment_status: 'paid',
        metadata: {
          plan_name: 'explore',
          duration: 'month',
          tenantId: 'tenant_123',
          userId: 'user_123',
        },
      };
      const mockEvent = { id: 'evt_123', type: 'checkout.session.completed', data: { object: mockStripeSession } };
      const mockUser = { _id: 'user_123', email: 'test@example.com', save: vi.fn().mockResolvedValue(true) };
      const mockTenant = { _id: 'tenant_123', save: vi.fn().mockResolvedValue(true) };
      const mockSubscription = { id: 'sub_123', latest_invoice: 'in_123' };
      const mockInvoice = { hosted_invoice_url: 'https://invoice.stripe.com/inv_123' };

      it('should create subscription, update tenant and user, and send email', async () => {
        Tenant.findById.mockReturnValue({ session: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue(mockTenant) });
        UserModel.findById.mockReturnValue({ session: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue(mockUser) });
        SubscriptionModel.findOne.mockReturnValue({ session: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(null) });
        mockStripeInstance.subscriptions.retrieve.mockResolvedValue(mockSubscription);
        mockStripeInstance.invoices.retrieve.mockResolvedValue(mockInvoice);
        purchasePlanTemplate.mockResolvedValue({});
        sendMailWithMailGun.mockResolvedValue({});
        const mockNewSubscriptionInstance = { save: vi.fn().mockResolvedValue(true) };
        SubscriptionModel.mockImplementation(() => mockNewSubscriptionInstance);

        await PaymentService.processStripeEventService(mockEvent);

        expect(SubscriptionModel).toHaveBeenCalledWith({
          userId: 'user_123',
          tenantId: 'tenant_123',
          transactionId: 'cs_123',
          price: 29,
          plan_name: 'explore',
          duration: 'month',
          expiresAt: new Date('2023-02-01T00:00:00.000Z'),
          paymentStatus: 'paid',
          invoiceUrl: 'https://invoice.stripe.com/inv_123',
        });
        expect(mockNewSubscriptionInstance.save).toHaveBeenCalled();
        expect(mockTenant.plan).toBe('explore');
        expect(mockTenant.status).toBe('active');
        expect(mockTenant.limits.maxApiCalls).toBe(10000);
        expect(mockTenant.save).toHaveBeenCalled();
        expect(mockUser.isSubscribed).toBe(true);
        expect(mockUser.subscription).toBeDefined();
        expect(mockUser.save).toHaveBeenCalled();
        expect(purchasePlanTemplate).toHaveBeenCalled();
        expect(sendMailWithMailGun).toHaveBeenCalled();
        expect(mockSession.commitTransaction).toHaveBeenCalled();
        expect(mockSession.abortTransaction).not.toHaveBeenCalled();
      });

      it('should skip processing if subscription already exists for the transaction', async () => {
        SubscriptionModel.findOne.mockReturnValue({ session: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue({ _id: 'sub_exists' }) });
        
        await PaymentService.processStripeEventService(mockEvent);

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Subscription already exists'));
        expect(mockStripeInstance.subscriptions.retrieve).not.toHaveBeenCalled();
        expect(mockTenant.save).not.toHaveBeenCalled();
        expect(mockUser.save).not.toHaveBeenCalled();
        expect(mockSession.commitTransaction).toHaveBeenCalled();
      });

      it('should throw error and abort transaction if tenant not found', async () => {
        Tenant.findById.mockReturnValue({ session: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue(null) });
        
        await expect(PaymentService.processStripeEventService(mockEvent)).rejects.toThrow('Tenant not found');
        
        expect(mockSession.abortTransaction).toHaveBeenCalled();
        expect(mockSession.commitTransaction).not.toHaveBeenCalled();
      });
    });

    describe('customer.subscription.deleted', () => {
        const mockStripeSubscription = { id: 'sub_123' };
        const mockEvent = { id: 'evt_456', type: 'customer.subscription.deleted', data: { object: mockStripeSubscription } };
        const mockExistingSubscription = { 
            paymentStatus: 'active', 
            status: 'active', 
            tenantId: 'tenant_123', 
            userId: 'user_123',
            save: vi.fn().mockResolvedValue(true) 
        };
        const mockUser = { isSubscribed: true, subscription: {}, save: vi.fn().mockResolvedValue(true) };
        const mockTenant = { plan: 'explore', status: 'active', limits: {}, save: vi.fn().mockResolvedValue(true) };

        it('should cancel subscription, revert tenant to free plan, and update user', async () => {
            SubscriptionModel.findOne.mockReturnValue({ session: vi.fn().mockReturnValue(mockExistingSubscription) });
            Tenant.findById.mockReturnValue({ session: vi.fn().mockReturnValue(mockTenant) });
            UserModel.findById.mockReturnValue({ session: vi.fn().mockReturnValue(mockUser) });

            await PaymentService.processStripeEventService(mockEvent);

            expect(mockExistingSubscription.paymentStatus).toBe('expired');
            expect(mockExistingSubscription.status).toBe('cancelled');
            expect(mockExistingSubscription.save).toHaveBeenCalled();
            
            expect(mockTenant.plan).toBe('free');
            expect(mockTenant.limits.maxApiCalls).toBe(1000);
            expect(mockTenant.save).toHaveBeenCalled();

            expect(mockUser.isSubscribed).toBe(false);
            expect(mockUser.subscription).toBeNull();
            expect(mockUser.save).toHaveBeenCalled();

            expect(mockSession.commitTransaction).toHaveBeenCalled();
        });

        it('should do nothing if subscription is not found', async () => {
            SubscriptionModel.findOne.mockReturnValue({ session: vi.fn().mockResolvedValue(null) });

            await PaymentService.processStripeEventService(mockEvent);

            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Subscription not found for cancellation event'));
            expect(mockTenant.save).not.toHaveBeenCalled();
            expect(mockUser.save).not.toHaveBeenCalled();
            expect(mockSession.commitTransaction).toHaveBeenCalled();
        });
    });

    it('should do nothing for unhandled event types', async () => {
        const mockEvent = { id: 'evt_789', type: 'invoice.paid', data: {} };
        await PaymentService.processStripeEventService(mockEvent);

        expect(SubscriptionModel.findOne).not.toHaveBeenCalled();
        expect(Tenant.findById).not.toHaveBeenCalled();
        expect(UserModel.findById).not.toHaveBeenCalled();
        expect(mockSession.commitTransaction).toHaveBeenCalled();
    });
  });
});