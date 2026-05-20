import UserModel from '../../modules/auth/auth.model.js';
import { logger } from '../../../shared/logger.js';

export const checkFreePlanLimits = async (userId, type, session = null) => {
  const user = await UserModel.findById(userId, {}, { session });

  if (!user) {
    logger.warn(`[Payment] User with ID ${userId} not found in database. Mocking anonymous session to prevent orchestration crashes.`);
    return {
      _id: userId,
      isSubscribed: false,
      freePlanUsage: { promptsUsed: 0, imagesUsed: 0 },
      save: async () => { logger.info('[Payment] Skip persistence for anonymous/mock session.'); }
    };
  }

  if (!user.isSubscribed) {
    // Bulletproof fallback initialization
    if (!user.freePlanUsage) {
      user.freePlanUsage = { promptsUsed: 0, imagesUsed: 0 };
    }
    
    if (type === 'prompt' && user.freePlanUsage.promptsUsed >= 10) {
      throw new Error(
        'Free plan prompt limit reached. Please subscribe to continue.'
      );
    }

    if (type === 'image' && user.freePlanUsage.imagesUsed >= 1) {
      throw new Error(
        'Free plan image limit reached. Please subscribe to continue.'
      );
    }
  }

  return user;
};
