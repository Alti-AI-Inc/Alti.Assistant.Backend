import path from 'path';
import winston, { format } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, label, prettyPrint, printf, json } = format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

// Base format for local development
const localFormat = combine(
  label({ label: 'Alti Core Service' }),
  timestamp(),
  myFormat,
  prettyPrint()
);

// Structured JSON format for Google Cloud Logging (production)
const cloudFormat = combine(
  label({ label: 'Alti Core Service' }),
  timestamp(),
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
