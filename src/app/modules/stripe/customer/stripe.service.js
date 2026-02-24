import Stripe from "stripe";
import config from "../../../../../config/index.js";
import Product from "../products/products.model.js";

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: "2022-11-15",
});

const createCustomerService = async (user) => {
  const customer = await stripe.customers.create({
    name: user.name,
    email: user.email,
    address: user.address,
    phone: user.phone,
  });
  return customer;
}

const retrieveAllCustomersService = async () => {
  const customers = await stripe.customers.list();
  return customers;
}

const retrieveAllProductsService = async () => {
  const products = await Product.find({}).lean();
  return products;
}

const retrieveAllSubscriptionsService = async () => {
  const subscriptions = await stripe.subscriptions.list();
  return subscriptions;
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
  deleteCustomerService,
  retrieveAllCustomersService,
  retrieveAllProductsService,
  retrieveAllSubscriptionsService
};