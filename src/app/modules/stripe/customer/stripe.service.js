/**
 * @file This file provides services for interacting with the Stripe API, specifically for customer, product, and subscription management.
 * It encapsulates Stripe API calls and database interactions related to Stripe products.
 */

import Stripe from 'stripe';
import config from '../../../../../config/index.js';
import Product from '../products/products.model.js';

/**
 * Initializes the Stripe API client with the secret key from the application configuration.
 * The API version is set to '2022-11-15'.
 * @type {Stripe}
 */
const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

/**
 * Creates a new customer in Stripe.
 *
 * @async
 * @function createCustomerService
 * @param {object} user - The user object containing customer details.
 * @param {string} user.name - The name of the customer.
 * @param {string} user.email - The email address of the customer.
 * @param {object} [user.address] - The address of the customer.
 * @param {string} [user.phone] - The phone number of the customer.
 * @returns {Promise<Stripe.Customer>} A promise that resolves to the created Stripe Customer object.
 * @throws {Error} If the Stripe API call fails.
 */
const createCustomerService = async (user) => {
  const customer = await stripe.customers.create({
    name: user.name,
    email: user.email,
    address: user.address,
    phone: user.phone,
  });
  return customer;
};

/**
 * Retrieves a list of all customers from Stripe.
 *
 * @async
 * @function retrieveAllCustomersService
 * @returns {Promise<Stripe.ApiList<Stripe.Customer>>} A promise that resolves to a list of Stripe Customer objects.
 * @throws {Error} If the Stripe API call fails.
 */
const retrieveAllCustomersService = async () => {
  const customers = await stripe.customers.list();
  return customers;
};

/**
 * Retrieves all products stored in the local database.
 * This function queries the `Product` model.
 *
 * @async
 * @function retrieveAllProductsService
 * @returns {Promise<Array<object>>} A promise that resolves to an array of product documents.
 * @throws {Error} If the database query fails.
 */
const retrieveAllProductsService = async () => {
  const products = await Product.find({}).lean();
  return products;
};

/**
 * Retrieves a list of all subscriptions from Stripe.
 *
 * @async
 * @function retrieveAllSubscriptionsService
 * @returns {Promise<Stripe.ApiList<Stripe.Subscription>>} A promise that resolves to a list of Stripe Subscription objects.
 * @throws {Error} If the Stripe API call fails.
 */
const retrieveAllSubscriptionsService = async () => {
  const subscriptions = await stripe.subscriptions.list();
  return subscriptions;
};

/**
 * Retrieves a specific customer from Stripe by their ID.
 *
 * @async
 * @function retrieveCustomerService
 * @param {string} customerId - The ID of the customer to retrieve.
 * @returns {Promise<Stripe.Customer>} A promise that resolves to the retrieved Stripe Customer object.
 * @throws {Error} If the Stripe API call fails or the customer is not found.
 */
const retrieveCustomerService = async (customerId) => {
  const customer = await stripe.customers.retrieve(customerId);
  return customer;
};

/**
 * Updates an existing customer in Stripe.
 *
 * @async
 * @function updateCustomerService
 * @param {string} customerId - The ID of the customer to update.
 * @param {Stripe.CustomerUpdateParams} updateData - An object containing the fields to update for the customer.
 * @returns {Promise<Stripe.Customer>} A promise that resolves to the updated Stripe Customer object.
 * @throws {Error} If the Stripe API call fails.
 */
const updateCustomerService = async (customerId, updateData) => {
  const customer = await stripe.customers.update(customerId, updateData);
  return customer;
};

/**
 * Deletes a customer from Stripe.
 *
 * @async
 * @function deleteCustomerService
 * @param {string} customerId - The ID of the customer to delete.
 * @returns {Promise<Stripe.Customer>} A promise that resolves to the deleted Stripe Customer object (with `deleted: true`).
 * @throws {Error} If the Stripe API call fails.
 */
const deleteCustomerService = async (customerId) => {
  const confirmation = await stripe.customers.del(customerId);
  return confirmation;
};

export {
  createCustomerService,
  retrieveCustomerService,
  updateCustomerService,
  deleteCustomerService,
  retrieveAllCustomersService,
  retrieveAllProductsService,
  retrieveAllSubscriptionsService,
};