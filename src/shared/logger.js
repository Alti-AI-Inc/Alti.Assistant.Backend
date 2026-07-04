import path from 'path';
import winston, { format } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, label, prettyPrint, printf, json } = format;

// ── Log Sanitization ────────────────────────────────────────────────────────
// Redact sensitive patterns from all log messages to prevent secret leakage.
const REDACT_PATTERNS = [
  // JWT tokens (Bearer and raw)
  { regex: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi, replacement: 'Bearer [REDACTED]' },
  { regex: /eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g, replacement: '[REDACTED_JWT]' },
  // MongoDB connection strings
  { regex: /mongodb(\+srv)?:\/\/[^\s"']+/gi, replacement: '[REDACTED_MONGODB_URI]' },
  // Redis URLs
  { regex: /redis:\/\/[^\s"']+/gi, replacement: '[REDACTED_REDIS_URI]' },
  // API keys (common patterns)
  { regex: /sk_live_[A-Za-z0-9]{20,}/g, replacement: '[REDACTED_STRIPE_KEY]' },
  { regex: /sk_test_[A-Za-z0-9]{20,}/g, replacement: '[REDACTED_STRIPE_KEY]' },
  { regex: /AIza[A-Za-z0-9\-_]{35}/g, replacement: '[REDACTED_GOOGLE_KEY]' },
  // Generic key=value patterns for common secret env vars
  { regex: /(password|secret|token|api_key|apikey|access_key|private_key)\s*[:=]\s*['"]?[^\s'"]+/gi, replacement: '$1=[REDACTED]' },
  // Email addresses in logs (GDPR)
  { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
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
  if (info.message) {
    info.message = sanitizeValue(info.message);
  }
  // Sanitize splat args (additional arguments to logger.info/error)
  if (info.splat) {
    info.splat = info.splat.map((arg) =>
      typeof arg === 'string' ? sanitizeValue(arg) : arg
    );
  }
  return info;
});

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

// Base format for local development
const localFormat = combine(
  label({ label: 'Alti Assistant Core Service' }),
  timestamp(),
  sanitizeFormat(),
  myFormat,
  prettyPrint()
);

// Structured JSON format for Google Cloud Logging (production)
const cloudFormat = combine(
  label({ label: 'Alti Assistant Core Service' }),
  timestamp(),
  sanitizeFormat(),
  json()
);

const isProduction = process.env.NODE_ENV === 'production';

// Build transports array
const successTransports = [
  new winston.transports.Console({
    format: isProduction ? cloudFormat : localFormat,
  }),
];

const errorTransports = [
  new winston.transports.Console({
    format: isProduction ? cloudFormat : localFormat,
  }),
];

// Add file-based logging in development only
if (!isProduction) {
  successTransports.push(
    new DailyRotateFile({
      filename: path.join(
        process.cwd(),
        'logs',
        'successes',
        'RH-%DATE%-success.log'
      ),
      datePattern: 'YYYY-MM-DD-HH',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    })
  );

  errorTransports.push(
    new DailyRotateFile({
      filename: path.join(
        process.cwd(),
        'logs',
        'errors',
        'RH-%DATE%-error.log'
      ),
      datePattern: 'YYYY-MM-DD-HH',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    })
  );
}

// In production on Cloud Run, console output is automatically captured
// by Google Cloud Logging. Structured JSON format enables severity
// levels, trace correlation, and Error Reporting integration.

// Success logger
export const logger = winston.createLogger({
  level: 'info',
  format: isProduction ? cloudFormat : localFormat,
  transports: successTransports,
});

// Error logger
export const errorlogger = winston.createLogger({
  level: 'error',
  format: isProduction ? cloudFormat : localFormat,
  transports: errorTransports,
});
