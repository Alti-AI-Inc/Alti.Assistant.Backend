import { logger } from '../../../shared/logger.js';

const rateLimitCache = new Map();

export const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const limits = rateLimitCache.get(ip) || { count: 0, startTime: Date.now() };
  
  if (Date.now() - limits.startTime > 60000) {
    limits.count = 0;
    limits.startTime = Date.now();
  }
  
  limits.count++;
  rateLimitCache.set(ip, limits);
  
  if (limits.count > 50) {
    logger.warn(`[Rate Limiter] ⚠️ IP ${ip} exceeded 50 req/min. Throttling.`);
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  
  next();
};
