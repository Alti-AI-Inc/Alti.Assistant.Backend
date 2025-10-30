import Stripe from "stripe";
import config from "../../../../../config/index.js";
import Product from "./products.model.js";

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: "2022-11-15",
});

const createProductService = async (productData) => {
  console.log('Starting product and price creation in Stripe...');

  const plans = [
    {
      name: "Base Plan",
      description: "Up to 3 connectors • 100 GB storage",
      metadata: {
        plan_type: "Base",
        plan_level: "base",          // ✅ required
        connectors_limit: "3",
        storage_limit: "100 GB",
        storage_limit_gb: 100        // ✅ required (number is fine; Stripe stores as string)
      },
      prices: [
        {
          nickname: "Base Monthly",
          currency: "usd",
          unit_amount: 9900,
          recurring: { interval: "month", usage_type: "licensed" },
          billing_scheme: "per_unit"
        },
        {
          nickname: "Base Yearly",
          currency: "usd",
          unit_amount: Math.round(9900 * 12 * 0.85), // ✅ integer
          recurring: { interval: "year", usage_type: "licensed" },
          billing_scheme: "per_unit"
        }
      ]
    },
    {
      name: "Professional Plan",
      description: "Up to 10 connectors • 500 GB storage",
      metadata: {
        plan_type: "Professional",
        plan_level: "professional",  // ✅
        connectors_limit: "10",
        storage_limit: "500 GB",
        storage_limit_gb: 500        // ✅
      },
      prices: [
        {
          nickname: "Professional Monthly",
          currency: "usd",
          unit_amount: 24900,
          recurring: { interval: "month", usage_type: "licensed" },
          billing_scheme: "per_unit"
        },
        {
          nickname: "Professional Yearly",
          currency: "usd",
          unit_amount: Math.round(24900 * 12 * 0.85), // ✅
          recurring: { interval: "year", usage_type: "licensed" },
          billing_scheme: "per_unit"
        }
      ]
    },
    {
      name: "Enterprise Plan",
      description: "Unlimited connectors • 1 TB+ storage",
      metadata: {
        plan_type: "Enterprise",
        plan_level: "enterprise",     // ✅
        connectors_limit: "Unlimited",
        storage_limit: "1 TB+",
        storage_limit_gb: 1024,       // ✅ pick a concrete cap for DB (1 TB)
        storage_limit_plus: "true"    // (optional) flag to indicate “+”
      },
      prices: [
        {
          nickname: "Enterprise Monthly",
          currency: "usd",
          unit_amount: 49900,
          recurring: { interval: "month", usage_type: "licensed" },
          billing_scheme: "per_unit"
        },
        {
          nickname: "Enterprise Yearly",
          currency: "usd",
          unit_amount: Math.round(49900 * 12 * 0.85), // ✅
          recurring: { interval: "year", usage_type: "licensed" },
          billing_scheme: "per_unit"
        }
      ]
    }
  ];


  await Product.deleteMany({}); // Clear existing products in DB

  const productsForDb = [];

  try {
    for (const plan of plans) {
      // ✅ plan.product doesn't exist — pass fields directly
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        // 'type' is optional/legacy; safe to omit or keep
        metadata: plan.metadata
      });

      console.log(`Created product: ${product.id} - ${product.name}`);

      // Create each price
      const createdPrices = [];
      for (const price of plan.prices) {
        // ✅ Make sure unit_amount is an integer
        const unitAmountInt = Math.round(price.unit_amount);

        const createdPrice = await stripe.prices.create({
          product: product.id,
          currency: price.currency || 'usd',
          unit_amount: unitAmountInt,
          // ✅ interval must come from price.recurring.interval
          recurring: {
            interval: price.recurring.interval,
            usage_type: price.recurring.usage_type || 'licensed'
          },
          nickname: price.nickname,
          billing_scheme: price.billing_scheme || 'per_unit'
        });

        console.log(
          `  Created price: ${price.nickname} - $${(unitAmountInt / 100).toFixed(2)} / ${price.recurring.interval}`
        );

        createdPrices.push({
          nickname: price.nickname,
          unit_amount: unitAmountInt,
          interval: price.recurring.interval,
          stripe_price_id: createdPrice.id
        });
      }

      productsForDb.push({
        name: product.name,
        description: product.description,
        metadata: product.metadata,
        prices: createdPrices,              // ✅ store actual created price IDs & normalized values
        stripe_product_id: product.id
      });
    }

    await Product.insertMany(productsForDb);
    return true;
  } catch (error) {
    console.error('Error creating products and prices in Stripe:', error);
    throw error;
  }
};


const retrieveProductService = async (productId) => {
  const product = await stripe.products.retrieve(productId);
  return product;
}

const updateProductService = async (productId, updateData) => {
  const product = await stripe.products.update(productId, updateData);
  return product;
}

const deleteProductService = async (productId) => {
  const confirmation = await stripe.products.del(productId);
  return confirmation;
}

export {
  createProductService,
  retrieveProductService,
  updateProductService,
  deleteProductService
};
