import Stripe from 'stripe';
import config from '../../../../config/index.js';

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

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