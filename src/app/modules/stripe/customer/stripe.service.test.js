import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCustomerService,
  retrieveCustomerService,
  updateCustomerService,
  deleteCustomerService,
  retrieveAllCustomersService,
  retrieveAllProductsService,
  retrieveAllSubscriptionsService,
} from './stripe.service.js';

// Mock dependencies
const mockStripeCustomers = {
  create: vi.fn(),
  list: vi.fn(),
  retrieve: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
};

const mockStripeSubscriptions = {
  list: vi.fn(),
};

const mockStripeInstance = {
  customers: mockStripeCustomers,
  subscriptions: mockStripeSubscriptions,
};

// Mock the 'stripe' module itself
vi.mock('stripe', () => ({
  default: vi.fn(() => mockStripeInstance),
}));

// Mock the config module
vi.mock('../../../../../config/index.js', () => ({
  default: {
    stripe: {
      stripe_secret_key: 'sk_test_mock_key',
    },
  },
}));

// Mock the Product model
const mockProductLean = vi.fn();
const mockProductFind = vi.fn(() => ({
  lean: mockProductLean,
}));

vi.mock('../products/products.model.js', () => ({
  default: {
    find: mockProductFind,
  },
}));

describe('Stripe Services', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('createCustomerService', () => {
    it('should create a customer successfully with all provided details', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        address: { line1: '123 Main St', city: 'Anytown', postal_code: '12345', country: 'US' },
        phone: '+15551234567',
      };
      const mockStripeCustomer = { id: 'cus_123', ...userData };
      mockStripeCustomers.create.mockResolvedValue(mockStripeCustomer);

      const result = await createCustomerService(userData);

      expect(mockStripeCustomers.create).toHaveBeenCalledWith({
        name: userData.name,
        email: userData.email,
        address: userData.address,
        phone: userData.phone,
      });
      expect(result).toEqual(mockStripeCustomer);
    });

    it('should create a customer successfully with only required details', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
      };
      const mockStripeCustomer = { id: 'cus_123', ...userData };
      mockStripeCustomers.create.mockResolvedValue(mockStripeCustomer);

      const result = await createCustomerService(userData);

      expect(mockStripeCustomers.create).toHaveBeenCalledWith({
        name: userData.name,
        email: userData.email,
        address: undefined,
        phone: undefined,
      });
      expect(result).toEqual(mockStripeCustomer);
    });

    it('should throw an error if Stripe API call fails during customer creation', async () => {
      const userData = { name: 'Test User', email: 'test@example.com' };
      const error = new Error('Stripe API error during creation');
      mockStripeCustomers.create.mockRejectedValue(error);

      await expect(createCustomerService(userData)).rejects.toThrow(error);
      expect(mockStripeCustomers.create).toHaveBeenCalledOnce();
    });
  });

  describe('retrieveAllCustomersService', () => {
    it('should retrieve all customers successfully', async () => {
      const mockCustomersList = {
        data: [{ id: 'cus_1', email: 'a@b.com' }, { id: 'cus_2', email: 'c@d.com' }],
        has_more: false,
        object: 'list',
        url: '/v1/customers',
      };
      mockStripeCustomers.list.mockResolvedValue(mockCustomersList);

      const result = await retrieveAllCustomersService();

      expect(mockStripeCustomers.list).toHaveBeenCalledWith();
      expect(result).toEqual(mockCustomersList);
    });

    it('should throw an error if Stripe API call fails during customer list retrieval', async () => {
      const error = new Error('Stripe API error during list retrieval');
      mockStripeCustomers.list.mockRejectedValue(error);

      await expect(retrieveAllCustomersService()).rejects.toThrow(error);
      expect(mockStripeCustomers.list).toHaveBeenCalledOnce();
    });
  });

  describe('retrieveAllProductsService', () => {
    it('should retrieve all products from the local database successfully', async () => {
      const mockProducts = [{ _id: 'prod_db_1', name: 'Product A' }, { _id: 'prod_db_2', name: 'Product B' }];
      mockProductLean.mockResolvedValue(mockProducts);

      const result = await retrieveAllProductsService();

      expect(mockProductFind).toHaveBeenCalledWith({});
      expect(mockProductLean).toHaveBeenCalledWith();
      expect(result).toEqual(mockProducts);
    });

    it('should throw an error if the database query fails', async () => {
      const error = new Error('Database query failed');
      mockProductLean.mockRejectedValue(error);

      await expect(retrieveAllProductsService()).rejects.toThrow(error);
      expect(mockProductFind).toHaveBeenCalledWith({});
      expect(mockProductLean).toHaveBeenCalledOnce();
    });
  });

  describe('retrieveAllSubscriptionsService', () => {
    it('should retrieve all subscriptions successfully', async () => {
      const mockSubscriptionsList = {
        data: [{ id: 'sub_1', status: 'active' }, { id: 'sub_2', status: 'canceled' }],
        has_more: false,
        object: 'list',
        url: '/v1/subscriptions',
      };
      mockStripeSubscriptions.list.mockResolvedValue(mockSubscriptionsList);

      const result = await retrieveAllSubscriptionsService();

      expect(mockStripeSubscriptions.list).toHaveBeenCalledWith();
      expect(result).toEqual(mockSubscriptionsList);
    });

    it('should throw an error if Stripe API call fails during subscription list retrieval', async () => {
      const error = new Error('Stripe API error during subscription list');
      mockStripeSubscriptions.list.mockRejectedValue(error);

      await expect(retrieveAllSubscriptionsService()).rejects.toThrow(error);
      expect(mockStripeSubscriptions.list).toHaveBeenCalledOnce();
    });
  });

  describe('retrieveCustomerService', () => {
    it('should retrieve a specific customer by ID successfully', async () => {
      const customerId = 'cus_retrieve_123';
      const mockStripeCustomer = { id: customerId, email: 'retrieve@example.com' };
      mockStripeCustomers.retrieve.mockResolvedValue(mockStripeCustomer);

      const result = await retrieveCustomerService(customerId);

      expect(mockStripeCustomers.retrieve).toHaveBeenCalledWith(customerId);
      expect(result).toEqual(mockStripeCustomer);
    });

    it('should throw an error if the customer is not found or Stripe API fails', async () => {
      const customerId = 'cus_nonexistent';
      const error = new Error('Customer not found');
      mockStripeCustomers.retrieve.mockRejectedValue(error);

      await expect(retrieveCustomerService(customerId)).rejects.toThrow(error);
      expect(mockStripeCustomers.retrieve).toHaveBeenCalledWith(customerId);
    });
  });

  describe('updateCustomerService', () => {
    it('should update an existing customer in Stripe successfully', async () => {
      const customerId = 'cus_update_123';
      const updateData = { email: 'updated@example.com', name: 'Updated Name' };
      const mockUpdatedCustomer = { id: customerId, ...updateData };
      mockStripeCustomers.update.mockResolvedValue(mockUpdatedCustomer);

      const result = await updateCustomerService(customerId, updateData);

      expect(mockStripeCustomers.update).toHaveBeenCalledWith(customerId, updateData);
      expect(result).toEqual(mockUpdatedCustomer);
    });

    it('should throw an error if Stripe API call fails during customer update', async () => {
      const customerId = 'cus_update_123';
      const updateData = { email: 'updated@example.com' };
      const error = new Error('Failed to update customer');
      mockStripeCustomers.update.mockRejectedValue(error);

      await expect(updateCustomerService(customerId, updateData)).rejects.toThrow(error);
      expect(mockStripeCustomers.update).toHaveBeenCalledWith(customerId, updateData);
    });
  });

  describe('deleteCustomerService', () => {
    it('should delete a customer from Stripe successfully', async () => {
      const customerId = 'cus_delete_123';
      const mockDeleteConfirmation = { id: customerId, object: 'customer', deleted: true };
      mockStripeCustomers.del.mockResolvedValue(mockDeleteConfirmation);

      const result = await deleteCustomerService(customerId);

      expect(mockStripeCustomers.del).toHaveBeenCalledWith(customerId);
      expect(result).toEqual(mockDeleteConfirmation);
    });

    it('should throw an error if Stripe API call fails during customer deletion', async () => {
      const customerId = 'cus_delete_123';
      const error = new Error('Failed to delete customer');
      mockStripeCustomers.del.mockRejectedValue(error);

      await expect(deleteCustomerService(customerId)).rejects.toThrow(error);
      expect(mockStripeCustomers.del).toHaveBeenCalledWith(customerId);
    });
  });
});