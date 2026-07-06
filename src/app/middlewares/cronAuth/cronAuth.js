import { logger } from '../../../shared/logger.js';

export const cronAuth = (req, res, next) => {
  const secret = process.env.CRON_SECRET_KEY;
  const requestSecret = req.headers['x-cron-secret'];

  // If CRON_SECRET_KEY is not configured, we might want to allow it or deny it.
  // For security, if it's expected to be set in production, we should enforce it.
  if (!secret) {
    logger.warn('CRON_SECRET_KEY is not set in environment variables. Cron endpoints are unprotected.');
    return next();
  }

  if (requestSecret === secret) {
    return next();
  }

  logger.warn('Unauthorized attempt to access cron endpoint.');
  return res.status(403).json({ success: false, message: 'Forbidden: Invalid cron secret' });
};
