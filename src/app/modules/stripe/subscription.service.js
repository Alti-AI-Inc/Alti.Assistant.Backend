import Stripe from 'stripe';
import config from '../../../../config/index.js';

/**
 * Stripe SDK client instance initialized with the application's secret key.
 * @type {Stripe}
 */
const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

/**
 * Creates a new Stripe subscription for a specific customer and price tier.
 * This service is typically invoked within a multi-tenant context where the customerId
 * maps to a specific tenant or user account in the system.
 *
 * @async
 * @function createSubscriptionService
 * @param {string} customerId - The unique Stripe customer ID representing the tenant or user.
 * @param {string} priceId - The Stripe price ID representing the subscription plan/tier.
 * @returns {Promise<Stripe.Subscription>} Resolves to the created Stripe subscription object, expanding the latest invoice's payment intent.
 * @throws {Stripe.errors.StripeError} Throws an error if the Stripe API request fails.
 */
const createSubscriptionService = async (customerId, priceId) => {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      expand: ['latest_invoice.payment_intent'],
    });
    return subscription;
  } catch (error) {
    // Handle Stripe API errors gracefully.
    // Log the error for debugging and re-throw to propagate to the calling layer.
    console.error('Stripe createSubscriptionService error:', error);
    throw error;
  }
};

/**
 * Retrieves the details of an existing Stripe subscription.
 *
 * @async
 * @function retrieveSubscriptionService
 * @param {string} subscriptionId - The unique Stripe subscription ID.
 * @returns {Promise<Stripe.Subscription>} Resolves to the retrieved Stripe subscription object.
 * @throws {Stripe.errors.StripeError} Throws an error if the subscription is not found or Stripe API fails.
 */
const retrieveSubscriptionService = async (subscriptionId) => {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    // Handle Stripe API errors gracefully.
    console.error('Stripe retrieveSubscriptionService error:', error);
    throw error;
  }
};

/**
 * Cancels an active Stripe subscription immediately.
 * Access to this service should be restricted to authorized tenant administrators or system owners.
 *
 * @async
 * @function cancelSubscriptionService
 * @param {string} subscriptionId - The unique Stripe subscription ID to cancel.
 * @returns {Promise<Stripe.Subscription>} Resolves to the cancelled Stripe subscription object.
 * @throws {Stripe.errors.StripeError} Throws an error if the cancellation fails.
 */
const cancelSubscriptionService = async (subscriptionId) => {
  try {
    const confirmation = await stripe.subscriptions.cancel(subscriptionId);
    return confirmation;
  } catch (error) {
    // Handle Stripe API errors gracefully.
    console.error('Stripe cancelSubscriptionService error:', error);
    throw error;
  }
};

/**
 * Retrieves all active subscriptions associated with a specific Stripe customer.
 * Useful for verifying active subscription status and billing tiers in a multi-tenant environment.
 *
 * @async
 * @function getCustomerSubscriptionsService
 * @param {string} customerId - The unique Stripe customer ID (multi-tenant context identifier).
 * @returns {Promise<Stripe.Subscription[]>} Resolves to an array of active Stripe subscription objects with expanded payment method and latest invoice details.
 * @throws {Stripe.errors.StripeError} Throws an error if the Stripe API request fails.
 */
const getCustomerSubscriptionsService = async (customerId) => {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      expand: ['data.default_payment_method', 'data.latest_invoice'],
    });
    return subscriptions.data;
  } catch (error) {
    // Handle Stripe API errors gracefully.
    console.error('Stripe getCustomerSubscriptionsService error:', error);
    throw error;
  }
};

export {
  createSubscriptionService,
  retrieveSubscriptionService,
  cancelSubscriptionService,
  getCustomerSubscriptionsService,
};