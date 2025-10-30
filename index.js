import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import toobusy from 'toobusy-js';
// import config from './config';
import globalErrorHandler from './src/app/middlewares/globalErrorHandler/globalErrorHandler.js';
import router from './src/app/routes/index.js';
// import { logger } from './src/shared/logger';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import config from './config/index.js';
import './src/app/middlewares/resetUsage/resetUsage.js';
import passportConfig from './src/app/modules/social-login/config/passport.js';
import { logger } from './src/shared/logger.js';

// Load environment variables
dotenv.config();

const app = express();

// ✅ Use body-parser raw() FIRST for Stripe webhook before any JSON parsing
app.use(
  '/api/v1/subscription/webhook',
  express.raw({ type: 'application/json' }),
);

// app.use(cors({
//   origin: '*',
// }))

app.use(
  cors({
    origin: [
      'https://asonai.com',
      'https://www.asonai.com',
      'https://ason-web.netlify.app',
      'http://localhost:3000',
      'http://localhost:8080',
      'http://localhost:3001'
    ],
    credentials: true,
  }),
);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.disable('x-powered-by');

// Enable trust proxy (For Rate-Limit)
app.set('trust proxy', 'loopback');

// Helmet middleware for security headers
app.use(helmet());

// Additional Helmet security configurations
app.use(
  helmet.contentSecurityPolicy({
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
  }),
);
app.use(helmet.referrerPolicy({ policy: 'same-origin' }));
app.use(helmet.frameguard({ action: 'deny' }));
app.use(helmet.noSniff());
app.use(helmet.xssFilter());
app.use(helmet.hidePoweredBy());
app.disable('etag');

// Prevent DOS attacks with toobusy
app.use((req, res, next) => {
  if (toobusy()) {
    res.status(503).send('Server too busy!');
  } else {
    next();
  }
});

// MongoDB connection
mongoose
  .connect(config.database_local)
  .then(() => logger.info('✅ Database connection successfully'))
  .catch(err => {
    logger.error('❌ Error connecting to the database:', err);
    process.exit(1); // Exit the application on database connection error
  });

// Initialize passport (no session)
passportConfig(passport);
app.use(passport.initialize());

app.get('/api/user', (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.json(req.user || null);
});

// API routes
app.use('/api/v1', router);

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Service is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Global error handler middleware
app.use(globalErrorHandler);

// Root endpoint
app.get('/', (req, res) => {
  res.send('ASON is working! YaY!');
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
app.listen(port, "0.0.0.0", () => {
  logger.info(`✅ App is running on 0.0.0.0:${port}`);
});
export default app;
