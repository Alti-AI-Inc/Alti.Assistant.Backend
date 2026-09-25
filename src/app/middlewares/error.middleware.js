import { logger } from '../../shared/logger.js';

export const globalErrorHandler = (err, req, res, next) => {
  logger.error(`[Global Error] Uncaught Exception on ${req.method} ${req.originalUrl} - ${err.message}`);
  
  // Strip stack traces in production
  const response = {
    error: 'Internal Server Error',
    code: err.status || 500,
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message
  };

  res.status(response.code).json(response);
};
