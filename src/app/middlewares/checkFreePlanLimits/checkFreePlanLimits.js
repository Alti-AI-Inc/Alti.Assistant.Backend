import UserModel from '../../modules/auth/auth.model.js';

export const checkFreePlanLimits = async (userId, type, session = null) => {
  const user = await UserModel.findById(userId, {}, { session });

  if (!user) {
    throw new Error('User not found.');
  }

  if (!user.isSubscribed) {
    if (type === 'prompt' && user.freePlanUsage.promptsUsed >= 10) {
      throw new Error('Free plan prompt limit reached. Please subscribe to continue.');
    }

    if (type === 'image' && user.freePlanUsage.imagesUsed >= 1) {
      throw new Error('Free plan image limit reached. Please subscribe to continue.');
    }
  }

  return user;
};