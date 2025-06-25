import rateLimit from 'express-rate-limit';

const createRateLimiter = (timeInMinutes = 5, maxRequests = 5) => {
  return rateLimit({
    windowMs: timeInMinutes * 60 * 1000,
    max: maxRequests,
    message: {
      success: false,
      message: `You have exceeded the ${maxRequests} requests in ${timeInMinutes} minutes limit!`,
      statusCode: 429,
      data: null,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

export default createRateLimiter;