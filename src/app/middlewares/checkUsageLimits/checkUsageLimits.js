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

  const subObj = subscription.toObject ? subscription.toObject() : subscription;
  const planName = (subObj.plan_name || 'explore').toLowerCase();
  const planLimits = limits[planName] || limits.explore;
  
  // Bulletproof safety checks for usage nested objects
  const usage = subObj.usage || { promptsUsed: 0, imagesUsed: 0 };
  const promptsUsed = (usage && typeof usage.promptsUsed === 'number') ? usage.promptsUsed : 0;
  const imagesUsed = (usage && typeof usage.imagesUsed === 'number') ? usage.imagesUsed : 0;

  let errors = [];

  if (promptsUsed >= planLimits.prompts) {
    errors.push(`Your ${subObj.plan_name || 'explore'} plan prompts limit reached.`);
  }

  if (imagesUsed >= planLimits.images) {
    errors.push(
      `Your ${subObj.plan_name || 'explore'} plan image generation limit reached.`
    );
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return subscription;
};
