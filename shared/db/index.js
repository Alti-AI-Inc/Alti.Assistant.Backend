/**
 * @fileoverview Shared MongoDB connection manager for all Inso Assistant agent microservices.
 * Provides a singleton connection with automatic reconnection, health checks,
 * and graceful shutdown.
 *
 * Usage:
 *   import { connectDB, getConnection, disconnectDB } from '@inso/shared/db';
 *   await connectDB();
 */

import mongoose from 'mongoose';
import { createLogger } from '../logging/index.js';

const { logger } = createLogger('shared-db');

let isConnected = false;
let connectionPromise = null;

/**
 * Connect to MongoDB Atlas using the shared config.
 * Uses a singleton pattern — multiple calls return the same connection.
 * @param {string} [uri] - MongoDB connection URI (defaults to env var)
 * @returns {Promise<mongoose.Connection>}
 */
export async function connectDB(uri) {
  const mongoUri = uri || process.env.DATABASE_LOCAL || process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MongoDB URI not configured. Set DATABASE_LOCAL or MONGODB_URI env var.');
  }

  // Already connected — return existing connection
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Connection in progress — wait for it
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      // If currently connecting, wait for it
      if (mongoose.connection.readyState === 2) {
        await new Promise((resolve) => mongoose.connection.once('open', resolve));
        isConnected = true;
        return mongoose.connection;
      }

      // Register event handlers before connecting
      mongoose.connection.on('error', (error) => {
        logger.error(`MongoDB connection error: ${error.message}`);
        isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Mongoose will auto-reconnect.');
        isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected successfully.');
        isConnected = true;
      });

      await mongoose.connect(mongoUri, { family: 4 });
      isConnected = true;
      logger.info('MongoDB connected successfully.');
      return mongoose.connection;
    } catch (error) {
      logger.error(`MongoDB connection failed: ${error.message}`);
      isConnected = false;
      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Get the current MongoDB connection (throws if not connected).
 * @returns {mongoose.Connection}
 */
export function getConnection() {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected. Call connectDB() first.');
  }
  return mongoose.connection;
}

/**
 * Gracefully close the MongoDB connection.
 * @returns {Promise<void>}
 */
export async function disconnectDB() {
  if (isConnected || mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected gracefully.');
  }
}

/**
 * Health check — returns true if the DB is connected and responsive.
 * @returns {Promise<boolean>}
 */
export async function isHealthy() {
  try {
    if (mongoose.connection.readyState !== 1) return false;
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

export default { connectDB, getConnection, disconnectDB, isHealthy };
