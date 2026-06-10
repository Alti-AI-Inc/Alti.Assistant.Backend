import Stripe from 'stripe';
import config from '../../../../config/index.js';

/**
 * Initializes the Stripe API client with the secret key from the application configuration.
 * The API version is set to '2022-11-15'.
 * @type {Stripe}
 */
const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

/**
 * Creates a new Stripe Payment Intent for a given amount, currency, and customer.
 * This intent is used to collect payment from a customer.
 *
 * @param {number} amount - The amount to charge in cents (e.g., 1000 for $10.00).
 * @param {string} currency - The three-letter ISO currency code (e.g., 'usd', 'eur').
 * @param {string} customerId - The ID of the Stripe customer for whom the payment intent is being created.
 * @returns {Promise<{clientSecret: string}>} A promise that resolves to an object containing the client secret
 *   for the Payment Intent, which is used on the frontend to confirm the payment.
 * @throws {Error} If the Payment Intent creation fails due to Stripe API errors or network issues.
 */
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
    throw new Error(`Failed to create payment intent: ${error.message}`);
  }
};

/**
 * Retrieves all payment methods of type 'card' associated with a specific Stripe customer.
 *
 * @param {string} customerId - The ID of the Stripe customer whose payment methods are to be retrieved.
 * @returns {Promise<Array<Stripe.PaymentMethod>>} A promise that resolves to an array of Stripe PaymentMethod objects.
 * @throws {Error} If retrieving payment methods fails due to Stripe API errors or network issues.
 */
const getAllPaymentMethodsService = async (customerId) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
    return paymentMethods.data;
  } catch (error) {
    // Handle Stripe API errors or network issues to prevent unhandled promise rejections.
    throw new Error(`Failed to retrieve payment methods: ${error.message}`);
  }
};

/**
 * Attaches a payment method to a Stripe customer and optionally sets it as the customer's default payment method
 * for future invoices.
 *
 * @param {string} customerId - The ID of the Stripe customer to whom the payment method will be attached.
 * @param {string} paymentMethodId - The ID of the Payment Method to attach and potentially set as default.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the payment method is successfully attached
 *   and set as default.
 * @throws {Error} If attaching or updating the payment method fails due to Stripe API errors or network issues.
 */
const savePaymentMethodService = async (customerId, paymentMethodId) => {
  try {
    // Attach the payment method to the customer
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
    throw new Error(`Failed to save payment method: ${error.message}`);
  }
};

/**
 * Detaches a payment method from a customer. This is crucial for workspace owners to manage and delete old payment methods.
 *
 * @param {string} paymentMethodId - The ID of the Payment Method to detach.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the payment method is successfully detached.
 * @throws {Error} If detaching the payment method fails due to Stripe API errors or network issues.
 */
const detachPaymentMethodService = async (paymentMethodId) => {
  try {
    await stripe.paymentMethods.detach(paymentMethodId);
    return true;
  } catch (error) {
    throw new Error(`Failed to detach payment method: ${error.message}`);
  }
};

/**
 * Sets an existing payment method as the default payment method for a customer's invoices.
 *
 * @param {string} customerId - The ID of the Stripe customer.
 * @param {string} paymentMethodId - The ID of the Payment Method to set as default.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the default payment method is successfully updated.
 * @throws {Error} If updating the customer's default payment method fails.
 */
const setDefaultPaymentMethodService = async (customerId, paymentMethodId) => {
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    return true;
  } catch (error) {
    throw new Error(`Failed to set default payment method: ${error.message}`);
  }
};

export {
  createPaymentIntentService,
  getAllPaymentMethodsService,
  savePaymentMethodService,
  detachPaymentMethodService,
  setDefaultPaymentMethodService,
};