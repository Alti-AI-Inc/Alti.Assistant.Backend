export const canUserGenerateVideo = async (userId) => {
  return { canGenerate: true, plan: 'pro' };
};

export const decrementUserVideoCredits = async (userId, amount) => {
  return true;
};
