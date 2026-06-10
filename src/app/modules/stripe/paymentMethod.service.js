import Stripe from 'stripe';
import config from '../../../../config/index.js';

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

const createPaymentIntentService = async (amount, currency, customerId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // amount in cents
      currency: currency,
      customer: customerId,
      // Optional: attach minimal metadata to help you later
      metadata: { customerId },
      automatic_payment_methods: { enabled: false }, // we’ll use CardElement explicitly
    });
    return { clientSecret: paymentIntent.client_secret };
  } catch (error) {
    // Handle Stripe API errors or network issues to prevent unhandled promise rejections.
    throw new Error('Failed to create payment intent.');
  }
};

const getAllPaymentMethodsService = async (customerId) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
    return paymentMethods.data;
  } catch (error) {
    // Handle Stripe API errors or network issues to prevent unhandled promise rejections.
    throw new Error('Failed to retrieve payment methods.');
  }
};

const savePaymentMethodService = async (customerId, paymentMethodId) => {
  try {
    // Attach the payment method to the customer
    // Removed console.log for production readiness and performance.
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
    // Optionally, set it as the default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    return true;
  } catch (error) {
    // Handle Stripe API errors or network issues to prevent unhandled promise rejections.
    throw new Error('Failed to save payment method.');
  }
};

export {
  createPaymentIntentService,
  getAllPaymentMethodsService,
  savePaymentMethodService,
};