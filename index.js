import dotenv from 'dotenv';
// Load environment variables immediately on boot before any other modules are imported
dotenv.config();

import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Failed to set custom DNS servers:', e);
}

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import hpp from 'hpp';
import httpStatus from 'http-status';
import { createRequire } from 'module';
import mongoose from 'mongoose';
import toobusy from 'toobusy-js';
import requestIdMiddleware from './src/app/middlewares/requestId.js';
import tenantGuardrail from './src/shared/tenantGuardrail.js';
const require = createRequire(import.meta.url);
require('buffer').SlowBuffer = require('buffer').Buffer;
const originalConnect = mongoose.connect.bind(mongoose);
mongoose.connect = async function (uri, options) {
  if (uri && uri.includes('localhost')) {
    console.warn(`[Mongoose Patch] Blocked rogue connection to ${uri}`);
    return mongoose;
  }
  if (
    mongoose.connection.readyState === 1 ||
    mongoose.connection.readyState === 2
  ) {
    console.warn(`[Mongoose Patch] Blocked duplicate connection to ${uri}`);
    return mongoose;
  }
  console.log(`[Mongoose Patch] Allowing initial connection to ${uri}`);
  return originalConnect(uri, options);
};

// Enforce tenant isolation boundaries globally on all queries
mongoose.plugin(tenantGuardrail);

// import config from './config';
import globalErrorHandler from './src/app/middlewares/globalErrorHandler/globalErrorHandler.js';
import { MonitorWebhookRoutes } from './src/app/modules/ExaMonitor/monitor.webhook.route.js';
import router from './src/app/routes/index.js';
// import { logger } from './src/shared/logger';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import config from './config/index.js';

import { jwtHelpers } from './src/app/helpers/jwtHelpers.js';
import usageLogger from './src/app/middlewares/usageLogger/usageLogger.js';
import passportConfig from './src/app/modules/social-login/config/passport.js';

import { logger } from './src/shared/logger.js';
import { RedisClient } from './src/shared/redis.js';
import { requestContextStore } from './src/shared/requestContext.js';
import { fetchStripeIps } from './src/shared/stripeSecurity.js';

// Load environment variables (already loaded at entrypoint top)

// ═══════════════════════════════════════════════════════════════════════════════
// STARTUP ENV VALIDATION — fail fast if critical config is missing
// ═══════════════════════════════════════════════════════════════════════════════
const REQUIRED_ENV = ['DATABASE_LOCAL'];
const RECOMMENDED_ENV = [
  'GEMINI_API_KEY',
  'JWT_ACCESS_TOKEN',
  'JWT_REFRESH_REFRESH_TOKEN',
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.error(
      `❌ FATAL: Required environment variable ${key} is not set. Server cannot start reliably.`
    );
    // Don't exit — let Cloud Run accept the revision, but log loudly
  }
}
for (const key of RECOMMENDED_ENV) {
  if (!process.env[key]) {
    logger.warn(
      `⚠️ Recommended environment variable ${key} is not set. Some features may not work.`
    );
  }
}

const app = express();

app.use('/api/v1/webhooks/exa/monitors', MonitorWebhookRoutes);

// ✅ Register raw body parsers for Stripe webhooks FIRST (essential for signature checks)
app.use('/api/v1/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(
  '/api/v1/subscription/webhook',
  express.raw({ type: 'application/json' })
);
app.use(
  '/api/v1/subscriptions/webhook',
  express.raw({ type: 'application/json' })
);

const allowedOrigins = [
  'https://insohq.com',
  'https://www.insohq.com',
  'https://insoassistant.com',
  'https://www.insoassistant.com',
];

// Only allow localhost origins in non-production environments
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push(
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
  );
}

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Request ID tracing — must be early for correlation across all middleware
app.use(requestIdMiddleware);

// Compression — gzip all responses for bandwidth savings
app.use(compression());

// Body parsing with explicit size limits
// Exclude Stripe webhook paths (they need raw body for signature verification)
app.use((req, res, next) => {
  if (req.originalUrl.includes('/webhook') && req.method === 'POST') {
    next();
  } else {
    express.json({ limit: '2mb' })(req, res, next);
  }
});

app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// NoSQL injection protection — strips $ operators from user input
app.use(mongoSanitize());

// HTTP Parameter Pollution protection
app.use(hpp());

app.disable('x-powered-by');

// Configure trust proxy safely for rate-limiting integrity.
// Never use boolean `true` because it trusts all proxy hops and allows IP spoofing.
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv !== undefined) {
  const normalized = String(trustProxyEnv).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') {
    app.set('trust proxy', false);
  } else if (/^\d+$/.test(normalized)) {
    app.set('trust proxy', Number.parseInt(normalized, 10));
  } else if (normalized === 'loopback') {
    app.set('trust proxy', 'loopback');
  } else {
    // Safe fallback for unrecognized values
    app.set('trust proxy', 1);
  }
} else {
  // Cloud Run / ingress default: trust the first proxy hop only.
  app.set('trust proxy', config.env === 'production' ? 1 : false);
}

// Helmet middleware for robust security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
        blockAllMixedContent: [],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'same-origin' },
    frameguard: { action: 'deny' },
    xssFilter: true,
    noSniff: true,
    hidePoweredBy: true,
  })
);
app.disable('etag');

// Prevent DOS attacks with toobusy — active in production environments
app.use((req, res, next) => {
  if (config.env !== 'development' && config.env !== 'test' && toobusy()) {
    res.status(503).json({
      success: false,
      message: 'Server is under heavy load. Please try again shortly.',
    });
  } else {
    next();
  }
});

// MongoDB connection with retry — do NOT exit on failure so Cloud Run
// accepts the revision. The server starts immediately and DB reconnects.
const connectDB = (retries = 5, delay = 5000) => {
  const dbUri = config.database_local;

  if (
    !dbUri ||
    typeof dbUri !== 'string' ||
    (!dbUri.startsWith('mongodb://') && !dbUri.startsWith('mongodb+srv://'))
  ) {
    logger.error(
      `❌ DB connection failed: Invalid database URI format (got: "${dbUri}").`
    );
    if (retries > 0) {
      setTimeout(() => connectDB(retries - 1, delay), delay);
    } else {
      logger.error('❌ All DB retries exhausted. Running without database.');
    }
    return;
  }

  try {
    let connectionPromise;
    if (mongoose.connection.readyState === 1) {
      connectionPromise = Promise.resolve();
    } else if (mongoose.connection.readyState === 2) {
      connectionPromise = new Promise((resolve) =>
        mongoose.connection.once('open', resolve)
      );
    } else {
      connectionPromise = mongoose.connect(dbUri, {
        family: 4,
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 20,
        minPoolSize: 2,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
      });
    }

    connectionPromise
      .then(() => {
        logger.info('✅ Database connection successfully');

        fetchStripeIps().catch((err) =>
          logger.error('Failed to pre-fetch Stripe webhook IPs at boot:', err)
        );
      })
      .catch((err) => {
        logger.error(
          `❌ DB connection failed (${retries} retries left): ${err.message}`
        );
        if (retries > 0) {
          setTimeout(() => connectDB(retries - 1, delay), delay);
        } else {
          logger.error(
            '❌ All DB retries exhausted. Running without database.'
          );
        }
      });
  } catch (err) {
    logger.error(`❌ DB connection synchronous exception: ${err.message}`);
    if (retries > 0) {
      setTimeout(() => connectDB(retries - 1, delay), delay);
    } else {
      logger.error('❌ All DB retries exhausted. Running without database.');
    }
  }
};
connectDB();

// Initialize passport (no session)
passportConfig(passport);
app.use(passport.initialize());

// Usage logging middleware (asynchronous - no performance impact)
app.use(usageLogger);

// Request context storage for per-user AsyncLocalStorage
app.use((req, res, next) => {
  requestContextStore.run({ req, res }, () => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const verifiedUser = jwtHelpers.verifyToken(
          token,
          config.jwt.access_token
        );
        const userId = verifiedUser?.userId || verifiedUser?._id;
      }
    } catch (e) {
      // Ignore token validation issues for guest/public routes
    }
    next();
  });
});

app.get('/api/user', (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.json(req.user || null);
});

// API routes
app.use('/api/v1', router);

// Health check endpoint for Cloud Run
app.get('/health', async (req, res) => {
  const checks = {
    server: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || 'unknown',
  };

  // Check MongoDB
  try {
    checks.mongodb =
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  } catch {
    checks.mongodb = 'error';
  }

  // Check Redis
  try {
    if (RedisClient.isReady) {
      await RedisClient.set('health:ping', 'pong', { EX: 10 });
      const pong = await RedisClient.get('health:ping');
      checks.redis = pong === 'pong' ? 'connected' : 'degraded';
    } else if (RedisClient.isEnabled) {
      checks.redis = 'disconnected';
    } else {
      checks.redis = 'disabled (in-memory fallback active)';
    }
  } catch (err) {
    checks.redis = `error: ${err.message}`;
  }

  const allHealthy = checks.mongodb === 'connected';
  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    message: allHealthy ? 'Service is healthy' : 'Service degraded',
    checks,
  });
});

// Liveness probe — is the process alive and accepting connections?
app.get('/liveness', (req, res) => {
  res.status(200).json({ status: 'alive', uptime: process.uptime() });
});

// Readiness probe — is the service ready to accept traffic?
app.get('/readiness', async (req, res) => {
  const ready = {
    mongodb: mongoose.connection.readyState === 1,
  };

  if (RedisClient.isReady) {
    try {
      await RedisClient.set('readiness:ping', 'pong', { EX: 5 });
      ready.redis = true;
    } catch {
      ready.redis = false;
    }
  } else if (RedisClient.isEnabled) {
    ready.redis = false;
  } else {
    ready.redis = true;
  }

  const isReady = ready.mongodb; // MongoDB is required, Redis is optional
  res.status(isReady ? 200 : 503).json({
    success: isReady,
    message: isReady ? 'Service is ready' : 'Service is not ready',
    checks: ready,
  });
});

// Global error handler middleware
app.use(globalErrorHandler);

// Root endpoint
app.get('/', (req, res) => {
  res.send('Inso AI is working! YaY!');
});

// 404 Handler
app.use((req, res) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: 'Not found',
    errorMessages: [
      {
        path: req.originalUrl,
        message: 'Api not found',
      },
    ],
  });
});

// Start server
const port = process.env.PORT || config.port || 5100;
const server = app.listen(port, '0.0.0.0', () => {
  logger.info(`🚀 Server is running on port ${port} in ${config.env} mode`);
});

// Graceful shutdown handlers
const SHUTDOWN_TIMEOUT_MS = 10000; // Force exit after 10s if graceful shutdown hangs

const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully`);

  // Safety net: force exit if graceful shutdown takes too long
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref(); // Don't keep process alive just for this timer

  server.close(async () => {
    logger.info('HTTP server closed, draining complete');
    try {
      await mongoose.connection.close(false);
      logger.info('MongoDB connection closed');
    } catch (err) {
      logger.error('Error closing MongoDB connection:', err);
    }
    try {
      await RedisClient.disconnect();
      logger.info('Redis connections closed');
    } catch (err) {
      logger.error('Error closing Redis connections:', err);
    }
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Diagnostic: log WHY the process exits (helpful for debugging container restarts)
process.on('exit', (code) => {
  console.error(
    `[EXIT DIAGNOSTIC] Process exiting with code: ${code} at ${new Date().toISOString()}`
  );
  console.error(`[EXIT DIAGNOSTIC] Stack trace:`, new Error().stack);
});

process.on('beforeExit', (code) => {
  console.error(
    `[BEFORE EXIT] Process about to exit with code: ${code} — event loop empty at ${new Date().toISOString()}`
  );
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

export default app;
