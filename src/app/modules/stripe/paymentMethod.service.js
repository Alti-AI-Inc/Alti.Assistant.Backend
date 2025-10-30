import Stripe from "stripe";
import config from "../../../../config/index.js";

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: "2022-11-15",
});

const createPaymentIntentService = async (amount, currency, customerId) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount, // amount in cents
    currency: currency,
    // Optional: attach minimal metadata to help you later
    metadata: { customerId },
    automatic_payment_methods: { enabled: false }, // we’ll use CardElement explicitly
  });
  return { clientSecret: paymentIntent.client_secret };
};

const getAllPaymentMethodsService = async (customerId) => {
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });
  return paymentMethods.data;
}

const savePaymentMethodService = async (customerId, paymentMethodId) => {
  // Attach the payment method to the customer
  console.log('Attaching payment method to customer in Stripe...', customerId, paymentMethodId);
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });
  // Optionally, set it as the default payment method
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  return true;
}

export {
  createPaymentIntentService,
  getAllPaymentMethodsService,
  savePaymentMethodService
};