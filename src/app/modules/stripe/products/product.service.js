/**
 * @file This file provides service functions for managing Stripe products and prices.
 * It interacts with the Stripe API to create, retrieve, update, and delete products,
 * and also stores product information in a local database.
 */

import Stripe from 'stripe';
import { scheduleTask } from '../../../../shared/queues.js';
import config from '../../../../../config/index.js';
import Product from './products.model.js';



/**
 * Stripe API client instance initialized with the secret key and API version.
 * @type {Stripe}
 */
const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

// Queue system initialized via shared/queues.js

/**
 * [WORKER LOGIC] Creates predefined Stripe products and their associated prices, then stores them in the local database.
 * This function contains the long-running logic and is designed to be executed by a background worker (triggered by a Cloud Task).
 * It hardcodes a set of subscription plans (Base, Professional, Enterprise) with monthly and yearly prices.
 *
 * @returns {Promise<boolean>} A promise that resolves to `true` if products and prices are successfully created and stored.
 * @throws {Error} If there is an error during Stripe API calls or database operations.
 */
const handleProductCreationJob = async () => {
  console.log('Starting product and price creation in Stripe (background job)...');

  const plans = [
    {
      name: 'Base Plan',
      description: 'Up to 3 connectors • 100 GB storage',
      metadata: {
        plan_type: 'Base',
        plan_level: 'base', // ✅ required
        connectors_limit: '3',
        storage_limit: '100 GB',
        storage_limit_gb: 100, // ✅ required (number is fine; Stripe stores as string)
      },
      prices: [
        {
          nickname: 'Base Monthly',
          currency: 'usd',
          unit_amount: 9900,
          recurring: { interval: 'month', usage_type: 'licensed' },
          billing_scheme: 'per_unit',
        },
        {
          nickname: 'Base Yearly',
          currency: 'usd',
          unit_amount: Math.round(9900 * 12 * 0.85), // ✅ integer
          recurring: { interval: 'year', usage_type: 'licensed' },
          billing_scheme: 'per_unit',
        },
      ],
    },
    {
      name: 'Professional Plan',
      description: 'Up to 10 connectors • 500 GB storage',
      metadata: {
        plan_type: 'Professional',
        plan_level: 'professional', // ✅
        connectors_limit: '10',
        storage_limit: '500 GB',
        storage_limit_gb: 500, // ✅
      },
      prices: [
        {
          nickname: 'Professional Monthly',
          currency: 'usd',
          unit_amount: 24900,
          recurring: { interval: 'month', usage_type: 'licensed' },
          billing_scheme: 'per_unit',
        },
        {
          nickname: 'Professional Yearly',
          currency: 'usd',
          unit_amount: Math.round(24900 * 12 * 0.85), // ✅
          recurring: { interval: 'year', usage_type: 'licensed' },
          billing_scheme: 'per_unit',
        },
      ],
    },
    {
      name: 'Enterprise Plan',
      description: 'Unlimited connectors • 1 TB+ storage',
      metadata: {
        plan_type: 'Enterprise',
        plan_level: 'enterprise', // ✅
        connectors_limit: 'Unlimited',
        storage_limit: '1 TB+',
        storage_limit_gb: 1024, // ✅ pick a concrete cap for DB (1 TB)
        storage_limit_plus: 'true', // (optional) flag to indicate “+”
      },
      prices: [
        {
          nickname: 'Enterprise Monthly',
          currency: 'usd',
          unit_amount: 49900,
          recurring: { interval: 'month', usage_type: 'licensed' },
          billing_scheme: 'per_unit',
        },
        {
          nickname: 'Enterprise Yearly',
          currency: 'usd',
          unit_amount: Math.round(49900 * 12 * 0.85), // ✅
          recurring: { interval: 'year', usage_type: 'licensed' },
          billing_scheme: 'per_unit',
        },
      ],
    },
  ];

  const productsForDb = [];

  try {
    for (const plan of plans) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: plan.metadata,
      });

      console.log(`Created product: ${product.id} - ${product.name}`);

      const createdPrices = [];
      for (const price of plan.prices) {
        const unitAmountInt = Math.round(price.unit_amount);

        const createdPrice = await stripe.prices.create({
          product: product.id,
          currency: price.currency || 'usd',
          unit_amount: unitAmountInt,
          recurring: {
            interval: price.recurring.interval,
            usage_type: price.recurring.usage_type || 'licensed',
          },
          nickname: price.nickname,
          billing_scheme: price.billing_scheme || 'per_unit',
        });

        console.log(
          `  Created price: ${price.nickname} - ${(unitAmountInt / 100).toFixed(2)} / ${price.recurring.interval}`
        );

        createdPrices.push({
          nickname: price.nickname,
          unit_amount: unitAmountInt,
          interval: price.recurring.interval,
          stripe_price_id: createdPrice.id,
        });
      }

      productsForDb.push({
        name: product.name,
        description: product.description,
        metadata: product.metadata,
        prices: createdPrices,
        stripe_product_id: product.id,
      });
    }

    await Product.insertMany(productsForDb);
    console.log('Successfully synced all products and prices to the database.');
    return true;
  } catch (error) {
    console.error('Error creating products and prices in Stripe background job:', error);
    throw error;
  }
};

/**
 * Asynchronously triggers the creation of predefined Stripe products and prices via a background job.
 * This function offloads the long-running task to the background queue to avoid blocking the main thread
 * and to ensure resilience. It immediately returns after queueing the task.
 *
 * @param {object} productData - This parameter is currently not used.
 * @returns {Promise<string>} A promise that resolves to the status of the task.
 * @throws {Error} If there is an error queueing the task.
 */
const createProductService = async (productData) => {
  const queue = 'stripe-processing-queue';
  try {
    console.log('Offloading product creation to queue...');
    await scheduleTask(queue, {}, 0);
    console.log(`Created task in queue ${queue}`);
    return 'queued';
  } catch (error) {
    console.error('Error creating queue task for product creation:', error);
    throw new Error('Failed to queue product creation job.');
  }
};

/**
 * Retrieves a list of prices associated with a specific product from Stripe.
 *
 * @param {object} params - An object containing parameters for the price retrieval.
 * @param {string} params.productId - The ID of the Stripe product for which to retrieve prices.
 * @returns {Promise<Stripe.ApiList<Stripe.Price>>} A promise that resolves to a list of Stripe Price objects.
 * @throws {Error} If the Stripe API call fails.
 */
const retrieveAllPricesService = async (params) => {
  const prices = await stripe.prices.list({
    product: params.productId,
  });
  return prices;
};

/**
 * Retrieves a single product from Stripe by its ID.
 *
 * @param {string} productId - The ID of the Stripe product to retrieve.
 * @returns {Promise<Stripe.Product>} A promise that resolves to a Stripe Product object.
 * @throws {Error} If the Stripe API call fails (e.g., product not found).
 */
const retrieveProductService = async (productId) => {
  const product = await stripe.products.retrieve(productId);
  return product;
};

/**
 * Updates an existing product in Stripe.
 *
 * @param {string} productId - The ID of the Stripe product to update.
 * @param {Stripe.ProductUpdateParams} updateData - An object containing the fields to update for the product.
 * @returns {Promise<Stripe.Product>} A promise that resolves to the updated Stripe Product object.
 * @throws {Error} If the Stripe API call fails.
 */
const updateProductService = async (productId, updateData) => {
  const product = await stripe.products.update(productId, updateData);
  return product;
};

/**
 * Deletes a product from Stripe.
 *
 * @param {string} productId - The ID of the Stripe product to delete.
 * @returns {Promise<Stripe.Product>} A promise that resolves to the deleted Stripe Product object (with `deleted: true`).
 * @throws {Error} If the Stripe API call fails.
 */
const deleteProductService = async (productId) => {
  const confirmation = await stripe.products.del(productId);
  return confirmation;
};

export {
  createProductService,
  retrieveProductService,
  updateProductService,
  deleteProductService,
  retrieveAllPricesService,
  handleProductCreationJob,
};