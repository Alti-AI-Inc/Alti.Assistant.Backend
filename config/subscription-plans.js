import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load Stripe products from the generated JSON file
const stripeProductsPath = join(__dirname, 'stripe-products.json');
let stripeProducts;

try {
  const fileContent = readFileSync(stripeProductsPath, 'utf8');
  stripeProducts = JSON.parse(fileContent);
} catch (error) {
  console.error('Error loading stripe-products.json:', error.message);
  throw new Error(
    'Stripe products configuration not found. Please run: npm run seed:stripe'
  );
}

// Transform plans array into a map for easy lookup
const SUBSCRIPTION_PLANS = {};

stripeProducts.plans.forEach((plan) => {
  SUBSCRIPTION_PLANS[plan.plan] = {
    name: plan.name,
    planKey: plan.plan,
    pricePerSeat: plan.price,
    currency: plan.currency,
    interval: plan.interval,

    // Stripe identifiers
    stripeProductId: plan.productId,
    stripePriceId: plan.priceId,

    // Feature limits
    limits: {
      dailyWebSearchLimit: plan.features.dailyWebSearchLimit,
      dailyDeepResearchLimit: plan.features.dailyDeepResearchLimit,
      canInviteTeam: plan.features.canInviteTeam,
      unlimitedSeats: plan.features.unlimitedSeats,
    },

    // Display information
    displayName: plan.name,
    description: getDescriptionForPlan(plan.plan),
    features: getFeaturesListForPlan(plan.plan),
  };
});

/**
 * Get human-readable description for each plan
 */
function getDescriptionForPlan(planKey) {
  const descriptions = {
    free: 'Perfect for trying out Alti Assistant with basic features',
    explore: 'Great for individuals and small teams getting started',
    execute: 'Ideal for growing teams with regular usage needs',
    command: 'Best for large teams with high-volume requirements',
  };
  return descriptions[planKey] || '';
}

/**
 * Get features list for each plan
 */
function getFeaturesListForPlan(planKey) {
  const features = {
    free: [
      '10 web searches per day',
      'No deep research',
      'Single user only',
      'Basic support',
    ],
    explore: [
      '1,000 web searches per day',
      '10 deep research queries per day',
      'Unlimited team members',
      '$20 per user per month',
      'Email support',
    ],
    execute: [
      '5,000 web searches per day',
      '50 deep research queries per day',
      'Unlimited team members',
      '$50 per user per month',
      'Priority email support',
      'Advanced analytics',
    ],
    command: [
      '15,000 web searches per day',
      '150 deep research queries per day',
      'Unlimited team members',
      '$100 per user per month',
      'Priority support with dedicated account manager',
      'Advanced analytics',
      'Custom integrations',
    ],
  };
  return features[planKey] || [];
}

/**
 * Get plan details by plan key
 */
export function getPlanDetails(planKey) {
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan) {
    throw new Error(`Invalid plan: ${planKey}`);
  }
  return plan;
}

/**
 * Get all available plans
 */
export function getAllPlans() {
  return Object.values(SUBSCRIPTION_PLANS);
}

/**
 * Get plan by Stripe product ID
 */
export function getPlanByProductId(productId) {
  return Object.values(SUBSCRIPTION_PLANS).find(
    (plan) => plan.stripeProductId === productId
  );
}

/**
 * Get plan by Stripe price ID
 */
export function getPlanByPriceId(priceId) {
  return Object.values(SUBSCRIPTION_PLANS).find(
    (plan) => plan.stripePriceId === priceId
  );
}

/**
 * Check if a plan allows team invitations
 */
export function canPlanInviteTeam(planKey) {
  const plan = SUBSCRIPTION_PLANS[planKey];
  return plan ? plan.limits.canInviteTeam : false;
}

/**
 * Get usage limits for a plan
 */
export function getPlanLimits(planKey) {
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan) {
    throw new Error(`Invalid plan: ${planKey}`);
  }
  return plan.limits;
}

/**
 * Calculate monthly cost for a plan based on number of seats
 */
export function calculatePlanCost(planKey, seats = 1) {
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan) {
    throw new Error(`Invalid plan: ${planKey}`);
  }

  return {
    planKey,
    planName: plan.name,
    pricePerSeat: plan.pricePerSeat,
    seats,
    totalCost: plan.pricePerSeat * seats,
    currency: plan.currency,
    interval: plan.interval,
  };
}

/**
 * Check if plan upgrade is valid
 */
export function isValidUpgrade(currentPlan, newPlan) {
  const planHierarchy = ['free', 'explore', 'execute', 'command'];
  const currentIndex = planHierarchy.indexOf(currentPlan);
  const newIndex = planHierarchy.indexOf(newPlan);

  if (currentIndex === -1 || newIndex === -1) {
    return false;
  }

  return newIndex > currentIndex;
}

/**
 * Check if plan downgrade is valid
 */
export function isValidDowngrade(currentPlan, newPlan) {
  const planHierarchy = ['free', 'explore', 'execute', 'command'];
  const currentIndex = planHierarchy.indexOf(currentPlan);
  const newIndex = planHierarchy.indexOf(newPlan);

  if (currentIndex === -1 || newIndex === -1) {
    return false;
  }

  return newIndex < currentIndex;
}

export { SUBSCRIPTION_PLANS };
export default SUBSCRIPTION_PLANS;
