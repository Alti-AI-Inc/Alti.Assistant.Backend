import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter for DDoS and abuse prevention.
 * 300 requests per 15-minute window per IP.
 */
export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    status: false,
    message: 'Too many requests from this IP. Please try again later.',
    statusCode: 429,
    data: null,
  },
  skip: (req) => {
    // Skip webhooks from external providers (Stripe, Exa)
    return req.originalUrl.includes('/webhook');
  },
});

/**
 * Strict limiter for expensive AI generation and prompt routing endpoints.
 * 60 requests per 1-minute window per IP.
 */
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    status: false,
    message: 'AI inference rate limit exceeded. Please wait a moment before sending more prompts.',
    statusCode: 429,
    data: null,
  },
});

export default {
  globalApiLimiter,
  aiRateLimiter,
};
