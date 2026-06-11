import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';
import {
  createSubscriptionService,
  retrieveSubscriptionService,
  cancelSubscriptionService,
  getCustomerSubscriptionsService,
} from './subscription.service.js';

// Mock the Stripe SDK
vi.mock('stripe', () => {
  const mockSubscriptions = {
    create: vi.fn(),
    retrieve: vi.fn(),
    cancel: vi.fn(),
    list: vi.fn(),
  };
  const MockStripe = vi.fn(() => ({
    subscriptions: mockSubscriptions,
  }));
  return { default: MockStripe };
});

// Mock the config module
vi.mock('../../../../config/index.js', () => ({
  default: {
    stripe: {
      stripe_secret_key: 'sk_test_mocked',
    },
  },
}));

// Get a reference to the mocked Stripe instance's subscriptions object
const stripe = new Stripe();
const mockStripeSubscriptions = stripe.subscriptions;

describe('Stripe Subscription Services', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('createSubscriptionService', () => {
    it('should create a new subscription and return it', async () => {
      const customerId = 'cus_12345';
      const priceId = 'price_67890';
      const mockSubscription = {
        id: 'sub_abcdef',
        customer: customerId,
        items: { data: [{ price: { id: priceId } }] },
        status: 'active',
        latest_invoice: { payment_intent: { id: 'pi_123' } },
      };

      mockStripeSubscriptions.create.mockResolvedValue(mockSubscription);

      const result = await createSubscriptionService(customerId, priceId);

      expect(mockStripeSubscriptions.create).toHaveBeenCalledTimes(1);
      expect(mockStripeSubscriptions.create).toHaveBeenCalledWith({
        customer: customerId,
        items: [{ price: priceId }],
        expand: ['latest_invoice.payment_intent'],
      });
      expect(result).toEqual(mockSubscription);
    });

    it('should throw an error if the Stripe API fails', async () => {
      const customerId = 'cus_12345';
      const priceId = 'price_67890';
      const stripeError = new Error('Stripe API Error');

      mockStripeSubscriptions.create.mockRejectedValue(stripeError);

      await expect(createSubscriptionService(customerId, priceId)).rejects.toThrow(stripeError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Stripe createSubscriptionService error:', stripeError);
    });
  });

  describe('retrieveSubscriptionService', () => {
    it('should retrieve an existing subscription by its ID', async () => {
      const subscriptionId = 'sub_abcdef';
      const mockSubscription = {
        id: subscriptionId,
        status: 'active',
        customer: 'cus_12345',
      };

      mockStripeSubscriptions.retrieve.mockResolvedValue(mockSubscription);

      const result = await retrieveSubscriptionService(subscriptionId);

      expect(mockStripeSubscriptions.retrieve).toHaveBeenCalledTimes(1);
      expect(mockStripeSubscriptions.retrieve).toHaveBeenCalledWith(subscriptionId);
      expect(result).toEqual(mockSubscription);
    });

    it('should throw an error if the subscription is not found', async () => {
      const subscriptionId = 'sub_notfound';
      const stripeError = new Error('Subscription not found');

      mockStripeSubscriptions.retrieve.mockRejectedValue(stripeError);

      await expect(retrieveSubscriptionService(subscriptionId)).rejects.toThrow(stripeError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Stripe retrieveSubscriptionService error:', stripeError);
    });
  });

  describe('cancelSubscriptionService', () => {
    it('should cancel an active subscription and return the confirmation', async () => {
      const subscriptionId = 'sub_abcdef';
      const mockCanceledSubscription = {
        id: subscriptionId,
        status: 'canceled',
        customer: 'cus_12345',
      };

      mockStripeSubscriptions.cancel.mockResolvedValue(mockCanceledSubscription);

      const result = await cancelSubscriptionService(subscriptionId);

      expect(mockStripeSubscriptions.cancel).toHaveBeenCalledTimes(1);
      expect(mockStripeSubscriptions.cancel).toHaveBeenCalledWith(subscriptionId);
      expect(result).toEqual(mockCanceledSubscription);
    });

    it('should throw an error if the cancellation fails', async () => {
      const subscriptionId = 'sub_abcdef';
      const stripeError = new Error('Cancellation failed');

      mockStripeSubscriptions.cancel.mockRejectedValue(stripeError);

      await expect(cancelSubscriptionService(subscriptionId)).rejects.toThrow(stripeError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Stripe cancelSubscriptionService error:', stripeError);
    });
  });

  describe('getCustomerSubscriptionsService', () => {
    it('should retrieve all active subscriptions for a given customer', async () => {
      const customerId = 'cus_12345';
      const mockSubscriptionsList = {
        data: [
          { id: 'sub_1', status: 'active', customer: customerId },
          { id: 'sub_2', status: 'active', customer: customerId },
        ],
        has_more: false,
        object: 'list',
        url: '/v1/subscriptions',
      };

      mockStripeSubscriptions.list.mockResolvedValue(mockSubscriptionsList);

      const result = await getCustomerSubscriptionsService(customerId);

      expect(mockStripeSubscriptions.list).toHaveBeenCalledTimes(1);
      expect(mockStripeSubscriptions.list).toHaveBeenCalledWith({
        customer: customerId,
        status: 'active',
        expand: ['data.default_payment_method', 'data.latest_invoice'],
      });
      expect(result).toEqual(mockSubscriptionsList.data);
    });

    it('should return an empty array if the customer has no active subscriptions', async () => {
      const customerId = 'cus_no_subs';
      const mockEmptyList = {
        data: [],
        has_more: false,
        object: 'list',
        url: '/v1/subscriptions',
      };

      mockStripeSubscriptions.list.mockResolvedValue(mockEmptyList);

      const result = await getCustomerSubscriptionsService(customerId);

      expect(result).toEqual([]);
    });

    it('should throw an error if the Stripe API fails to list subscriptions', async () => {
      const customerId = 'cus_12345';
      const stripeError = new Error('Failed to list subscriptions');

      mockStripeSubscriptions.list.mockRejectedValue(stripeError);

      await expect(getCustomerSubscriptionsService(customerId)).rejects.toThrow(stripeError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Stripe getCustomerSubscriptionsService error:', stripeError);
    });
  });
});