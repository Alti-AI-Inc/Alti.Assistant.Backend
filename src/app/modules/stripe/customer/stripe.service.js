import Stripe from "stripe";
import config from "../../../../../config/index.js";

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: "2022-11-15",
});

const createCustomerService = async (user) => {
  const customer = await stripe.customers.create({
    name: user.name,
    email: user.email,
  });
  return customer;
}

const retrieveCustomerService = async (customerId) => {
  const customer = await stripe.customers.retrieve(customerId);
  return customer;
}

const updateCustomerService = async (customerId, updateData) => {
  const customer = await stripe.customers.update(customerId, updateData);
  return customer;
}

const deleteCustomerService = async (customerId) => {
  const confirmation = await stripe.customers.del(customerId);
  return confirmation;
}

export {
  createCustomerService,
  retrieveCustomerService,
  updateCustomerService,
  deleteCustomerService
};