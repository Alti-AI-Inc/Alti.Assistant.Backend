// import http from 'http';
// import mongoose from 'mongoose';
// import config from './config/index.js';
// import app from './index.js'; // Make sure this exists and exports an Express app
// import { errorlogger, logger } from './src/shared/logger.js';
// import { RedisClient } from './src/shared/redis.js';

// process.on('uncaughtException', error => {
//   errorlogger.error('Uncaught Exception detected:', error);
//   process.exit(1);
// });

// let server;
// mongoose.set('strictQuery', true);
// mongoose.set('bufferCommands', false);
// async function main() {
//   try {
//     await RedisClient.connect();
//     logger.info('✅ Redis is connected successfully');

//     await mongoose.connect(config.database_local);
//     logger.info('✅ MongoDB connected successfully');

//     server = http.createServer(app).listen(config.port, () => {
//       logger.info(`🚀 Server listening on port ${config.port}`);
//     });
//   } catch (error) {
//     errorlogger.error(`❌ Failed to connect: ${error}`);
//     process.exit(1);
//   }

//   process.on('unhandledRejection', error => {
//     errorlogger.error('❗ Unhandled Rejection:', error);
//     if (server) server.close(() => process.exit(1));
//     else process.exit(1);
//   });
// }

// main();

// process.on('SIGTERM', () => {
//   logger.info('Signal Termination is received');
//   if (server) {
//     server.close();
//   }
// });

import http from 'http';
import mongoose from 'mongoose';
import app from './app'; // Make sure this exists and exports an Express app
import config from './config';
import { errorlogger, logger } from './shared/logger';
import { RedisClient, subscribeToEvents } from './shared/redis';

process.on('uncaughtException', error => {
  errorlogger.error('Uncaught Exception detected:', error);
  process.exit(1);
});

let server;

// Database connection
mongoose
  .connect(config.database_local, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => logger.info('Database connection successfully'))
  .catch(err => {
    logger.info('Error connecting to the database:', err);
    process.exit(1); // Exit the application on database connection error
  });

async function main() {
  try {
    await RedisClient.connect().then(() => {
      subscribeToEvents();
    });

    // This line is redundant if already connected above, but keeping as per your original
    await mongoose.connect(config.database_local);

    server = http.createServer(app).listen(config.port, () => {
      logger.info(`Application listening on port ${config.port}`);
    });

    logger.info('Database is Connected Successfully');
  } catch (error) {
    errorlogger.error(`Failed to connect Database: ${error}`);
  }

  process.on('unhandledRejection', error => {
    errorlogger.error('Unhandled Rejection detected:', error);

    if (server) {
      server.close(() => {
        errorlogger.error(error);
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });
}

main();

process.on('SIGTERM', () => {
  logger.info('Signal Termination is received');
  if (server) {
    server.close();
  }
});
