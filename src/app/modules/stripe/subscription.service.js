import Stripe from "stripe";
import config from "../../../../config/index.js";

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: "2022-11-15",
});


const createSubscriptionService = async (customerId, priceId) => {
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    expand: ['latest_invoice.payment_intent'],
  });
  return subscription;
}

const retrieveSubscriptionService = async (subscriptionId) => {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return subscription;
}

const cancelSubscriptionService = async (subscriptionId) => {
  const confirmation = await stripe.subscriptions.cancel(subscriptionId);
  return confirmation;
}

const getCustomerSubscriptionsService = async (customerId) => {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    expand: ['data.default_payment_method', 'data.latest_invoice']
  });
  return subscriptions.data;
}

export {
  createSubscriptionService,
  retrieveSubscriptionService,
  cancelSubscriptionService,
  getCustomerSubscriptionsService
};