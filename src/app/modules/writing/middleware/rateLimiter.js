import rateLimiter from '../../../../shared/rateLimiter.js';

export const startWritingLimiter = {
  consume: async (userId) => {
    return rateLimiter.limitByUserId(userId, { points: 10, duration: 60, errorMessage: 'Too many writing sessions started.' });
  }
};

export const writingInteractionLimiter = {
  consume: async (userId) => {
    return rateLimiter.limitByUserId(userId, { points: 50, duration: 60, errorMessage: 'Too many interactions.' });
  }
};

export const finalContentLimiter = {
  consume: async (userId) => {
    return rateLimiter.limitByUserId(userId, { points: 5, duration: 60, errorMessage: 'Too many final content generations.' });
  }
};
