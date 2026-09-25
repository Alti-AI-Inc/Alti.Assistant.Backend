import { logger } from '../../../shared/logger.js';
import jwt from 'jsonwebtoken';

export const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    logger.warn(`[Auth] ❌ Blocked unauthorized request to ${req.originalUrl}`);
    return res.status(401).json({ error: 'Missing Bearer Token' });
  }

  try {
    // In production, verify against Liberty Center One SSO / Clerk
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    req.user = decoded;
    next();
  } catch (err) {
    logger.error(`[Auth] ❌ Invalid Token: ${err.message}`);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};
