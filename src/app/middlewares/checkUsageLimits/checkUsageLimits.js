import SubscriptionModel from '../../modules/payment/payment.model.js';

const limits = {
  explore: { prompts: 10, images: 10 },
  analyze: { prompts: 250, images: 25 },
  execute: { prompts: 500, images: 50 },
  command: { prompts: 1000, images: 100 },
};

export const checkUsageLimits = async (userId, session = null) => {
  const subscription = await SubscriptionModel.findOne(
    { userId, paymentStatus: 'paid', expiresAt: { $gte: new Date() } },
    {},
    { sort: { expiresAt: -1 }, session }
  );

  if (!subscription) {
    throw new Error('No active subscription found.');
  }

  const planLimits = limits[subscription.plan_name];

  let errors = [];

  if (subscription.usage.promptsUsed >= planLimits.prompts) {
    errors.push(`Your ${subscription.plan_name} plan prompts limit reached.`);
  }

  if (subscription.usage.imagesUsed >= planLimits.images) {
    errors.push(`Your ${subscription.plan_name} plan image generation limit reached.`);
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return subscription;
};