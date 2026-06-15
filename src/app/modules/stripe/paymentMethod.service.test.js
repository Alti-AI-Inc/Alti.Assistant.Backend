import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import {
  createPaymentIntentService,
  getAllPaymentMethodsService,
  savePaymentMethodService,
  detachPaymentMethodService,
  setDefaultPaymentMethodService,
} from './paymentMethod.service.js';

// Mock the Stripe library
vi.mock('stripe', () => {
  const mockStripe = {
    paymentIntents: {
      create: vi.fn(),
    },
    paymentMethods: {
      list: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
    },
    customers: {
      update: vi.fn(),
    },
  };
  // The default export is the constructor
  const Stripe = vi.fn().mockImplementation(() => mockStripe);
  // Assign the mocked methods to the constructor for access
  Stripe.prototype.paymentIntents = mockStripe.paymentIntents;
  Stripe.prototype.paymentMethods = mockStripe.paymentMethods;
  Stripe.prototype.customers = mockStripe.customers;
  return { default: Stripe };
});

// Mock the config file
vi.mock('../../../../config/index.js', () => ({
  default: {
    stripe: {
      stripe_secret_key: 'sk_test_mock_key',
    },
  },
}));

const stripe = new Stripe();

describe('paymentMethod.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPaymentIntentService', () => {
    it('should create a payment intent and return its client secret', async () => {
      const mockAmount = 5000;
      const mockCurrency = 'usd';
      const mockCustomerId = 'cus_123';
      const mockClientSecret = 'pi_123_secret_456';

      stripe.paymentIntents.create.mockResolvedValue({
        client_secret: mockClientSecret,
      });

      const result = await createPaymentIntentService(mockAmount, mockCurrency, mockCustomerId);

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: mockAmount,
        currency: mockCurrency,
        customer: mockCustomerId,
        metadata: { customerId: mockCustomerId },
        automatic_payment_methods: { enabled: false },
      });
      expect(result).toEqual({ clientSecret: mockClientSecret });
    });

    it('should throw an error if Stripe API fails to create a payment intent', async () => {
      const errorMessage = 'API connection error';
      stripe.paymentIntents.create.mockRejectedValue(new Error(errorMessage));

      await expect(createPaymentIntentService(5000, 'usd', 'cus_123')).rejects.toThrow(
        `Failed to create payment intent: ${errorMessage}`
      );
    });
  });

  describe('getAllPaymentMethodsService', () => {
    it('should retrieve all card payment methods for a customer', async () => {
      const mockCustomerId = 'cus_123';
      const mockPaymentMethods = [{ id: 'pm_1' }, { id: 'pm_2' }];

      stripe.paymentMethods.list.mockResolvedValue({
        data: mockPaymentMethods,
      });

      const result = await getAllPaymentMethodsService(mockCustomerId);

      expect(stripe.paymentMethods.list).toHaveBeenCalledWith({
        customer: mockCustomerId,
        type: 'card',
      });
      expect(result).toEqual(mockPaymentMethods);
    });

    it('should throw an error if Stripe API fails to retrieve payment methods', async () => {
      const errorMessage = 'Invalid customer ID';
      stripe.paymentMethods.list.mockRejectedValue(new Error(errorMessage));

      await expect(getAllPaymentMethodsService('cus_123')).rejects.toThrow(
        `Failed to retrieve payment methods: ${errorMessage}`
      );
    });
  });

  describe('savePaymentMethodService', () => {
    const mockCustomerId = 'cus_123';
    const mockPaymentMethodId = 'pm_123';

    it('should attach a payment method and set it as default', async () => {
      stripe.paymentMethods.attach.mockResolvedValue({});
      stripe.customers.update.mockResolvedValue({});

      const result = await savePaymentMethodService(mockCustomerId, mockPaymentMethodId);

      expect(stripe.paymentMethods.attach).toHaveBeenCalledWith(mockPaymentMethodId, {
        customer: mockCustomerId,
      });
      expect(stripe.customers.update).toHaveBeenCalledWith(mockCustomerId, {
        invoice_settings: { default_payment_method: mockPaymentMethodId },
      });
      expect(result).toBe(true);
    });

    it('should throw an error if attaching the payment method fails', async () => {
      const errorMessage = 'Could not attach payment method.';
      stripe.paymentMethods.attach.mockRejectedValue(new Error(errorMessage));

      await expect(savePaymentMethodService(mockCustomerId, mockPaymentMethodId)).rejects.toThrow(
        `Failed to save payment method: ${errorMessage}`
      );
      expect(stripe.customers.update).not.toHaveBeenCalled();
    });

    it('should throw an error if setting the default payment method fails', async () => {
      const errorMessage = 'Could not update customer.';
      stripe.paymentMethods.attach.mockResolvedValue({});
      stripe.customers.update.mockRejectedValue(new Error(errorMessage));

      await expect(savePaymentMethodService(mockCustomerId, mockPaymentMethodId)).rejects.toThrow(
        `Failed to save payment method: ${errorMessage}`
      );
      expect(stripe.paymentMethods.attach).toHaveBeenCalledTimes(1);
    });
  });

  describe('detachPaymentMethodService', () => {
    it('should detach a payment method successfully', async () => {
      const mockPaymentMethodId = 'pm_123';
      stripe.paymentMethods.detach.mockResolvedValue({});

      const result = await detachPaymentMethodService(mockPaymentMethodId);

      expect(stripe.paymentMethods.detach).toHaveBeenCalledWith(mockPaymentMethodId);
      expect(result).toBe(true);
    });

    it('should throw an error if Stripe API fails to detach the payment method', async () => {
      const errorMessage = 'Payment method not found';
      stripe.paymentMethods.detach.mockRejectedValue(new Error(errorMessage));

      await expect(detachPaymentMethodService('pm_123')).rejects.toThrow(
        `Failed to detach payment method: ${errorMessage}`
      );
    });
  });

  describe('setDefaultPaymentMethodService', () => {
    const mockCustomerId = 'cus_123';
    const mockPaymentMethodId = 'pm_123';

    it('should set the default payment method for a customer', async () => {
      stripe.customers.update.mockResolvedValue({});

      const result = await setDefaultPaymentMethodService(mockCustomerId, mockPaymentMethodId);

      expect(stripe.customers.update).toHaveBeenCalledWith(mockCustomerId, {
        invoice_settings: { default_payment_method: mockPaymentMethodId },
      });
      expect(result).toBe(true);
    });

    it('should throw an error if Stripe API fails to update the customer', async () => {
      const errorMessage = 'Customer not found';
      stripe.customers.update.mockRejectedValue(new Error(errorMessage));

      await expect(setDefaultPaymentMethodService(mockCustomerId, mockPaymentMethodId)).rejects.toThrow(
        `Failed to set default payment method: ${errorMessage}`
      );
    });
  });
});