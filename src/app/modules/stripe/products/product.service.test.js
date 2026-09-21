import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('stripe', () => {
  const mockStripeInstance = {
    products: {
      create: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
      del: vi.fn(),
    },
    prices: {
      create: vi.fn(),
      list: vi.fn(),
    },
  };
  // The default export is the constructor function
  const Stripe = vi.fn().mockImplementation(() => mockStripeInstance);
  return { default: Stripe };
});

vi.mock('../../../../shared/queues.js', () => ({
  scheduleTask: vi.fn(),
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    stripe: {
      stripe_secret_key: 'sk_test_mock',
    },
  },
}));

vi.mock('./products.model.js', () => ({
  default: {
    insertMany: vi.fn(),
  },
}));

// Import the service functions after mocks are set up
const {
  handleProductCreationJob,
  createProductService,
  retrieveAllPricesService,
  retrieveProductService,
  updateProductService,
  deleteProductService,
} = await import('./product.service.js');

// Import the mocked modules to get handles to the mock instances
import Stripe from 'stripe';
import { scheduleTask } from '../../../../shared/queues.js';
import Product from './products.model.js';
import config from '../../../../../config/index.js';

const mockStripe = new Stripe();

describe('Stripe Product Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleProductCreationJob', () => {
    it('should create products, prices, and save to DB successfully', async () => {
      mockStripe.products.create
        .mockResolvedValueOnce({ id: 'prod_base', name: 'Base Plan' })
        .mockResolvedValueOnce({ id: 'prod_prof', name: 'Professional Plan' })
        .mockResolvedValueOnce({ id: 'prod_ent', name: 'Enterprise Plan' });

      mockStripe.prices.create
        .mockResolvedValueOnce({ id: 'price_base_monthly' })
        .mockResolvedValueOnce({ id: 'price_base_yearly' })
        .mockResolvedValueOnce({ id: 'price_prof_monthly' })
        .mockResolvedValueOnce({ id: 'price_prof_yearly' })
        .mockResolvedValueOnce({ id: 'price_ent_monthly' })
        .mockResolvedValueOnce({ id: 'price_ent_yearly' });

      Product.insertMany.mockResolvedValue(true);

      const result = await handleProductCreationJob();

      expect(result).toBe(true);
      expect(mockStripe.products.create).toHaveBeenCalledTimes(3);
      expect(mockStripe.prices.create).toHaveBeenCalledTimes(6);
      expect(Product.insertMany).toHaveBeenCalledTimes(1);

      const dbPayload = Product.insertMany.mock.calls[0][0];
      expect(dbPayload).toHaveLength(3);
      expect(dbPayload[0].name).toBe('Base Plan');
      expect(dbPayload[0].stripe_product_id).toBe('prod_base');
      expect(dbPayload[0].prices).toHaveLength(2);
      expect(dbPayload[0].prices[0].stripe_price_id).toBe('price_base_monthly');
      expect(dbPayload[0].prices[1].unit_amount).toBe(Math.round(9900 * 12 * 0.85));
    });

    it('should throw an error if Stripe product creation fails', async () => {
      const error = new Error('Stripe API Error');
      mockStripe.products.create.mockRejectedValue(error);

      await expect(handleProductCreationJob()).rejects.toThrow(error);
      expect(Product.insertMany).not.toHaveBeenCalled();
    });

    it('should throw an error if Stripe price creation fails', async () => {
      const error = new Error('Stripe Price Error');
      mockStripe.products.create.mockResolvedValue({ id: 'prod_1', name: 'Test Plan' });
      mockStripe.prices.create.mockRejectedValue(error);

      await expect(handleProductCreationJob()).rejects.toThrow(error);
      expect(Product.insertMany).not.toHaveBeenCalled();
    });

    it('should throw an error if database insertion fails', async () => {
      const error = new Error('Database Error');
      mockStripe.products.create.mockResolvedValue({ id: 'prod_1', name: 'Test Plan' });
      mockStripe.prices.create.mockResolvedValue({ id: 'price_1' });
      Product.insertMany.mockRejectedValue(error);

      await expect(handleProductCreationJob()).rejects.toThrow(error);
    });
  });

  describe('createProductService', () => {
    it('should successfully schedule a task', async () => {
      scheduleTask.mockResolvedValue();

      const taskName = await createProductService({});

      expect(taskName).toBe('queued');
      expect(scheduleTask).toHaveBeenCalledWith('test-queue', {}, 0);
    });

    it('should throw a generic error if queueing fails', async () => {
      const error = new Error('Queue Error');
      scheduleTask.mockRejectedValue(error);

      await expect(createProductService({})).rejects.toThrow('Failed to queue product creation job.');
    });
  });

  describe('retrieveAllPricesService', () => {
    it('should retrieve all prices for a given product ID', async () => {
      const mockPrices = { data: [{ id: 'price_1' }, { id: 'price_2' }] };
      mockStripe.prices.list.mockResolvedValue(mockPrices);

      const prices = await retrieveAllPricesService({ productId: 'prod_123' });

      expect(prices).toEqual(mockPrices);
      expect(mockStripe.prices.list).toHaveBeenCalledWith({ product: 'prod_123' });
    });

    it('should throw an error if Stripe API fails', async () => {
      const error = new Error('Stripe Error');
      mockStripe.prices.list.mockRejectedValue(error);

      await expect(retrieveAllPricesService({ productId: 'prod_123' })).rejects.toThrow(error);
    });
  });

  describe('retrieveProductService', () => {
    it('should retrieve a product by its ID', async () => {
      const mockProduct = { id: 'prod_123', name: 'Test Product' };
      mockStripe.products.retrieve.mockResolvedValue(mockProduct);

      const product = await retrieveProductService('prod_123');

      expect(product).toEqual(mockProduct);
      expect(mockStripe.products.retrieve).toHaveBeenCalledWith('prod_123');
    });

    it('should throw an error if Stripe API fails', async () => {
      const error = new Error('Stripe Error');
      mockStripe.products.retrieve.mockRejectedValue(error);

      await expect(retrieveProductService('prod_123')).rejects.toThrow(error);
    });
  });

  describe('updateProductService', () => {
    it('should update a product with the given data', async () => {
      const updateData = { name: 'Updated Product Name' };
      const mockUpdatedProduct = { id: 'prod_123', name: 'Updated Product Name' };
      mockStripe.products.update.mockResolvedValue(mockUpdatedProduct);

      const product = await updateProductService('prod_123', updateData);

      expect(product).toEqual(mockUpdatedProduct);
      expect(mockStripe.products.update).toHaveBeenCalledWith('prod_123', updateData);
    });

    it('should throw an error if Stripe API fails', async () => {
      const error = new Error('Stripe Error');
      mockStripe.products.update.mockRejectedValue(error);

      await expect(updateProductService('prod_123', {})).rejects.toThrow(error);
    });
  });

  describe('deleteProductService', () => {
    it('should delete a product by its ID', async () => {
      const mockConfirmation = { id: 'prod_123', deleted: true };
      mockStripe.products.del.mockResolvedValue(mockConfirmation);

      const confirmation = await deleteProductService('prod_123');

      expect(confirmation).toEqual(mockConfirmation);
      expect(mockStripe.products.del).toHaveBeenCalledWith('prod_123');
    });

    it('should throw an error if Stripe API fails', async () => {
      const error = new Error('Stripe Error');
      mockStripe.products.del.mockRejectedValue(error);

      await expect(deleteProductService('prod_123')).rejects.toThrow(error);
    });
  });
});