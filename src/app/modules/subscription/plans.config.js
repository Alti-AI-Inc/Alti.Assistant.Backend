/**
 * SaaS Plan Configuration — Single Source of Truth
 *
 * 1 prompt = 1 input + 1 output (one round-trip through the orchestrator)
 *
 * All plans are monthly. Prompt limits reset at billing cycle start.
 */

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    promptLimit: 25,
    stripePriceId: null,
  },
  monthly_5: {
    name: 'Starter',
    price: 500, // cents
    promptLimit: 250,
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY_5 || 'price_monthly_5',
  },
  monthly_10: {
    name: 'Basic',
    price: 1000,
    promptLimit: 500,
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY_10 || 'price_monthly_10',
  },
  monthly_20: {
    name: 'Pro',
    price: 2000,
    promptLimit: 1000,
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY_20 || 'price_monthly_20',
  },
  monthly_50: {
    name: 'Growth',
    price: 5000,
    promptLimit: 2500,
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY_50 || 'price_monthly_50',
  },
  monthly_100: {
    name: 'Business',
    price: 10000,
    promptLimit: 5000,
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY_100 || 'price_monthly_100',
  },
  monthly_200: {
    name: 'Scale',
    price: 20000,
    promptLimit: 10000,
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY_200 || 'price_monthly_200',
  },
  monthly_500: {
    name: 'Enterprise',
    price: 50000,
    promptLimit: 25000,
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY_500 || 'price_monthly_500',
  },
};

/**
 * Get prompt limit for a plan.
 * @param {string} planId
 * @returns {number}
 */
export function getPromptLimit(planId) {
  return PLANS[planId]?.promptLimit || PLANS.free.promptLimit;
}

/**
 * Get plan config by Stripe Price ID.
 * @param {string} priceId
 * @returns {{ planId: string, config: object } | null}
 */
export function getPlanByPriceId(priceId) {
  for (const [planId, config] of Object.entries(PLANS)) {
    if (config.stripePriceId === priceId) {
      return { planId, config };
    }
  }
  return null;
}

/**
 * Get all plans for display.
 * @returns {Array}
 */
export function getAllPlans() {
  return Object.entries(PLANS)
    .filter(([id]) => id !== 'free')
    .map(([id, config]) => ({
      id,
      name: config.name,
      price: config.price / 100,
      promptLimit: config.promptLimit,
      stripePriceId: config.stripePriceId,
    }));
}

export default PLANS;
