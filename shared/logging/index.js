/**
 * @fileoverview Shared Winston logger for all Inso Assistant agent microservices.
 * Provides structured JSON logging for Cloud Logging in production
 * and human-readable format in development. Includes log sanitization
 * to prevent secret leakage.
 *
 * Usage:
 *   import { logger, errorLogger } from '@inso/shared/logging';
 *   logger.info('Processing request', { userId, agentName: 'search' });
 */

import winston, { format } from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';

const { combine, timestamp, label, printf, json } = format;

// ── Log Sanitization ────────────────────────────────────────────────────────
const REDACT_PATTERNS = [
  { regex: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi, replacement: 'Bearer [REDACTED]' },
  { regex: /eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g, replacement: '[REDACTED_JWT]' },
  { regex: /mongodb(\+srv)?:\/\/[^\s"']+/gi, replacement: '[REDACTED_MONGODB_URI]' },
  { regex: /redis:\/\/[^\s"']+/gi, replacement: '[REDACTED_REDIS_URI]' },
  { regex: /sk_live_[A-Za-z0-9]{20,}/g, replacement: '[REDACTED_STRIPE_KEY]' },
  { regex: /sk_test_[A-Za-z0-9]{20,}/g, replacement: '[REDACTED_STRIPE_KEY]' },
  { regex: /AIza[A-Za-z0-9\-_]{35}/g, replacement: '[REDACTED_GOOGLE_KEY]' },
  { regex: /(password|secret|token|api_key|apikey|access_key|private_key)\s*[:=]\s*['"]?[^\s'"]+/gi, replacement: '$1=[REDACTED]' },
];

const sanitizeValue = (value) => {
  if (typeof value !== 'string') return value;
  let sanitized = value;
  for (const { regex, replacement } of REDACT_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement);
  }
  return sanitized;
};

const sanitizeFormat = format((info) => {
  if (info.message) info.message = sanitizeValue(info.message);
  if (info.splat) {
    info.splat = info.splat.map((arg) =>
      typeof arg === 'string' ? sanitizeValue(arg) : arg
    );
  }
  return info;
});

/**
 * Creates a logger configured for a specific agent service.
 * @param {string} serviceName - The name of the agent (e.g., 'agent-search')
 * @returns {{ logger: winston.Logger, errorLogger: winston.Logger }}
 */
export function createLogger(serviceName = 'inso-agent') {
  const isProduction = process.env.NODE_ENV === 'production';

  const localFormat = combine(
    label({ label: serviceName }),
    timestamp(),
    sanitizeFormat(),
    printf(({ level, message, label, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${label}] ${level}: ${message}${metaStr}`;
    })
  );

  const cloudFormat = combine(
    label({ label: serviceName }),
    timestamp(),
    sanitizeFormat(),
    json()
  );

  const logFormat = isProduction ? cloudFormat : localFormat;

  const loggerTransports = [new winston.transports.Console({ format: logFormat })];
  const errorTransports = [new winston.transports.Console({ format: logFormat })];

  if (isProduction) {
    try {
      const gcpTransport = new LoggingWinston({
        logName: serviceName,
        // Will automatically detect GCP project config when running on GCP
      });
      loggerTransports.push(gcpTransport);
      errorTransports.push(gcpTransport);
    } catch (err) {
      console.warn(`Failed to initialize LoggingWinston for ${serviceName}:`, err.message);
    }
  }

  const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: loggerTransports,
  });

  const errorLogger = winston.createLogger({
    level: 'error',
    format: logFormat,
    transports: errorTransports,
  });

  return { logger, errorLogger };
}

// Default logger instance for backward compatibility
const { logger, errorLogger } = createLogger(
  process.env.SERVICE_NAME || 'Inso Assistant Core Service'
);

export { logger, errorLogger };
export default { createLogger, logger, errorLogger };
