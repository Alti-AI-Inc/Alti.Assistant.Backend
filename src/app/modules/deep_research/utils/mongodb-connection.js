import mongoose from 'mongoose';

/**
 * @type {boolean}
 * @description Flag indicating whether a MongoDB connection is currently active.
 */
let isConnected = false;
/**
 * @type {string | null}
 * @description Stores the URI of the currently active MongoDB connection.
 */
let currentUri = null;

// BUG FIX: Add a flag to ensure event listeners are only attached once.
// Attaching them multiple times on concurrent or repeated calls can lead to
// duplicate logs, unexpected behavior, and memory leaks.
let listenersAttached = false;

/**
 * Establishes a connection to MongoDB using Mongoose.
 * If already connected to the same URI, it returns the existing connection.
 * If connected to a different URI, it disconnects first before establishing a new connection.
 * It also sets up event listeners for connection errors, disconnections, and reconnections.
 *
 * @param {string} [uri='mongodb://localhost:27017/research_agent'] - The MongoDB connection URI.
 *   Defaults to 'mongodb://localhost:27017/research_agent'.
 * @returns {Promise<mongoose.Connection>} A promise that resolves to the Mongoose connection object.
 * @throws {Error} If there is an error connecting to MongoDB.
 */
export const connectToMongoDB = async (
  uri = 'mongodb://localhost:27017/research_agent'
) => {
  // If already connected to the same URI, return existing connection.
  // We also check Mongoose's readyState as the source of truth.
  if (isConnected && currentUri === uri && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If connected to a different URI, disconnect first
  if (isConnected && currentUri !== uri) {
    console.log('Disconnecting from previous MongoDB connection...');
    await mongoose.disconnect();
    // State will be updated by the 'disconnected' event listener.
    isConnected = false;
    currentUri = null;
  }

  // Attach listeners only once to prevent duplicates.
  // This block is placed here to ensure it runs before any new connection attempt.
  if (!listenersAttached) {
    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      isConnected = false;
      // BUG FIX: Do not nullify currentUri on a transient error.
      // Mongoose will attempt to reconnect to the same URI, and nullifying this
      // would break the logic in connectToMongoDB that checks the current URI.
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      isConnected = false;
      currentUri = null; // A clean disconnect means we are no longer associated with the URI.
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
      isConnected = true; // The URI is still the same.
    });

    listenersAttached = true;
  }

  try {
    // Mongoose's connect() method is idempotent. If a connection is already in progress,
    // it will return a promise that resolves with that connection, preventing race conditions.
    console.log('Connecting to MongoDB for research agent...');

    // Mongoose 6+ defaults to useNewUrlParser and useUnifiedTopology,
    // so these options are no longer necessary and can be removed.
    await mongoose.connect(uri, {
      family: 4,
    });

    isConnected = true;
    currentUri = uri;
    console.log('MongoDB connected successfully for research agent');

    // BUG FIX: Return the mongoose.connection object to match the JSDoc and other return paths.
    return mongoose.connection;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    isConnected = false;
    currentUri = null;
    throw error;
  }
};

/**
 * Retrieves the active Mongoose connection object.
 *
 * @returns {mongoose.Connection} The active Mongoose connection object.
 * @throws {Error} If MongoDB is not connected. Call `connectToMongoDB()` first.
 */
export const getMongoDBConnection = () => {
  // BUG FIX: Also check mongoose's readyState for a more reliable status check.
  if (!isConnected || mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected. Call connectToMongoDB() first.');
  }
  return mongoose.connection;
};

/**
 * Disconnects from the active MongoDB connection if one exists.
 *
 * @returns {Promise<void>} A promise that resolves when the disconnection is complete.
 */
export const disconnectFromMongoDB = async () => {
  if (isConnected || mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    // State is updated by the 'disconnected' event listener.
    // Setting it here as well ensures immediate consistency.
    isConnected = false;
    currentUri = null;
    console.log('MongoDB disconnected');
  }
};