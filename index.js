import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Failed to set custom DNS servers:', e);
}

import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import toobusy from 'toobusy-js';
import requestIdMiddleware from './src/app/middlewares/requestId.js';
import tenantGuardrail from './src/shared/tenantGuardrail.js';

// Enforce tenant isolation boundaries globally on all queries
mongoose.plugin(tenantGuardrail);

// import config from './config';
import globalErrorHandler from './src/app/middlewares/globalErrorHandler/globalErrorHandler.js';
import router from './src/app/routes/index.js';
// import { logger } from './src/shared/logger';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import config from './config/index.js';
import './src/app/middlewares/resetUsage/resetUsage.js';
import './src/app/cron/usage/cleanupOldUsage.js';
import passportConfig from './src/app/modules/social-login/config/passport.js';
import { logger } from './src/shared/logger.js';
import usageLogger from './src/app/middlewares/usageLogger/usageLogger.js';
import { initializeCronJobs } from './src/app/cron/index.js';
import { fetchStripeIps } from './src/shared/stripeSecurity.js';
import { warmSportsCache } from './src/app/helpers/sportsDataCache.js';
import { temporalWorkerCoordinator } from './src/app/modules/workflow_automation/services/temporal/worker.js';
import { requestContextStore } from './src/shared/requestContext.js';
import { dockerWorkspaceService } from './src/app/modules/docker/dockerWorkspace.service.js';
import { jwtHelpers } from './src/app/helpers/jwtHelpers.js';
import { initSentry, captureException, flushSentry } from './src/shared/sentry.js';
import { RedisClient } from './src/shared/redis.js';

// Load environment variables
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════════
// STARTUP ENV VALIDATION — fail fast if critical config is missing
// ═══════════════════════════════════════════════════════════════════════════════
const REQUIRED_ENV = ['DATABASE_LOCAL'];
const RECOMMENDED_ENV = ['GEMINI_API_KEY', 'JWT_ACCESS_TOKEN', 'JWT_REFRESH_REFRESH_TOKEN'];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.error(`❌ FATAL: Required environment variable ${key} is not set. Server cannot start reliably.`);
    // Don't exit — let Cloud Run accept the revision, but log loudly
  }
}
for (const key of RECOMMENDED_ENV) {
  if (!process.env[key]) {
    logger.warn(`⚠️ Recommended environment variable ${key} is not set. Some features may not work.`);
  }
}

const app = express();

// Initialize Sentry error tracking (no-op if SENTRY_DSN is not set)
initSentry(app);

// ✅ Register raw body parsers for Stripe webhooks FIRST (essential for signature checks)
app.use('/api/v1/stripe/webhook', express.raw({ type: 'application/json' }));
app.use('/api/v1/subscription/webhook', express.raw({ type: 'application/json' }));
app.use('/api/v1/subscriptions/webhook', express.raw({ type: 'application/json' }));

const allowedOrigins = [
  'https://altihq.com',
  'https://www.altihq.com',
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

// Enable trust proxy for Cloud Run behind Google's load balancer
app.set('trust proxy', true);

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

// Prevent DOS attacks with toobusy — active in all environments
app.use((req, res, next) => {
  if (toobusy()) {
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
  mongoose
    .connect(config.database_local, {
      family: 4,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 20,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    })
    .then(() => {
      logger.info('✅ Database connection successfully');
      initializeCronJobs();
      
      // Start background Temporal Worker
      temporalWorkerCoordinator.start().catch((err) =>
        logger.error('⚠️ Failed to start background Temporal Worker:', err.message)
      );

      fetchStripeIps().catch((err) =>
        logger.error('Failed to pre-fetch Stripe webhook IPs at boot:', err)
      );
      // Start PredictionData.io background cache warming
      setTimeout(() => {
        try {
          warmSportsCache();
          logger.info('✅ PredictionData.io sports cache warming started');
        } catch (err) {
          logger.warn('⚠️ Sports cache warm failed to start:', err.message);
        }
      }, 3000); // 3s delay so DB + Redis are fully ready
    })
    .catch((err) => {
      logger.error(`❌ DB connection failed (${retries} retries left): ${err.message}`);
      if (retries > 0) {
        setTimeout(() => connectDB(retries - 1, delay), delay);
      } else {
        logger.error('❌ All DB retries exhausted. Running without database.');
      }
    });
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
        const verifiedUser = jwtHelpers.verifyToken(token, config.jwt.access_token);
        const userId = verifiedUser?.userId || verifiedUser?._id;
        if (userId) {
          // Asynchronously warm up container workspace in background
          dockerWorkspaceService.prewarmWorkspace(userId).catch(() => {});
        }
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
    checks.mongodb = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  } catch {
    checks.mongodb = 'error';
  }

  // Check Redis
  try {
    if (RedisClient.isEnabled) {
      await RedisClient.set('health:ping', 'pong', { EX: 10 });
      const pong = await RedisClient.get('health:ping');
      checks.redis = pong === 'pong' ? 'connected' : 'degraded';
    } else {
      checks.redis = 'disabled (in-memory fallback active)';
    }
  } catch {
    checks.redis = 'error';
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

  if (RedisClient.isEnabled) {
    try {
      await RedisClient.set('readiness:ping', 'pong', { EX: 5 });
      ready.redis = true;
    } catch {
      ready.redis = false;
    }
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
  res.send('Alti is working! YaY!');
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
const server = app.listen(port, () => {
  logger.info(`✅ App is running on 0.0.0.0:${port}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   Gemini model: ${config.gemini_model}`);
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
    await flushSentry();
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  captureException(err, { fatal: true });
  flushSentry().finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
  captureException(reason, { type: 'unhandledRejection' });
  // Log but don't exit — unhandled rejections shouldn't crash the server
});

export default app;
