import httpStatus from 'http-status';
import ApiError from '../errors/ApiError.js';
import { RedisClient, redisClient } from './redis.js';

// In-memory fallback rate limiter store
const inMemoryStore = new Map();

// Periodically clean up expired entries to prevent memory leaks
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of inMemoryStore.entries()) {
    if (value.expiresAt < now) {
      inMemoryStore.delete(key);
    }
  }
}, 60000);

if (cleanupInterval && typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

/**
 * Perform rate limit check
 * @param {string} key - Redis key
 * @param {number} maxPoints - Maximum number of allowed requests/points
 * @param {number} durationInSeconds - The rate limit window duration in seconds
 * @param {number} cost - Cost of the current request/action
 * @returns {Promise<boolean>} - True if request is allowed, false if rate limited
 */
async function checkRateLimit(key, maxPoints, durationInSeconds, cost = 1) {
  const now = Date.now();

  // Try Redis rate limiting if enabled and active
  if (RedisClient.isEnabled && redisClient && redisClient.isOpen) {
    try {
      const current = await redisClient.get(key);
      if (current === null) {
        await redisClient.set(key, cost, { EX: durationInSeconds });
        return true;
      }
      const count = parseInt(current, 10) || 0;
      if (count + cost > maxPoints) {
        return false;
      }
      await redisClient.incrBy(key, cost);
      return true;
    } catch (err) {
      console.warn(`Redis rate limiter failed, falling back to memory: ${err.message}`);
    }
  }

  // Memory fallback rate limiting
  const entry = inMemoryStore.get(key);
  if (!entry || entry.expiresAt < now) {
    inMemoryStore.set(key, {
      count: cost,
      expiresAt: now + durationInSeconds * 1000
    });
    return true;
  }

  if (entry.count + cost > maxPoints) {
    return false;
  }

  entry.count += cost;
  return true;
}

/**
 * Enterprise rate limiter function
 */
export async function rateLimiter({ key, limit, duration, context, errorMessage }) {
  const prefix = context ? `rl_fn:${context}:` : 'rl_fn:';
  const fullKey = prefix + key;
  const hasPassed = await checkRateLimit(fullKey, limit, duration, 1);
  if (!hasPassed) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      errorMessage || 'Too many requests. Please try again later.'
    );
  }
}

// Attach helpers to the rateLimiter function so both style usages work
rateLimiter.limitByIp = async function(req, { points = 1, duration = 60, maxPoints, errorMessage }) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
  const fullKey = `rl_ip:${ip}`;
  const hasPassed = await checkRateLimit(fullKey, maxPoints, duration, points);
  if (!hasPassed) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      errorMessage || 'Too many requests from this IP. Please try again later.'
    );
  }
};

rateLimiter.limitByUserId = async function(userId, { points = 1, duration = 60, maxPoints, errorMessage }) {
  const fullKey = `rl_user:${userId || 'anonymous'}`;
  const hasPassed = await checkRateLimit(fullKey, maxPoints, duration, points);
  if (!hasPassed) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      errorMessage || 'You have made too many requests. Please try again later.'
    );
  }
};

/**
 * Express middleware rate limiter factory
 */
export const createRateLimiter = (arg1, arg2) => {
  let points = 100;
  let duration = 60;
  let keyPrefix = 'rl';
  let keyGenerator = (req) => req.user?.userId || req.user?._id || req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  let errorMessage = 'Too many requests, please try again later.';

  if (typeof arg1 === 'object' && arg1 !== null) {
    points = arg1.points || arg1.limit || 100;
    duration = arg1.duration || 60;
    keyPrefix = arg1.keyPrefix || 'rl';
    if (arg1.keyGenerator) keyGenerator = arg1.keyGenerator;
    errorMessage = arg1.errorMessage || errorMessage;
  } else {
    // Legacy format: createRateLimiter(timeInMinutes, maxRequests)
    const timeInMinutes = typeof arg1 === 'number' ? arg1 : 5;
    const maxRequests = typeof arg2 === 'number' ? arg2 : 5;
    points = maxRequests;
    duration = timeInMinutes * 60;
    keyPrefix = 'rl_legacy';
  }

  return async (req, res, next) => {
    try {
      const key = keyGenerator(req);
      const fullKey = `${keyPrefix}:${key}`;
      const hasPassed = await checkRateLimit(fullKey, points, duration, 1);
      if (!hasPassed) {
        return res.status(httpStatus.TOO_MANY_REQUESTS).json({
          success: false,
          message: errorMessage
        });
      }
      next();
    } catch (err) {
      console.error('Rate limiter middleware error:', err);
      next();
    }
  };
};

export const createLimiter = createRateLimiter;

// Define specific pre-configured rate limiters
export const apiLimiterStrict = createRateLimiter({
  keyPrefix: 'api_strict',
  points: 20,
  duration: 60,
  errorMessage: 'Too many requests, please try again after a minute.'
});

export const apiLimiterDaily = createRateLimiter({
  keyPrefix: 'api_daily',
  points: 200,
  duration: 24 * 60 * 60,
  errorMessage: 'Daily limit exceeded. Please try again tomorrow.'
});

export const startSessionLimiter = createRateLimiter({
  keyPrefix: 'session_start',
  points: 10,
  duration: 60,
  errorMessage: 'Too many session start requests, please try again after a minute.'
});

export const deleteSessionLimiter = createRateLimiter({
  keyPrefix: 'session_delete',
  points: 20,
  duration: 60,
  errorMessage: 'Too many session delete requests, please try again after a minute.'
});

export default rateLimiter;
