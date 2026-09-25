import { logger } from '../../shared/logger.js';

export const auditLogger = async (req, res, next) => {
  const startTime = Date.now();
  const { method, originalUrl, ip, user } = req;
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Construct audit log payload
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: `${method} ${originalUrl}`,
      actor: user?.id || 'anonymous',
      ip,
      status: statusCode,
      durationMs: duration
    };
    
    // In production, insert this directly into PostgreSQL Audit schema
    logger.info(`[Audit Log] ${JSON.stringify(logEntry)}`);
  });
  
  next();
};
